/**
 * Planning Generator - generates PLANNING.md documents
 * @module core/planning-generator
 */

import type { BaseChatModel } from '@langchain/core/language_models';
import type {
  Phase,
  Task,
  PlanningDocument,
  TaskNode,
  TechStackRecommendation,
  FileStructure,
  APIContract,
  Risk,
  Deliverable,
  ValidationResult,
} from '../types/planning.js';
import type { WorkflowManager } from './workflow-manager.js';
import type { MemoryRetrieval } from '../memory/memory-retrieval.js';
import { generateId } from '../utils/id-generator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'planning-generator' });

/**
 * Planning context for generation
 */
export interface PlanningContext {
  phase: Phase;
  projectName: string;
  previousPhases: Phase[];
  availableAgents: string[];
}

/**
 * Planning feedback for revision
 */
export interface PlanningFeedback {
  changes: string[];
  techStackOverrides?: TechStackRecommendation;
  fileStructureChanges?: FileStructure;
}

/**
 * Planning Generator creates PLANNING.md documents
 * Supports both LLM-powered and rule-based planning
 */
export class PlanningGenerator {
  private llm: BaseChatModel | null;
  private workflowManager: WorkflowManager | null;
  private memoryRetriever: MemoryRetrieval | null;

  /**
   * Create a PlanningGenerator with optional dependencies
   * All dependencies are optional - if not provided, rule-based planning is used
   */
  constructor(
    llm?: BaseChatModel,
    workflowManager?: WorkflowManager,
    memoryRetriever?: MemoryRetrieval
  ) {
    this.llm = llm ?? null;
    this.workflowManager = workflowManager ?? null;
    this.memoryRetriever = memoryRetriever ?? null;
    logger.info({
      hasLlm: !!this.llm,
      hasWorkflowManager: !!this.workflowManager,
      hasMemoryRetriever: !!this.memoryRetriever,
    }, 'PlanningGenerator initialized');
  }

  /**
   * Check if LLM-powered planning is available
   */
  isLLMEnabled(): boolean {
    return !!this.llm;
  }

  /**
   * Generate a planning document for a phase
   */
  async generatePlan(context: PlanningContext): Promise<PlanningDocument> {
    logger.info({ phase: context.phase.id }, 'Generating planning document');

    const taskTree = this.decomposeTasks(context.phase);
    const techStack = this.recommendTechStack(context);
    const fileStructure = this.generateFileStructure(context);
    const apiContracts = this.defineAPIContracts(context.phase);
    const risks = this.identifyRisks(context.phase);
    const deliverables = this.identifyDeliverables(context.phase);

    const document: PlanningDocument = {
      id: generateId(),
      version: 1,
      phase: context.phase.id,
      taskTree,
      techStack,
      fileStructure,
      apiContracts,
      risks,
      deliverables,
    };

    // If LLM is available, enhance with LLM-powered suggestions
    if (this.llm) {
      try {
        const enhanced = await this.enhanceWithLLM(document, context);
        return enhanced;
      } catch (error) {
        logger.warn({ error }, 'LLM enhancement failed, using rule-based plan');
      }
    }

    return document;
  }

  /**
   * Revise an existing planning document
   */
  async revisePlan(
    current: PlanningDocument,
    feedback: PlanningFeedback
  ): Promise<PlanningDocument> {
    logger.info({ planId: current.id, changes: feedback.changes }, 'Revising planning document');

    const revised: PlanningDocument = {
      ...current,
      version: current.version + 1,
      techStack: feedback.techStackOverrides ?? current.techStack,
      fileStructure: feedback.fileStructureChanges ?? current.fileStructure,
      taskTree: this.applyFeedbackToTaskTree(current.taskTree, feedback.changes),
    };

    return revised;
  }

  /**
   * Validate a planning document
   */
  async validatePlan(plan: PlanningDocument): Promise<ValidationResult> {
    const errors: string[] = [];

    // Phase validation
    if (!plan.phase) {
      errors.push('Phase is required');
    }

    // Task tree validation
    if (plan.taskTree.length === 0) {
      errors.push('Task tree cannot be empty');
    }

    // Collect all task IDs for dependency validation
    const allTaskIds = new Set<string>();
    const collectTaskIds = (nodes: TaskNode[]): void => {
      for (const node of nodes) {
        allTaskIds.add(node.id);
        collectTaskIds(node.children);
      }
    };
    collectTaskIds(plan.taskTree);

    // Validate task dependencies exist
    const validateDependencies = (nodes: TaskNode[]): void => {
      for (const node of nodes) {
        for (const depId of node.dependencies) {
          if (!allTaskIds.has(depId)) {
            errors.push(`Task ${node.id} has unknown dependency: ${depId}`);
          }
        }
        validateDependencies(node.children);
      }
    };
    validateDependencies(plan.taskTree);

    // Tech stack validation
    if (plan.techStack.recommendations.length === 0) {
      errors.push('Tech stack recommendations cannot be empty');
    }

    // File structure validation
    if (plan.fileStructure.directories.length === 0 && plan.fileStructure.files.length === 0) {
      errors.push('File structure cannot be empty');
    }

    // Validate file paths don't conflict
    const filePaths = new Set<string>();
    for (const file of plan.fileStructure.files) {
      if (filePaths.has(file.path)) {
        errors.push(`Duplicate file path: ${file.path}`);
      }
      filePaths.add(file.path);
    }

    // API contracts validation
    for (const contract of plan.apiContracts) {
      if (!contract.endpoint.startsWith('/')) {
        errors.push(`API endpoint must start with /: ${contract.endpoint}`);
      }
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(contract.method)) {
        errors.push(`Invalid HTTP method: ${contract.method}`);
      }
    }

    // Risks validation
    for (const risk of plan.risks) {
      if (!['low', 'medium', 'high'].includes(risk.severity)) {
        errors.push(`Invalid risk severity: ${risk.severity}`);
      }
      if (!['low', 'medium', 'high'].includes(risk.likelihood)) {
        errors.push(`Invalid risk likelihood: ${risk.likelihood}`);
      }
    }

    // Deliverables validation
    for (const deliverable of plan.deliverables) {
      if (!deliverable.owner) {
        errors.push(`Deliverable ${deliverable.id} has no owner`);
      }
      if (deliverable.acceptanceCriteria.length === 0) {
        errors.push(`Deliverable ${deliverable.id} has no acceptance criteria`);
      }
    }

    // Check for circular dependencies in task tree
    if (this.hasCircularDependencies(plan.taskTree)) {
      errors.push('Circular dependencies detected in task tree');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Decompose phase tasks into task tree
   */
  private decomposeTasks(phase: Phase): TaskNode[] {
    const nodes: TaskNode[] = [];

    for (const task of phase.tasks) {
      const node: TaskNode = {
        id: task.id,
        name: task.name,
        description: task.description ?? `Implement ${task.name}`,
        children: [],
        estimatedTokens: task.estimatedTokens ?? this.estimateTaskTokens(task),
        dependencies: task.depends ?? [],
      };

      // Decompose into subtasks based on owners
      if (task.owners.length > 1) {
        for (const owner of task.owners) {
          node.children.push({
            id: `${task.id}.${owner}`,
            name: `${task.name} (${owner})`,
            description: `Subtask for ${owner}`,
            children: [],
            estimatedTokens: Math.floor(node.estimatedTokens / task.owners.length),
            dependencies: [],
          });
        }
      }

      nodes.push(node);
    }

    return nodes;
  }

  /**
   * Estimate tokens for a task based on its characteristics
   */
  private estimateTaskTokens(task: Task): number {
    let baseTokens = 10000; // Base estimate

    // Adjust based on task name keywords
    const name = task.name.toLowerCase();
    if (name.includes('api') || name.includes('endpoint')) {
      baseTokens += 5000;
    }
    if (name.includes('database') || name.includes('model')) {
      baseTokens += 8000;
    }
    if (name.includes('test') || name.includes('qa')) {
      baseTokens += 3000;
    }
    if (name.includes('ui') || name.includes('frontend') || name.includes('component')) {
      baseTokens += 6000;
    }

    // Adjust based on owners count
    baseTokens += task.owners.length * 2000;

    // Adjust based on dependencies
    baseTokens += (task.depends?.length ?? 0) * 1000;

    return baseTokens;
  }

  /**
   * Recommend tech stack based on context
   */
  private recommendTechStack(context: PlanningContext): TechStackRecommendation {
    const recommendations: TechStackRecommendation['recommendations'] = [];

    // Default recommendations based on phase
    const phaseName = context.phase.name.toLowerCase();

    if (phaseName.includes('architecture') || phaseName.includes('design')) {
      recommendations.push({
        category: 'Architecture',
        technology: 'TypeScript',
        reason: 'Type-safe language ideal for large-scale applications',
        alternatives: ['JavaScript', 'Python'],
      });
      recommendations.push({
        category: 'Framework',
        technology: 'Node.js',
        reason: 'Unified language for frontend and backend',
        alternatives: ['Deno', 'Bun'],
      });
    }

    if (phaseName.includes('backend') || phaseName.includes('api')) {
      recommendations.push({
        category: 'API Framework',
        technology: 'Express.js',
        reason: 'Lightweight, flexible, widely adopted',
        alternatives: ['Fastify', 'NestJS', 'Hono'],
      });
      recommendations.push({
        category: 'Database',
        technology: 'PostgreSQL',
        reason: 'Robust relational database with JSON support',
        alternatives: ['MySQL', 'SQLite'],
      });
    }

    if (phaseName.includes('frontend') || phaseName.includes('ui')) {
      recommendations.push({
        category: 'UI Framework',
        technology: 'React',
        reason: 'Large ecosystem, strong community support',
        alternatives: ['Vue', 'Svelte', 'Angular'],
      });
      recommendations.push({
        category: 'Build Tool',
        technology: 'Vite',
        reason: 'Fast development server and build tool',
        alternatives: ['Webpack', 'esbuild'],
      });
    }

    if (phaseName.includes('test') || phaseName.includes('qa')) {
      recommendations.push({
        category: 'Testing',
        technology: 'Vitest',
        reason: 'Fast, TypeScript-native testing framework',
        alternatives: ['Jest', 'Mocha'],
      });
    }

    return {
      recommendations,
      overall: {
        backend: 'Node.js + Express.js + TypeScript',
        frontend: 'React + TypeScript + Vite',
        database: 'PostgreSQL',
        testing: 'Vitest + React Testing Library',
      },
    };
  }

  /**
   * Generate file structure
   */
  private generateFileStructure(context: PlanningContext): FileStructure {
    const structure: FileStructure = {
      directories: [],
      files: [],
    };

    const phaseName = context.phase.name.toLowerCase();

    // Base directory structure
    structure.directories.push(
      { path: 'src', description: 'Source code root' },
      { path: 'src/api', description: 'API routes and controllers' },
      { path: 'src/services', description: 'Business logic services' },
      { path: 'src/models', description: 'Data models and schemas' },
      { path: 'src/utils', description: 'Utility functions' },
      { path: 'test', description: 'Test files' },
      { path: 'test/unit', description: 'Unit tests' },
      { path: 'test/integration', description: 'Integration tests' },
      { path: 'config', description: 'Configuration files' }
    );

    // Add files based on phase
    if (phaseName.includes('backend') || phaseName.includes('api')) {
      structure.files.push(
        { path: 'src/api/routes.ts', description: 'API route definitions', language: 'typescript' },
        { path: 'src/api/controllers/index.ts', description: 'API controllers', language: 'typescript' },
        { path: 'src/models/index.ts', description: 'Data models', language: 'typescript' },
        { path: 'src/services/user.service.ts', description: 'User service', language: 'typescript' }
      );
    }

    if (phaseName.includes('frontend') || phaseName.includes('ui')) {
      structure.directories.push(
        { path: 'src/components', description: 'UI components' },
        { path: 'src/pages', description: 'Page components' },
        { path: 'src/hooks', description: 'Custom hooks' },
        { path: 'src/store', description: 'State management' }
      );

      structure.files.push(
        { path: 'src/components/Button.tsx', description: 'Button component', language: 'tsx' },
        { path: 'src/pages/Home.tsx', description: 'Home page', language: 'tsx' },
        { path: 'src/hooks/useAuth.ts', description: 'Auth hook', language: 'typescript' }
      );
    }

    if (phaseName.includes('test') || phaseName.includes('qa')) {
      structure.files.push(
        { path: 'test/setup.ts', description: 'Test setup', language: 'typescript' },
        { path: 'test/unit/example.test.ts', description: 'Example unit test', language: 'typescript' },
        { path: 'test/integration/api.test.ts', description: 'API integration test', language: 'typescript' }
      );
    }

    return structure;
  }

  /**
   * Define API contracts from phase tasks
   */
  private defineAPIContracts(phase: Phase): APIContract[] {
    const contracts: APIContract[] = [];

    for (const task of phase.tasks) {
      if (task.name.toLowerCase().includes('api') || task.name.toLowerCase().includes('endpoint')) {
        // Generate mock API contract
        contracts.push({
          endpoint: `/api/${task.name.toLowerCase().replace(/\s+/g, '-')}`,
          method: 'GET',
          request: {
            headers: { 'Content-Type': 'application/json' },
            body: undefined,
            query: [{ name: 'page', type: 'number', required: false }],
          },
          response: {
            status: 200,
            body: { data: [], total: 0 },
          },
        });
      }
    }

    return contracts;
  }

  /**
   * Identify risks for the phase
   */
  private identifyRisks(phase: Phase): Risk[] {
    const risks: Risk[] = [];

    // Check for parallel tasks
    const parallelTasks = phase.tasks.filter(t => t.parallel);
    if (parallelTasks.length > 0) {
      risks.push({
        id: 'risk-parallel-conflict',
        description: 'Parallel tasks may have file conflicts',
        severity: 'medium',
        likelihood: 'medium',
        mitigation: 'Use module-based file isolation for each task',
      });
    }

    // Check for task dependencies
    const tasksWithDeps = phase.tasks.filter(t => (t.depends?.length ?? 0) > 0);
    if (tasksWithDeps.length > 0) {
      risks.push({
        id: 'risk-dependency-chain',
        description: 'Task dependency chain may cause delays',
        severity: 'low',
        likelihood: 'medium',
        mitigation: 'Execute independent tasks first',
      });
    }

    // Check for multiple owners
    const multiOwnerTasks = phase.tasks.filter(t => t.owners.length > 1);
    if (multiOwnerTasks.length > 0) {
      risks.push({
        id: 'risk-multi-owner',
        description: 'Tasks with multiple owners may have coordination overhead',
        severity: 'low',
        likelihood: 'low',
        mitigation: 'Clear task ownership and communication plan',
      });
    }

    return risks;
  }

  /**
   * Identify deliverables for the phase
   */
  private identifyDeliverables(phase: Phase): Deliverable[] {
    return phase.tasks.map(task => ({
      id: task.id,
      name: task.name,
      description: task.description ?? `Deliverable for ${task.name}`,
      owner: task.owners[0] ?? 'unknown',
      acceptanceCriteria: [
        'Code compiles without errors',
        'Unit tests pass with >80% coverage',
        'Lint checks pass',
      ],
      dueDate: undefined,
    }));
  }

  /**
   * Apply feedback changes to task tree
   */
  private applyFeedbackToTaskTree(taskTree: TaskNode[], changes: string[]): TaskNode[] {
    // Simple implementation - in reality would parse the changes
    // and update task tree accordingly
    return taskTree;
  }

  /**
   * Check for circular dependencies in task tree
   */
  private hasCircularDependencies(nodes: TaskNode[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: TaskNode): boolean => {
      visited.add(node.id);
      recursionStack.add(node.id);

      for (const child of node.children) {
        if (!visited.has(child.id) && hasCycle(child)) {
          return true;
        }
        if (recursionStack.has(child.id)) {
          return true;
        }
      }

      recursionStack.delete(node.id);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id) && hasCycle(node)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enhance planning document with LLM-powered suggestions
   * This is called automatically if an LLM is provided in the constructor
   */
  private async enhanceWithLLM(
    document: PlanningDocument,
    context: PlanningContext
  ): Promise<PlanningDocument> {
    if (!this.llm) {
      return document;
    }

    logger.debug('Enhancing plan with LLM');

    // Build prompt for LLM
    const prompt = `Based on the following phase context, suggest improvements to the planning document:

Phase: ${context.phase.name}
Description: ${context.phase.description ?? 'N/A'}
Tasks: ${context.phase.tasks.map(t => t.name).join(', ')}

Current Tech Stack Recommendations:
${document.techStack.recommendations.map(r => `- ${r.category}: ${r.technology}`).join('\n')}

Provide suggestions for:
1. Additional tech stack recommendations
2. Potential risks not identified
3. Missing deliverables
4. API improvements`;

    try {
      const response = await this.llm.invoke(prompt);
      const content = typeof response === 'string' ? response : response.content;

      // In a full implementation, we would parse the LLM response
      // and update the document accordingly
      logger.info({ responseLength: content.length }, 'LLM enhancement received');

      // For now, just log and return the original document
      // A real implementation would parse the response and update risks/deliverables
    } catch (error) {
      logger.warn({ error }, 'LLM enhancement failed');
    }

    return document;
  }
}
