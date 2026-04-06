/**
 * Agent-related type definitions
 * @module types/agent
 */

import { z } from 'zod';

/**
 * Agent type enum
 */
export const AgentTypeSchema = z.enum(['main', 'architect', 'backend-dev', 'frontend-dev', 'qa-engineer']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * Agent configuration from agent.md
 */
export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  tools: string[];
  model?: string;
  middleware?: string[];
  tokenBudget: number;
  instructions?: string;
}

export const AgentConfigSchema: z.ZodType<AgentConfig> = z.object({
  type: AgentTypeSchema,
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()),
  model: z.string().optional(),
  middleware: z.array(z.string()).optional(),
  tokenBudget: z.number().default(50000),
  instructions: z.string().optional(),
});

/**
 * Agent runtime state
 */
export interface AgentState {
  messages: BaseMessage[];
  files: Record<string, FileData>;
  todos: Todo[];
  skillsMetadata: Record<string, SkillMeta>;
}

export const AgentStateSchema: z.ZodType<AgentState> = z.object({
  messages: z.array(BaseMessageSchema),
  files: z.record(z.string(), FileDataSchema),
  todos: z.array(TodoSchema),
  skillsMetadata: z.record(z.string(), SkillMetaSchema),
});

/**
 * Base message in agent conversation
 */
export interface BaseMessage {
  id: string;
  type: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export const BaseMessageSchema: z.ZodType<BaseMessage> = z.object({
  id: z.string(),
  type: z.enum(['human', 'ai', 'system', 'tool']),
  content: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Serialized message for checkpoint
 */
export interface SerializedMessage {
  type: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  additional_kwargs?: Record<string, unknown>;
}

export const SerializedMessageSchema: z.ZodType<SerializedMessage> = z.object({
  type: z.enum(['human', 'ai', 'system', 'tool']),
  content: z.string(),
  additional_kwargs: z.record(z.unknown()).optional(),
});

/**
 * File data in agent state
 */
export interface FileData {
  path: string;
  content: string;
  language?: string;
  lastModified: Date;
}

export const FileDataSchema: z.ZodType<FileData> = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  lastModified: z.date(),
});

/**
 * Serialized file for checkpoint
 */
export interface SerializedFile {
  path: string;
  content: string;
  language?: string;
}

export const SerializedFileSchema: z.ZodType<SerializedFile> = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
});

/**
 * Todo item in agent state
 */
export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

export const TodoSchema: z.ZodType<Todo> = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
});

/**
 * Serialized todo for checkpoint
 */
export interface SerializedTodo {
  content: string;
  status: string;
  priority?: string;
}

export const SerializedTodoSchema: z.ZodType<SerializedTodo> = z.object({
  content: z.string(),
  status: z.string(),
  priority: z.string().optional(),
});

/**
 * Skills metadata
 */
export interface SkillMeta {
  skillId: string;
  name: string;
  lastUsed: Date;
  successRate: number;
}

export const SkillMetaSchema: z.ZodType<SkillMeta> = z.object({
  skillId: z.string(),
  name: z.string(),
  lastUsed: z.date(),
  successRate: z.number(),
});

/**
 * Agent instance (runtime)
 */
export interface AgentInstance {
  id: string;
  type: AgentType;
  config: AgentConfig;
  state: AgentState;
}

export const AgentInstanceSchema: z.ZodType<AgentInstance> = z.object({
  id: z.string(),
  type: AgentTypeSchema,
  config: AgentConfigSchema,
  state: AgentStateSchema,
});

/**
 * Routing rule from agent.md
 */
export interface RoutingRule {
  module: string;
  agents: AgentType[];
  mode: 'parallel' | 'sequential';
  condition?: string;
}

export const RoutingRuleSchema: z.ZodType<RoutingRule> = z.object({
  module: z.string(),
  agents: z.array(AgentTypeSchema),
  mode: z.enum(['parallel', 'sequential']),
  condition: z.string().optional(),
});

/**
 * Agent registry from agent.md
 */
export interface AgentRegistry {
  roles: AgentConfig[];
  routingRules: RoutingRule[];
}

export const AgentRegistrySchema: z.ZodType<AgentRegistry> = z.object({
  roles: z.array(AgentConfigSchema),
  routingRules: z.array(RoutingRuleSchema),
});
