/**
 * Validation utilities using Zod
 * @module utils/validation
 */

import { z, ZodError, ZodType } from 'zod';

/**
 * Validation result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate data against a Zod schema
 */
export function validateSchema<T>(
  schema: ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * Validate data, throwing on failure
 */
export function validateSchemaOrThrow<T>(
  schema: ZodType<T>,
  data: unknown,
  errorMessage?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    const message = errorMessage ?? `Validation failed: ${errors.map(e => e.message).join(', ')}`;
    throw new ValidationError(message, errors);
  }

  return result.data;
}

/**
 * Format Zod errors into our ValidationError format
 */
export function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map(err => ({
    path: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ValidationError[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate workflow configuration
 */
export function validateWorkflowConfig(config: unknown): ValidationResult<unknown> {
  // Import here to avoid circular dependency
  const { WorkflowSpecSchema } = require('../types/workflow.js');
  return validateSchema(WorkflowSpecSchema, config);
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: unknown): ValidationResult<unknown> {
  // Import here to avoid circular dependency
  const { AgentRegistrySchema } = require('../types/agent.js');
  return validateSchema(AgentRegistrySchema, config);
}

/**
 * Validate planning document
 */
export function validatePlanningDocument(doc: unknown): ValidationResult<unknown> {
  // PlanningDocumentSchema would be imported here
  const PlanningDocumentSchema = z.object({
    id: z.string(),
    version: z.number(),
    phase: z.string(),
    confirmedAt: z.date().optional(),
    confirmedBy: z.string().optional(),
  });

  return validateSchema(PlanningDocumentSchema, doc);
}

/**
 * Create a partial schema for incremental validation
 */
export function createPartialSchema<T extends z.ZodType>(schema: T): ZodType<Partial<z.infer<T>>> {
  return z.object({
    ...(schema as z.ZodObject<z.ZodRawShape>).shape,
  }).partial();
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Check if a string is a valid semver
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  return semverRegex.test(version);
}
