/**
 * Base Tool interface for all tools
 * @module tools/base-tool
 */

/**
 * Tool result interface
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all tools
 */
export interface BaseTool {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly inputSchema: ToolInputSchema;
  readonly outputSchema: ToolOutputSchema;
  readonly allowedRoles: string[];

  execute(input: unknown): Promise<ToolResult>;
  validateInput?(input: unknown): ValidationResult;
}

/**
 * Tool input/output schema
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required?: string[];
}

export interface ToolOutputSchema {
  type: 'string' | 'object' | 'array' | 'boolean' | 'number';
}

export interface ToolProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * Tool category
 */
export type ToolCategory =
  | 'file'
  | 'command'
  | 'git'
  | 'search'
  | 'http'
  | 'database'
  | 'code'
  | 'system';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Abstract base class for tools
 */
export abstract class AbstractTool implements BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ToolCategory;
  abstract readonly allowedRoles: string[];

  abstract readonly inputSchema: ToolInputSchema;
  abstract readonly outputSchema: ToolOutputSchema;

  abstract execute(input: unknown): Promise<ToolResult>;

  validateInput(input: unknown): ValidationResult {
    const errors: string[] = [];

    if (this.inputSchema.required) {
      for (const field of this.inputSchema.required) {
        if (!(field in (input as Record<string, unknown>))) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Tool execution context
 */
export interface ToolContext {
  projectRoot: string;
  sessionId: string;
  agentId: string;
  allowedPaths?: string[];
  blockedCommands?: string[];
  sandboxEnabled: boolean;
}

/**
 * Create a basic tool result
 */
export function createToolResult(
  success: boolean,
  output?: string,
  error?: string,
  metadata?: Record<string, unknown>
): ToolResult {
  return {
    success,
    output,
    error,
    metadata,
  };
}

/**
 * Create a success tool result
 */
export function successResult(output: string, metadata?: Record<string, unknown>): ToolResult {
  return createToolResult(true, output, undefined, metadata);
}

/**
 * Create an error tool result
 */
export function errorResult(error: string, metadata?: Record<string, unknown>): ToolResult {
  return createToolResult(false, undefined, error, metadata);
}
