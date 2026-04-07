/**
 * Execution Engine - orchestrates phase execution with quality gates and checkpoints
 * @module core/execution-engine
 */

import type {
  Phase,
  Task,
  TaskStatus,
  Checkpoint,
  ExecutionResult,
  PhaseResult,
  WorkflowProgress,
} from '../types/index.js';
import type { PlanningDocument } from '../types/planning.js';
import type { AgentScheduler, SchedulerOptions } from './agent-scheduler.js';
import type { WorkflowManager } from './workflow-manager.js';
import type { QualityGate } from '../quality/quality-gate.js';
import type { CheckpointManager } from '../storage/checkpoint-manager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'execution-engine' });

/**
 * Execution options
 */
export interface ExecutionOptions {
  parallel: boolean;
  watch: boolean;
  skipQualityGate: boolean;
  autoCheckpoint: boolean;
  checkpointInterval: number;
}

/**
 * Default execution options
 */
const DEFAULT_OPTIONS: ExecutionOptions = {
  parallel: true,
  watch: false,
  skipQualityGate: false,
  autoCheckpoint: true,
  checkpointInterval: 300000, // 5 minutes
};

/**
 * Execution state
 */
type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * Dangerous operation requiring approval
 */
export interface DangerousOperation {
  type: 'delete' | 'overwrite' | 'branch' | 'commit';
  target: string;
  description: string;
}

/**
 * Confirmation result
 */
export interface Confirmation {
  confirmed: boolean;
  reason?: string;
}

/**
 * Approval result for dangerous operations
 */
export interface Approval {
  approved: boolean;
  approvedBy?: string;
  timestamp?: Date;
}

/**
 * Execution Engine manages the lifecycle of phase execution
 */
export class ExecutionEngine {
  private scheduler: AgentScheduler;
  private workflowManager: WorkflowManager;
  private qualityGate: QualityGate;
  private checkpointManager: CheckpointManager;
  private options: ExecutionOptions;
  private state: ExecutionState = 'idle';
  private currentPhaseId: string | null = null;
  private lastCheckpointTime: number = 0;
  private listeners: Set<(event: ExecutionEvent) => void> = new Set();

  constructor(
    scheduler: AgentScheduler,
    workflowManager: WorkflowManager,
    qualityGate: QualityGate,
    checkpointManager: CheckpointManager,
    options?: Partial<ExecutionOptions>
  ) {
    this.scheduler = scheduler;
    this.workflowManager = workflowManager;
    this.qualityGate = qualityGate;
    this.checkpointManager = checkpointManager;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    logger.info({ options: this.options }, 'ExecutionEngine initialized');
  }

  /**
   * Execute a specific phase
   */
  async executePhase(phaseId: string, options?: Partial<ExecutionOptions>): Promise<PhaseResult> {
    const execOptions = { ...this.options, ...options };

    logger.info({ phaseId, options: execOptions }, 'Starting phase execution');

    if (this.state === 'running') {
      throw new Error('Execution already in progress');
    }

    const phase = this.workflowManager.getPhase(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    if (!this.workflowManager.canExecute(phaseId)) {
      throw new Error(`Cannot execute phase: ${phaseId}`);
    }

    this.state = 'running';
    this.currentPhaseId = phaseId;
    this.workflowManager.startPhase(phaseId);

    const startTime = Date.now();
    const taskResults: ExecutionResult[] = [];

    this.emit({ type: 'phase_start', phaseId });

    try {
      // Get executable tasks
      const executableTasks = this.workflowManager.getExecutableTasks();

      if (execOptions.parallel) {
        // Parallel execution with DAG ordering
        const parallelGroups = this.workflowManager.getParallelExecutableTasks();
        for (const group of parallelGroups) {
          const groupResults = await this.scheduler.scheduleParallel(group.map(t => t.id));
          taskResults.push(...groupResults);

          // Process results
          for (const result of groupResults) {
            this.processTaskResult(result);

            // Auto-checkpoint
            if (execOptions.autoCheckpoint) {
              await this.maybeCheckpoint();
            }
          }
        }
      } else {
        // Sequential execution
        for (const task of executableTasks) {
          const results = await this.scheduler.scheduleSequential([task.id]);
          const result = results[0];
          taskResults.push(result);
          this.processTaskResult(result);

          // Stop on failure (unless quality gate is skipped)
          if (result.status === 'failed' && !execOptions.skipQualityGate) {
            logger.warn({ taskId: task.id }, 'Task failed, stopping phase execution');
            break;
          }

          // Auto-checkpoint
          if (execOptions.autoCheckpoint) {
            await this.maybeCheckpoint();
          }
        }
      }

      // Quality gate check
      let qualityPassed = true;
      if (!execOptions.skipQualityGate && taskResults.some(r => r.status === 'success')) {
        this.emit({ type: 'quality_check_start' });
        qualityPassed = await this.runQualityGate(phase);
        this.emit({ type: 'quality_check_end', passed: qualityPassed });
      }

      const endTime = Date.now();
      const phaseResult = this.createPhaseResult(
        phase,
        taskResults,
        startTime,
        endTime,
        qualityPassed
      );

      this.state = 'completed';
      this.emit({ type: 'phase_end', result: phaseResult });

      logger.info({
        phaseId,
        duration: phaseResult.duration,
        tasksCompleted: phaseResult.tasksCompleted,
        tasksFailed: phaseResult.tasksFailed,
        qualityPassed,
      }, 'Phase execution completed');

      return phaseResult;
    } catch (error) {
      this.state = 'failed';
      const errorResult: PhaseResult = {
        phaseId,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        success: false,
        taskResults,
        tasksCompleted: taskResults.filter(r => r.status === 'success').length,
        tasksFailed: taskResults.filter(r => r.status === 'failed').length,
        qualityPassed: false,
        error: String(error),
      };

      this.emit({ type: 'phase_error', error: String(error), result: errorResult });
      logger.error({ phaseId, error }, 'Phase execution failed');

      throw error;
    }
  }

  /**
   * Resume paused execution
   */
  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      throw new Error('No paused execution to resume');
    }

    logger.info('Resuming execution');
    this.state = 'running';
    this.emit({ type: 'resume' });

    // Continue with current phase
    if (this.currentPhaseId) {
      await this.executePhase(this.currentPhaseId);
    }
  }

  /**
   * Pause execution
   */
  async pause(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('No running execution to pause');
    }

    logger.info('Pausing execution');
    this.state = 'paused';
    this.emit({ type: 'pause' });

    // Save checkpoint
    await this.saveCheckpoint();
  }

  /**
   * Await user confirmation during execution
   */
  async awaitConfirmation(prompt: string): Promise<Confirmation> {
    logger.info({ prompt }, 'Awaiting confirmation');

    // In a real implementation, this would block and wait for user input
    // For now, return a default confirmation
    this.emit({ type: 'confirmation_request', prompt });

    return {
      confirmed: true,
      reason: 'Default confirmation (implement user input)',
    };
  }

  /**
   * Request approval for dangerous operation
   */
  async requestApproval(operation: DangerousOperation): Promise<Approval> {
    logger.info(operation, 'Requesting approval for dangerous operation');

    this.emit({ type: 'approval_request', operation });

    // In a real implementation, this would block and wait for approval
    // For now, return denied approval by default
    return {
      approved: false,
      approvedBy: undefined,
      timestamp: undefined,
    };
  }

  /**
   * Get current execution state
   */
  getState(): ExecutionState {
    return this.state;
  }

  /**
   * Get current phase ID
   */
  getCurrentPhaseId(): string | null {
    return this.currentPhaseId;
  }

  /**
   * Get progress
   */
  getProgress(): WorkflowProgress {
    return this.workflowManager.getProgress();
  }

  /**
   * Subscribe to execution events
   */
  subscribe(listener: (event: ExecutionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Save checkpoint
   */
  async saveCheckpoint(): Promise<Checkpoint> {
    logger.info('Saving checkpoint');
    const checkpoint = this.workflowManager.saveCheckpoint();
    await this.checkpointManager.save(checkpoint);
    this.lastCheckpointTime = Date.now();
    this.emit({ type: 'checkpoint_saved', checkpointId: checkpoint.id });
    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = await this.checkpointManager.load(checkpointId);
    if (checkpoint) {
      this.workflowManager.restoreCheckpoint(checkpoint);
      this.emit({ type: 'checkpoint_restored', checkpointId });
      logger.info({ checkpointId }, 'Checkpoint restored');
    } else {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
  }

  /**
   * List available checkpoints
   */
  async listCheckpoints(): Promise<Checkpoint[]> {
    return this.checkpointManager.list();
  }

  /**
   * Process task result and update workflow state
   */
  private processTaskResult(result: ExecutionResult): void {
    switch (result.status) {
      case 'success':
        this.workflowManager.completeTask(result.taskId);
        this.emit({ type: 'task_complete', result });
        break;
      case 'failed':
        this.workflowManager.failTask(result.taskId);
        this.emit({ type: 'task_failed', result });
        break;
      case 'skipped':
        this.workflowManager.skipTask(result.taskId);
        this.emit({ type: 'task_skipped', result });
        break;
    }
  }

  /**
   * Run quality gate for phase
   */
  private async runQualityGate(phase: Phase): Promise<boolean> {
    try {
      // Determine what to check based on phase
      const targets = this.getQualityTargets(phase);

      for (const target of targets) {
        const result = await this.qualityGate.runChecks(target);
        if (!result.passed) {
          logger.warn({ target, result }, 'Quality gate failed');
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error({ error }, 'Quality gate error');
      return false;
    }
  }

  /**
   * Get quality check targets based on phase
   */
  private getQualityTargets(phase: Phase): string[] {
    const targets: string[] = [];

    for (const task of phase.tasks) {
      if (task.outputFiles) {
        targets.push(...task.outputFiles);
      }
    }

    // Always check src directory if it exists
    if (targets.length === 0) {
      targets.push('./src');
    }

    return targets;
  }

  /**
   * Maybe create checkpoint based on interval
   */
  private async maybeCheckpoint(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheckpointTime >= this.options.checkpointInterval) {
      await this.saveCheckpoint();
    }
  }

  /**
   * Create phase result object
   */
  private createPhaseResult(
    phase: Phase,
    taskResults: ExecutionResult[],
    startTime: number,
    endTime: number,
    qualityPassed: boolean
  ): PhaseResult {
    return {
      phaseId: phase.id,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: endTime - startTime,
      success: taskResults.every(r => r.status === 'success'),
      taskResults,
      tasksCompleted: taskResults.filter(r => r.status === 'success').length,
      tasksFailed: taskResults.filter(r => r.status === 'failed').length,
      qualityPassed,
    };
  }

  /**
   * Emit event to listeners
   */
  private emit(event: ExecutionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error({ error, event }, 'Event listener error');
      }
    }
  }
}

/**
 * Execution event types
 */
export type ExecutionEvent =
  | { type: 'phase_start'; phaseId: string }
  | { type: 'phase_end'; result: PhaseResult }
  | { type: 'phase_error'; error: string; result: PhaseResult }
  | { type: 'task_complete'; result: ExecutionResult }
  | { type: 'task_failed'; result: ExecutionResult }
  | { type: 'task_skipped'; result: ExecutionResult }
  | { type: 'quality_check_start' }
  | { type: 'quality_check_end'; passed: boolean }
  | { type: 'checkpoint_saved'; checkpointId: string }
  | { type: 'checkpoint_restored'; checkpointId: string }
  | { type: 'confirmation_request'; prompt: string }
  | { type: 'approval_request'; operation: DangerousOperation }
  | { type: 'pause' }
  | { type: 'resume' };
