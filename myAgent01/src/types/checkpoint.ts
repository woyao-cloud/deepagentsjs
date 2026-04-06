/**
 * Checkpoint-related type definitions
 * @module types/checkpoint
 */

import { z } from 'zod';
import { SerializedMessageSchema, type SerializedMessage } from './agent.js';
import { SerializedFileSchema, type SerializedFile } from './agent.js';
import { SerializedTodoSchema, type SerializedTodo } from './agent.js';
import { TaskStatusSchema, type TaskStatus } from './workflow.js';
import { TokenUsageSchema, type TokenUsage } from './task.js';

/**
 * Checkpoint for workflow state persistence
 */
export interface Checkpoint {
  id: string;
  timestamp: Date;
  workflow: WorkflowCheckpoint;
  agent: AgentCheckpoint;
  memory: MemoryCheckpoint;
  tokenUsage: TokenUsage;
  snapshots: SnapshotPaths;
}

export const CheckpointSchema: z.ZodType<Checkpoint> = z.object({
  id: z.string(),
  timestamp: z.date(),
  workflow: WorkflowCheckpointSchema,
  agent: AgentCheckpointSchema,
  memory: MemoryCheckpointSchema,
  tokenUsage: TokenUsageSchema,
  snapshots: SnapshotPathsSchema,
});

/**
 * Workflow state in checkpoint
 */
export interface WorkflowCheckpoint {
  currentPhase: string;
  completedPhases: string[];
  taskStatus: Record<string, TaskStatus>;
  blockedTasks: string[];
}

export const WorkflowCheckpointSchema: z.ZodType<WorkflowCheckpoint> = z.object({
  currentPhase: z.string(),
  completedPhases: z.array(z.string()),
  taskStatus: z.record(z.string(), TaskStatusSchema),
  blockedTasks: z.array(z.string()),
});

/**
 * Agent state in checkpoint
 */
export interface AgentCheckpoint {
  messages: SerializedMessage[];
  files: Record<string, SerializedFile>;
  todos: SerializedTodo[];
}

export const AgentCheckpointSchema: z.ZodType<AgentCheckpoint> = z.object({
  messages: z.array(SerializedMessageSchema),
  files: z.record(z.string(), SerializedFileSchema),
  todos: z.array(SerializedTodoSchema),
});

/**
 * Memory state in checkpoint
 */
export interface MemoryCheckpoint {
  working: WorkingMemoryCheckpoint | null;
  shortTerm: ShortTermMemoryCheckpoint | null;
}

export interface WorkingMemoryCheckpoint {
  messages: SerializedMessage[];
  currentTask: CurrentTaskCheckpoint | null;
  files: Record<string, SerializedFile>;
  todos: SerializedTodo[];
}

export interface CurrentTaskCheckpoint {
  id: string;
  description: string;
  progress: number;
}

export interface ShortTermMemoryCheckpoint {
  sessionId: string;
  sessionStart: string;
  conversationHistory: CompressedMessageCheckpoint[];
  taskMemories: TaskMemoryCheckpoint[];
}

export interface CompressedMessageCheckpoint {
  type: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  summary: string;
  tokenCount: number;
}

export interface TaskMemoryCheckpoint {
  taskId: string;
  summary: string;
  keyDecisions: string[];
  learnings: string[];
}

export const MemoryCheckpointSchema: z.ZodType<MemoryCheckpoint> = z.object({
  working: z.object({
    messages: z.array(SerializedMessageSchema),
    currentTask: z.object({
      id: z.string(),
      description: z.string(),
      progress: z.number(),
    }).nullable(),
    files: z.record(z.string(), SerializedFileSchema),
    todos: z.array(SerializedTodoSchema),
  }).nullable(),
  shortTerm: z.object({
    sessionId: z.string(),
    sessionStart: z.string(),
    conversationHistory: z.array(z.object({
      type: z.enum(['human', 'ai', 'system', 'tool']),
      content: z.string(),
      summary: z.string(),
      tokenCount: z.number(),
    })),
    taskMemories: z.array(z.object({
      taskId: z.string(),
      summary: z.string(),
      keyDecisions: z.array(z.string()),
      learnings: z.array(z.string()),
    })),
  }).nullable(),
});

/**
 * Snapshot paths for file state
 */
export interface SnapshotPaths {
  srcDir: string;
  logsDir: string;
  checkpointDir: string;
}

export const SnapshotPathsSchema: z.ZodType<SnapshotPaths> = z.object({
  srcDir: z.string(),
  logsDir: z.string(),
  checkpointDir: z.string(),
});

/**
 * Session snapshot for persistence
 */
export interface SessionSnapshot {
  id: string;
  sessionId: string;
  timestamp: Date;
  workflow: WorkflowCheckpoint;
  agent: AgentCheckpoint;
  memory: MemoryCheckpoint;
  tokenUsage: TokenUsage;
  fileSnapshotPath: string;
}

export const SessionSnapshotSchema: z.ZodType<SessionSnapshot> = z.object({
  id: z.string(),
  sessionId: z.string(),
  timestamp: z.date(),
  workflow: WorkflowCheckpointSchema,
  agent: AgentCheckpointSchema,
  memory: MemoryCheckpointSchema,
  tokenUsage: TokenUsageSchema,
  fileSnapshotPath: z.string(),
});

/**
 * Session metadata
 */
export interface SessionMetadata {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: Date;
  lastAccessedAt: Date;
  status: SessionStatus;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed';

export const SessionMetadataSchema: z.ZodType<SessionMetadata> = z.object({
  id: z.string(),
  projectPath: z.string(),
  projectName: z.string(),
  createdAt: z.date(),
  lastAccessedAt: z.date(),
  status: z.enum(['active', 'paused', 'completed', 'failed']),
});

/**
 * Session summary for listing
 */
export interface SessionSummary {
  id: string;
  projectName: string;
  status: SessionStatus;
  createdAt: Date;
  lastAccessedAt: Date;
  currentPhase: string;
  progress: number;
}

export const SessionSummarySchema: z.ZodType<SessionSummary> = z.object({
  id: z.string(),
  projectName: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'failed']),
  createdAt: z.date(),
  lastAccessedAt: z.date(),
  currentPhase: z.string(),
  progress: z.number(),
});

/**
 * Session filter for listing
 */
export interface SessionFilter {
  status?: SessionStatus;
  projectPath?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export const SessionFilterSchema: z.ZodType<SessionFilter> = z.object({
  status: z.enum(['active', 'paused', 'completed', 'failed']).optional(),
  projectPath: z.string().optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
});
