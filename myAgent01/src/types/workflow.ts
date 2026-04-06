/**
 * Workflow-related type definitions
 * @module types/workflow
 */

import { z } from 'zod';

/**
 * Phase status enum
 */
export const PhaseStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked']);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * Task status enum
 */
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Quality gate configuration
 */
export interface QualityGate {
  lint: boolean;
  test: boolean;
  schemaCheck: boolean;
  securityScan: boolean;
}

/**
 * Task definition within a phase
 */
export interface Task {
  id: string;
  name: string;
  description?: string;
  parallel: boolean;
  owners: AgentType[];
  depends?: string[];
  status: TaskStatus;
  qualityGate?: QualityGate;
  estimatedTokens?: number;
}

export const TaskSchema: z.ZodType<Task> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  parallel: z.boolean(),
  owners: z.array(AgentTypeSchema),
  depends: z.array(z.string()).optional(),
  status: TaskStatusSchema,
  qualityGate: z.object({
    lint: z.boolean(),
    test: z.boolean(),
    schemaCheck: z.boolean(),
    securityScan: z.boolean(),
  }).optional(),
  estimatedTokens: z.number().optional(),
});

/**
 * Phase within the workflow
 */
export interface Phase {
  id: string;
  name: string;
  depends: string[];
  tasks: Task[];
  status: PhaseStatus;
}

export const PhaseSchema: z.ZodType<Phase> = z.object({
  id: z.string(),
  name: z.string(),
  depends: z.array(z.string()),
  tasks: z.array(TaskSchema),
  status: PhaseStatusSchema,
});

/**
 * Rule definition for workflow
 */
export interface Rule {
  id: string;
  description: string;
  condition?: string;
  action?: string;
}

export const RuleSchema: z.ZodType<Rule> = z.object({
  id: z.string(),
  description: z.string(),
  condition: z.string().optional(),
  action: z.string().optional(),
});

/**
 * Workflow metadata
 */
export interface WorkflowMetadata {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  author?: string;
}

export const WorkflowMetadataSchema: z.ZodType<WorkflowMetadata> = z.object({
  version: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: z.string().optional(),
});

/**
 * Complete workflow specification
 */
export interface WorkflowSpec {
  phases: Phase[];
  rules: Rule[];
  metadata: WorkflowMetadata;
}

export const WorkflowSpecSchema: z.ZodType<WorkflowSpec> = z.object({
  phases: z.array(PhaseSchema),
  rules: z.array(RuleSchema),
  metadata: WorkflowMetadataSchema,
});

/**
 * Workflow progress tracking
 */
export interface WorkflowProgress {
  totalPhases: number;
  completedPhases: number;
  currentPhase: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  overallPercent: number;
}

/**
 * Validation result for workflow parsing
 */
export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  warnings: WorkflowValidationWarning[];
}

export interface WorkflowValidationError {
  path: string;
  message: string;
}

export interface WorkflowValidationWarning {
  path: string;
  message: string;
}

// Re-export AgentType for use in Task.owners
import { AgentType, AgentTypeSchema } from './agent.js';

export { PhaseStatus, TaskStatus, QualityGate, Task, Phase, Rule, WorkflowMetadata, WorkflowSpec, WorkflowProgress, WorkflowValidationResult, WorkflowValidationError, WorkflowValidationWarning };
