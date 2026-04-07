/**
 * Tool Registry - registers and manages all available tools
 * @module tools/tool-registry
 */

import type { BaseTool, ToolResult } from './base-tool.js';
import {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  GlobTool,
  ExistsTool,
  DeleteFileTool,
  MkdirTool,
  CopyFileTool,
  StatsTool,
} from './file-tools.js';
import { CommandTool, RunScriptTool, isCommandAllowed, isDangerousCommand, getAllowedCommands } from './command-tools.js';
import {
  GitStatusTool,
  GitAddTool,
  GitCommitTool,
  GitBranchTool,
  GitCheckoutTool,
  GitLogTool,
  GitPushTool,
  GitDiffTool,
} from './git-tools.js';
import { GrepTool, FindTool, SystemGrepTool } from './search-tools.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'tool-registry' });

/**
 * Tool metadata for registry
 */
export interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  allowedRoles: string[];
  inputSchema: unknown;
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  agentId?: string;
  agentRole?: string;
  context?: Record<string, unknown>;
}

/**
 * Tool Registry manages all available tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private byCategory: Map<string, BaseTool[]> = new Map();
  private byRole: Map<string, BaseTool[]> = new Map();

  constructor() {
    this.registerDefaults();
    logger.info({ toolCount: this.tools.size }, 'ToolRegistry initialized');
  }

  /**
   * Register default tools
   */
  private registerDefaults(): void {
    // File tools
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new EditFileTool());
    this.register(new GlobTool());
    this.register(new ExistsTool());
    this.register(new DeleteFileTool());
    this.register(new MkdirTool());
    this.register(new CopyFileTool());
    this.register(new StatsTool());

    // Command tools
    this.register(new CommandTool());
    this.register(new RunScriptTool());

    // Git tools
    this.register(new GitStatusTool());
    this.register(new GitAddTool());
    this.register(new GitCommitTool());
    this.register(new GitBranchTool());
    this.register(new GitCheckoutTool());
    this.register(new GitLogTool());
    this.register(new GitPushTool());
    this.register(new GitDiffTool());

    // Search tools
    this.register(new GrepTool());
    this.register(new FindTool());
    this.register(new SystemGrepTool());
  }

  /**
   * Register a tool
   */
  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);

    // Index by category
    const categoryTools = this.byCategory.get(tool.category) ?? [];
    categoryTools.push(tool);
    this.byCategory.set(tool.category, categoryTools);

    // Index by role
    for (const role of tool.allowedRoles) {
      const roleTools = this.byRole.get(role) ?? [];
      roleTools.push(tool);
      this.byRole.set(role, roleTools);
    }

    logger.debug({ tool: tool.name, category: tool.category }, 'Tool registered');
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    this.tools.delete(name);

    // Remove from category index
    const categoryTools = this.byCategory.get(tool.category);
    if (categoryTools) {
      const index = categoryTools.indexOf(tool);
      if (index >= 0) {
        categoryTools.splice(index, 1);
      }
    }

    // Remove from role index
    for (const role of tool.allowedRoles) {
      const roleTools = this.byRole.get(role);
      if (roleTools) {
        const index = roleTools.indexOf(tool);
        if (index >= 0) {
          roleTools.splice(index, 1);
        }
      }
    }

    logger.debug({ tool: name }, 'Tool unregistered');
    return true;
  }

  /**
   * Get tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): BaseTool[] {
    return this.byCategory.get(category) ?? [];
  }

  /**
   * Get tools for a specific role
   */
  getForRole(role: string): BaseTool[] {
    return this.byRole.get(role) ?? [];
  }

  /**
   * Get tool metadata for all tools
   */
  getMetadata(): ToolMetadata[] {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      allowedRoles: tool.allowedRoles,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute a tool by name
   */
  async execute(
    name: string,
    input: unknown,
    options: ToolExecutionOptions = {}
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // Check role permission
    if (options.agentRole && !tool.allowedRoles.includes(options.agentRole)) {
      return {
        success: false,
        error: `Tool ${name} not allowed for role: ${options.agentRole}`,
      };
    }

    try {
      // Validate input if tool supports it
      if (tool.validateInput) {
        const validation = tool.validateInput(input);
        if (!validation.valid) {
          return {
            success: false,
            error: `Invalid input: ${validation.errors.join(', ')}`,
          };
        }
      }

      // Execute tool
      logger.debug({ tool: name, agentId: options.agentId }, 'Executing tool');
      const result = await tool.execute(input);

      logger.debug({ tool: name, success: result.success }, 'Tool executed');
      return result;
    } catch (error) {
      logger.error({ tool: name, error }, 'Tool execution failed');
      return {
        success: false,
        error: `Tool execution failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool count
   */
  size(): number {
    return this.tools.size;
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.byCategory.keys());
  }

  /**
   * Get all roles
   */
  getRoles(): string[] {
    return Array.from(this.byRole.keys());
  }
}

/**
 * Global tool registry instance
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global tool registry
 */
export function resetToolRegistry(): void {
  globalRegistry = null;
}

/**
 * Create a new tool registry (for testing or isolation)
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

// Re-export dangerous command utilities
export { isCommandAllowed, isDangerousCommand, getAllowedCommands };
