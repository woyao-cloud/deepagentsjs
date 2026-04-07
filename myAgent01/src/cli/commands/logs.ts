/**
 * Logs Command - Tail agent logs
 * @module cli/commands/logs
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Show agent logs
 */
export async function showLogs(agent: string, follow: boolean = false, last: number = 100): Promise<void> {
  const logsDir = path.join(process.cwd(), 'LOGS', 'agents', agent);

  const readAndDisplayLogs = async () => {
    try {
      const files = await fs.readdir(logsDir);
      const logFiles = files.filter(f => f.endsWith('.log')).sort();

      if (logFiles.length === 0) {
        console.log(`No logs found for agent: ${agent}`);
        return;
      }

      // Get the most recent log file
      const latestLog = logFiles[logFiles.length - 1];
      const logPath = path.join(logsDir, latestLog);
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').slice(-last);

      console.clear();
      console.log(`=== Logs for ${agent} (${latestLog}) ===\n`);
      console.log(lines.join('\n'));
    } catch {
      console.log(`No logs found for agent: ${agent}`);
    }
  };

  await readAndDisplayLogs();

  if (follow) {
    console.log('\n(Press Ctrl+C to exit)');
    let lastSize = 0;

    const interval = setInterval(async () => {
      try {
        const files = (await fs.readdir(logsDir)).filter(f => f.endsWith('.log')).sort();
        if (files.length === 0) return;

        const latestLog = files[files.length - 1];
        const logPath = path.join(logsDir, latestLog);
        const stat = await fs.stat(logPath);

        if (stat.size > lastSize) {
          const content = await fs.readFile(logPath, 'utf-8');
          const lines = content.split('\n');
          const newLines = lines.slice(-(stat.size - lastSize)).join('\n');
          if (newLines.trim()) {
            process.stdout.write(newLines + '\n');
          }
          lastSize = stat.size;
        }
      } catch {
        // Ignore errors in follow mode
      }
    }, 1000);

    process.on('SIGINT', () => {
      clearInterval(interval);
      process.exit(0);
    });
  }
}
