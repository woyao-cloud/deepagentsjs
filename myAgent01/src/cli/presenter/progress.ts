/**
 * Progress Display - Real-time progress presenter
 * @module cli/presenter/progress
 */

const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠿'];
const CHECKmark = '\x1b[32m✓\x1b[0m';
const ERRORMARK = '\x1b[31m✗\x1b[0m';
const WARNMARK = '\x1b[33m⚠\x1b[0m';

/**
 * Progress state
 */
export interface ProgressState {
  phase: string;
  task: string;
  status: 'running' | 'success' | 'failed' | 'waiting';
  progress: number; // 0-100
  message?: string;
}

/**
 * Progress presenter for real-time display
 */
export class ProgressPresenter {
  private currentState: ProgressState | null = null;
  private spinnerIndex = 0;
  private lastLineCount = 0;

  /**
   * Start progress display
   */
  start(phase: string, task: string): void {
    this.currentState = { phase, task, status: 'running', progress: 0 };
    this.render();
  }

  /**
   * Update progress
   */
  update(progress: number, message?: string): void {
    if (this.currentState) {
      this.currentState.progress = Math.min(100, Math.max(0, progress));
      if (message) {
        this.currentState.message = message;
      }
      this.render();
    }
  }

  /**
   * Mark as succeeded
   */
  success(message?: string): void {
    if (this.currentState) {
      this.currentState.status = 'success';
      this.currentState.progress = 100;
      if (message) {
        this.currentState.message = message;
      }
      this.render();
      this.clear();
    }
  }

  /**
   * Mark as failed
   */
  fail(message?: string): void {
    if (this.currentState) {
      this.currentState.status = 'failed';
      if (message) {
        this.currentState.message = message;
      }
      this.render();
      this.clear();
    }
  }

  /**
   * Wait for input
   */
  wait(message: string): void {
    if (this.currentState) {
      this.currentState.status = 'waiting';
      this.currentState.message = message;
      this.render();
    }
  }

  /**
   * Clear progress display
   */
  private clear(): void {
    if (this.lastLineCount > 0) {
      process.stdout.write('\r' + '\u001b[K'.repeat(this.lastLineCount));
      this.lastLineCount = 0;
    }
  }

  /**
   * Render current state
   */
  private render(): void {
    if (!this.currentState) return;

    const spinner = SPINNER_CHARS[this.spinnerIndex % SPINNER_CHARS.length];
    const { phase, task, status, progress, message } = this.currentState;

    let statusIcon: string;
    let statusText: string;

    switch (status) {
      case 'running':
        statusIcon = spinner;
        statusText = `\x1b[36m${task}\x1b[0m`;
        break;
      case 'success':
        statusIcon = CHECKmark;
        statusText = `\x1b[32m${task}\x1b[0m`;
        break;
      case 'failed':
        statusIcon = ERRORMARK;
        statusText = `\x1b[31m${task}\x1b[0m`;
        break;
      case 'waiting':
        statusIcon = WARNMARK;
        statusText = `\x1b[33m${task}\x1b[0m`;
        break;
    }

    const bar = this.renderBar(progress);
    const msg = message ? ` | ${message}` : '';

    const line = `\r${statusIcon} [${phase}] ${statusText} ${bar} ${msg}`;

    // Clear previous lines
    if (this.lastLineCount > 0) {
      process.stdout.write('\r\u001b[2K'.repeat(this.lastLineCount));
    }

    process.stdout.write(line);
    this.lastLineCount = 1;

    // Animate spinner
    if (status === 'running') {
      this.spinnerIndex++;
    }
  }

  /**
   * Render progress bar
   */
  private renderBar(progress: number): string {
    const width = 30;
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    const bar =
      '\x1b[32m' +
      '█'.repeat(filled) +
      '\x1b[2m' +
      '░'.repeat(empty) +
      '\x1b[0m';

    return `[${bar}] ${progress.toString().padStart(3)}%`;
  }
}

/**
 * Create progress presenter
 */
export function createProgressPresenter(): ProgressPresenter {
  return new ProgressPresenter();
}
