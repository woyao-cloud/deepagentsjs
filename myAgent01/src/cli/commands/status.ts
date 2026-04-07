/**
 * Status Command - Show workflow execution status
 * @module cli/commands/status
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { WorkflowProgress } from '../../types/index.js';
import { createStatusView } from '../presenter/status-view.js';

/**
 * Show workflow status
 */
export async function showStatus(live: boolean = false): Promise<void> {
  const statusView = createStatusView();

  const displayStatus = async () => {
    try {
      const statusFile = path.join(process.cwd(), 'STATUS.md');
      const content = await fs.readFile(statusFile, 'utf-8');
      console.log(statusView.render(parseStatusContent(content)));
    } catch {
      console.log('No workflow status found. Run "deepagents run --phase plan" to start.');
    }
  };

  await displayStatus();

  if (live) {
    console.log('\n(Press Ctrl+C to exit)');
    const interval = setInterval(displayStatus, 3000);
    process.on('SIGINT', () => {
      clearInterval(interval);
      process.exit(0);
    });
  }
}

/**
 * Parse status content from STATUS.md
 */
function parseStatusContent(content: string): WorkflowProgress {
  // Simple markdown parsing for status
  const lines = content.split('\n');
  const phases: WorkflowProgress['phases'] = [];
  let currentPhase: (typeof phases)[0] | null = null;

  for (const line of lines) {
    // Phase header: ## Phase 1: Name [status]
    const phaseMatch = line.match(/^##\s+(Phase\s+\d+):\s+(.+?)\s*\[(\w+)\]?\s*$/);
    if (phaseMatch) {
      if (currentPhase) {
        phases.push(currentPhase);
      }
      currentPhase = {
        phaseId: phaseMatch[1],
        phaseName: phaseMatch[2],
        status: (phaseMatch[3]?.toLowerCase() as WorkflowProgress['phases'][0]['status']) || 'pending',
        tasks: [],
      };
      continue;
    }

    // Task line: - [x] Task Name or - [ ] Task Name
    const taskMatch = line.match(/^-\s+\[([ x~])\]\s+(.+?)(?:\s*\((.+?)\))?\s*$/);
    if (taskMatch && currentPhase) {
      const statusMap: Record<string, 'completed' | 'pending' | 'failed' | 'skipped'> = {
        x: 'completed',
        ' ': 'pending',
        '~': 'skipped',
      };
      currentPhase.tasks.push({
        taskId: taskMatch[2].toLowerCase().replace(/\s+/g, '-'),
        taskName: taskMatch[2],
        status: statusMap[taskMatch[1]] || 'pending',
      });
    }
  }

  if (currentPhase) {
    phases.push(currentPhase);
  }

  return { phases };
}
