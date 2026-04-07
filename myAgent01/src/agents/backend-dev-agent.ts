/**
 * Backend Developer Agent - implements backend logic and APIs
 * @module agents/backend-dev-agent
 */

import type { Task, ExecutionContext, TaskResult } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'backend-dev-agent' });

/**
 * Backend Developer Agent specializes in API and business logic implementation
 */
export class BackendDevAgent extends BaseAgent {
  constructor() {
    super('backend-dev', {
      type: 'backend-dev',
      name: 'Backend Developer Agent',
      description: 'Specializes in API development, business logic, and database design',
      tools: ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'command'],
      model: 'claude-haiku-4-5',
      tokenBudget: 60000,
    });
  }

  /**
   * Initialize backend dev agent
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Backend Developer Agent');
    this.addSystemMessage('Backend Developer Agent initialized - ready for backend development tasks');
  }

  /**
   * Execute backend development task
   */
  async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const startTime = Date.now();
    logger.info({ taskId: task.id, taskName: task.name }, 'Executing backend task');

    this.addHumanMessage(`Starting backend task: ${task.name}`);

    try {
      const files: Record<string, string> = {};

      // Determine what kind of backend files to generate based on task
      const taskNameLower = task.name.toLowerCase();

      if (taskNameLower.includes('api') || taskNameLower.includes('endpoint')) {
        Object.assign(files, this.generateAPIFiles(task));
      }

      if (taskNameLower.includes('service') || taskNameLower.includes('business')) {
        Object.assign(files, this.generateServiceFiles(task));
      }

      if (taskNameLower.includes('model') || taskNameLower.includes('database') || taskNameLower.includes('data')) {
        Object.assign(files, this.generateModelFiles(task));
      }

      // If no specific type matched, generate generic module
      if (Object.keys(files).length === 0) {
        Object.assign(files, this.generateGenericModule(task));
      }

      // Generate tests for the backend code
      const testFiles = this.generateBackendTests(task);
      Object.assign(files, testFiles);

      this.addAIMessage(`Backend development completed for: ${task.name}`);

      return {
        taskId: task.id,
        status: 'success',
        output: {
          files,
          messages: [
            `Backend development completed for ${task.name}`,
            `Generated ${Object.keys(files).length} files`,
          ],
        },
        tokenUsage: {
          inputTokens: 4000,
          outputTokens: 6000,
        },
        duration: Date.now() - startTime,
        logs: [],
      };
    } catch (error) {
      logger.error({ taskId: task.id, error }, 'Backend task failed');
      return {
        taskId: task.id,
        status: 'failed',
        output: { files: {}, messages: [] },
        tokenUsage: { inputTokens: 4000, outputTokens: 2000 },
        duration: Date.now() - startTime,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate API files
   */
  private generateAPIFiles(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`src/api/${moduleName}.ts`]: this.generateAPIRoute(task),
      [`src/api/${moduleName}.controller.ts`]: this.generateAPIController(task),
      [`src/api/${moduleName}.schema.ts`]: this.generateAPISchema(task),
    };
  }

  /**
   * Generate service files
   */
  private generateServiceFiles(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`src/services/${moduleName}.service.ts`]: this.generateService(task),
      [`src/services/${moduleName}.interface.ts`]: this.generateServiceInterface(task),
    };
  }

  /**
   * Generate model files
   */
  private generateModelFiles(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`src/models/${moduleName}.model.ts`]: this.generateModel(task),
      [`src/models/${moduleName}.repository.ts`]: this.generateRepository(task),
    };
  }

  /**
   * Generate generic module
   */
  private generateGenericModule(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`src/${moduleName}/index.ts`]: this.generateModuleIndex(task),
      [`src/${moduleName}/${moduleName}.ts`]: this.generateModuleMain(task),
    };
  }

  /**
   * Generate backend tests
   */
  private generateBackendTests(task: Task): Record<string, string> {
    const moduleName = this.toModuleName(task.name);
    return {
      [`test/unit/${moduleName}.test.ts`]: this.generateBackendTest(task),
    };
  }

  /**
   * Generate API route
   */
  private generateAPIRoute(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} API routes
 */

import { Router } from 'express';
import { ${this.capitalize(moduleName)}Controller } from './${moduleName}.controller.js';

const router = Router();
const controller = new ${this.capitalize(moduleName)}Controller();

router.get('/', controller.list.bind(controller));
router.get('/:id', controller.get.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));

export default router;
`;
  }

  /**
   * Generate API controller
   */
  private generateAPIController(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Controller
 */

import type { Request, Response } from 'express';

export class ${this.capitalize(moduleName)}Controller {
  async list(req: Request, res: Response): Promise<void> {
    // TODO: Implement list ${moduleName}
    res.json({ data: [], total: 0 });
  }

  async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    // TODO: Implement get ${moduleName}
    res.json({ id, name: '', description: '' });
  }

  async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    // TODO: Implement create ${moduleName}
    res.status(201).json({ id: 'new-id', ...data });
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const data = req.body;
    // TODO: Implement update ${moduleName}
    res.json({ id, ...data });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    // TODO: Implement delete ${moduleName}
    res.status(204).send();
  }
}
`;
  }

  /**
   * Generate API schema (Zod validation)
   */
  private generateAPISchema(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} API Schema definitions
 */

import { z } from 'zod';

export const ${this.capitalize(moduleName)}Schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const Create${this.capitalize(moduleName)}Schema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const Update${this.capitalize(moduleName)}Schema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export type ${this.capitalize(moduleName)} = z.infer<typeof ${this.capitalize(moduleName)}Schema>;
export type Create${this.capitalize(moduleName)} = z.infer<typeof Create${this.capitalize(moduleName)}Schema>;
export type Update${this.capitalize(moduleName)} = z.infer<typeof Update${this.capitalize(moduleName)}Schema>;
`;
  }

  /**
   * Generate service
   */
  private generateService(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Service
 */

import type { ${this.capitalize(moduleName)}, Create${this.capitalize(moduleName)}, Update${this.capitalize(moduleName)} } from '../models/${moduleName}.model.js';

export class ${this.capitalize(moduleName)}Service {
  async findAll(): Promise<${this.capitalize(moduleName)}[]> {
    // TODO: Implement findAll
    return [];
  }

  async findById(id: string): Promise<${this.capitalize(moduleName)} | null> {
    // TODO: Implement findById
    return null;
  }

  async create(data: Create${this.capitalize(moduleName)}): Promise<${this.capitalize(moduleName)}> {
    // TODO: Implement create
    return {
      id: 'new-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async update(id: string, data: Update${this.capitalize(moduleName)}): Promise<${this.capitalize(moduleName)} | null> {
    // TODO: Implement update
    return null;
  }

  async delete(id: string): Promise<boolean> {
    // TODO: Implement delete
    return true;
  }
}
`;
  }

  /**
   * Generate service interface
   */
  private generateServiceInterface(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Service Interface
 */

export interface I${this.capitalize(moduleName)}Service {
  findAll(): Promise<import('./${moduleName}.model.js').${this.capitalize(moduleName)}[]>;
  findById(id: string): Promise<import('./${moduleName}.model.js').${this.capitalize(moduleName)} | null>;
  create(data: import('./${moduleName}.schema.js').Create${this.capitalize(moduleName)}): Promise<import('./${moduleName}.model.js').${this.capitalize(moduleName)}>;
  update(id: string, data: import('./${moduleName}.schema.js').Update${this.capitalize(moduleName)}): Promise<import('./${moduleName}.model.js').${this.capitalize(moduleName)} | null>;
  delete(id: string): Promise<boolean>;
}
`;
  }

  /**
   * Generate model
   */
  private generateModel(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Data Model
 */

export interface ${this.capitalize(moduleName)} {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ${this.capitalize(moduleName)}Model {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export function toDomain(model: ${this.capitalize(moduleName)}Model): ${this.capitalize(moduleName)} {
  return {
    id: model.id,
    name: model.name,
    description: model.description ?? undefined,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
  };
}

export function toModel(domain: ${this.capitalize(moduleName)}): ${this.capitalize(moduleName)}Model {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description ?? null,
    created_at: domain.createdAt,
    updated_at: domain.updatedAt,
  };
}
`;
  }

  /**
   * Generate repository
   */
  private generateRepository(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Repository
 */

import type { ${this.capitalize(moduleName)}, ${this.capitalize(moduleName)}Model } from './${moduleName}.model.js';

export interface I${this.capitalize(moduleName)}Repository {
  findAll(): Promise<${this.capitalize(moduleName)}[]>;
  findById(id: string): Promise<${this.capitalize(moduleName)} | null>;
  create(data: Omit<${this.capitalize(moduleName)}, 'id' | 'createdAt' | 'updatedAt'>): Promise<${this.capitalize(moduleName)}>;
  update(id: string, data: Partial<${this.capitalize(moduleName)}>): Promise<${this.capitalize(moduleName)} | null>;
  delete(id: string): Promise<boolean>;
}

export class ${this.capitalize(moduleName)}Repository implements I${this.capitalize(moduleName)}Repository {
  // TODO: Implement repository with database connection
}
`;
  }

  /**
   * Generate module index
   */
  private generateModuleIndex(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Module
 */

export * from './${moduleName}.js';
`;
  }

  /**
   * Generate module main
   */
  private generateModuleMain(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Module
 */

export class ${this.capitalize(moduleName)} {
  // TODO: Implement module
}
`;
  }

  /**
   * Generate backend test
   */
  private generateBackendTest(task: Task): string {
    const moduleName = this.toModuleName(task.name);
    return `/**
 * ${task.name} Backend Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ${this.capitalize(moduleName)}Service } from '../../src/services/${moduleName}.service.js';

describe('${this.capitalize(moduleName)}Service', () => {
  let service: ${this.capitalize(moduleName)}Service;

  beforeEach(() => {
    service = new ${this.capitalize(moduleName)}Service();
  });

  describe('findAll', () => {
    it('should return empty array', async () => {
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent id', async () => {
      const result = await service.findById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new item', async () => {
      const result = await service.create({ name: 'Test' });
      expect(result.name).toBe('Test');
      expect(result.id).toBeDefined();
    });
  });
});
`;
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
