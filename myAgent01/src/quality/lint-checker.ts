/**
 * Lint Checker - runs linters on code
 * @module quality/lint-checker
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'lint-checker' });

/**
 * Lint result
 */
export interface LintResult {
  success: boolean;
  tool: 'eslint' | 'prettier' | 'tsc' | 'oxlint' | string;
  files: LintFileResult[];
  summary: LintSummary;
  duration: number;
}

export interface LintFileResult {
  file: string;
  errors: LintError[];
  warnings: LintWarning[];
}

export interface LintError {
  line: number;
  column: number;
  message: string;
  rule?: string;
}

export interface LintWarning {
  line: number;
  column: number;
  message: string;
  rule?: string;
}

export interface LintSummary {
  filesChecked: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  totalErrors: number;
  totalWarnings: number;
}

/**
 * Lint Checker configuration
 */
export interface LintCheckerConfig {
  projectRoot: string;
  linters?: ('eslint' | 'prettier' | 'tsc' | 'oxlint')[];
  extensions?: string[];
  ignorePatterns?: string[];
}

/**
 * Lint Checker runs linters on code
 */
export class LintChecker {
  private config: LintCheckerConfig;
  private defaultLinters = ['eslint', 'prettier', 'tsc'];

  constructor(config: LintCheckerConfig) {
    this.config = {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      ignorePatterns: ['node_modules', 'dist', 'build', 'coverage', '.git'],
      ...config,
    };
    logger.info({ config: this.config }, 'LintChecker initialized');
  }

  /**
   * Run lint check on files or directory
   */
  async check(target?: string): Promise<LintResult> {
    const startTime = Date.now();
    const targetPath = target ?? this.config.projectRoot;
    const linters = this.config.linters ?? this.defaultLinters;

    logger.info({ target: targetPath, linters }, 'Running lint check');

    const allResults: LintFileResult[] = [];

    for (const linter of linters) {
      const results = await this.runLinter(linter, targetPath);
      allResults.push(...results);
    }

    const summary = this.summarizeResults(allResults);

    return {
      success: summary.totalErrors === 0,
      tool: linters.join(','),
      files: allResults,
      summary,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Run a specific linter
   */
  private async runLinter(linter: string, target: string): Promise<LintFileResult[]> {
    logger.debug({ linter, target }, 'Running linter');

    switch (linter) {
      case 'eslint':
        return this.runESLint(target);
      case 'prettier':
        return this.runPrettier(target);
      case 'tsc':
        return this.runTsc(target);
      case 'oxlint':
        return this.runOxlint(target);
      default:
        return [];
    }
  }

  /**
   * Run ESLint
   */
  private async runESLint(target: string): Promise<LintFileResult[]> {
    try {
      const args = ['npx', 'eslint', '--format=json', target];
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0 || result.exitCode === 1) {
        // Parse ESLint JSON output
        const eslintResults = JSON.parse(result.stdout);
        return this.parseESLintResults(eslintResults);
      }

      return [];
    } catch (error) {
      logger.warn({ error }, 'ESLint check failed');
      return [];
    }
  }

  /**
   * Parse ESLint results
   */
  private parseESLintResults(eslintResults: Array<{ filePath: string; messages: Array<{ line: number; column: number; message: string; severity: number; ruleId?: string }> }>): LintFileResult[] {
    return eslintResults.map(result => ({
      file: result.filePath,
      errors: result.messages
        .filter(msg => msg.severity === 2)
        .map(msg => ({
          line: msg.line,
          column: msg.column,
          message: msg.message,
          rule: msg.ruleId,
        })),
      warnings: result.messages
        .filter(msg => msg.severity === 1)
        .map(msg => ({
          line: msg.line,
          column: msg.column,
          message: msg.message,
          rule: msg.ruleId,
        })),
    }));
  }

  /**
   * Run Prettier check
   */
  private async runPrettier(target: string): Promise<LintFileResult[]> {
    try {
      const args = ['npx', 'prettier', '--check', '--loglevel=error', target];
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0) {
        return [];
      }

      // Prettier doesn't provide detailed file results in check mode easily
      return [{
        file: target,
        errors: [{
          line: 0,
          column: 0,
          message: 'Prettier found formatting issues',
        }],
        warnings: [],
      }];
    } catch (error) {
      logger.warn({ error }, 'Prettier check failed');
      return [];
    }
  }

  /**
   * Run TypeScript compiler check
   */
  private async runTsc(target: string): Promise<LintFileResult[]> {
    try {
      const args = ['npx', 'tsc', '--noEmit', '--pretty=false'];
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0) {
        return [];
      }

      // Parse tsc errors from stderr
      return this.parseTscErrors(result.stderr);
    } catch (error) {
      logger.warn({ error }, 'TypeScript check failed');
      return [];
    }
  }

  /**
   * Parse TypeScript errors
   */
  private parseTscErrors(stderr: string): LintFileResult[] {
    const results: LintFileResult[] = [];
    const lines = stderr.split('\n');

    let currentFile = '';
    let currentErrors: LintError[] = [];

    for (const line of lines) {
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s*error\s+(.+)$/);
      if (match) {
        if (currentFile) {
          results.push({
            file: currentFile,
            errors: currentErrors,
            warnings: [],
          });
        }
        currentFile = match[1];
        currentErrors = [{
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[4],
        }];
      }
    }

    if (currentFile) {
      results.push({
        file: currentFile,
        errors: currentErrors,
        warnings: [],
      });
    }

    return results;
  }

  /**
   * Run Oxlint
   */
  private async runOxlint(target: string): Promise<LintFileResult[]> {
    try {
      const args = ['npx', 'oxlint', '--format=json', target];
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0) {
        return [];
      }

      // Parse oxlint JSON output
      const oxlintResults = JSON.parse(result.stdout);
      return this.parseOxlintResults(oxlintResults);
    } catch (error) {
      logger.warn({ error }, 'Oxlint check failed');
      return [];
    }
  }

  /**
   * Parse Oxlint results
   */
  private parseOxlintResults(oxlintResults: { files?: Array<{ filePath: string; messages: Array<{ line: number; column: number; message: string; severity: string }> }> }): LintFileResult[] {
    return (oxlintResults.files ?? []).map(result => ({
      file: result.filePath,
      errors: result.messages
        .filter(msg => msg.severity === 'error')
        .map(msg => ({
          line: msg.line,
          column: msg.column,
          message: msg.message,
        })),
      warnings: result.messages
        .filter(msg => msg.severity === 'warning')
        .map(msg => ({
          line: msg.line,
          column: msg.column,
          message: msg.message,
        })),
    }));
  }

  /**
   * Summarize lint results
   */
  private summarizeResults(results: LintFileResult[]): LintSummary {
    let totalErrors = 0;
    let totalWarnings = 0;
    let filesWithErrors = 0;
    let filesWithWarnings = 0;

    for (const result of results) {
      if (result.errors.length > 0) {
        filesWithErrors++;
        totalErrors += result.errors.length;
      }
      if (result.warnings.length > 0) {
        filesWithWarnings++;
        totalWarnings += result.warnings.length;
      }
    }

    return {
      filesChecked: results.length,
      filesWithErrors,
      filesWithWarnings,
      totalErrors,
      totalWarnings,
    };
  }

  /**
   * Spawn command helper
   */
  private spawnCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const [cmd, ...cmdArgs] = args;
      const proc = spawn(cmd, cmdArgs, {
        cwd: this.config.projectRoot,
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

      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (error) => {
        resolve({
          stdout: '',
          stderr: error.message,
          exitCode: 1,
        });
      });
    });
  }

  /**
   * Check if file should be linted based on extension and ignore patterns
   */
  shouldLint(file: string): boolean {
    const ext = path.extname(file);
    if (!this.config.extensions?.includes(ext)) {
      return false;
    }
    // Also check ignore patterns after extension passes
    return !this.shouldIgnore(file);
  }

  /**
   * Check if file should be ignored
   */
  shouldIgnore(file: string): boolean {
    return this.config.ignorePatterns?.some(pattern =>
      file.includes(pattern)
    ) ?? false;
  }
}

/**
 * Create default lint checker
 */
export function createLintChecker(projectRoot: string): LintChecker {
  return new LintChecker({ projectRoot });
}
