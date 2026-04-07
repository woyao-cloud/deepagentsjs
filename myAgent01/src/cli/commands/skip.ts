/**
 * Skip Command - Skip a task
 * @module cli/commands/skip
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Skip a task
 */
export async function skipTask(taskName: string): Promise<void> {
  const statusFile = path.join(process.cwd(), 'STATUS.md');

  try {
    const content = await fs.readFile(statusFile, 'utf-8');
    const lines = content.split('\n');
    const taskPattern = new RegExp(`^-\\s+(\\[.\\])\\s+${escapeRegex(taskName)}(?:\\s*\\(.*\\))?\\s*$`);

    let found = false;
    const updatedLines = lines.map(line => {
      const match = line.match(taskPattern);
      if (match) {
        found = true;
        return line.replace(match[1], '[~]');
      }
      return line;
    });

    if (!found) {
      console.log(`Task not found: ${taskName}`);
      console.log('Use "deepagents status" to see available tasks.');
      return;
    }

    await fs.writeFile(statusFile, updatedLines.join('\n'), 'utf-8');
    console.log(`Task skipped: ${taskName}`);
  } catch {
    console.log('No STATUS.md found. Run "deepagents run --phase plan" to initialize.');
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
