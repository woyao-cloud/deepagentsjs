/**
 * Workflow Manager - handles workflow state and phase navigation
 * @module core/workflow-manager
 */

import type {
  WorkflowSpec,
  Phase,
  Task,
  TaskStatus,
  PhaseStatus,
  WorkflowProgress,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowValidationWarning,
  Checkpoint,
} from '../types/index.js';
import { DAGBuilder } from './dag.js';
import { generateCheckpointId } from '../utils/id-generator.js';
import { createLogger, type pino } from '../utils/logger.js';

const logger = createLogger({ component: 'workflow-manager' });

/**
 * Workflow Manager handles workflow state transitions and phase navigation
 */
export class WorkflowManager {
  private workflowSpec: WorkflowSpec;
  private currentPhaseId: string | null = null;
  private completedPhaseIds: Set<string> = new Set();
  private taskStatusMap: Map<string, TaskStatus> = new Map();
  private phaseStatusMap: Map<string, PhaseStatus> = new Map();
  private blockedTasks: Set<string> = new Set();
  private checkpointHistory: Checkpoint[] = [];

  constructor(workflowSpec: WorkflowSpec) {
    this.workflowSpec = workflowSpec;
    this.initializeStatus();
  }

  /**
   * Initialize status maps from workflow spec
   */
  private initializeStatus(): void {
    for (const phase of this.workflowSpec.phases) {
      this.phaseStatusMap.set(phase.id, 'pending');
      for (const task of phase.tasks) {
        this.taskStatusMap.set(task.id, task.status);
      }
    }
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): Phase | null {
    if (!this.currentPhaseId) {
      return null;
    }
    return this.workflowSpec.phases.find(p => p.id === this.currentPhaseId) ?? null;
  }

  /**
   * Get phase by ID
   */
  getPhase(phaseId: string): Phase | null {
    return this.workflowSpec.phases.find(p => p.id === phaseId) ?? null;
  }

  /**
   * Get next executable phase
   */
  getNextPhase(): Phase | null {
    for (const phase of this.workflowSpec.phases) {
      if (this.completedPhaseIds.has(phase.id)) {
        continue;
      }

      if (this.canExecute(phase.id)) {
        return phase;
      }
    }
    return null;
  }

  /**
   * Check if a phase can be executed
   */
  canExecute(phaseId: string): boolean {
    const phase = this.getPhase(phaseId);
    if (!phase) {
      return false;
    }

    // Check if all dependencies are completed
    for (const depId of phase.depends) {
      if (!this.completedPhaseIds.has(depId)) {
        return false;
      }
    }

    // Check if phase is not already completed or blocked
    const status = this.phaseStatusMap.get(phaseId);
    return status !== 'completed' && status !== 'blocked';
  }

  /**
   * Get all currently executable tasks
   */
  getExecutableTasks(): Task[] {
    const currentPhase = this.getCurrentPhase();
    if (!currentPhase) {
      return [];
    }

    const completedTaskIds = new Set<string>();
    for (const [taskId, status] of this.taskStatusMap) {
      if (status === 'completed') {
        completedTaskIds.add(taskId);
      }
    }

    return currentPhase.tasks.filter(task => {
      if (this.taskStatusMap.get(task.id) !== 'pending') {
        return false;
      }

      // Check if all dependencies are completed
      for (const depId of task.depends ?? []) {
        if (!completedTaskIds.has(depId)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get tasks that can run in parallel
   */
  getParallelExecutableTasks(): Task[][] {
    const executableTasks = this.getExecutableTasks();
    if (executableTasks.length === 0) {
      return [];
    }

    // Build DAG from tasks
    const builder = new DAGBuilder();

    for (const task of executableTasks) {
      builder.addNode(task.id, task.depends ?? []);
    }

    for (const task of executableTasks) {
      for (const depId of task.depends ?? []) {
        builder.addEdge(depId, task.id);
      }
    }

    const dag = builder.build();
    const result: Task[][] = [];

    for (const group of dag.executionOrder) {
      const tasksInGroup = executableTasks.filter(t => group.includes(t.id));
      if (tasksInGroup.length > 0) {
        result.push(tasksInGroup);
      }
    }

    return result;
  }

  /**
   * Start a phase
   */
  startPhase(phaseId: string): void {
    const phase = this.getPhase(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    if (!this.canExecute(phaseId)) {
      throw new Error(`Cannot execute phase: ${phaseId}`);
    }

    this.currentPhaseId = phaseId;
    this.phaseStatusMap.set(phaseId, 'in_progress');
    logger.info({ phaseId, phaseName: phase.name }, 'Starting phase');
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string): void {
    this.updateTaskStatus(taskId, 'completed');
    logger.info({ taskId }, 'Task completed');
  }

  /**
   * Mark a task as failed
   */
  failTask(taskId: string): void {
    this.updateTaskStatus(taskId, 'failed');
    logger.error({ taskId }, 'Task failed');

    // Check if this blocks the phase
    const currentPhase = this.getCurrentPhase();
    if (currentPhase) {
      const failedTask = currentPhase.tasks.find(t => t.id === taskId);
      if (failedTask && failedTask.parallel) {
        // Parallel tasks failure might not block the phase
        this.blockedTasks.add(taskId);
      }
    }
  }

  /**
   * Skip a task
   */
  skipTask(taskId: string): void {
    this.updateTaskStatus(taskId, 'skipped');
    logger.info({ taskId }, 'Task skipped');
  }

  /**
   * Rollback a task to pending
   */
  rollbackTask(taskId: string): void {
    this.taskStatusMap.set(taskId, 'pending');
    this.blockedTasks.delete(taskId);

    const phase = this.getCurrentPhase();
    if (phase) {
      const task = phase.tasks.find(t => t.id === taskId);
      if (task) {
        // Also rollback dependent tasks
        for (const dependentTask of phase.tasks) {
          if (dependentTask.depends?.includes(taskId)) {
            this.rollbackTask(dependentTask.id);
          }
        }
      }
    }

    logger.info({ taskId }, 'Task rolled back');
  }

  /**
   * Update task status
   */
  private updateTaskStatus(taskId: string, status: TaskStatus): void {
    this.taskStatusMap.set(taskId, status);

    // Check if all tasks in current phase are done
    const currentPhase = this.getCurrentPhase();
    if (currentPhase) {
      const allTasksDone = currentPhase.tasks.every(task => {
        const taskStatus = this.taskStatusMap.get(task.id);
        return taskStatus === 'completed' || taskStatus === 'skipped' || taskStatus === 'failed';
      });

      if (allTasksDone) {
        this.completePhase(currentPhase.id);
      }
    }
  }

  /**
   * Complete current phase
   */
  private completePhase(phaseId: string): void {
    this.phaseStatusMap.set(phaseId, 'completed');
    this.completedPhaseIds.add(phaseId);
    this.currentPhaseId = null;
    logger.info({ phaseId }, 'Phase completed');

    // Check if this completes the entire workflow
    if (this.isComplete()) {
      logger.info('Workflow completed');
    }
  }

  /**
   * Check if workflow is complete
   */
  isComplete(): boolean {
    return this.workflowSpec.phases.every(phase =>
      this.completedPhaseIds.has(phase.id)
    );
  }

  /**
   * Get workflow progress
   */
  getProgress(): WorkflowProgress {
    const completedTasks = Array.from(this.taskStatusMap.values())
      .filter(status => status === 'completed').length;
    const failedTasks = Array.from(this.taskStatusMap.values())
      .filter(status => status === 'failed').length;
    const totalTasks = this.taskStatusMap.size;

    return {
      totalPhases: this.workflowSpec.phases.length,
      completedPhases: this.completedPhaseIds.size,
      currentPhase: this.currentPhaseId,
      totalTasks,
      completedTasks,
      failedTasks,
      overallPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskStatusMap.get(taskId);
  }

  /**
   * Get phase status
   */
  getPhaseStatus(phaseId: string): PhaseStatus | undefined {
    return this.phaseStatusMap.get(phaseId);
  }

  /**
   * Save current state as checkpoint
   */
  saveCheckpoint(tokenUsage?: { inputTokens: number; outputTokens: number }): Checkpoint {
    const taskStatusRecord: Record<string, TaskStatus> = {};
    for (const [taskId, status] of this.taskStatusMap) {
      taskStatusRecord[taskId] = status;
    }

    const checkpoint: Checkpoint = {
      id: generateCheckpointId(),
      timestamp: new Date(),
      workflow: {
        currentPhase: this.currentPhaseId ?? '',
        completedPhases: Array.from(this.completedPhaseIds),
        taskStatus: taskStatusRecord,
        blockedTasks: Array.from(this.blockedTasks),
      },
      agent: {
        messages: [],
        files: {},
        todos: [],
      },
      memory: {
        working: null,
        shortTerm: null,
      },
      tokenUsage: tokenUsage ?? { inputTokens: 0, outputTokens: 0 },
      snapshots: {
        srcDir: './src',
        logsDir: './LOGS',
        checkpointDir: './.deepagents/checkpoints',
      },
    };

    this.checkpointHistory.push(checkpoint);
    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  restoreCheckpoint(checkpoint: Checkpoint): void {
    this.currentPhaseId = checkpoint.workflow.currentPhase || null;
    this.completedPhaseIds = new Set(checkpoint.workflow.completedPhases);
    this.taskStatusMap = new Map(Object.entries(checkpoint.workflow.taskStatus));
    this.blockedTasks = new Set(checkpoint.workflow.blockedTasks);

    // Restore phase statuses
    for (const phase of this.workflowSpec.phases) {
      if (this.completedPhaseIds.has(phase.id)) {
        this.phaseStatusMap.set(phase.id, 'completed');
      } else if (phase.id === this.currentPhaseId) {
        this.phaseStatusMap.set(phase.id, 'in_progress');
      } else {
        this.phaseStatusMap.set(phase.id, 'pending');
      }
    }

    logger.info({ checkpointId: checkpoint.id }, 'Restored from checkpoint');
  }

  /**
   * Get workflow specification
   */
  getWorkflowSpec(): WorkflowSpec {
    return this.workflowSpec;
  }

  /**
   * Validate workflow
   */
  validate(): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationWarning[] = [];

    // Check for duplicate phase IDs
    const phaseIds = new Set<string>();
    for (const phase of this.workflowSpec.phases) {
      if (phaseIds.has(phase.id)) {
        errors.push({
          path: `phases[${phase.id}]`,
          message: `Duplicate phase ID: ${phase.id}`,
        });
      }
      phaseIds.add(phase.id);
    }

    // Check phase dependencies exist
    for (const phase of this.workflowSpec.phases) {
      for (const depId of phase.depends) {
        if (!phaseIds.has(depId)) {
          errors.push({
            path: `phases[${phase.id}].depends`,
            message: `Unknown dependency: ${depId}`,
          });
        }
      }
    }

    // Check for circular dependencies in phases
    if (this.hasCircularPhaseDependencies()) {
      errors.push({
        path: 'phases',
        message: 'Circular dependency detected in phases',
      });
    }

    // Check for duplicate task IDs
    const taskIds = new Set<string>();
    for (const phase of this.workflowSpec.phases) {
      for (const task of phase.tasks) {
        if (taskIds.has(task.id)) {
          errors.push({
            path: `tasks[${task.id}]`,
            message: `Duplicate task ID: ${task.id}`,
          });
        }
        taskIds.add(task.id);
      }
    }

    // Check task dependencies exist
    for (const phase of this.workflowSpec.phases) {
      for (const task of phase.tasks) {
        for (const depId of task.depends ?? []) {
          if (!taskIds.has(depId)) {
            errors.push({
              path: `tasks[${task.id}].depends`,
              message: `Unknown task dependency: ${depId}`,
            });
          }
        }
      }
    }

    // Warn about tasks with no owners
    for (const phase of this.workflowSpec.phases) {
      for (const task of phase.tasks) {
        if (task.owners.length === 0) {
          warnings.push({
            path: `tasks[${task.id}]`,
            message: `Task has no owners assigned: ${task.id}`,
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
   * Check for circular dependencies in phases
   */
  private hasCircularPhaseDependencies(): boolean {
    const phaseIds = this.workflowSpec.phases.map(p => p.id);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (phaseId: string): boolean => {
      visited.add(phaseId);
      recursionStack.add(phaseId);

      const phase = this.getPhase(phaseId);
      if (phase) {
        for (const depId of phase.depends) {
          if (!visited.has(depId) && hasCycle(depId)) {
            return true;
          }
          if (recursionStack.has(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(phaseId);
      return false;
    };

    for (const phaseId of phaseIds) {
      if (!visited.has(phaseId) && hasCycle(phaseId)) {
        return true;
      }
    }

    return false;
  }
}
