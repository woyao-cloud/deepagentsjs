/**
 * Main Agent - Supervisor for the multi-agent system
 * @module agents/main-agent
 */

import type {
  Task,
  ExecutionContext,
  TaskResult,
  AgentRegistry,
  PlanningDocument,
} from '../types/index.js';
import type { BaseAgent } from './base-agent.js';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'main-agent' });

/**
 * Main Agent (Supervisor) coordinates all sub-agents
 */
export class MainAgent extends BaseAgent {
  private agentRegistry: AgentRegistry | null = null;
  private subAgents: Map<string, BaseAgent> = new Map();
  private currentPlanning: PlanningDocument | null = null;

  constructor() {
    super('main', {
      type: 'main',
      name: 'Main Agent',
      description: 'Supervisor agent that coordinates all sub-agents',
      tools: [],
      tokenBudget: 100000,
    });
  }

  /**
   * Initialize the main agent
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Main Agent');
    this.addSystemMessage('Main Agent initialized');
  }

  /**
   * Set the agent registry
   */
  setAgentRegistry(registry: AgentRegistry): void {
    this.agentRegistry = registry;
    this.logger.info({ roles: registry.roles.map(r => r.type) }, 'Agent registry set');
  }

  /**
   * Set the current planning document
   */
  setPlanning(plan: PlanningDocument): void {
    this.currentPlanning = plan;
    this.logger.info({ planId: plan.id, phase: plan.phase }, 'Planning document set');
  }

  /**
   * Register a sub-agent
   */
  registerSubAgent(agent: BaseAgent): void {
    this.subAgents.set(agent.getId(), agent);
    this.logger.info({ agentId: agent.getId(), agentType: agent.getType() }, 'Sub-agent registered');
  }

  /**
   * Get a sub-agent by ID
   */
  getSubAgent(agentId: string): BaseAgent | undefined {
    return this.subAgents.get(agentId);
  }

  /**
   * Execute a task by delegating to appropriate sub-agents
   */
  async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    this.logger.info({ taskId: task.id, taskName: task.name }, 'Executing task');

    const startTime = Date.now();

    try {
      // Add task start message
      this.addHumanMessage(`Starting task: ${task.name}`);

      // Determine which agents should handle this task
      const assignedAgents = this.assignTaskToAgents(task);

      if (assignedAgents.length === 0) {
        return {
          taskId: task.id,
          status: 'failed',
          output: { files: {}, messages: ['No agents assigned to task'] },
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          duration: Date.now() - startTime,
          logs: [],
          error: 'No agents assigned',
        };
      }

      // Execute with assigned agents
      const results: TaskResult[] = [];

      for (const agent of assignedAgents) {
        // Filter context for sub-agent
        const filteredContext: ExecutionContext = {
          ...context,
          workingMemory: {
            ...context.workingMemory,
            messages: [],
            todos: [],
          },
        };

        const result = await agent.executeTask(task, filteredContext);
        results.push(result);
      }

      // Aggregate results
      const aggregatedFiles: Record<string, string> = {};
      const aggregatedMessages: string[] = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (const result of results) {
        Object.assign(aggregatedFiles, result.output.files);
        aggregatedMessages.push(...result.output.messages);
        totalInputTokens += result.tokenUsage.inputTokens;
        totalOutputTokens += result.tokenUsage.outputTokens;
      }

      // Determine overall status
      const allSucceeded = results.every(r => r.status === 'success');
      const anyFailed = results.some(r => r.status === 'failed');

      return {
        taskId: task.id,
        status: anyFailed ? 'failed' : allSucceeded ? 'success' : 'skipped',
        output: {
          files: aggregatedFiles,
          messages: aggregatedMessages,
        },
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
        duration: Date.now() - startTime,
        logs: results.flatMap(r => r.logs),
      };
    } catch (error) {
      this.logger.error({ taskId: task.id, error }, 'Task execution failed');
      return {
        taskId: task.id,
        status: 'failed',
        output: { files: {}, messages: [] },
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Assign task to appropriate agents based on task owners
   */
  private assignTaskToAgents(task: Task): BaseAgent[] {
    const agents: BaseAgent[] = [];

    for (const ownerType of task.owners) {
      // Find sub-agent of this type
      for (const agent of this.subAgents.values()) {
        if (agent.getType() === ownerType) {
          agents.push(agent);
          break;
        }
      }
    }

    return agents;
  }

  /**
   * Add system message
   */
  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date(),
    });
  }

  /**
   * Generate planning for a phase (stub for LLM integration)
   */
  async generatePlanning?(phase: Task): Promise<PlanningDocument>;

  /**
   * Review and approve planning (stub for LLM integration)
   */
  async reviewPlanning?(plan: PlanningDocument): Promise<boolean>;

  /**
   * Handle human-in-the-loop confirmation
   */
  async handleConfirmation?(confirmed: boolean, feedback?: string): Promise<void>;
}
