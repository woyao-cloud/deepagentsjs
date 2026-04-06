/**
 * Token budget-related type definitions
 * @module types/token
 */

import { z } from 'zod';
import { AgentTypeSchema, type AgentType } from './agent.js';
import { TokenUsageSchema, type TokenUsage } from './task.js';

/**
 * Token budget configuration
 */
export interface TokenBudget {
  limit: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export const TokenBudgetSchema: z.ZodType<TokenBudget> = z.object({
  limit: z.number(),
  warningThreshold: z.number().default(0.8),
  criticalThreshold: z.number().default(0.95),
});

/**
 * Budget status
 */
export type BudgetStatusLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface BudgetStatus {
  withinBudget: boolean;
  usagePercent: number;
  status: BudgetStatusLevel;
  remainingTokens: number;
  estimatedCompletion: 'likely' | 'uncertain' | 'unlikely';
}

export const BudgetStatusSchema: z.ZodType<BudgetStatus> = z.object({
  withinBudget: z.boolean(),
  usagePercent: z.number(),
  status: z.enum(['ok', 'warning', 'critical', 'exceeded']),
  remainingTokens: z.number(),
  estimatedCompletion: z.enum(['likely', 'uncertain', 'unlikely']),
});

/**
 * Budget allocation for all agents and tasks
 */
export interface BudgetAllocation {
  global: TokenBudget;
  agents: Record<AgentType, TokenBudget>;
  tasks: Record<string, TokenBudget>;
  reserved: ReservedBudget;
}

export interface ReservedBudget {
  system: number;
  compression: number;
  emergency: number;
}

export const BudgetAllocationSchema: z.ZodType<BudgetAllocation> = z.object({
  global: TokenBudgetSchema,
  agents: z.record(AgentTypeSchema, TokenBudgetSchema),
  tasks: z.record(z.string(), TokenBudgetSchema),
  reserved: z.object({
    system: z.number(),
    compression: z.number(),
    emergency: z.number(),
  }),
});

/**
 * Budget configuration for initialization
 */
export interface BudgetConfig {
  globalLimit: number;
  modelContextWindow: number;
  agentWeights: Record<AgentType, number>;
  agentPriorities: Record<AgentType, number>;
}

/**
 * Regulation action types
 */
export type RegulationAction =
  | { type: 'continue' }
  | { type: 'compress'; target: 'working' | 'short'; priority: number }
  | { type: 'summarize'; target: 'messages'; depth: 'light' | 'medium' | 'deep' }
  | { type: 'escalate'; reason: string }
  | { type: 'abort'; reason: string };

/**
 * Token usage record
 */
export interface TokenUsageRecord {
  agentId: string;
  taskId: string;
  usage: TokenUsage;
  timestamp: Date;
}

export const TokenUsageRecordSchema: z.ZodType<TokenUsageRecord> = z.object({
  agentId: z.string(),
  taskId: z.string(),
  usage: TokenUsageSchema,
  timestamp: z.date(),
});

/**
 * Global token usage summary
 */
export interface GlobalTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  byAgent: Record<AgentType, TokenUsage>;
  byTask: Record<string, TokenUsage>;
}

export const GlobalTokenUsageSchema: z.ZodType<GlobalTokenUsage> = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheCreationTokens: z.number(),
  totalCacheReadTokens: z.number(),
  byAgent: z.record(AgentTypeSchema, TokenUsageSchema),
  byTask: z.record(z.string(), TokenUsageSchema),
});
