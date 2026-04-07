/**
 * Rollback Command - Rollback a task to its last checkpoint
 * @module cli/commands/rollback
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readdir } from 'fs/promises';

/**
 * Rollback a task to its last checkpoint
 */
export async function rollbackTask(taskName: string, force: boolean = false): Promise<void> {
  const checkpointDir = path.join(process.cwd(), '.checkpoints');
  const statusFile = path.join(process.cwd(), 'STATUS.md');

  try {
    // Find checkpoint for task
    const taskCheckpointDir = path.join(checkpointDir, 'tasks', taskName);

    const files = await readdir(taskCheckpointDir).catch(() => []);
    if (files.length === 0) {
      console.log(`No checkpoint found for task: ${taskName}`);
      return;
    }

    // Get most recent checkpoint
    const checkpoints = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (checkpoints.length === 0) {
      console.log(`No checkpoint found for task: ${taskName}`);
      return;
    }

    const latestCheckpoint = checkpoints[0];
    const checkpointPath = path.join(taskCheckpointDir, latestCheckpoint);

    if (!force) {
      const answer = await prompt('This will restore files from checkpoint. Continue? (y/N) ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Rollback cancelled.');
        return;
      }
    }

    // Read checkpoint
    const checkpointData = JSON.parse(
      await fs.readFile(checkpointPath, 'utf-8')
    );

    // Restore files
    if (checkpointData.files) {
      for (const file of checkpointData.files) {
        const filePath = path.join(process.cwd(), file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }

    // Update STATUS.md
    if (statusFile) {
      const content = await fs.readFile(statusFile, 'utf-8');
      const lines = content.split('\n');
      const taskPattern = new RegExp(`^-\\s+(\\[.\\])\\s+${escapeRegex(taskName)}(?:\\s*\\(.*\\))?\\s*$`);

      const updatedLines = lines.map(line => {
        const match = line.match(taskPattern);
        if (match) {
          return line.replace(match[1], '[ ]');
        }
        return line;
      });

      await fs.writeFile(statusFile, updatedLines.join('\n'), 'utf-8');
    }

    console.log(`Task rolled back: ${taskName}`);
    console.log(`Restored ${checkpointData.files?.length || 0} files from checkpoint: ${latestCheckpoint}`);
  } catch {
    console.log(`No checkpoint found for task: ${taskName}`);
    console.log('Run "deepagents run --phase plan" to initialize checkpoints.');
  }
}

/**
 * Simple prompt for confirmation
 */
function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(question + ' ');
    process.stdin.once('data', data => {
      resolve(data.toString().trim());
    });
  });
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
