/**
 * Test Runner - runs test suites
 * @module quality/test-runner
 */

import { spawn } from 'child_process';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'test-runner' });

/**
 * Test result
 */
export interface TestResult {
  success: boolean;
  framework: string;
  summary: TestSummary;
  suites: TestSuiteResult[];
  duration: number;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: TestCoverage;
}

export interface TestSuiteResult {
  name: string;
  tests: TestCaseResult[];
  duration: number;
  success: boolean;
}

export interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  stack?: string;
}

export interface TestCoverage {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  threshold?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

/**
 * Test Runner configuration
 */
export interface TestRunnerConfig {
  projectRoot: string;
  framework?: 'vitest' | 'jest' | 'mocha' | 'pytest';
  coverage?: boolean;
  watch?: boolean;
}

/**
 * Test Runner executes test suites
 */
export class TestRunner {
  private config: TestRunnerConfig;
  private defaultFramework: 'vitest' = 'vitest';

  constructor(config: TestRunnerConfig) {
    this.config = {
      framework: 'vitest',
      coverage: false,
      ...config,
    };
    logger.info({ config: this.config }, 'TestRunner initialized');
  }

  /**
   * Run tests
   */
  async run(target?: string): Promise<TestResult> {
    const startTime = Date.now();
    const targetPath = target ?? this.config.projectRoot;

    logger.info({ target: targetPath, framework: this.config.framework }, 'Running tests');

    const framework = this.config.framework ?? this.defaultFramework;

    switch (framework) {
      case 'vitest':
        return this.runVitest(targetPath);
      case 'jest':
        return this.runJest(targetPath);
      case 'mocha':
        return this.runMocha(targetPath);
      default:
        return this.runVitest(targetPath);
    }
  }

  /**
   * Run Vitest
   */
  private async runVitest(target: string): Promise<TestResult> {
    const startTime = Date.now();
    const args = ['npx', 'vitest', 'run', '--reporter=json'];

    if (this.config.coverage) {
      args.push('--coverage');
    }

    if (target) {
      args.push(target);
    }

    try {
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0 || result.exitCode === 1) {
        // Vitest returns exit code 1 if tests failed but ran
        const parsed = this.parseVitestResults(result.stdout);
        return {
          success: parsed.summary.failed === 0,
          framework: 'vitest',
          summary: parsed.summary,
          suites: parsed.suites,
          duration: Date.now() - startTime,
        };
      }

      return this.createErrorResult('vitest', 'Test execution failed', Date.now() - startTime);
    } catch (error) {
      return this.createErrorResult('vitest', (error as Error).message, Date.now() - startTime);
    }
  }

  /**
   * Parse Vitest JSON results
   */
  private parseVitestResults(stdout: string): { summary: TestSummary; suites: TestSuiteResult[] } {
    try {
      const data = JSON.parse(stdout);
      const suites: TestSuiteResult[] = [];

      // Parse test results from Vitest JSON reporter
      const testResults = data.testResults ?? data.tests ?? [];

      for (const suite of data.suites ?? data.testSuites ?? []) {
        suites.push({
          name: suite.name,
          tests: (suite.tests ?? []).map((t: { title: string[]; state: string; duration: number; error?: { message: string; stack?: string } }) => ({
            name: Array.isArray(t.title) ? t.title.join(' > ') : t.title,
            status: t.state === 'passed' ? 'passed' : t.state === 'skipped' ? 'skipped' : 'failed',
            duration: t.duration ?? 0,
            error: t.error?.message,
            stack: t.error?.stack,
          })),
          duration: suite.duration ?? 0,
          success: suite.failures === 0,
        });
      }

      const summary: TestSummary = {
        total: data.summary?.tests ?? testResults.length,
        passed: data.summary?.passed ?? 0,
        failed: data.summary?.failed ?? 0,
        skipped: data.summary?.skipped ?? 0,
        duration: data.summary?.duration ?? 0,
      };

      if (data.coverage) {
        // Handle multiple coverage formats (v8, istanbul, etc.)
        const cov = data.coverage;
        // v8 format: { default: { totals: { ... } } }
        if (cov.default?.totals) {
          const t = cov.default.totals;
          summary.coverage = {
            statements: t.pct ?? 0,
            branches: t.branches_pct ?? 0,
            functions: t.functions_pct ?? 0,
            lines: t.lines_pct ?? 0,
          };
        }
        // istanbul/coverage-badge format with named keys
        else if (typeof cov.statements === 'object' && 'pct' in cov.statements) {
          summary.coverage = {
            statements: (cov.statements as { pct: number }).pct,
            branches: (cov.branches as { pct: number }).pct ?? 0,
            functions: (cov.functions as { pct: number }).pct ?? 0,
            lines: (cov.lines as { pct: number }).pct ?? 0,
          };
        }
        // Generic array format fallback (least reliable)
        else if (Array.isArray(cov)) {
          summary.coverage = {
            statements: cov[0]?.pct ?? 0,
            branches: cov[1]?.pct ?? 0,
            functions: cov[2]?.pct ?? 0,
            lines: cov[3]?.pct ?? 0,
          };
        }
      }

      return { summary, suites };
    } catch {
      // Return empty results if parsing fails
      return {
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
        },
        suites: [],
      };
    }
  }

  /**
   * Run Jest
   */
  private async runJest(target: string): Promise<TestResult> {
    const startTime = Date.now();
    const args = ['npx', 'jest', '--json'];

    if (this.config.coverage) {
      args.push('--coverage');
    }

    if (target) {
      args.push(target);
    }

    try {
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0 || result.exitCode === 1) {
        const parsed = this.parseJestResults(result.stdout);
        return {
          success: parsed.summary.failed === 0,
          framework: 'jest',
          summary: parsed.summary,
          suites: parsed.suites,
          duration: Date.now() - startTime,
        };
      }

      return this.createErrorResult('jest', 'Test execution failed', Date.now() - startTime);
    } catch (error) {
      return this.createErrorResult('jest', (error as Error).message, Date.now() - startTime);
    }
  }

  /**
   * Parse Jest JSON results
   */
  private parseJestResults(stdout: string): { summary: TestSummary; suites: TestSuiteResult[] } {
    try {
      const data = JSON.parse(stdout);
      const suites: TestSuiteResult[] = [];

      for (const suite of data.testResults ?? []) {
        suites.push({
          name: suite.name,
          tests: (suite.assertionResults ?? []).map((t: { title: string; status: string; duration: number; failureMessages?: string[] }) => ({
            name: t.title,
            status: t.status === 'passed' ? 'passed' : t.status === 'pending' ? 'skipped' : 'failed',
            duration: t.duration ?? 0,
            error: t.failureMessages?.[0],
          })),
          duration: suite.duration ?? 0,
          success: suite.status !== 'failed',
        });
      }

      const summary: TestSummary = {
        total: data.numTotalTests ?? 0,
        passed: data.numPassedTests ?? 0,
        failed: data.numFailedTests ?? 0,
        skipped: data.numPendingTests ?? 0,
        duration: data.testExecutionTime ?? 0,
      };

      if (data.coverageMap) {
        const coverage = data.coverageMap.getCoverageSummary?.();
        if (coverage) {
          summary.coverage = {
            statements: coverage.statements?.pct ?? 0,
            branches: coverage.branches?.pct ?? 0,
            functions: coverage.functions?.pct ?? 0,
            lines: coverage.lines?.pct ?? 0,
          };
        }
      }

      return { summary, suites };
    } catch {
      return {
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
        suites: [],
      };
    }
  }

  /**
   * Run Mocha
   */
  private async runMocha(target: string): Promise<TestResult> {
    const startTime = Date.now();
    const args = ['npx', 'mocha', '--reporter=json'];

    if (target) {
      args.push(target);
    }

    try {
      const result = await this.spawnCommand(args);

      if (result.exitCode === 0 || result.exitCode === 1) {
        const parsed = this.parseMochaResults(result.stdout);
        return {
          success: parsed.summary.failed === 0,
          framework: 'mocha',
          summary: parsed.summary,
          suites: parsed.suites,
          duration: Date.now() - startTime,
        };
      }

      return this.createErrorResult('mocha', 'Test execution failed', Date.now() - startTime);
    } catch (error) {
      return this.createErrorResult('mocha', (error as Error).message, Date.now() - startTime);
    }
  }

  /**
   * Parse Mocha JSON results
   */
  private parseMochaResults(stdout: string): { summary: TestSummary; suites: TestSuiteResult[] } {
    try {
      const data = JSON.parse(stdout);
      const suites: TestSuiteResult[] = [];

      const stats = data.stats ?? {};
      let failed = 0;
      let passed = 0;

      for (const file of data.failures ?? []) {
        failed++;
        suites.push({
          name: file.title,
          tests: file.tests?.map((t: { title: string; state: string; duration: number; err?: { message: string } }) => ({
            name: t.title,
            status: t.state === 'passed' ? 'passed' : 'failed',
            duration: t.duration ?? 0,
            error: t.err?.message,
          })) ?? [],
          duration: 0,
          success: false,
        });
      }

      for (const file of data.passes ?? []) {
        passed++;
        suites.push({
          name: file.title,
          tests: [{
            name: file.title,
            status: 'passed' as const,
            duration: file.duration ?? 0,
          }],
          duration: file.duration ?? 0,
          success: true,
        });
      }

      return {
        summary: {
          total: passed + failed,
          passed,
          failed,
          skipped: 0,
          duration: stats.duration ?? 0,
        },
        suites,
      };
    } catch {
      return {
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
        suites: [],
      };
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(framework: string, error: string, duration: number): TestResult {
    return {
      success: false,
      framework,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
      },
      suites: [],
      duration,
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
}

/**
 * Create default test runner
 */
export function createTestRunner(projectRoot: string): TestRunner {
  return new TestRunner({ projectRoot });
}
