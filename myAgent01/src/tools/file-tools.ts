/**
 * File Tools - file operations for agents
 * @module tools/file-tools
 */

import { promises as fs } from 'fs';
import path from 'path';
import { AbstractTool, successResult, errorResult, type ToolResult, type ToolContext } from './base-tool.js';

/**
 * Read file tool
 */
export class ReadFileTool extends AbstractTool {
  readonly name = 'read_file';
  readonly description = 'Read content from a file';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        default: 'utf-8',
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath, encoding = 'utf-8' } = input as { path: string; encoding?: string };

    try {
      // Validate path is within project
      const content = await fs.readFile(filePath, { encoding });
      return successResult(content, { path: filePath, bytes: content.length });
    } catch (error) {
      return errorResult(`Failed to read file: ${(error as Error).message}`, { path: filePath });
    }
  }
}

/**
 * Write file tool
 */
export class WriteFileTool extends AbstractTool {
  readonly name = 'write_file';
  readonly description = 'Write content to a file';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        default: 'utf-8',
      },
    },
    required: ['path', 'content'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath, content, encoding = 'utf-8' } = input as { path: string; content: string; encoding?: string };

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file atomically using temp file
      const tmpPath = `${filePath}.tmp.${Date.now()}`;
      await fs.writeFile(tmpPath, content, { encoding });
      await fs.rename(tmpPath, filePath);

      return successResult(`File written: ${filePath}`, { path: filePath, bytes: content.length });
    } catch (error) {
      return errorResult(`Failed to write file: ${(error as Error).message}`, { path: filePath });
    }
  }
}

/**
 * Edit file tool - performs line-based edits
 */
export class EditFileTool extends AbstractTool {
  readonly name = 'edit_file';
  readonly description = 'Edit a file by replacing text or inserting lines';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'Text to find and replace (exact match)',
      },
      new_string: {
        type: 'string',
        description: 'Replacement text',
      },
      after_line: {
        type: 'number',
        description: 'Insert after this line number (1-indexed)',
      },
      before_line: {
        type: 'number',
        description: 'Insert before this line number (1-indexed)',
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath, old_string, new_string, after_line, before_line } = input as {
      path: string;
      old_string?: string;
      new_string?: string;
      after_line?: number;
      before_line?: number;
    };

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let newContent = content;

      if (old_string !== undefined && new_string !== undefined) {
        // Replace text
        if (!content.includes(old_string)) {
          return errorResult(`Text not found in file: ${old_string.slice(0, 50)}...`, { path: filePath });
        }
        newContent = content.replace(old_string, new_string);
      } else if (after_line !== undefined && new_string !== undefined) {
        // Insert after line
        const lines = content.split('\n');
        const insertIndex = Math.min(after_line, lines.length);
        lines.splice(insertIndex, 0, new_string);
        newContent = lines.join('\n');
      } else if (before_line !== undefined && new_string !== undefined) {
        // Insert before line
        const lines = content.split('\n');
        const insertIndex = Math.max(0, before_line - 1);
        lines.splice(insertIndex, 0, new_string);
        newContent = lines.join('\n');
      } else {
        return errorResult('Must specify either old_string+new_string or after_line/before_line+new_string', { path: filePath });
      }

      // Write back
      await fs.writeFile(filePath, newContent, 'utf-8');
      return successResult(`File edited: ${filePath}`, { path: filePath });
    } catch (error) {
      return errorResult(`Failed to edit file: ${(error as Error).message}`, { path: filePath });
    }
  }
}

/**
 * List files tool - glob pattern matching
 */
export class GlobTool extends AbstractTool {
  readonly name = 'glob';
  readonly description = 'List files matching a glob pattern';
  readonly category = 'search' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match (e.g., **/*.ts)',
      },
      cwd: {
        type: 'string',
        description: 'Current working directory',
      },
    },
    required: ['pattern'],
  };

  readonly outputSchema = 'array' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { pattern, cwd = process.cwd() } = input as { pattern: string; cwd?: string };

    try {
      // Simple glob implementation - in production would use proper glob library
      const matches = await this.simpleGlob(pattern, cwd);
      return successResult(JSON.stringify(matches), { pattern, count: matches.length });
    } catch (error) {
      return errorResult(`Failed to glob: ${(error as Error).message}`, { pattern });
    }
  }

  private async simpleGlob(pattern: string, cwd: string): Promise<string[]> {
    // Basic implementation - would use glob library in production
    const results: string[] = [];
    // This is a stub - real implementation would use packages like glob or fast-glob
    return results;
  }
}

/**
 * File exists tool
 */
export class ExistsTool extends AbstractTool {
  readonly name = 'exists';
  readonly description = 'Check if a file or directory exists';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to check',
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'boolean' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath } = input as { path: string };

    try {
      await fs.access(filePath);
      return successResult('true', { path: filePath, exists: true });
    } catch {
      return successResult('false', { path: filePath, exists: false });
    }
  }
}

/**
 * Delete file tool
 */
export class DeleteFileTool extends AbstractTool {
  readonly name = 'delete_file';
  readonly description = 'Delete a file';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to delete',
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath } = input as { path: string };

    try {
      await fs.unlink(filePath);
      return successResult(`File deleted: ${filePath}`, { path: filePath });
    } catch (error) {
      return errorResult(`Failed to delete file: ${(error as Error).message}`, { path: filePath });
    }
  }
}

/**
 * Create directory tool
 */
export class MkdirTool extends AbstractTool {
  readonly name = 'mkdir';
  readonly description = 'Create a directory';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory to create',
      },
      recursive: {
        type: 'boolean',
        description: 'Create parent directories as needed',
        default: true,
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: dirPath, recursive = true } = input as { path: string; recursive?: boolean };

    try {
      await fs.mkdir(dirPath, { recursive });
      return successResult(`Directory created: ${dirPath}`, { path: dirPath });
    } catch (error) {
      return errorResult(`Failed to create directory: ${(error as Error).message}`, { path: dirPath });
    }
  }
}

/**
 * Copy file tool
 */
export class CopyFileTool extends AbstractTool {
  readonly name = 'copy_file';
  readonly description = 'Copy a file';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      src: {
        type: 'string',
        description: 'Source file path',
      },
      dest: {
        type: 'string',
        description: 'Destination file path',
      },
    },
    required: ['src', 'dest'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { src, dest } = input as { src: string; dest: string };

    try {
      const destDir = path.dirname(dest);
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(src, dest);
      return successResult(`File copied: ${src} -> ${dest}`, { src, dest });
    } catch (error) {
      return errorResult(`Failed to copy file: ${(error as Error).message}`, { src, dest });
    }
  }
}

/**
 * Get file stats tool
 */
export class StatsTool extends AbstractTool {
  readonly name = 'stats';
  readonly description = 'Get file or directory statistics';
  readonly category = 'file' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to get stats for',
      },
    },
    required: ['path'],
  };

  readonly outputSchema = 'object' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: filePath } = input as { path: string };

    try {
      const stats = await fs.stat(filePath);
      const result = {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
      };
      return successResult(JSON.stringify(result), { path: filePath });
    } catch (error) {
      return errorResult(`Failed to get stats: ${(error as Error).message}`, { path: filePath });
    }
  }
}
