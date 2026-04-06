/**
 * Workflow Parser - parses workflow.md into WorkflowSpec
 * @module config/workflow-parser
 */

import YAML from 'yaml';
import type {
  WorkflowSpec,
  Phase,
  Task,
  Rule,
  WorkflowMetadata,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowValidationWarning,
  PhaseStatus,
  TaskStatus,
  AgentType,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'workflow-parser' });

/**
 * Default workflow template
 */
export const DEFAULT_WORKFLOW_TEMPLATE = `# Workflow Configuration

## Phases

- [Phase 1] 需求分析与架构设计 (depends: none)
  - Task: 架构设计 (parallel: false, owner: architect)

- [Phase 2] 核心模块开发 (depends: Phase 1)
  - Task: 商品模块 (parallel: true, owner: backend-dev, frontend-dev)
  - Task: 人员管理模块 (parallel: true, owner: backend-dev, qa-engineer)

- [Phase 3] 联调与测试 (depends: Phase 2)
  - Task: API 集成测试 (parallel: false, owner: qa-engineer)
  - Task: 端到端测试 (parallel: false, owner: qa-engineer)

## Rules

- 每阶段输出必须通过自动化校验（Lint/Test）
- 并行任务需使用独立命名空间，避免文件冲突
- 所有变更需自动生成 Commit Message 并推送至 Feature Branch
`;

/**
 * Parse workflow.md content into WorkflowSpec
 */
export function parseWorkflow(content: string): WorkflowSpec {
  logger.debug('Parsing workflow content');

  // Try YAML first, then fall back to markdown parsing
  let spec: WorkflowSpec;

  try {
    const parsed = YAML.parse(content);
    spec = parseYAMLWorkflow(parsed);
  } catch {
    spec = parseMarkdownWorkflow(content);
  }

  return spec;
}

/**
 * Parse YAML format workflow
 */
function parseYAMLWorkflow(parsed: Record<string, unknown>): WorkflowSpec {
  const phases: Phase[] = [];
  const rules: Rule[] = [];

  // Parse phases
  const phasesData = parsed.phases as Array<Record<string, unknown>> | undefined;
  if (phasesData) {
    for (let i = 0; i < phasesData.length; i++) {
      const phaseData = phasesData[i];
      phases.push(parsePhase(phaseData, i + 1));
    }
  }

  // Parse rules
  const rulesData = parsed.rules as Array<Record<string, unknown>> | undefined;
  if (rulesData) {
    for (const ruleData of rulesData) {
      rules.push({
        id: (ruleData.id as string) ?? `rule-${rules.length + 1}`,
        description: (ruleData.description as string) ?? '',
        condition: ruleData.condition as string | undefined,
        action: ruleData.action as string | undefined,
      });
    }
  }

  return {
    phases,
    rules,
    metadata: {
      version: (parsed.version as string) ?? '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: parsed.author as string | undefined,
    },
  };
}

/**
 * Parse a phase from YAML data
 */
function parsePhase(data: Record<string, unknown>, index: number): Phase {
  const name = data.name as string;
  const depends = parseDepends(data.depends as string | string[] | undefined);
  const tasksData = data.tasks as Array<Record<string, unknown>> | undefined;

  const tasks: Task[] = [];
  if (tasksData) {
    for (const taskData of tasksData) {
      tasks.push(parseTask(taskData));
    }
  }

  return {
    id: generatePhaseId(name, index),
    name,
    depends,
    tasks,
    status: 'pending' as PhaseStatus,
  };
}

/**
 * Parse task from YAML data
 */
function parseTask(data: Record<string, unknown>): Task {
  const name = data.name as string;
  const parallel = (data.parallel as boolean) ?? false;
  const ownerStr = data.owner as string | string[] | undefined;
  const owners = parseOwners(ownerStr);
  const depends = parseDepends(data.depends as string | string[] | undefined);

  return {
    id: generateTaskId(name),
    name,
    description: data.description as string | undefined,
    parallel,
    owners,
    depends,
    status: 'pending' as TaskStatus,
    qualityGate: data.qualityGate as Task['qualityGate'],
    estimatedTokens: data.estimatedTokens as number | undefined,
  };
}

/**
 * Parse depends field
 */
function parseDepends(depends: string | string[] | undefined): string[] {
  if (!depends) {
    return [];
  }
  if (typeof depends === 'string') {
    if (depends === 'none') {
      return [];
    }
    return depends.split(',').map(d => d.trim()).filter(Boolean);
  }
  return depends;
}

/**
 * Parse owners field
 */
function parseOwners(owner: string | string[] | undefined): AgentType[] {
  if (!owner) {
    return [];
  }
  if (typeof owner === 'string') {
    return owner.split(',').map(o => o.trim() as AgentType).filter(Boolean);
  }
  return owner as AgentType[];
}

/**
 * Generate phase ID from name
 */
function generatePhaseId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `phase-${index}-${slug}`;
}

/**
 * Generate task ID from name
 */
function generateTaskId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse markdown format workflow
 */
function parseMarkdownWorkflow(content: string): WorkflowSpec {
  const phases: Phase[] = [];
  const rules: Rule[] = [];

  const lines = content.split('\n');
  let currentPhase: Phase | null = null;
  let currentTask: Task | null = null;
  let section: 'phases' | 'rules' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Section headers
    if (line === '## Phases') {
      section = 'phases';
      continue;
    }
    if (line === '## Rules') {
      section = 'rules';
      continue;
    }

    // Skip non-section content
    if (!section) {
      continue;
    }

    // Phase definition: - [Phase N] Name (depends: ...)
    const phaseMatch = line.match(/^-\s*\[Phase\s+(\d+)\]\s*(.+?)\s*\((depends:\s*(.+?))?\)/);
    if (phaseMatch && section === 'phases') {
      if (currentPhase) {
        phases.push(currentPhase);
      }

      const phaseNum = parseInt(phaseMatch[1], 10);
      const phaseName = phaseMatch[2].trim();
      const dependsStr = phaseMatch[4]?.trim();
      const depends = dependsStr && dependsStr !== 'none'
        ? dependsStr.split(',').map(d => d.trim())
        : [];

      currentPhase = {
        id: generatePhaseId(phaseName, phaseNum),
        name: phaseName,
        depends,
        tasks: [],
        status: 'pending',
      };
      currentTask = null;
      continue;
    }

    // Task definition: - Task: Name (parallel: true/false, owner: agent)
    const taskMatch = line.match(/^-\s*Task:\s*(.+?)\s*\((.+?)\)/);
    if (taskMatch && currentPhase) {
      const taskName = taskMatch[1].trim();
      const optionsStr = taskMatch[2];
      const options = parseTaskOptions(optionsStr);

      currentTask = {
        id: generateTaskId(taskName),
        name: taskName,
        description: options.description,
        parallel: options.parallel,
        owners: options.owners,
        depends: options.depends,
        status: 'pending',
      };

      currentPhase.tasks.push(currentTask);
      continue;
    }

    // Continuation of task description (indented line)
    if (line.startsWith('  - ') && currentTask) {
      const desc = line.replace(/^  -\s*/, '').trim();
      if (desc) {
        currentTask.description = (currentTask.description ?? '') + '\n' + desc;
      }
      continue;
    }
  }

  // Add last phase
  if (currentPhase) {
    phases.push(currentPhase);
  }

  return {
    phases,
    rules,
    metadata: {
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

/**
 * Parse task options from parentheses
 */
function parseTaskOptions(optionsStr: string): {
  parallel: boolean;
  owners: AgentType[];
  depends: string[];
  description?: string;
} {
  const result = {
    parallel: false,
    owners: [] as AgentType[],
    depends: [] as string[],
    description: undefined as string | undefined,
  };

  // Match key: value pairs
  const pairs = optionsStr.split(',').map(p => p.trim());
  for (const pair of pairs) {
    const [key, value] = pair.split(':').map(p => p.trim());
    if (!key || !value) continue;

    switch (key) {
      case 'parallel':
        result.parallel = value === 'true';
        break;
      case 'owner':
        result.owners = value.split('+').map(o => o.trim() as AgentType);
        break;
      case 'depends':
        result.depends = value.split('+').map(d => d.trim()).filter(Boolean);
        break;
      case 'description':
        result.description = value;
        break;
    }
  }

  return result;
}

/**
 * Validate workflow specification
 */
export function validateWorkflow(spec: WorkflowSpec): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const warnings: WorkflowValidationWarning[] = [];

  // Check phases exist
  if (spec.phases.length === 0) {
    errors.push({
      path: 'phases',
      message: 'Workflow must have at least one phase',
    });
  }

  // Check phase IDs are unique
  const phaseIds = new Set<string>();
  for (const phase of spec.phases) {
    if (phaseIds.has(phase.id)) {
      errors.push({
        path: `phase[${phase.id}]`,
        message: `Duplicate phase ID: ${phase.id}`,
      });
    }
    phaseIds.add(phase.id);
  }

  // Check task IDs are unique across all phases
  const taskIds = new Set<string>();
  for (const phase of spec.phases) {
    for (const task of phase.tasks) {
      if (taskIds.has(task.id)) {
        errors.push({
          path: `task[${task.id}]`,
          message: `Duplicate task ID: ${task.id}`,
        });
      }
      taskIds.add(task.id);
    }
  }

  // Check phase dependencies reference valid phases
  for (const phase of spec.phases) {
    for (const depId of phase.depends) {
      if (!phaseIds.has(depId)) {
        errors.push({
          path: `phase[${phase.id}].depends`,
          message: `Unknown phase dependency: ${depId}`,
        });
      }
    }
  }

  // Check task dependencies reference valid tasks
  for (const phase of spec.phases) {
    for (const task of phase.tasks) {
      for (const depId of task.depends ?? []) {
        if (!taskIds.has(depId)) {
          errors.push({
            path: `task[${task.id}].depends`,
            message: `Unknown task dependency: ${depId}`,
          });
        }
      }
    }
  }

  // Check for circular dependencies
  if (hasCircularDependencies(spec)) {
    errors.push({
      path: 'dependencies',
      message: 'Circular dependency detected',
    });
  }

  // Warn about tasks without owners
  for (const phase of spec.phases) {
    for (const task of phase.tasks) {
      if (task.owners.length === 0) {
        warnings.push({
          path: `task[${task.id}]`,
          message: `Task has no owners assigned: ${task.name}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for circular dependencies
 */
function hasCircularDependencies(spec: WorkflowSpec): boolean {
  const phaseDeps = new Map<string, Set<string>>();

  for (const phase of spec.phases) {
    phaseDeps.set(phase.id, new Set(phase.depends));
  }

  for (const phase of spec.phases) {
    const visited = new Set<string>();
    if (hasCycle(phase.id, phaseDeps, visited)) {
      return true;
    }
  }

  return false;
}

function hasCycle(
  phaseId: string,
  deps: Map<string, Set<string>>,
  visited: Set<string>
): boolean {
  if (visited.has(phaseId)) {
    return true;
  }
  visited.add(phaseId);

  const phaseDeps = deps.get(phaseId);
  if (phaseDeps) {
    for (const dep of phaseDeps) {
      if (hasCycle(dep, deps, visited)) {
        return true;
      }
    }
  }

  visited.delete(phaseId);
  return false;
}

/**
 * Create a default workflow specification
 */
export function createDefaultWorkflow(): WorkflowSpec {
  return parseWorkflow(DEFAULT_WORKFLOW_TEMPLATE);
}
