/**
 * Search Tools - grep, find, and other search operations
 * @module tools/search-tools
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { AbstractTool, successResult, errorResult, type ToolResult } from './base-tool.js';

/**
 * Grep tool - search file contents
 */
export class GrepTool extends AbstractTool {
  readonly name = 'grep';
  readonly description = 'Search for patterns in files';
  readonly category = 'search' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Path to search in',
      },
      recursive: {
        type: 'boolean',
        description: 'Search recursively',
        default: true,
      },
      files: {
        type: 'array',
        description: 'Specific files to search (overrides path)',
        items: { type: 'string' },
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case sensitive search',
        default: false,
      },
      include: {
        type: 'string',
        description: 'File pattern to include (e.g., *.ts)',
      },
      exclude: {
        type: 'string',
        description: 'File pattern to exclude',
      },
      maxCount: {
        type: 'number',
        description: 'Maximum number of matches per file',
      },
      lineNumbers: {
        type: 'boolean',
        description: 'Include line numbers in output',
        default: true,
      },
    },
    required: ['pattern', 'path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const {
      pattern,
      path: searchPath,
      recursive = true,
      files,
      caseSensitive = false,
      include,
      exclude,
      maxCount,
      lineNumbers = true,
    } = input as {
      pattern: string;
      path: string;
      recursive?: boolean;
      files?: string[];
      caseSensitive?: boolean;
      include?: string;
      exclude?: string;
      maxCount?: number;
      lineNumbers?: boolean;
    };

    try {
      const results = await this.grep({
        pattern,
        path: searchPath,
        recursive,
        files,
        caseSensitive,
        include,
        exclude,
        maxCount,
        lineNumbers,
      });

      return successResult(JSON.stringify(results), {
        pattern,
        path: searchPath,
        matchCount: results.length,
      });
    } catch (error) {
      return errorResult(`Grep failed: ${(error as Error).message}`, { pattern, path: searchPath });
    }
  }

  private async grep(options: {
    pattern: string;
    path: string;
    recursive: boolean;
    files?: string[];
    caseSensitive: boolean;
    include?: string;
    exclude?: string;
    maxCount?: number;
    lineNumbers: boolean;
  }): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const { pattern, path: searchPath, recursive, files, include, exclude, maxCount, lineNumbers } = options;

    // If specific files provided, search only those
    const searchFiles = files ?? await this.getFiles(searchPath, recursive, include, exclude);

    const regex = new RegExp(pattern, 'g');

    for (const file of searchFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (regex.test(line)) {
            results.push({
              file: path.relative(searchPath, file),
              line: i + 1,
              content: line.trim(),
            });

            if (maxCount && results.length >= maxCount) {
              return results;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }

  private async getFiles(
    dir: string,
    recursive: boolean,
    include?: string,
    exclude?: string
  ): Promise<string[]> {
    const files: string[] = [];
    const includeRegex = include ? new RegExp(include.replace('*', '.*')) : null;
    const excludeRegex = exclude ? new RegExp(exclude.replace('*', '.*')) : null;

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && recursive) {
          // Skip node_modules and .git
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (includeRegex && !includeRegex.test(entry.name)) continue;
          if (excludeRegex && excludeRegex.test(entry.name)) continue;
          files.push(fullPath);
        }
      }
    }

    await walk(dir);
    return files;
  }
}

/**
 * Find tool - find files by name
 */
export class FindTool extends AbstractTool {
  readonly name = 'find';
  readonly description = 'Find files by name';
  readonly category = 'search' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Directory to search in',
      },
      name: {
        type: 'string',
        description: 'File name pattern (supports * wildcards)',
      },
      type: {
        type: 'string',
        description: 'File type (f: file, d: directory)',
        enum: ['f', 'd'],
      },
      recursive: {
        type: 'boolean',
        description: 'Search recursively',
        default: true,
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum directory depth',
      },
    },
    required: ['path', 'name'],
  };

  readonly outputSchema = 'array' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { path: searchPath, name, type = 'f', recursive = true, maxDepth } = input as {
      path: string;
      name: string;
      type?: string;
      recursive?: boolean;
      maxDepth?: number;
    };

    try {
      const results = await this.find({
        path: searchPath,
        name,
        type,
        recursive,
        maxDepth,
      });

      return successResult(JSON.stringify(results), {
        path: searchPath,
        name,
        count: results.length,
      });
    } catch (error) {
      return errorResult(`Find failed: ${(error as Error).message}`, { path: searchPath, name });
    }
  }

  private async find(options: {
    path: string;
    name: string;
    type: string;
    recursive: boolean;
    maxDepth?: number;
  }): Promise<string[]> {
    const results: string[] = [];
    const { path: dir, name, type, maxDepth } = options;
    const namePattern = new RegExp('^' + name.replace('*', '.*') + '$');

    async function walk(currentDir: string, depth: number): Promise<void> {
      if (maxDepth !== undefined && depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory() && options.recursive) {
            // Skip node_modules and .git
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              await walk(fullPath, depth + 1);
            }
          } else if (entry.isFile() && type === 'f') {
            if (namePattern.test(entry.name)) {
              results.push(fullPath);
            }
          } else if (entry.isDirectory() && type === 'd') {
            if (namePattern.test(entry.name)) {
              results.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    }

    await walk(dir, 0);
    return results;
  }
}

/**
 * Grep tool using system grep (more efficient for large codebases)
 */
export class SystemGrepTool extends AbstractTool {
  readonly name = 'system_grep';
  readonly description = 'Fast grep using system grep command';
  readonly category = 'search' as const;
  readonly allowedRoles = ['architect', 'backend-dev', 'frontend-dev', 'qa-engineer', 'main'];

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Path to search in',
      },
      recursive: {
        type: 'boolean',
        description: 'Search recursively',
        default: true,
      },
      include: {
        type: 'string',
        description: 'File pattern to include',
      },
      lineNumbers: {
        type: 'boolean',
        description: 'Include line numbers',
        default: true,
      },
    },
    required: ['pattern', 'path'],
  };

  readonly outputSchema = 'string' as const;

  async execute(input: unknown): Promise<ToolResult> {
    const { pattern, path: searchPath, recursive = true, include, lineNumbers = true } = input as {
      pattern: string;
      path: string;
      recursive?: boolean;
      include?: string;
      lineNumbers?: boolean;
    };

    return new Promise((resolve) => {
      const args = [pattern];

      if (lineNumbers) {
        args.push('-n');
      }

      if (recursive) {
        args.push('-r');
      }

      if (include) {
        args.push('--include=' + include);
      }

      args.push(searchPath);

      const proc = spawn('grep', args, { shell: true });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || code === 1) {
          resolve(successResult(stdout, { pattern, path: searchPath }));
        } else {
          resolve(errorResult(`Grep failed: ${stderr || 'Unknown error'}`, { pattern, path: searchPath }));
        }
      });

      proc.on('error', (error) => {
        resolve(errorResult(`Grep failed: ${error.message}`, { pattern, path: searchPath }));
      });
    });
  }
}
