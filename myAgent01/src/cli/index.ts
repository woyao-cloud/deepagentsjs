/**
 * CLI entry point
 * @module cli
 */

import { Command } from 'commander';
import { initProject } from './commands/init.js';
import { runPhase } from './commands/run.js';
import { confirmPlanning } from './commands/confirm.js';
import { showStatus } from './commands/status.js';
import { showLogs } from './commands/logs.js';
import { skipTask } from './commands/skip.js';
import { rollbackTask } from './commands/rollback.js';
import { VERSION } from '../index.js';

const program = new Command();

program
  .name('deepagents')
  .description('DeepAgents Code Agent - Multi-agent code generation system')
  .version(VERSION);

// deepagents init --name <project>
program
  .command('init')
  .description('Initialize a new DeepAgents project')
  .requiredOption('--name <name>', 'Project name')
  .option('--template <template>', 'Template to use', 'default')
  .action(initProject);

// deepagents run --phase <plan|execute>
program
  .command('run')
  .description('Run workflow phase')
  .requiredOption('--phase <phase>', 'Phase to run (plan|execute)')
  .option('--parallel', 'Enable parallel execution', false)
  .option('--watch', 'Watch for changes', false)
  .option('--resume', 'Resume from checkpoint', false)
  .option('--skip-quality-gate', 'Skip quality gates', false)
  .action(runPhase);

// deepagents confirm --file <planning-file>
program
  .command('confirm')
  .description('Confirm PLANNING.md to proceed with execution')
  .requiredOption('--file <file>', 'Planning file path')
  .option('--revise', 'Record as revision', false)
  .action(confirmPlanning);

// deepagents status
program
  .command('status')
  .description('Show workflow execution status')
  .option('--live', 'Watch live status', false)
  .action(showStatus);

// deepagents logs --agent <name>
program
  .command('logs')
  .description('Show agent execution logs')
  .requiredOption('--agent <name>', 'Agent name')
  .option('--follow', 'Follow log output', false)
  .option('--last <lines>', 'Number of last lines to show', '100')
  .action(showLogs);

// deepagents skip --task <name>
program
  .command('skip')
  .description('Skip a task')
  .requiredOption('--task <name>', 'Task name')
  .action(skipTask);

// deepagents rollback --task <name>
program
  .command('rollback')
  .description('Rollback a task')
  .requiredOption('--task <name>', 'Task name')
  .option('--force', 'Force rollback without confirmation', false)
  .action(rollbackTask);

// Export program for testing
export { program };

// Run if executed directly
program.parse();
