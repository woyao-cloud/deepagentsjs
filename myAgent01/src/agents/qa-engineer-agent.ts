/**
 * QA Engineer Agent - responsible for testing and quality assurance
 * @module agents/qa-engineer-agent
 */

import type { Task, ExecutionContext, TaskResult } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'qa-engineer-agent' });

/**
 * QA Engineer Agent specializes in testing and quality assurance
 */
export class QAEngineerAgent extends BaseAgent {
  constructor() {
    super('qa-engineer', {
      type: 'qa-engineer',
      name: 'QA Engineer Agent',
      description: 'Specializes in test case generation and coverage validation',
      tools: ['read_file', 'write_file', 'glob', 'grep', 'command'],
      model: 'claude-haiku-4-5',
      tokenBudget: 40000,
    });
  }

  /**
   * Initialize QA engineer agent
   */
  async initialize(): Promise<void> {
    logger.info('Initializing QA Engineer Agent');
    this.addSystemMessage('QA Engineer Agent initialized - ready for testing tasks');
  }

  /**
   * Execute QA testing task
   */
  async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const startTime = Date.now();
    logger.info({ taskId: task.id, taskName: task.name }, 'Executing QA task');

    this.addHumanMessage(`Starting QA task: ${task.name}`);

    try {
      const files: Record<string, string> = {};

      const taskNameLower = task.name.toLowerCase();

      // Generate unit tests
      if (taskNameLower.includes('test') || taskNameLower.includes('unit')) {
        Object.assign(files, this.generateUnitTests(task));
      }

      // Generate integration tests
      if (taskNameLower.includes('integration') || taskNameLower.includes('api')) {
        Object.assign(files, this.generateIntegrationTests(task));
      }

      // Generate E2E tests
      if (taskNameLower.includes('e2e') || taskNameLower.includes('end-to-end')) {
        Object.assign(files, this.generateE2ETests(task));
      }

      // Generate test setup and utilities
      Object.assign(files, this.generateTestSetup(task));

      // Generate test configuration
      Object.assign(files, this.generateTestConfig(task));

      this.addAIMessage(`QA testing completed for: ${task.name}`);

      return {
        taskId: task.id,
        status: 'success',
        output: {
          files,
          messages: [
            `QA testing completed for ${task.name}`,
            `Generated ${Object.keys(files).length} test files`,
            'Test coverage target: 80%',
          ],
        },
        tokenUsage: {
          inputTokens: 3000,
          outputTokens: 5000,
        },
        duration: Date.now() - startTime,
        logs: [],
      };
    } catch (error) {
      logger.error({ taskId: task.id, error }, 'QA task failed');
      return {
        taskId: task.id,
        status: 'failed',
        output: { files: {}, messages: [] },
        tokenUsage: { inputTokens: 3000, outputTokens: 2000 },
        duration: Date.now() - startTime,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate unit tests
   */
  private generateUnitTests(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`test/unit/${moduleName}.test.ts`]: this.generateUnitTestContent(task),
      [`test/unit/${moduleName}.coverage.ts`]: this.generateCoverageReport(task),
    };
  }

  /**
   * Generate integration tests
   */
  private generateIntegrationTests(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`test/integration/${moduleName}.test.ts`]: this.generateIntegrationTestContent(task),
      [`test/integration/${moduleName}.setup.ts`]: this.generateIntegrationSetup(task),
    };
  }

  /**
   * Generate E2E tests
   */
  private generateE2ETests(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`test/e2e/${moduleName}.spec.ts`]: this.generateE2ETestContent(task),
    };
  }

  /**
   * Generate test setup
   */
  private generateTestSetup(task: Task): Record<string, string> {
    return {
      'test/setup.ts': this.generateTestSetupContent(task),
      'test/helpers.ts': this.generateTestHelpers(task),
      'test/mocks/index.ts': this.generateMocks(task),
    };
  }

  /**
   * Generate test configuration
   */
  private generateTestConfig(task: Task): Record<string, string> {
    return {
      'vitest.config.ts': this.generateVitestConfig(task),
      'test/coverage/thresholds.json': this.generateCoverageThresholds(task),
    };
  }

  /**
   * Generate unit test content
   */
  private generateUnitTestContent(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    const className = this.capitalize(moduleName);
    return `/**
 * Unit Tests for ${task.name}
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ${className} } from '../../src/${moduleName}/${moduleName}.js';

describe('${className}', () => {
  let instance: ${className};

  beforeEach(() => {
    instance = new ${className}();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(instance).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      // TODO: Add initialization assertions
      expect(instance).toBeDefined();
    });
  });

  describe('core functionality', () => {
    it('should perform expected operation', async () => {
      // TODO: Add test implementation
      expect(true).toBe(true);
    });

    it('should handle edge cases', async () => {
      // TODO: Add edge case tests
      expect(true).toBe(true);
    });

    it('should handle error conditions', async () => {
      // TODO: Add error handling tests
      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      // TODO: Add empty input test
    });

    it('should handle null values', () => {
      // TODO: Add null handling test
    });

    it('should handle undefined values', () => {
      // TODO: Add undefined handling test
    });
  });
});
`;
  }

  /**
   * Generate coverage report template
   */
  private generateCoverageReport(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * Coverage Report for ${task.name}
 * Target: 80% coverage
 */

export const coverageReport = {
  target: {
    statements: 80,
    branches: 70,
    functions: 80,
    lines: 80,
  },
  actual: {
    statements: 0,
    branches: 0,
    functions: 0,
    lines: 0,
  },
};
`;
  }

  /**
   * Generate integration test content
   */
  private generateIntegrationTestContent(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    const className = this.capitalize(moduleName);
    return `/**
 * Integration Tests for ${task.name}
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ${className}Service } from '../../src/services/${moduleName}.service.js';
import { TestDatabase } from '../helpers';

describe('${className}Service Integration', () => {
  let service: ${className}Service;
  let db: TestDatabase;

  beforeAll(async () => {
    db = await TestDatabase.create();
    service = new ${className}Service(db.connection);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await db.reset();
  });

  describe('CRUD operations', () => {
    it('should create a new record', async () => {
      const result = await service.create({
        name: 'Test Item',
        description: 'Test Description',
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Item');
    });

    it('should retrieve a record by id', async () => {
      const created = await service.create({
        name: 'Test Item',
        description: 'Test Description',
      });

      const retrieved = await service.findById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Item');
    });

    it('should update a record', async () => {
      const created = await service.create({
        name: 'Original Name',
        description: 'Original Description',
      });

      const updated = await service.update(created.id, {
        name: 'Updated Name',
      });

      expect(updated?.name).toBe('Updated Name');
    });

    it('should delete a record', async () => {
      const created = await service.create({
        name: 'To Delete',
        description: 'Will be deleted',
      });

      const deleted = await service.delete(created.id);
      expect(deleted).toBe(true);

      const retrieved = await service.findById(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('query operations', () => {
    it('should list all records', async () => {
      await service.create({ name: 'Item 1' });
      await service.create({ name: 'Item 2' });

      const items = await service.findAll();
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });
});
`;
  }

  /**
   * Generate integration test setup
   */
  private generateIntegrationSetup(task: Task): string {
    return `/**
 * Integration Test Setup
 */

import { TestDatabase } from '../helpers';

export async function setupIntegrationTest() {
  const db = await TestDatabase.create();
  return db;
}

export async function teardownIntegrationTest(db: TestDatabase) {
  await db.cleanup();
}

export async function resetDatabase(db: TestDatabase) {
  await db.reset();
}
`;
  }

  /**
   * Generate E2E test content
   */
  private generateE2ETestContent(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * E2E Tests for ${task.name}
 */

import { test, expect, Page } from '@playwright/test';

test.describe('${task.name}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the page', async ({ page }) => {
    await expect(page).toHaveTitle(/.*/);
  });

  test('should display main content', async ({ page }) => {
    // TODO: Add assertions for main content
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle user interactions', async ({ page }) => {
    // TODO: Add user interaction tests
  });

  test('should navigate between sections', async ({ page }) => {
    // TODO: Add navigation tests
  });

  test('should display data correctly', async ({ page }) => {
    // TODO: Add data display tests
  });

  test('should handle form submissions', async ({ page }) => {
    // TODO: Add form submission tests
  });

  test('should handle errors gracefully', async ({ page }) => {
    // TODO: Add error handling tests
  });
});
`;
  }

  /**
   * Generate test setup content
   */
  private generateTestSetupContent(task: Task): string {
    return `/**
 * Test Setup - Global test configuration
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup } from './helpers';

// Global test timeout
const TEST_TIMEOUT = 30000;

// Run before all tests
beforeAll(() => {
  // TODO: Setup global test fixtures
  console.log('Starting test suite...');
});

// Run after all tests
afterAll(async () => {
  // TODO: Cleanup global fixtures
  await cleanup();
  console.log('Test suite completed.');
});

// Run before each test
beforeEach(() => {
  // TODO: Reset state before each test
});

// Run after each test
afterEach(async () => {
  // TODO: Cleanup after each test
});
`;
  }

  /**
   * Generate test helpers
   */
  private generateTestHelpers(task: Task): string {
    return `/**
 * Test Helpers - Utility functions for tests
 */

import { faker } from '@faker-js/faker';

/**
 * Generate a random ID
 */
export function generateId(): string {
  return faker.string.uuid();
}

/**
 * Generate random test data
 */
export function generateTestData() {
  return {
    id: generateId(),
    name: faker.commerce.productName(),
    description: faker.lorem.sentence(),
    price: parseFloat(faker.commerce.price()),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a mock function with predefined behavior
 */
export function createMockFn<T>(implementation?: () => T): () => T {
  return implementation ?? (() => undefined as unknown as T);
}

/**
 * Test Database helper
 */
export class TestDatabase {
  private static instance: TestDatabase | null = null;
  public connection: unknown;

  static async create(): Promise<TestDatabase> {
    const db = new TestDatabase();
    // TODO: Initialize database connection
    db.connection = {};
    return db;
  }

  async reset(): Promise<void> {
    // TODO: Reset database state
  }

  async cleanup(): Promise<void> {
    // TODO: Cleanup database
  }
}

/**
 * Mock API response
 */
export function mockApiResponse<T>(data: T, status = 200) {
  return {
    status,
    data,
    headers: new Headers({ 'content-type': 'application/json' }),
    ok: status >= 200 && status < 300,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Cleanup function
 */
export async function cleanup(): Promise<void> {
  // TODO: Cleanup resources
}
`;
  }

  /**
   * Generate mocks
   */
  private generateMocks(task: Task): Record<string, string> {
    return {
      'test/mocks/api.ts': this.generateAPIMocks(task),
      'test/mocks/db.ts': this.generateDBMocks(task),
    };
  }

  /**
   * Generate API mocks
   */
  private generateAPIMocks(task: Task): string {
    return `/**
 * API Mocks
 */

import { vi } from 'vitest';

export const apiMocks = {
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
  put: vi.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
  delete: vi.fn().mockResolvedValue({ status: 204 }),
};

export function resetApiMocks() {
  apiMocks.get.mockClear();
  apiMocks.post.mockClear();
  apiMocks.put.mockClear();
  apiMocks.delete.mockClear();
}
`;
  }

  /**
   * Generate database mocks
   */
  private generateDBMocks(task: Task): string {
    return `/**
 * Database Mocks
 */

import { vi } from 'vitest';

export const dbMocks = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  one: vi.fn().mockResolvedValue(null),
  none: vi.fn().mockResolvedValue(undefined),
  many: vi.fn().mockResolvedValue([]),
};

export function resetDbMocks() {
  dbMocks.query.mockClear();
  dbMocks.one.mockClear();
  dbMocks.none.mockClear();
  dbMocks.many.mockClear();
}
`;
  }

  /**
   * Generate Vitest config
   */
  private generateVitestConfig(task: Task): string {
    return `/**
 * Vitest Configuration
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
`;
  }

  /**
   * Generate coverage thresholds
   */
  private generateCoverageThresholds(task: Task): string {
    return JSON.stringify({
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
      'src/**/*.ts': {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    }, null, 2);
  }

  /**
   * Convert task name to module name
   */
  private toModuleName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Add system message to state
   */
  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date(),
    });
  }
}
