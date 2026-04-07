/**
 * Run Command - Execute workflow phases
 * @module cli/commands/run
 */

import { promises as fs } from 'fs';
import path from 'path';
import { WorkflowManager } from '../../core/workflow-manager.js';
import { ExecutionEngine, type ExecutionOptions } from '../../core/execution-engine.js';
import { AgentScheduler } from '../../core/agent-scheduler.js';
import { createQualityGate } from '../../quality/quality-gate.js';
import { CheckpointManager } from '../../storage/checkpoint-manager.js';
import { parseWorkflowFile } from '../../config/workflow-parser.js';
import { parseAgentFile } from '../../config/agent-parser.js';
import { createProgressPresenter } from '../presenter/progress.js';
import { createLogger } from '../../utils/logger.js';
import { DAGBuilder } from '../../core/dag.js';

const logger = createLogger({ component: 'run-command' });

/**
 * Run options
 */
export interface RunOptions {
  parallel: boolean;
  watch: boolean;
  resume: boolean;
  skipQualityGate: boolean;
}

/**
 * Execute workflow phase
 */
export async function runPhase(phase: string, options: RunOptions): Promise<void> {
  const progress = createProgressPresenter();

  try {
    // Load workflow and agent configs
    const projectRoot = process.cwd();
    const workflowPath = path.join(projectRoot, 'workflow.md');
    const agentPath = path.join(projectRoot, 'agent.md');

    if (!(await fileExists(workflowPath))) {
      console.error('workflow.md not found. Run "deepagents init" first.');
      return;
    }

    if (!(await fileExists(agentPath))) {
      console.error('agent.md not found. Run "deepagents init" first.');
      return;
    }

    progress.start(phase, 'Loading configuration');
    const workflowSpec = await parseWorkflowFile(workflowPath);
    const agentRegistry = await parseAgentFile(agentPath);

    progress.update(20, 'Initializing components');

    // Initialize workflow manager
    const workflowManager = new WorkflowManager(workflowSpec);

    // Build DAG from workflow
    const dagBuilder = new DAGBuilder();
    for (const phaseSpec of workflowSpec.phases) {
      for (const task of phaseSpec.tasks) {
        dagBuilder.addNode(task.id, task.depends ?? []);
      }
    }
    const dag = dagBuilder.build();

    // Initialize checkpoint manager
    const checkpointManager = new CheckpointManager({
      checkpointDir: path.join(projectRoot, '.checkpoints'),
    });

    // Initialize quality gate
    const qualityGate = createQualityGate(projectRoot, phase);

    // Create agent factory
    const { AgentFactory } = await import('../../agents/agent-factory.js');
    const agentFactory = new AgentFactory();
    agentFactory.setRegistry(agentRegistry);

    // Create token tracker
    const { createTokenTracker } = await import('../../token/index.js');
    const tokenTracker = createTokenTracker();

    // Initialize scheduler
    const scheduler = new AgentScheduler(
      agentFactory,
      dag,
      tokenTracker,
      { parallel: options.parallel }
    );

    // Initialize execution engine
    const executionEngine = new ExecutionEngine(
      scheduler,
      workflowManager,
      qualityGate,
      checkpointManager,
      {
        parallel: options.parallel,
        watch: options.watch,
        skipQualityGate: options.skipQualityGate,
        autoCheckpoint: true,
        checkpointInterval: 300000,
      }
    );

    // Subscribe to execution events for progress display
    executionEngine.subscribe(event => {
      switch (event.type) {
        case 'phase_start':
          progress.start(event.phaseId, 'Starting phase');
          break;
        case 'task_complete':
          progress.update(50, `Task completed: ${event.result.taskId}`);
          break;
        case 'task_failed':
          progress.fail(`Task failed: ${event.result.taskId}`);
          break;
        case 'quality_check_start':
          progress.update(80, 'Running quality gate');
          break;
        case 'quality_check_end':
          progress.update(90, `Quality gate: ${event.passed ? 'passed' : 'failed'}`);
          break;
        case 'phase_end':
          if (event.result.success) {
            progress.success(`Phase completed in ${event.result.duration}ms`);
          } else {
            progress.fail(`Phase failed: ${event.result.error}`);
          }
          break;
      }
    });

    // Resume from checkpoint if requested
    if (options.resume) {
      progress.update(30, 'Resuming from checkpoint');
      const checkpoints = await executionEngine.listCheckpoints();
      if (checkpoints.length > 0) {
        await executionEngine.restoreCheckpoint(checkpoints[checkpoints.length - 1].id);
        console.log(`Resumed from checkpoint: ${checkpoints[checkpoints.length - 1].id}`);
      }
    }

    // Execute the phase
    progress.update(40, `Executing phase: ${phase}`);
    const result = await executionEngine.executePhase(phase);

    // Output result
    console.log('\n');
    if (result.success) {
      console.log(`\x1b[32m✓ Phase ${phase} completed successfully\x1b[0m`);
      console.log(`  Tasks: ${result.tasksCompleted} completed, ${result.tasksFailed} failed`);
      console.log(`  Duration: ${result.duration}ms`);
    } else {
      console.error(`\x1b[31m✗ Phase ${phase} failed\x1b[0m`);
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
    }
  } catch (error) {
    progress.fail(`Error: ${(error as Error).message}`);
    logger.error({ error }, 'Phase execution failed');
    throw error;
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
