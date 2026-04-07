/**
 * Agent Scheduler - orchestrates multi-agent task execution
 * @module core/agent-scheduler
 */

import type {
  AgentType,
  Task,
  TaskStatus,
  ExecutionContext,
  ExecutionResult,
  ExecutionReport,
  ConflictReport,
  TokenUsage,
} from '../types/index.js';
import type { PlanningDocument, TaskNode } from '../types/planning.js';
import type { AgentFactory } from '../agents/agent-factory.js';
import type { DAG } from './dag.js';
import type { TokenTracker } from '../token/index.js';
import type { BaseAgent } from '../agents/base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'agent-scheduler' });

/**
 * Execution options for scheduling
 */
export interface SchedulerOptions {
  parallel: boolean;
  maxConcurrent: number;
  contextIsolation: boolean;
}

/**
 * Default scheduler options
 */
const DEFAULT_OPTIONS: SchedulerOptions = {
  parallel: true,
  maxConcurrent: 3,
  contextIsolation: true,
};

/**
 * Agent Scheduler manages multi-agent task orchestration
 */
export class AgentScheduler {
  private agentFactory: AgentFactory;
  private dag: DAG;
  private tokenTracker: TokenTracker;
  private options: SchedulerOptions;
  private activeAgents: Map<string, BaseAgent> = new Map();
  private executionHistory: ExecutionResult[] = [];

  constructor(
    agentFactory: AgentFactory,
    dag: DAG,
    tokenTracker: TokenTracker,
    options?: Partial<SchedulerOptions>
  ) {
    this.agentFactory = agentFactory;
    this.dag = dag;
    this.tokenTracker = tokenTracker;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    logger.info({ options: this.options }, 'AgentScheduler initialized');
  }

  /**
   * Schedule and execute tasks in parallel
   */
  async scheduleParallel(taskIds: string[]): Promise<ExecutionResult[]> {
    logger.info({ taskIds }, 'Scheduling parallel execution');

    const results: ExecutionResult[] = [];
    const tasks = taskIds.map(id => this.dag.getNode(id)).filter(Boolean) as Task[];

    // Group tasks by execution level
    const levels = this.groupByLevel(tasks);

    for (const levelTasks of levels) {
      const levelResults = await Promise.all(
        levelTasks.map(task => this.executeTask(task))
      );
      results.push(...levelResults);

      // Check if any failed - if so, stop
      if (levelResults.some(r => r.status === 'failed')) {
        logger.warn('Task failed in parallel group, continuing with remaining tasks');
      }
    }

    return results;
  }

  /**
   * Schedule and execute tasks sequentially
   */
  async scheduleSequential(taskIds: string[]): Promise<ExecutionResult[]> {
    logger.info({ taskIds }, 'Scheduling sequential execution');

    const results: ExecutionResult[] = [];
    const tasks = taskIds.map(id => this.dag.getNode(id)).filter(Boolean) as Task[];

    for (const task of tasks) {
      const result = await this.executeTask(task);
      results.push(result);

      // Stop on failure
      if (result.status === 'failed') {
        logger.warn({ taskId: task.id }, 'Task failed, stopping sequential execution');
        break;
      }
    }

    return results;
  }

  /**
   * Execute a complete planning document
   */
  async executePlan(plan: PlanningDocument): Promise<ExecutionReport> {
    logger.info({ planId: plan.id, phase: plan.phase }, 'Executing plan');

    const startTime = Date.now();
    const taskResults: ExecutionResult[] = [];
    const taskNodeMap = this.buildTaskNodeMap(plan.taskTree);

    // Execute task tree
    for (const rootTask of plan.taskTree) {
      const result = await this.executeTaskNode(rootTask, taskNodeMap);
      taskResults.push(result);

      if (result.status === 'failed') {
        logger.warn({ taskId: rootTask.id }, 'Root task failed');
      }
    }

    const endTime = Date.now();
    const totalTokens = this.calculateTotalTokens(taskResults);

    const report: ExecutionReport = {
      planId: plan.id,
      phase: plan.phase,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: endTime - startTime,
      taskResults,
      totalTokens,
      success: taskResults.every(r => r.status === 'success'),
      summary: this.generateSummary(taskResults),
    };

    logger.info({
      planId: plan.id,
      duration: report.duration,
      totalTokens,
      success: report.success,
    }, 'Plan execution completed');

    return report;
  }

  /**
   * Detect conflicts between tasks
   */
  detectConflicts(tasks: Task[]): ConflictReport[] {
    logger.debug({ taskCount: tasks.length }, 'Detecting conflicts');

    const conflicts: ConflictReport[] = [];
    const fileOwnership = new Map<string, { taskId: string; owner: AgentType }[]>();

    // Build file ownership map
    for (const task of tasks) {
      for (const file of task.outputFiles ?? []) {
        const owners = fileOwnership.get(file) ?? [];
        owners.push({ taskId: task.id, owner: task.owners[0] as AgentType });
        fileOwnership.set(file, owners);
      }
    }

    // Find conflicts
    for (const [file, owners] of fileOwnership) {
      const uniqueOwners = new Set(owners.map(o => o.owner));
      if (uniqueOwners.size > 1) {
        conflicts.push({
          type: 'file',
          resource: file,
          tasks: owners.map(o => o.taskId),
          severity: owners.length > 2 ? 'high' : 'medium',
          description: `File ${file} is owned by multiple agent types: ${Array.from(uniqueOwners).join(', ')}`,
          resolution: 'Assign file to single owner or use atomic file operations',
        });
      }
    }

    // Check for resource conflicts
    const resourceUsage = new Map<string, string[]>();
    for (const task of tasks) {
      for (const resource of task.resources ?? []) {
        const users = resourceUsage.get(resource) ?? [];
        users.push(task.id);
        resourceUsage.set(resource, users);
      }
    }

    for (const [resource, taskIds] of resourceUsage) {
      if (taskIds.length > 1) {
        conflicts.push({
          type: 'resource',
          resource,
          tasks: taskIds,
          severity: 'low',
          description: `Resource ${resource} is used by multiple tasks`,
          resolution: 'Tasks may need synchronization',
        });
      }
    }

    return conflicts;
  }

  /**
   * Get active agents
   */
  getActiveAgents(): Map<string, BaseAgent> {
    return new Map(this.activeAgents);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const agent = this.activeAgents.get(taskId);
    if (agent) {
      // In a real implementation, this would signal the agent to stop
      this.activeAgents.delete(taskId);
      logger.info({ taskId }, 'Task cancelled');
      return true;
    }
    return false;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): ExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Create execution context for a task
   */
  createExecutionContext(task: Task, parentState?: ExecutionContext['parentState']): ExecutionContext {
    const budgetLimit = this.estimateBudget(task);

    return {
      parentState,
      taskDescription: task.description ?? task.name,
      allowedTools: this.getAllowedTools(task),
      budgetLimit,
      sandbox: {
        enabled: this.options.contextIsolation,
        workspaceRoot: `./sandbox/${task.id}`,
      },
    };
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const agentId = `${task.owners[0]}-${task.id}`;

    logger.info({ taskId: task.id, agentType: task.owners[0] }, 'Executing task');

    try {
      // Create agent
      const agent = this.agentFactory.createAgent(task.owners[0] as AgentType, {
        taskId: task.id,
      });
      this.activeAgents.set(agentId, agent);

      // Create context
      const context = this.createExecutionContext(task);

      // Execute
      const output = await agent.execute(context);

      // Record token usage
      const tokenUsage: TokenUsage = {
        inputTokens: output.tokens?.input ?? 0,
        outputTokens: output.tokens?.output ?? 0,
      };
      this.tokenTracker.recordUsage(agentId, task.id, tokenUsage);

      const result: ExecutionResult = {
        taskId: task.id,
        agentId,
        status: 'success',
        output,
        tokenUsage,
        duration: Date.now() - startTime,
        logs: output.logs ?? [],
      };

      this.executionHistory.push(result);
      this.activeAgents.delete(agentId);

      logger.info({
        taskId: task.id,
        duration: result.duration,
        tokens: tokenUsage,
      }, 'Task completed successfully');

      return result;
    } catch (error) {
      const result: ExecutionResult = {
        taskId: task.id,
        agentId,
        status: 'failed',
        output: { logs: [`Error: ${error}`] },
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
        logs: [{ timestamp: new Date(), level: 'error', message: String(error) }],
      };

      this.executionHistory.push(result);
      this.activeAgents.delete(agentId);

      logger.error({ taskId: task.id, error }, 'Task failed');
      return result;
    }
  }

  /**
   * Execute a task node from planning document
   */
  private async executeTaskNode(
    node: TaskNode,
    taskNodeMap: Map<string, TaskNode>
  ): Promise<ExecutionResult> {
    // First execute children if any
    if (node.children.length > 0) {
      const childResults: ExecutionResult[] = [];
      for (const child of node.children) {
        const childResult = await this.executeTaskNode(child, taskNodeMap);
        childResults.push(childResult);

        if (childResult.status === 'failed') {
          // Continue with siblings even if one fails
          logger.warn({ childTaskId: child.id }, 'Child task failed, continuing');
        }
      }

      // Return first non-failed result or first failed
      const successfulResult = childResults.find(r => r.status === 'success');
      if (successfulResult) {
        return successfulResult;
      }
      return childResults[0];
    }

    // Execute leaf task
    const task = this.dag.getNode(node.id);
    if (!task) {
      return {
        taskId: node.id,
        agentId: 'unknown',
        status: 'failed',
        output: { logs: ['Task not found in DAG'] },
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
        logs: [{ timestamp: new Date(), level: 'error', message: 'Task not found' }],
      };
    }

    return this.executeTask(task);
  }

  /**
   * Group tasks by execution level (for parallel execution)
   */
  private groupByLevel(tasks: Task[]): Task[][] {
    const levels: Map<number, Task[]> = new Map();
    const visited = new Set<string>();

    const assignLevel = (task: Task, level: number): void => {
      if (visited.has(task.id)) {
        return;
      }
      visited.add(task.id);

      const existing = levels.get(level) ?? [];
      existing.push(task);
      levels.set(level, existing);

      // Children are at next level
      for (const depId of task.depends ?? []) {
        const dep = this.dag.getNode(depId);
        if (dep) {
          assignLevel(dep, level + 1);
        }
      }
    };

    // Process tasks
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        const deps = task.depends ?? [];
        if (deps.length === 0) {
          assignLevel(task, 0);
        }
      }
    }

    // Convert to array and sort by level
    return Array.from(levels.entries())
      .sort(([a], [b]) => a - b)
      .map(([, tasks]) => tasks);
  }

  /**
   * Build task node map for lookup
   */
  private buildTaskNodeMap(nodes: TaskNode[]): Map<string, TaskNode> {
    const map = new Map<string, TaskNode>();

    const addNodes = (nodeList: TaskNode[]): void => {
      for (const node of nodeList) {
        map.set(node.id, node);
        addNodes(node.children);
      }
    };

    addNodes(nodes);
    return map;
  }

  /**
   * Estimate budget for task
   */
  private estimateBudget(task: Task): number {
    let budget = 30000; // Base budget

    // Adjust by owner type
    switch (task.owners[0]) {
      case 'architect':
        budget = 80000;
        break;
      case 'backend-dev':
      case 'frontend-dev':
        budget = 60000;
        break;
      case 'qa-engineer':
        budget = 40000;
        break;
    }

    // Adjust by complexity
    if (task.depends && task.depends.length > 2) {
      budget *= 1.2;
    }

    return Math.floor(budget);
  }

  /**
   * Get allowed tools for task
   */
  private getAllowedTools(task: Task): string[] {
    const baseTools = ['read_file', 'write_file', 'edit_file', 'glob', 'grep'];

    // Add tools based on owner
    switch (task.owners[0]) {
      case 'backend-dev':
        return [...baseTools, 'execute_command', 'run_tests'];
      case 'frontend-dev':
        return [...baseTools, 'execute_command', 'run_tests', 'preview'];
      case 'qa-engineer':
        return [...baseTools, 'execute_command', 'run_tests', 'lint', 'typecheck'];
      default:
        return baseTools;
    }
  }

  /**
   * Calculate total tokens from results
   */
  private calculateTotalTokens(results: ExecutionResult[]): TokenUsage {
    return results.reduce(
      (acc, result) => ({
        inputTokens: acc.inputTokens + result.tokenUsage.inputTokens,
        outputTokens: acc.outputTokens + result.tokenUsage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 }
    );
  }

  /**
   * Generate execution summary
   */
  private generateSummary(results: ExecutionResult[]): string {
    const total = results.length;
    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return `Execution completed: ${succeeded}/${total} succeeded, ${failed} failed, ${skipped} skipped`;
  }
}
