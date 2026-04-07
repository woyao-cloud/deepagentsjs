/**
 * Memory-related type definitions
 * @module types/memory
 */

import { z } from 'zod';
import type { BaseMessage, FileData, Todo, SkillMeta } from './agent.js';
import type { SerializedMessage } from './agent.js';

// Re-export FileData, Todo, SkillMeta from agent.ts
export type { FileData, Todo, SkillMeta } from './agent.js';

/**
 * Working memory - current conversation context
 */
export interface WorkingMemory {
  messages: BaseMessage[];
  currentTask: CurrentTask | null;
  files: Record<string, FileData>;
  todos: Todo[];
  skillsMetadata: Record<string, SkillMeta>;
}

export interface CurrentTask {
  id: string;
  description: string;
  progress: number;
}

export const WorkingMemorySchema: z.ZodType<WorkingMemory> = z.object({
  messages: z.array(z.any()),
  currentTask: z.object({
    id: z.string(),
    description: z.string(),
    progress: z.number(),
  }).nullable(),
  files: z.record(z.string(), z.any()),
  todos: z.array(z.any()),
  skillsMetadata: z.record(z.string(), z.any()),
});

/**
 * Short-term memory - session-scoped
 */
export interface ShortTermMemory {
  sessionId: string;
  sessionStart: Date;
  conversationHistory: CompressedMessage[];
  taskMemories: TaskMemory[];
  entityKnowledge: Entity[];
  compression: CompressionStats;
}

export interface CompressedMessage {
  type: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  summary: string;
  tokenCount: number;
}

export interface TaskMemory {
  taskId: string;
  summary: string;
  keyDecisions: string[];
  learnings: string[];
  artifacts: MemoryArtifact[];
  completedAt: Date;
}

export interface Entity {
  name: string;
  type: 'project' | 'module' | 'file' | 'person' | 'concept';
  description: string;
  aliases: string[];
  lastReferencedAt: Date;
}

// Use MemoryArtifact to avoid conflict with task.ts Artifact
export interface MemoryArtifact {
  type: 'file' | 'test' | 'documentation' | 'config';
  name: string;
  path: string;
  content?: string;
}

export interface CompressionStats {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  lastCompressedAt: Date;
}

export const ShortTermMemorySchema: z.ZodType<ShortTermMemory> = z.object({
  sessionId: z.string(),
  sessionStart: z.date(),
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
    artifacts: z.array(z.object({
      type: z.enum(['file', 'test', 'documentation', 'config']),
      name: z.string(),
      path: z.string(),
      content: z.string().optional(),
    })),
    completedAt: z.date(),
  })),
  entityKnowledge: z.array(z.object({
    name: z.string(),
    type: z.enum(['project', 'module', 'file', 'person', 'concept']),
    description: z.string(),
    aliases: z.array(z.string()),
    lastReferencedAt: z.date(),
  })),
  compression: z.object({
    originalTokens: z.number(),
    compressedTokens: z.number(),
    compressionRatio: z.number(),
    lastCompressedAt: z.date(),
  }),
});

/**
 * Long-term memory - persistent knowledge base
 */
export interface LongTermMemory {
  skills: SkillEntry[];
  agentNotes: AgentNote[];
  projectKnowledge: ProjectKnowledge[];
  patterns: SuccessPattern[];
}

export interface SkillEntry {
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  content: string;
  embedding: number[];
  usageCount: number;
  successRate: number;
  lastUsedAt: Date;
  tags: string[];
}

export interface AgentNote {
  noteId: string;
  agentType: string;
  content: string;
  context: { project: string; taskType: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectKnowledge {
  projectId: string;
  projectName: string;
  architecture: string;
  techStack: string[];
  keyFiles: string[];
  lastUpdated: Date;
}

export interface SuccessPattern {
  patternId: string;
  name: string;
  description: string;
  context: string;
  exampleCode: string;
  successMetrics: {
    readability: number;
    maintainability: number;
    performance: number;
  };
  applicableProjects: string[];
}

export const LongTermMemorySchema: z.ZodType<LongTermMemory> = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    name: z.string(),
    description: z.string(),
    sourcePath: z.string(),
    content: z.string(),
    embedding: z.array(z.number()),
    usageCount: z.number(),
    successRate: z.number(),
    lastUsedAt: z.date(),
    tags: z.array(z.string()),
  })),
  agentNotes: z.array(z.object({
    noteId: z.string(),
    agentType: z.string(),
    content: z.string(),
    context: z.object({
      project: z.string(),
      taskType: z.string(),
    }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })),
  projectKnowledge: z.array(z.object({
    projectId: z.string(),
    projectName: z.string(),
    architecture: z.string(),
    techStack: z.array(z.string()),
    keyFiles: z.array(z.string()),
    lastUpdated: z.date(),
  })),
  patterns: z.array(z.object({
    patternId: z.string(),
    name: z.string(),
    description: z.string(),
    context: z.string(),
    exampleCode: z.string(),
    successMetrics: z.object({
      readability: z.number(),
      maintainability: z.number(),
      performance: z.number(),
    }),
    applicableProjects: z.array(z.string()),
  })),
});

/**
 * Memory retrieval interface
 */
export interface MemoryRetrievalOptions {
  memoryType: 'short' | 'long' | 'all';
  limit: number;
  threshold: number;
}

export interface MemoryEntry {
  content: string;
  source: 'working' | 'short' | 'long';
  relevance: number;
  recency: number;
  authority: number;
  finalScore: number;
}

export interface RetrievedContext {
  sessions: SessionMatch[];
  totalTokens: number;
  snippets: ContextSnippet[];
}

export interface SessionMatch {
  sessionId: string;
  projectPath: string;
  relevance: number;
  summary: string;
  keyDecisions: string[];
  artifacts: ArtifactRef[];
}

export interface ContextSnippet {
  sessionId: string;
  content: string;
  source: 'working' | 'short' | 'long';
  relevance: number;
  tokenCount: number;
}

export interface ArtifactRef {
  type: string;
  name: string;
  path: string;
}
