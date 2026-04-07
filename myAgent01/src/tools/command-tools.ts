/**
 * Command Tools - command execution for agents
 * @module tools/command-tools
 */

import { spawn } from 'child_process';
import { AbstractTool, successResult, errorResult, type ToolResult } from './base-tool.js';

/**
 * Command whitelist for safe execution
 */
const ALLOWED_COMMANDS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'node',
  'npx',
  'tsc',
  'vitest',
  'eslint',
  'prettier',
  'git',
  'ls',
  'cat',
  'echo',
  'mkdir',
  'rm',
  'cp',
  'mv',
  'find',
  'grep',
  'curl',
]);

/**
 * Dangerous commands that require confirmation
 */
const DANGEROUS_COMMANDS = new Set([
  'rm',
  'sudo',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'killall',
]);

/**
 * Execute command tool
 */
export class CommandTool extends AbstractTool {
  readonly name = 'command';
  readonly description = 'Execute a shell command';
  readonly category = 'command' as const;
  readonly allowedRoles = ['backend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute',
      },
      args: {
        type: 'array',
        description: 'Command arguments',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
        default: 60000,
      },
      dangerous: {
        type: 'boolean',
        description: 'Whether this is a dangerous command requiring confirmation',
        default: false,
      },
    },
    required: ['command'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { command, args = [], cwd = process.cwd(), timeout = 60000, dangerous = false } = input as {
      command: string;
      args?: string[];
      cwd?: string;
      timeout?: number;
      dangerous?: boolean;
    };

    // Check if command is allowed
    if (!ALLOWED_COMMANDS.has(command)) {
      return errorResult(`Command not allowed: ${command}. Allowed commands: ${[...ALLOWED_COMMANDS].join(', ')}`);
    }

    // Check if dangerous and requires special handling
    if (DANGEROUS_COMMANDS.has(command)) {
      return errorResult(`Dangerous command requires special confirmation: ${command}`);
    }

    try {
      const result = await this.spawnCommand(command, args, { cwd, timeout });
      return successResult(result.stdout, {
        command,
        args,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    } catch (error) {
      return errorResult(`Command failed: ${(error as Error).message}`, {
        command,
        args,
      });
    }
  }

  private spawnCommand(
    command: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

/**
 * Run npm/pnpm script tool
 */
export class RunScriptTool extends AbstractTool {
  readonly name = 'run_script';
  readonly description = 'Run a npm/pnpm script';
  readonly category = 'command' as const;
  readonly allowedRoles = ['backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      script: {
        type: 'string',
        description: 'Script name from package.json',
      },
      packageManager: {
        type: 'string',
        description: 'Package manager to use (npm, pnpm, yarn)',
        enum: ['npm', 'pnpm', 'yarn'],
        default: 'pnpm',
      },
      args: {
        type: 'array',
        description: 'Additional arguments to pass to the script',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 120000,
      },
    },
    required: ['script'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { script, packageManager = 'pnpm', args = [], cwd = process.cwd(), timeout = 120000 } = input as {
      script: string;
      packageManager?: string;
      args?: string[];
      cwd?: string;
      timeout?: number;
    };

    const pm = packageManager === 'yarn' ? 'yarn' : packageManager === 'npm' ? 'npm' : 'pnpm';
    const runArgs = pm === 'pnpm' || pm === 'yarn' ? ['run', script, ...args] : ['run', script, ...args];

    try {
      const result = await this.spawnCommand(pm, runArgs, { cwd, timeout });
      return successResult(result.stdout, {
        script,
        packageManager: pm,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    } catch (error) {
      return errorResult(`Script failed: ${(error as Error).message}`, { script, packageManager: pm });
    }
  }

  private spawnCommand(
    command: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

/**
 * Check if command is allowed
 */
export function isCommandAllowed(command: string): boolean {
  return ALLOWED_COMMANDS.has(command);
}

/**
 * Check if command is dangerous
 */
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.has(command);
}

/**
 * Get allowed commands
 */
export function getAllowedCommands(): string[] {
  return [...ALLOWED_COMMANDS];
}
