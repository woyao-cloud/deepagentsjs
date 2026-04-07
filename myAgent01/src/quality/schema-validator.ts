/**
 * Schema Validator - validates API schemas and data structures
 * @module quality/schema-validator
 */

import { z, ZodError, ZodSchema } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'schema-validator' });

/**
 * Validation result
 */
export interface SchemaValidationResult {
  success: boolean;
  schema: string;
  errors: SchemaValidationError[];
  warnings: SchemaValidationWarning[];
  duration: number;
}

export interface SchemaValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface SchemaValidationWarning {
  path: string;
  message: string;
}

/**
 * Schema definition
 */
export interface SchemaDefinition {
  name: string;
  schema: ZodSchema;
  description?: string;
}

/**
 * Schema Validator validates data against schemas
 */
export class SchemaValidator {
  private schemas: Map<string, ZodSchema> = new Map();
  private definitions: Map<string, SchemaDefinition> = new Map();

  constructor() {
    logger.debug('SchemaValidator initialized');
  }

  /**
   * Register a schema
   */
  register(name: string, schema: ZodSchema, description?: string): void {
    this.schemas.set(name, schema);
    this.definitions.set(name, { name, schema, description });
    logger.debug({ name }, 'Schema registered');
  }

  /**
   * Register multiple schemas
   */
  registerMany(definitions: SchemaDefinition[]): void {
    for (const def of definitions) {
      this.register(def.name, def.schema, def.description);
    }
  }

  /**
   * Validate data against a registered schema
   */
  validate(name: string, data: unknown): SchemaValidationResult {
    const startTime = Date.now();
    const schema = this.schemas.get(name);

    if (!schema) {
      return {
        success: false,
        schema: name,
        errors: [{
          path: '',
          message: `Schema not found: ${name}`,
        }],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }

    try {
      schema.parse(data);
      return {
        success: true,
        schema: name,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const zodError = error as ZodError;
      return {
        success: false,
        schema: name,
        errors: this.convertZodErrors(zodError),
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate against a raw schema
   */
  validateRaw(schema: ZodSchema, data: unknown, name = 'unknown'): SchemaValidationResult {
    const startTime = Date.now();

    try {
      schema.parse(data);
      return {
        success: true,
        schema: name,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const zodError = error as ZodError;
      return {
        success: false,
        schema: name,
        errors: this.convertZodErrors(zodError),
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Convert Zod errors to our format
   */
  private convertZodErrors(zodError: ZodError): SchemaValidationError[] {
    return zodError.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      value: err.code === 'invalid_type' ? err.received : undefined,
    }));
  }

  /**
   * Check if schema exists
   */
  has(name: string): boolean {
    return this.schemas.has(name);
  }

  /**
   * Get schema definition
   */
  get(name: string): SchemaDefinition | undefined {
    return this.definitions.get(name);
  }

  /**
   * Get all registered schema names
   */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate workflow configuration
   */
  validateWorkflow(workflow: unknown): SchemaValidationResult {
    const workflowSchema = z.object({
      phases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        depends: z.array(z.string()),
        tasks: z.array(z.object({
          id: z.string(),
          name: z.string(),
          parallel: z.boolean(),
          owners: z.array(z.string()),
          depends: z.array(z.string()).optional(),
        })),
        status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
      })),
      rules: z.array(z.object({
        id: z.string(),
        description: z.string(),
      })),
      metadata: z.object({
        version: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    });

    return this.validateRaw(workflowSchema, workflow, 'workflow');
  }

  /**
   * Validate agent configuration
   */
  validateAgentConfig(config: unknown): SchemaValidationResult {
    const agentSchema = z.object({
      roles: z.array(z.object({
        type: z.enum(['main', 'architect', 'backend-dev', 'frontend-dev', 'qa-engineer']),
        name: z.string(),
        description: z.string(),
        tools: z.array(z.string()),
        tokenBudget: z.number(),
      })),
      routingRules: z.array(z.object({
        module: z.string(),
        agents: z.array(z.enum(['main', 'architect', 'backend-dev', 'frontend-dev', 'qa-engineer'])),
        mode: z.enum(['parallel', 'sequential']),
      })),
    });

    return this.validateRaw(agentSchema, config, 'agentConfig');
  }

  /**
   * Validate planning document
   */
  validatePlanning(planning: unknown): SchemaValidationResult {
    const planningSchema = z.object({
      id: z.string(),
      version: z.number(),
      phase: z.string(),
      taskTree: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        children: z.array(z.any()),
        estimatedTokens: z.number(),
        dependencies: z.array(z.string()),
      })),
      techStack: z.object({
        recommendations: z.array(z.object({
          category: z.string(),
          technology: z.string(),
          reason: z.string(),
          alternatives: z.array(z.string()),
        })),
        overall: z.object({
          backend: z.string(),
          frontend: z.string(),
          database: z.string(),
          testing: z.string(),
        }),
      }),
    });

    return this.validateRaw(planningSchema, planning, 'planning');
  }
}

/**
 * Create default schema validator with built-in schemas
 */
export function createDefaultValidator(): SchemaValidator {
  const validator = new SchemaValidator();

  // Register default schemas for API validation
  validator.register('api_error', z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }));

  validator.register('api_success', z.object({
    data: z.unknown(),
    meta: z.object({
      timestamp: z.string(),
      version: z.string().optional(),
    }).optional(),
  }));

  validator.register('pagination', z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }));

  return validator;
}
