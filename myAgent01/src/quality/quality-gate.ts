/**
 * Quality Gate - orchestrates quality checks
 * @module quality/quality-gate
 */

import { createLogger } from '../utils/logger.js';
import type { LintResult } from './lint-checker.js';
import type { TestResult } from './test-runner.js';
import type { SchemaValidationResult } from './schema-validator.js';

const logger = createLogger({ component: 'quality-gate' });

/**
 * Quality gate result
 */
export interface QualityGateResult {
  passed: boolean;
  phase: string;
  checks: QualityCheckResult[];
  summary: QualitySummary;
  duration: number;
}

export interface QualityCheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'warning';
  result: LintResult | TestResult | SchemaValidationResult | null;
  errors?: string[];
  warnings?: string[];
}

export interface QualitySummary {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  skippedChecks: number;
  lintPassed: boolean;
  testPassed: boolean;
  schemaPassed: boolean;
}

/**
 * Quality gate configuration
 */
export interface QualityGateConfig {
  projectRoot: string;
  phase: string;
  skipLint?: boolean;
  skipTests?: boolean;
  skipSchema?: boolean;
  lintThreshold?: {
    maxErrors?: number;
    maxWarnings?: number;
  };
  testThreshold?: {
    minCoverage?: number;
    allowFailedTests?: boolean;
  };
}

/**
 * Quality Gate orchestrates all quality checks
 */
export class QualityGate {
  private config: Required<QualityGateConfig>;

  constructor(config: QualityGateConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      phase: config.phase,
      skipLint: config.skipLint ?? false,
      skipTests: config.skipTests ?? false,
      skipSchema: config.skipSchema ?? false,
      lintThreshold: config.lintThreshold ?? { maxErrors: 0, maxWarnings: 100 },
      testThreshold: config.testThreshold ?? { minCoverage: 80, allowFailedTests: false },
    };
    logger.info({ config: this.config }, 'QualityGate initialized');
  }

  /**
   * Run all quality gates
   */
  async run(): Promise<QualityGateResult> {
    const startTime = Date.now();
    const checks: QualityCheckResult[] = [];

    logger.info({ phase: this.config.phase }, 'Starting quality gate');

    // Run lint check
    if (!this.config.skipLint) {
      checks.push(await this.runLintCheck());
    } else {
      checks.push({ name: 'lint', status: 'skipped', result: null });
    }

    // Run tests
    if (!this.config.skipTests) {
      checks.push(await this.runTestCheck());
    } else {
      checks.push({ name: 'test', status: 'skipped', result: null });
    }

    // Run schema validation
    if (!this.config.skipSchema) {
      checks.push(await this.runSchemaCheck());
    } else {
      checks.push({ name: 'schema', status: 'skipped', result: null });
    }

    const summary = this.summarizeChecks(checks);

    const result: QualityGateResult = {
      passed: summary.failedChecks === 0,
      phase: this.config.phase,
      checks,
      summary,
      duration: Date.now() - startTime,
    };

    logger.info(
      { passed: result.passed, summary },
      'Quality gate completed'
    );

    return result;
  }

  /**
   * Run lint check
   */
  private async runLintCheck(): Promise<QualityCheckResult> {
    logger.debug('Running lint check');

    try {
      // Dynamic import to avoid circular dependency
      const { createLintChecker } = await import('./lint-checker.js');
      const checker = createLintChecker(this.config.projectRoot);
      const result = await checker.check();

      const passed = this.evaluateLintResult(result);

      return {
        name: 'lint',
        status: passed ? 'passed' : 'failed',
        result,
        errors: passed ? undefined : [this.formatLintErrors(result)],
        warnings: result.summary.totalWarnings > 0
          ? [`${result.summary.totalWarnings} warnings found`]
          : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Lint check failed');
      return {
        name: 'lint',
        status: 'failed',
        result: null,
        errors: [`Lint check error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Run test check
   */
  private async runTestCheck(): Promise<QualityCheckResult> {
    logger.debug('Running test check');

    try {
      const { createTestRunner } = await import('./test-runner.js');
      const runner = createTestRunner(this.config.projectRoot);
      runner.config = { ...runner.config, coverage: true };
      const result = await runner.run();

      const passed = this.evaluateTestResult(result);

      const errors: string[] = [];
      if (result.summary.failed > 0) {
        errors.push(`${result.summary.failed} tests failed`);
      }

      if (result.summary.coverage) {
        const { minCoverage } = this.config.testThreshold;
        if (result.summary.coverage.statements < (minCoverage ?? 80)) {
          errors.push(`Coverage too low: ${result.summary.coverage.statements}% < ${minCoverage}%`);
        }
      }

      return {
        name: 'test',
        status: passed ? 'passed' : 'failed',
        result,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Test check failed');
      return {
        name: 'test',
        status: 'failed',
        result: null,
        errors: [`Test check error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Run schema check on workflow artifacts
   */
  private async runSchemaCheck(): Promise<QualityCheckResult> {
    logger.debug('Running schema check');

    try {
      // Dynamic import to avoid circular dependency
      const { createDefaultValidator } = await import('./schema-validator.js');
      const validator = createDefaultValidator();

      // Get planning and workflow files to validate
      const path = await import('path');
      const { promises: fs } = await import('fs');

      const planPath = path.join(this.config.projectRoot, 'PLANNING.md');
      const errors: string[] = [];

      try {
        const planContent = await fs.readFile(planPath, 'utf-8');
        // Basic validation that PLANNING.md exists and is parseable
        if (planContent.length === 0) {
          errors.push('PLANNING.md is empty');
        } else if (!planContent.includes('#')) {
          errors.push('PLANNING.md does not appear to be valid markdown');
        }
      } catch {
        errors.push('PLANNING.md not found');
      }

      return {
        name: 'schema',
        status: errors.length > 0 ? 'failed' : 'passed',
        result: {
          success: errors.length === 0,
          schema: 'planning',
          errors: errors.map(e => ({ path: 'PLANNING.md', message: e })),
          warnings: [],
          duration: 0,
        },
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Schema check failed');
      return {
        name: 'schema',
        status: 'failed',
        result: null,
        errors: [`Schema check error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Evaluate lint result
   */
  private evaluateLintResult(result: LintResult): boolean {
    const { maxErrors, maxWarnings } = this.config.lintThreshold;

    if (result.summary.totalErrors > (maxErrors ?? 0)) {
      return false;
    }

    if (result.summary.totalWarnings > (maxWarnings ?? 100)) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate test result
   */
  private evaluateTestResult(result: TestResult): boolean {
    if (result.summary.failed > 0 && !this.config.testThreshold.allowFailedTests) {
      return false;
    }

    if (result.summary.coverage) {
      const { minCoverage } = this.config.testThreshold;
      if (result.summary.coverage.statements < (minCoverage ?? 80)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format lint errors
   */
  private formatLintErrors(result: LintResult): string {
    const filesWithErrors = result.summary.filesWithErrors;
    const totalErrors = result.summary.totalErrors;

    if (filesWithErrors > 1) {
      return `${totalErrors} lint errors in ${filesWithErrors} files`;
    }

    // Find first file with errors
    const firstFile = result.files.find(f => f.errors.length > 0);
    if (firstFile) {
      const error = firstFile.errors[0];
      return `${firstFile.file}:${error.line}:${error.column} - ${error.message}`;
    }

    return `${totalErrors} lint errors`;
  }

  /**
   * Summarize checks
   */
  private summarizeChecks(checks: QualityCheckResult[]): QualitySummary {
    let passedChecks = 0;
    let failedChecks = 0;
    let skippedChecks = 0;
    let lintPassed = false;
    let testPassed = false;
    let schemaPassed = false;

    for (const check of checks) {
      switch (check.status) {
        case 'passed':
          passedChecks++;
          break;
        case 'failed':
          failedChecks++;
          break;
        case 'skipped':
          skippedChecks++;
          break;
        case 'warning':
          passedChecks++; // Warnings don't fail the gate
          break;
      }

      switch (check.name) {
        case 'lint':
          lintPassed = check.status === 'passed' || check.status === 'skipped';
          break;
        case 'test':
          testPassed = check.status === 'passed' || check.status === 'skipped';
          break;
        case 'schema':
          schemaPassed = check.status === 'passed' || check.status === 'skipped';
          break;
      }
    }

    return {
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
      skippedChecks,
      lintPassed,
      testPassed,
      schemaPassed,
    };
  }
}

/**
 * Create quality gate for a phase
 */
export function createQualityGate(
  projectRoot: string,
  phase: string,
  options?: Partial<QualityGateConfig>
): QualityGate {
  return new QualityGate({ projectRoot, phase, ...options });
}

/**
 * Run quality gate and return result
 */
export async function runQualityGate(
  projectRoot: string,
  phase: string,
  options?: Partial<QualityGateConfig>
): Promise<QualityGateResult> {
  const gate = createQualityGate(projectRoot, phase, options);
  return gate.run();
}
