/**
 * Planning-related type definitions
 * @module types/planning
 */

import { z } from 'zod';

/**
 * Task node in planning document
 */
export interface TaskNode {
  id: string;
  name: string;
  description: string;
  children: TaskNode[];
  estimatedTokens: number;
  dependencies: string[];
}

export const TaskNodeSchema: z.ZodType<TaskNode> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  children: z.lazy(() => z.array(TaskNodeSchema)),
  estimatedTokens: z.number(),
  dependencies: z.array(z.string()),
});

/**
 * Tech stack recommendation
 */
export interface TechStackRecommendation {
  recommendations: TechRecommendation[];
  overall: {
    backend: string;
    frontend: string;
    database: string;
    testing: string;
  };
}

export interface TechRecommendation {
  category: string;
  technology: string;
  reason: string;
  alternatives: string[];
}

export const TechStackRecommendationSchema: z.ZodType<TechStackRecommendation> = z.object({
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
});

/**
 * File structure definition
 */
export interface FileStructure {
  directories: FileDirectory[];
  files: FileDefinition[];
}

export interface FileDirectory {
  path: string;
  description: string;
}

export interface FileDefinition {
  path: string;
  description: string;
  language?: string;
}

export const FileStructureSchema: z.ZodType<FileStructure> = z.object({
  directories: z.array(z.object({
    path: z.string(),
    description: z.string(),
  })),
  files: z.array(z.object({
    path: z.string(),
    description: z.string(),
    language: z.string().optional(),
  })),
});

/**
 * API contract definition
 */
export interface APIContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request: {
    headers?: Record<string, string>;
    body?: unknown;
    query?: APIParameter[];
    params?: APIParameter[];
  };
  response: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  };
}

export interface APIParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export const APIContractSchema: z.ZodType<APIContract> = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  request: z.object({
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
    query: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string().optional(),
    })).optional(),
    params: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string().optional(),
    })).optional(),
  }),
  response: z.object({
    status: z.number(),
    body: z.unknown(),
    headers: z.record(z.string()).optional(),
  }),
});

/**
 * Risk definition
 */
export interface Risk {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  likelihood: 'low' | 'medium' | 'high';
  impact?: string;
  mitigation?: string;
}

export const RiskSchema: z.ZodType<Risk> = z.object({
  id: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  likelihood: z.enum(['low', 'medium', 'high']),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});

/**
 * Deliverable definition
 */
export interface Deliverable {
  id: string;
  name: string;
  description: string;
  owner: string;
  acceptanceCriteria: string[];
  dueDate?: Date;
}

export const DeliverableSchema: z.ZodType<Deliverable> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dueDate: z.date().optional(),
});

/**
 * Planning document
 */
export interface PlanningDocument {
  id: string;
  version: number;
  phase: string;
  taskTree: TaskNode[];
  techStack: TechStackRecommendation;
  fileStructure: FileStructure;
  apiContracts: APIContract[];
  risks: Risk[];
  deliverables: Deliverable[];
  confirmedAt?: Date;
  confirmedBy?: string;
}

export const PlanningDocumentSchema: z.ZodType<PlanningDocument> = z.object({
  id: z.string(),
  version: z.number(),
  phase: z.string(),
  taskTree: z.array(TaskNodeSchema),
  techStack: TechStackRecommendationSchema,
  fileStructure: FileStructureSchema,
  apiContracts: z.array(APIContractSchema),
  risks: z.array(RiskSchema),
  deliverables: z.array(DeliverableSchema),
  confirmedAt: z.date().optional(),
  confirmedBy: z.string().optional(),
});

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
