/**
 * Git Tools - Git operations for agents
 * @module tools/git-tools
 */

import { spawn } from 'child_process';
import { AbstractTool, successResult, errorResult, type ToolResult } from './base-tool.js';

/**
 * Git status tool
 */
export class GitStatusTool extends AbstractTool {
  readonly name = 'git_status';
  readonly description = 'Get git repository status';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      porcelain: {
        type: 'boolean',
        description: 'Use porcelain output format',
        default: true,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { cwd, porcelain = true } = input as { cwd: string; porcelain?: boolean };

    try {
      const result = await this.runGit(['status', porcelain ? '--porcelain' : ''], { cwd });
      return successResult(result.stdout, { cwd });
    } catch (error) {
      return errorResult(`Git status failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git add tool
 */
export class GitAddTool extends AbstractTool {
  readonly name = 'git_add';
  readonly description = 'Stage files for commit';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      files: {
        type: 'array',
        description: 'Files to stage',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      all: {
        type: 'boolean',
        description: 'Stage all modified files',
        default: false,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { files = [], cwd, all = false } = input as { files?: string[]; cwd: string; all?: boolean };

    try {
      const args = ['add'];
      if (all) {
        args.push('-A');
      } else {
        args.push(...files);
      }

      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout || 'Files staged', { cwd, staged: all ? 'all' : files });
    } catch (error) {
      return errorResult(`Git add failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git commit tool
 */
export class GitCommitTool extends AbstractTool {
  readonly name = 'git_commit';
  readonly description = 'Create a git commit';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'Commit message',
      },
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      amend: {
        type: 'boolean',
        description: 'Amend the previous commit',
        default: false,
      },
    },
    required: ['message', 'cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { message, cwd, amend = false } = input as { message: string; cwd: string; amend?: boolean };

    try {
      const args = ['commit'];
      if (amend) {
        args.push('--amend', '--no-edit');
      } else {
        args.push('-m', message);
      }

      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout || 'Commit created', { cwd, amend });
    } catch (error) {
      return errorResult(`Git commit failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git branch tool
 */
export class GitBranchTool extends AbstractTool {
  readonly name = 'git_branch';
  readonly description = 'List, create, or delete branches';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      name: {
        type: 'string',
        description: 'Branch name (for create/delete)',
      },
      checkout: {
        type: 'boolean',
        description: 'Checkout the branch after creating',
        default: false,
      },
      delete: {
        type: 'boolean',
        description: 'Delete the branch',
        default: false,
      },
      list: {
        type: 'boolean',
        description: 'List all branches',
        default: true,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { cwd, name, checkout = false, deleteBranch = false, list = true } = input as {
      cwd: string;
      name?: string;
      checkout?: boolean;
      delete?: boolean;
      list?: boolean;
    };

    try {
      if (deleteBranch && name) {
        const result = await this.runGit(['branch', '-D', name], { cwd });
        return successResult(result.stdout || `Branch deleted: ${name}`, { cwd, deleted: name });
      }

      if (name && checkout) {
        await this.runGit(['checkout', '-b', name], { cwd });
        return successResult(`Branch created and checked out: ${name}`, { cwd, branch: name });
      }

      if (name) {
        const result = await this.runGit(['branch', name], { cwd });
        return successResult(result.stdout || `Branch created: ${name}`, { cwd, branch: name });
      }

      if (list) {
        const result = await this.runGit(['branch', '-a'], { cwd });
        return successResult(result.stdout, { cwd });
      }

      return errorResult('Invalid branch operation', { cwd });
    } catch (error) {
      return errorResult(`Git branch failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git checkout tool
 */
export class GitCheckoutTool extends AbstractTool {
  readonly name = 'git_checkout';
  readonly description = 'Switch branches or restore files';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      branch: {
        type: 'string',
        description: 'Branch to checkout',
      },
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      create: {
        type: 'boolean',
        description: 'Create branch before checkout',
        default: false,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { branch, cwd, create = false } = input as { branch?: string; cwd: string; create?: boolean };

    try {
      if (!branch) {
        return errorResult('Branch name required', { cwd });
      }

      const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout || `Switched to branch: ${branch}`, { cwd, branch, created: create });
    } catch (error) {
      return errorResult(`Git checkout failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git log tool
 */
export class GitLogTool extends AbstractTool {
  readonly name = 'git_log';
  readonly description = 'Get git commit history';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      maxCount: {
        type: 'number',
        description: 'Maximum number of commits to show',
        default: 10,
      },
      oneline: {
        type: 'boolean',
        description: 'Use one-line format',
        default: false,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { cwd, maxCount = 10, oneline = false } = input as { cwd: string; maxCount?: number; oneline?: boolean };

    try {
      const args = ['log', `--max-count=${maxCount}`];
      if (oneline) {
        args.push('--oneline');
      }

      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout, { cwd, count: maxCount });
    } catch (error) {
      return errorResult(`Git log failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git push tool - requires confirmation
 */
export class GitPushTool extends AbstractTool {
  readonly name = 'git_push';
  readonly description = 'Push commits to remote (requires confirmation)';
  readonly category = 'git' as const;
  readonly allowedRoles = ['main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      remote: {
        type: 'string',
        description: 'Remote name',
        default: 'origin',
      },
      branch: {
        type: 'string',
        description: 'Branch to push',
      },
      force: {
        type: 'boolean',
        description: 'Force push (dangerous)',
        default: false,
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { cwd, remote = 'origin', branch, force = false } = input as {
      cwd: string;
      remote?: string;
      branch?: string;
      force?: boolean;
    };

    try {
      if (force) {
        return errorResult('Force push requires explicit confirmation', { cwd });
      }

      const args = ['push', remote];
      if (branch) {
        args.push(branch);
      }

      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout || 'Pushed to remote', { cwd, remote, branch, force });
    } catch (error) {
      return errorResult(`Git push failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Git diff tool
 */
export class GitDiffTool extends AbstractTool {
  readonly name = 'git_diff';
  readonly description = 'Show changes between commits or working tree';
  readonly category = 'git' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root directory',
      },
      staged: {
        type: 'boolean',
        description: 'Show staged changes',
        default: false,
      },
      file: {
        type: 'string',
        description: 'Show diff for specific file',
      },
    },
    required: ['cwd'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { cwd, staged = false, file } = input as { cwd: string; staged?: boolean; file?: string };

    try {
      const args = ['diff'];
      if (staged) {
        args.push('--staged');
      }
      if (file) {
        args.push('--', file);
      }

      const result = await this.runGit(args, { cwd });
      return successResult(result.stdout || 'No changes', { cwd, staged });
    } catch (error) {
      return errorResult(`Git diff failed: ${(error as Error).message}`, { cwd });
    }
  }
}

/**
 * Run git command helper
 */
async function runGit(
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: options.cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}
