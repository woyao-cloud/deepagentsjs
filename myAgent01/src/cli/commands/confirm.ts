/**
 * Confirm Command - Confirm PLANNING.md to proceed with execution
 * @module cli/commands/confirm
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Confirm options
 */
export interface ConfirmOptions {
  revise: boolean;
}

/**
 * Confirm PLANNING.md to proceed with execution
 */
export async function confirmPlanning(
  file: string,
  options: ConfirmOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const planningPath = file || path.join(projectRoot, 'PLANNING.md');

  try {
    // Read planning file
    const content = await fs.readFile(planningPath, 'utf-8');

    // Validate it has required structure
    if (!validatePlanningStructure(content)) {
      console.error('Invalid PLANNING.md structure.');
      console.error('Required sections: # Planning, ## Task Tree, ## Tech Stack');
      return;
    }

    // Create confirmation marker
    const confirmMarker = `<!-- CONFIRMED: ${new Date().toISOString()} -->`;

    // Check if already confirmed
    if (content.includes('<!-- CONFIRMED:')) {
      if (options.revise) {
        // Remove old confirmation and add new one
        const revised = content.replace(
          /<!-- CONFIRMED:.*-->/,
          confirmMarker
        );
        await fs.writeFile(planningPath, revised, 'utf-8');
        console.log('Planning confirmed as revision.');
      } else {
        console.log('Planning is already confirmed. Use --revise to update confirmation.');
      }
      return;
    }

    // Append confirmation marker
    await fs.writeFile(planningPath, content + '\n\n' + confirmMarker + '\n', 'utf-8');

    console.log('\x1b[32m✓ PLANNING.md confirmed\x1b[0m');
    console.log('You can now run "deepagents run --phase execute" to start execution.');

    // If this was a revision, log to revision history
    if (options.revise) {
      await logRevision(planningPath);
    }
  } catch (error) {
    console.error(`Failed to confirm planning: ${(error as Error).message}`);
  }
}

/**
 * Validate planning structure
 */
function validatePlanningStructure(content: string): boolean {
  const requiredSections = [
    '# Planning',
    '## Task Tree',
    '## Tech Stack',
  ];

  return requiredSections.every(section => content.includes(section));
}

/**
 * Log revision to history
 */
async function logRevision(planningPath: string): Promise<void> {
  const historyPath = planningPath.replace('PLANNING.md', 'REVISION_HISTORY.md');

  try {
    let history = '';
    try {
      history = await fs.readFile(historyPath, 'utf-8');
    } catch {
      // Create new history file
      history = '# Revision History\n\n';
    }

    const entry = `## ${new Date().toISOString()}\n- Confirmed planning revision\n\n`;
    await fs.writeFile(historyPath, history + entry, 'utf-8');
  } catch {
    // Ignore history logging errors
  }
}
