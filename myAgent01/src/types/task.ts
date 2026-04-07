/**
 * Task and DAG-related type definitions
 * @module types/task
 */

import { z } from 'zod';
import { TaskStatusSchema, type TaskStatus } from './workflow.js';

/**
 * DAG node representation
 */
export interface DAGNode {
  id: string;
  taskId: string;
  dependencies: string[];
  parallelGroup: number;
}

export const DAGNodeSchema: z.ZodType<DAGNode> = z.object({
  id: z.string(),
  taskId: z.string(),
  dependencies: z.array(z.string()),
  parallelGroup: z.number(),
});

/**
 * DAG edge representation
 */
export interface DAGEdge {
  from: string;
  to: string;
}

export const DAGEdgeSchema: z.ZodType<DAGEdge> = z.object({
  from: z.string(),
  to: z.string(),
});

/**
 * Directed Acyclic Graph for task execution
 */
export interface DAG {
  nodes: DAGNode[];
  edges: DAGEdge[];
  executionOrder: string[][]; // Groups of task IDs that can run in parallel
  getNode(id: string): DAGNode | undefined;
  getTasks(): Map<string, Task>;
}

export const DAGSchema: z.ZodType<DAG> = z.object({
  nodes: z.array(DAGNodeSchema),
  edges: z.array(DAGEdgeSchema),
  executionOrder: z.array(z.array(z.string())),
});

/**
 * Execution plan for a phase
 */
export interface ExecutionPlan {
  dag: DAG;
  startTaskId: string;
  endTaskId: string;
  estimatedDuration: number;
  estimatedTokens: number;
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  status: 'success' | 'failed' | 'skipped';
  output: TaskOutput;
  tokenUsage: TokenUsage;
  duration: number;
  logs: LogEntry[];
  error?: string;
}

export interface TaskOutput {
  files: Record<string, string>;
  messages: string[];
  artifacts?: Artifact[];
}

/**
 * Log entry for task execution
 */
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Artifact produced by task execution
 */
export interface Artifact {
  type: 'file' | 'test' | 'documentation' | 'config';
  name: string;
  path: string;
  content?: string;
}

/**
 * Token usage for a task
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export const TokenUsageSchema: z.ZodType<TokenUsage> = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
});

/**
 * DAG validation result
 */
export interface DAGValidationResult {
  valid: boolean;
  hasCycles: boolean;
  orphanNodes: string[];
  errors: string[];
}

/**
 * Conflict report for concurrent tasks
 */
export interface ConflictReport {
  type: 'file' | 'resource' | 'dependency';
  resource: string;
  tasks: string[];
  severity: 'high' | 'medium' | 'low';
  description: string;
  resolution?: string;
}

/**
 * Execution result from agent task execution
 */
export interface ExecutionResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'failed' | 'skipped';
  output: TaskOutput;
  tokenUsage: TokenUsage;
  duration: number;
  logs: LogEntry[];
}

/**
 * Execution report for a complete plan
 */
export interface ExecutionReport {
  planId: string;
  phase: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  taskResults: ExecutionResult[];
  totalTokens: TokenUsage;
  success: boolean;
  summary: string;
}

export { TaskStatus };
