/**
 * Status View - Status report renderer with color output
 * @module cli/presenter/status-view
 */

import type { WorkflowProgress, PhaseStatus, TaskStatus } from '../../types/index.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const COLORS = {
  phasePending: '\x1b[33m', // yellow
  phaseInProgress: '\x1b[36m', // cyan
  phaseCompleted: '\x1b[32m', // green
  phaseBlocked: '\x1b[31m', // red
  taskPending: '\x1b[33m',
  taskInProgress: '\x1b[36m',
  taskCompleted: '\x1b[32m',
  taskFailed: '\x1b[31m',
  taskSkipped: '\x1b[2m',
};

/**
 * Status view renderer
 */
export class StatusView {
  private useColor: boolean;

  constructor(options?: { color?: boolean }) {
    this.useColor = options?.color ?? true;
  }

  /**
   * Render workflow status
   */
  render(progress: WorkflowProgress): string {
    const lines: string[] = [];

    lines.push(this.renderHeader(progress));
    lines.push('');

    for (const phaseProgress of progress.phases) {
      lines.push(this.renderPhase(phaseProgress));
    }

    lines.push('');
    lines.push(this.renderSummary(progress));

    return lines.join('\n');
  }

  /**
   * Render header
   */
  private renderHeader(progress: WorkflowProgress): string {
    const total = progress.phases.length;
    const completed = progress.phases.filter(p => p.status === 'completed').length;
    const current = progress.phases.find(p => p.status === 'in_progress');

    let header = `${BOLD}Workflow Status${RESET}\n`;
    header += `${DIM}${'─'.repeat(50)}${RESET}\n`;
    header += `Total: ${completed}/${total} phases`;
    if (current) {
      header += ` | Current: ${current.phaseId}`;
    }

    return header;
  }

  /**
   * Render phase status
   */
  private renderPhase(phaseProgress: {
    phaseId: string;
    phaseName: string;
    status: PhaseStatus;
    tasks: { taskId: string; taskName: string; status: TaskStatus }[];
  }): string {
    const { phaseId, phaseName, status, tasks } = phaseProgress;
    const statusColor = this.getPhaseStatusColor(status);
    const statusText = this.getPhaseStatusText(status);

    let line = `${statusColor}${BOLD}[${statusText}]${RESET} `;
    line += `${phaseId}: ${phaseName}`;

    const taskSummary = this.renderTaskSummary(tasks);
    if (taskSummary) {
      line += ` ${DIM}${taskSummary}${RESET}`;
    }

    return line;
  }

  /**
   * Render task summary for a phase
   */
  private renderTaskSummary(tasks: { taskId: string; taskName: string; status: TaskStatus }[]): string {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;

    const parts: string[] = [];

    if (completed > 0) parts.push(`${COLORS.taskCompleted}${completed}✓${RESET}`);
    if (inProgress > 0) parts.push(`${COLORS.taskInProgress}${inProgress}●${RESET}`);
    if (failed > 0) parts.push(`${COLORS.taskFailed}${failed}✗${RESET}`);
    if (pending > 0) parts.push(`${COLORS.taskPending}${pending}○${RESET}`);

    return `(${parts.join(' ')})`;
  }

  /**
   * Render summary
   */
  private renderSummary(progress: WorkflowProgress): string {
    const totalTasks = progress.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = progress.phases.reduce(
      (sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length,
      0
    );
    const failedTasks = progress.phases.reduce(
      (sum, p) => sum + p.tasks.filter(t => t.status === 'failed').length,
      0
    );

    return (
      `${BOLD}Summary:${RESET} ` +
      `${COLORS.taskCompleted}${completedTasks} completed${RESET}, ` +
      `${failedTasks > 0 ? COLORS.taskFailed : ''}${failedTasks} failed${RESET}, ` +
      `${totalTasks - completedTasks - failedTasks} pending`
    );
  }

  /**
   * Get phase status color
   */
  private getPhaseStatusColor(status: PhaseStatus): string {
    switch (status) {
      case 'completed':
        return COLORS.phaseCompleted;
      case 'in_progress':
        return COLORS.phaseInProgress;
      case 'blocked':
        return COLORS.phaseBlocked;
      default:
        return COLORS.phasePending;
    }
  }

  /**
   * Get phase status text
   */
  private getPhaseStatusText(status: PhaseStatus): string {
    switch (status) {
      case 'pending':
        return 'PENDING';
      case 'in_progress':
        return 'RUNNING';
      case 'completed':
        return 'DONE';
      case 'blocked':
        return 'BLOCKED';
    }
  }
}

/**
 * Create status view
 */
export function createStatusView(options?: { color?: boolean }): StatusView {
  return new StatusView(options);
}
