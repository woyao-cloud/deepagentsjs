/**
 * Core type exports for DeepAgents Code Agent
 */

import type { TokenBudget } from './token.js';

// Re-export types from workflow module
export type {
  PhaseStatus,
  TaskStatus,
  QualityGate,
  Task,
  Phase,
  Rule,
  WorkflowMetadata,
  WorkflowSpec,
  WorkflowProgress,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowValidationWarning,
  PhaseResult,
} from './workflow.js';
export { PhaseStatusSchema, TaskStatusSchema, TaskSchema, PhaseSchema, RuleSchema, WorkflowMetadataSchema, WorkflowSpecSchema } from './workflow.js';

// Re-export types from agent module
export type {
  AgentType,
  AgentConfig,
  AgentState,
  BaseMessage,
  SerializedMessage,
  FileData,
  SerializedFile,
  Todo,
  SerializedTodo,
  SkillMeta,
  AgentInstance,
  RoutingRule,
  AgentRegistry,
} from './agent.js';
export { AgentTypeSchema, AgentConfigSchema, AgentStateSchema, BaseMessageSchema, SerializedMessageSchema, FileDataSchema, SerializedFileSchema, TodoSchema, SerializedTodoSchema, SkillMetaSchema, AgentInstanceSchema, RoutingRuleSchema, AgentRegistrySchema } from './agent.js';

// Re-export types from task module
export type {
  DAGNode,
  DAGEdge,
  DAG,
  ExecutionPlan,
  TaskResult,
  TaskOutput,
  LogEntry,
  Artifact,
  TokenUsage,
  DAGValidationResult,
  ConflictReport,
  ExecutionResult,
  ExecutionReport,
} from './task.js';
export { DAGNodeSchema, DAGEdgeSchema, DAGSchema, TokenUsageSchema } from './task.js';

// Re-export types from memory module
export type {
  WorkingMemory,
  CurrentTask,
  ShortTermMemory,
  CompressedMessage,
  TaskMemory,
  Entity,
  Artifact as MemoryArtifact,
  CompressionStats,
  LongTermMemory,
  SkillEntry,
  AgentNote,
  ProjectKnowledge,
  SuccessPattern,
  MemoryRetrievalOptions,
  MemoryEntry,
  RetrievedContext,
  SessionMatch,
  ContextSnippet,
  ArtifactRef,
} from './memory.js';

// Re-export types from token module
export type {
  TokenBudget,
  BudgetStatus,
  BudgetStatusLevel,
  BudgetAllocation,
  ReservedBudget,
  BudgetConfig,
  RegulationAction,
  TokenUsageRecord,
  GlobalTokenUsage,
} from './token.js';
export { TokenBudgetSchema, BudgetStatusSchema, BudgetAllocationSchema, TokenUsageRecordSchema, GlobalTokenUsageSchema } from './token.js';

// Re-export types from checkpoint module
export type {
  Checkpoint,
  WorkflowCheckpoint,
  AgentCheckpoint,
  MemoryCheckpoint,
  WorkingMemoryCheckpoint,
  CurrentTaskCheckpoint,
  ShortTermMemoryCheckpoint,
  CompressedMessageCheckpoint,
  TaskMemoryCheckpoint,
  SnapshotPaths,
  SessionSnapshot,
  SessionMetadata,
  SessionStatus,
  SessionSummary,
  SessionFilter,
} from './checkpoint.js';
export { CheckpointSchema, WorkflowCheckpointSchema, AgentCheckpointSchema, MemoryCheckpointSchema, SnapshotPathsSchema, SessionSnapshotSchema, SessionMetadataSchema, SessionSummarySchema, SessionFilterSchema } from './checkpoint.js';

// Re-export types from planning module
export type {
  TaskNode,
  TechStackRecommendation,
  TechRecommendation,
  FileStructure,
  FileDirectory,
  FileDefinition,
  APIContract,
  APIParameter,
  Risk,
  Deliverable,
  PlanningDocument,
  ValidationResult,
} from './planning.js';
export { TaskNodeSchema, TechStackRecommendationSchema, FileStructureSchema, APIContractSchema, RiskSchema, DeliverableSchema, PlanningDocumentSchema } from './planning.js';

// Execution context for agent task execution (plan-compatible)
export interface ExecutionContext {
  parentState?: import('./workflow.js').WorkflowSpec;
  taskDescription: string;
  allowedTools: string[];
  budgetLimit: number;
  sandbox: SandboxConfig;
}

// Workflow state for execution context
export interface WorkflowState {
  currentPhase: string;
  completedPhases: string[];
  taskStatus: Record<string, string>;
}

// Sandbox configuration
export interface SandboxConfig {
  enabled: boolean;
  workspaceRoot: string;
}
