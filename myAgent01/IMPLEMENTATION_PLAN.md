# DeepAgents Code Agent - myAgent01 Implementation Plan

**Project:** myAgent01  
**Location:** `D:\claude-code-project\langchain\deepagentsjs\myAgent01\src`  
**Version:** 1.0.0  
**Created:** 2026-04-06  
**Complexity:** **Complex** (Estimated: 6-8 weeks)

---

## 1. Overview

### 1.1 Objective

Implement a complete TypeScript-based multi-agent code generation system (myAgent01) based on the DeepAgents architecture. The system parses workflow.md and agent.md configuration files, generates PLANNING.md via a Main Agent, and executes code generation tasks through specialized Sub-Agents (architect, backend-dev, frontend-dev, qa-engineer).

### 1.2 Scope

**In Scope:**
- Complete TypeScript project structure with LangChain/LangGraph integration
- Workflow Manager for parsing workflow.md and building DAGs
- Planning Generator for PLANNING.md creation
- Agent Scheduler for multi-agent orchestration
- Sub-Agent implementations with sandbox isolation
- Memory management (Working, Short-term, Long-term)
- Token budget management
- CLI commands (init, run, confirm, status, logs, skip, rollback)
- Human-in-the-loop checkpoints
- Quality gates (Lint, Test)
- Version control integration (branch, commit, PR)

**Out of Scope:**
- Actual LLM API integration (stubbed for implementation)
- Sandbox implementation (interface only)
- Persistent storage backend (interface only)
- E2E test automation framework

### 1.3 Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.x |
| Agent Framework | LangChain + LangGraph |
| CLI | Commander.js + Inquirer.js |
| Workflow Parsing | yaml + markdown-it |
| Testing | Vitest |
| Logging | pino |
| Validation | zod |

---

## 2. Project Structure

```
myAgent01/
├── src/
│   ├── index.ts                    # Package entry point
│   ├── types/                      # Core type definitions
│   │   ├── index.ts                # Type exports
│   │   ├── workflow.ts             # Workflow-related types
│   │   ├── agent.ts                # Agent-related types
│   │   ├── task.ts                 # Task and DAG types
│   │   ├── memory.ts               # Memory types
│   │   ├── token.ts                # Token budget types
│   │   └── checkpoint.ts           # Checkpoint types
│   │
│   ├── cli/                        # CLI layer
│   │   ├── index.ts                # CLI entry point
│   │   ├── commands/
│   │   │   ├── init.ts             # deepagents init
│   │   │   ├── run.ts              # deepagents run
│   │   │   ├── confirm.ts          # deepagents confirm
│   │   │   ├── status.ts           # deepagents status
│   │   │   ├── logs.ts             # deepagents logs
│   │   │   ├── skip.ts             # deepagents skip
│   │   │   └── rollback.ts         # deepagents rollback
│   │   └── presenter/
│   │       ├── progress.ts         # Real-time progress display
│   │       └── status-view.ts      # Status report renderer
│   │
│   ├── config/                      # Configuration management
│   │   ├── index.ts
│   │   ├── parser.ts               # Config file parsers
│   │   ├── workflow-parser.ts      # workflow.md parser
│   │   └── agent-parser.ts         # agent.md parser
│   │
│   ├── core/                       # Core orchestration
│   │   ├── index.ts
│   │   ├── workflow-manager.ts     # Workflow Manager (FR-WF-001)
│   │   ├── dag.ts                  # DAG implementation
│   │   ├── planning-generator.ts   # Planning Generator (FR-PLAN-001)
│   │   ├── agent-scheduler.ts      # Agent Scheduler (FR-AGENT-001)
│   │   └── execution-engine.ts     # Task execution engine (FR-EXEC-001)
│   │
│   ├── agents/                     # Agent implementations
│   │   ├── index.ts
│   │   ├── base-agent.ts           # Base Sub-Agent class
│   │   ├── architect-agent.ts      # Architect Agent
│   │   ├── backend-dev-agent.ts    # Backend Developer Agent
│   │   ├── frontend-dev-agent.ts   # Frontend Developer Agent
│   │   ├── qa-engineer-agent.ts    # QA Engineer Agent
│   │   ├── main-agent.ts           # Main Agent (Supervisor)
│   │   └── agent-factory.ts        # Agent instantiation factory
│   │
│   ├── memory/                     # Memory management
│   │   ├── index.ts
│   │   ├── working-memory.ts       # Working Memory
│   │   ├── short-term-memory.ts    # Short-term Memory
│   │   ├── long-term-memory.ts     # Long-term Memory
│   │   ├── memory-retrieval.ts     # Memory retrieval interface
│   │   └── memory-merger.ts        # Context merging utilities
│   │
│   ├── storage/                    # State persistence
│   │   ├── index.ts
│   │   ├── session-store.ts        # Session persistence
│   │   ├── checkpoint-manager.ts   # Checkpoint management
│   │   └── snapshot-store.ts       # Snapshot storage
│   │
│   ├── tools/                      # Tool layer
│   │   ├── index.ts
│   │   ├── base-tool.ts            # Base tool interface
│   │   ├── file-tools.ts           # File operations (read/write/edit)
│   │   ├── command-tools.ts        # Command execution
│   │   ├── git-tools.ts            # Git operations
│   │   ├── search-tools.ts         # Search tools (glob, grep)
│   │   └── tool-registry.ts        # Tool registration
│   │
│   ├── quality/                    # Quality gates
│   │   ├── index.ts
│   │   ├── lint-checker.ts         # Lint execution (FR-QA-001.1)
│   │   ├── test-runner.ts          # Test execution (FR-QA-001.2)
│   │   ├── schema-validator.ts     # Schema validation (FR-QA-001.3)
│   │   └── quality-gate.ts         # Quality gate orchestrator
│   │
│   ├── vcs/                        # Version control
│   │   ├── index.ts
│   │   ├── branch-manager.ts       # Branch operations (FR-VCS-001.1)
│   │   ├── commit-manager.ts       # Commit operations (FR-VCS-001.2)
│   │   └── pr-manager.ts           # PR operations (FR-VCS-001.3)
│   │
│   ├── token/                      # Token budget management
│   │   ├── index.ts
│   │   ├── token-tracker.ts        # Token tracking
│   │   ├── budget-allocator.ts     # Budget allocation
│   │   └── regulation-engine.ts     # Auto-regulation
│   │
│   └── utils/                      # Utilities
│       ├── index.ts
│       ├── logger.ts               # Logging setup (pino)
│       ├── file-utils.ts           # File utilities
│       ├── id-generator.ts         # ID generation
│       └── validation.ts            # Validation helpers
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 3. Core Type Definitions

### 3.1 Type Hierarchy

```
types/index.ts
├── Workflow types (workflow.ts)
├── Agent types (agent.ts)
├── Task types (task.ts)
├── Memory types (memory.ts)
├── Token types (token.ts)
└── Checkpoint types (checkpoint.ts)
```

### 3.2 Key Interfaces

```typescript
// src/types/workflow.ts
export interface WorkflowSpec {
  phases: Phase[];
  rules: Rule[];
  metadata: WorkflowMetadata;
}

export interface Phase {
  id: string;
  name: string;
  depends: string[];
  tasks: Task[];
  status: PhaseStatus;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  parallel: boolean;
  owners: AgentType[];
  depends?: string[];
  status: TaskStatus;
  qualityGate?: QualityGate;
}

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

// src/types/agent.ts
export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  tools: string[];
  model?: string;
  middleware?: string[];
  tokenBudget: number;
}

export type AgentType = 'main' | 'architect' | 'backend-dev' | 'frontend-dev' | 'qa-engineer';

export interface AgentInstance {
  id: string;
  type: AgentType;
  config: AgentConfig;
  state: AgentState;
  tools: BaseTool[];
}

export interface AgentState {
  messages: BaseMessage[];
  files: Record<string, FileData>;
  todos: Todo[];
  skillsMetadata: Record<string, SkillMeta>;
}

// src/types/task.ts
export interface DAG {
  nodes: DAGNode[];
  edges: DAGEdge[];
  executionOrder: string[][]; // Groups of parallelizable task IDs
}

export interface DAGNode {
  id: string;
  taskId: string;
  dependencies: string[];
  parallelGroup: number;
}

export interface DAGEdge {
  from: string;
  to: string;
}

// src/types/memory.ts
export interface WorkingMemory {
  messages: BaseMessage[];
  currentTask: { id: string; description: string; progress: number };
  files: Record<string, FileData>;
  todos: Todo[];
  skillsMetadata: Record<string, SkillMeta>;
}

export interface ShortTermMemory {
  sessionId: string;
  sessionStart: Date;
  conversationHistory: CompressedMessage[];
  taskMemories: TaskMemory[];
  entityKnowledge: Entity[];
  compression: CompressionStats;
}

export interface LongTermMemory {
  skills: SkillEntry[];
  agentNotes: AgentNote[];
  projectKnowledge: ProjectKnowledge[];
  patterns: SuccessPattern[];
}

// src/types/token.ts
export interface TokenBudget {
  limit: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface BudgetAllocation {
  global: TokenBudget;
  agents: Record<AgentType, TokenBudget>;
  tasks: Record<string, TokenBudget>;
  reserved: { system: number; compression: number; emergency: number };
}

// src/types/checkpoint.ts
export interface Checkpoint {
  id: string;
  timestamp: Date;
  workflow: {
    currentPhase: string;
    completedPhases: string[];
    taskStatus: Record<string, TaskStatus>;
  };
  agent: {
    messages: SerializedMessage[];
    files: Record<string, SerializedFile>;
    todos: SerializedTodo[];
  };
  memory: {
    working: WorkingMemory;
    shortTerm: ShortTermMemory;
  };
  tokenUsage: TokenUsage;
  snapshots: {
    srcDir: string;
    logsDir: string;
  };
}
```

---

## 4. Implementation Phases

### Phase 1: Foundation (Days 1-2)

**Objective:** Set up project infrastructure, core types, and configuration parsing.

#### 1.1 Project Setup

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: langchain, langgraph, commander, inquirer, yaml, markdown-it, zod, pino, vitest |
| `tsconfig.json` | Strict TypeScript config |
| `vitest.config.ts` | Test configuration |
| `src/index.ts` | Package entry point |

#### 1.2 Core Types Implementation

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | Re-exports all types |
| `src/types/workflow.ts` | WorkflowSpec, Phase, Task, PhaseStatus, TaskStatus |
| `src/types/agent.ts` | AgentConfig, AgentType, AgentInstance, AgentState |
| `src/types/task.ts` | DAG, DAGNode, DAGEdge, ExecutionPlan |
| `src/types/memory.ts` | WorkingMemory, ShortTermMemory, LongTermMemory |
| `src/types/token.ts` | TokenBudget, TokenUsage, BudgetAllocation, BudgetStatus |
| `src/types/checkpoint.ts` | Checkpoint, SessionSnapshot, SerializedMessage |

**Deliverables:**
- All type files with complete interfaces
- Zod schemas for validation
- Type guard functions

#### 1.3 Utilities

| File | Functions |
|------|-----------|
| `src/utils/logger.ts` | createLogger(), withContext() |
| `src/utils/id-generator.ts` | generateId(), generateSessionId() |
| `src/utils/file-utils.ts` | readFileSafe(), writeFileAtomic(), ensureDir() |
| `src/utils/validation.ts` | validateSchema(), validateWorkflow(), validateAgentConfig() |

**Deliverables:**
- Logger setup with pino (structured JSON logging)
- UUID-based ID generation
- Atomic file operations
- Zod-based validation utilities

---

### Phase 2: Configuration Parsing (Days 3-4)

**Objective:** Implement workflow.md and agent.md parsing into typed structures.

#### 2.1 Config Parsers

| File | Responsibility |
|------|----------------|
| `src/config/workflow-parser.ts` | Parse workflow.md → WorkflowSpec |
| `src/config/agent-parser.ts` | Parse agent.md → AgentConfig[] |
| `src/config/parser.ts` | Unified parser interface |

**Key Functions:**

```typescript
// src/config/workflow-parser.ts
export function parseWorkflow(content: string): WorkflowSpec;
export function validateWorkflow(spec: WorkflowSpec): ValidationResult;

// src/config/agent-parser.ts
export function parseAgentConfig(content: string): AgentConfig[];
export function parseRoutingRules(content: string): RoutingRule[];
```

#### 2.2 Config Templates

| File | Purpose |
|------|---------|
| `templates/workflow.md` | Default workflow template |
| `templates/agent.md` | Default agent definitions |

**Default Agent Definitions:**
```markdown
## Roles

- architect: 负责架构设计、技术选型、PLANNING.md 生成与接口契约定义
- backend-dev: 精通 TypeScript/Node.js，负责业务逻辑、API 与数据库设计
- frontend-dev: 精通 React/Vue，负责 UI 组件、状态管理与路由
- qa-engineer: 负责单元测试、集成测试用例生成与覆盖率校验

## Routing Rules

- 架构设计 → architect (串行)
- 核心模块开发 → backend-dev + frontend-dev (并发)
- 测试开发 → qa-engineer (串行)
- 联调与测试 → architect (串行主导)
```

**Deliverables:**
- Complete workflow.md parser with DAG support
- Complete agent.md parser with routing rules
- Validation of all parsed content
- Default template files

---

### Phase 3: DAG and Workflow Manager (Days 5-6)

**Objective:** Implement DAG construction and workflow phase navigation.

#### 3.1 DAG Implementation

| File | Responsibility |
|------|----------------|
| `src/core/dag.ts` | DAG builder, topological sort, parallelization |

**Key Functions:**

```typescript
// src/core/dag.ts
export class DAGBuilder {
  addNode(id: string, dependencies: string[]): DAGBuilder;
  addEdge(from: string, to: string): DAGBuilder;
  build(): DAG;
  getExecutionOrder(): string[][]; // Returns groups of parallel tasks
  validate(): DAGValidationResult;
}

export function detectParallelTasks(tasks: Task[]): string[][];
export function topologicalSort(nodes: DAGNode[]): string[];
export function validateNoCycles(nodes: DAGNode[], edges: DAGEdge[]): boolean;
```

#### 3.2 Workflow Manager

| File | Responsibility |
|------|----------------|
| `src/core/workflow-manager.ts` | Workflow state machine, phase navigation |

**Key Interface:**

```typescript
// src/core/workflow-manager.ts
export class WorkflowManager {
  constructor(workflowSpec: WorkflowSpec);
  
  // State queries
  getCurrentPhase(): Phase | null;
  getNextPhase(): Phase | null;
  getExecutableTasks(): Task[];
  canExecute(phaseId: string): boolean;
  getProgress(): WorkflowProgress;
  
  // State transitions
  startPhase(phaseId: string): void;
  completeTask(taskId: string): void;
  failTask(taskId: string, error: Error): void;
  skipTask(taskId: string): void;
  rollbackTask(taskId: string): void;
  
  // Persistence
  saveCheckpoint(): Checkpoint;
  restoreCheckpoint(checkpoint: Checkpoint): void;
}
```

**Deliverables:**
- DAG builder with cycle detection
- Topological sort for execution order
- Parallel task grouping (tasks with no interdependencies)
- WorkflowManager with state machine
- Checkpoint save/restore functionality

---

### Phase 4: Agent Infrastructure (Days 7-9)

**Objective:** Implement base agent classes and agent factory.

#### 4.1 Base Agent Architecture

| File | Responsibility |
|------|----------------|
| `src/agents/base-agent.ts` | Base class with LangGraph integration |
| `src/agents/agent-factory.ts` | Dynamic agent instantiation |

**Base Agent Interface:**

```typescript
// src/agents/base-agent.ts
export abstract class BaseAgent {
  readonly id: string;
  readonly type: AgentType;
  protected config: AgentConfig;
  protected state: AgentState;
  protected tools: BaseTool[];
  
  abstract initialize(): Promise<void>;
  abstract executeTask(task: Task, context: ExecutionContext): Promise<TaskResult>;
  abstract getState(): AgentState;
  
  protected addMessage(message: BaseMessage): void;
  protected updateFile(path: string, content: string): void;
  protected updateTodo(todo: Todo): void;
  protected checkBudget(): BudgetStatus;
}

export interface ExecutionContext {
  workingMemory: WorkingMemory;
  shortTermMemory: ShortTermMemory;
  checkpoint: Checkpoint;
  budget: BudgetAllocation;
}
```

#### 4.2 Agent Factory

```typescript
// src/agents/agent-factory.ts
export class AgentFactory {
  private toolRegistry: ToolRegistry;
  private memoryRetriever: MemoryRetrieval;
  
  createAgent(type: AgentType, config: AgentConfig): BaseAgent;
  createMainAgent(): MainAgent;
  createSubAgent(type: AgentType): BaseAgent;
}
```

#### 4.3 Sub-Agent Implementations

| File | Agent Type |
|------|------------|
| `src/agents/architect-agent.ts` | Architect Agent |
| `src/agents/backend-dev-agent.ts` | Backend Developer Agent |
| `src/agents/frontend-dev-agent.ts` | Frontend Developer Agent |
| `src/agents/qa-engineer-agent.ts` | QA Engineer Agent |

**Each Sub-Agent implements:**
- Specialized tool set
- Domain-specific instructions
- Task execution logic
- Result formatting

**Deliverables:**
- BaseAgent abstract class with LangGraph hooks
- AgentFactory for dynamic instantiation
- All four Sub-Agent implementations
- Tool binding per agent type

---

### Phase 5: Memory Management (Days 10-12)

**Objective:** Implement three-tier memory system.

#### 5.1 Memory Interfaces

| File | Responsibility |
|------|----------------|
| `src/memory/working-memory.ts` | Working memory operations |
| `src/memory/short-term-memory.ts` | Session-scoped memory |
| `src/memory/long-term-memory.ts` | Persistent knowledge base |
| `src/memory/memory-retrieval.ts` | Semantic and exact retrieval |
| `src/memory/memory-merger.ts` | Context merging utilities |

#### 5.2 Memory Operations

```typescript
// src/memory/working-memory.ts
export class WorkingMemory {
  private messages: BaseMessage[];
  private files: Map<string, FileData>;
  private todos: Todo[];
  
  addMessage(msg: BaseMessage): void;
  updateFile(path: string, content: string): void;
  addTodo(todo: Todo): void;
  updateProgress(taskId: string, progress: number): void;
  compress(targetTokens: number): CompressedMessage[];
  toCheckpoint(): SerializedWorkingMemory;
}

// src/memory/short-term-memory.ts
export class ShortTermMemory {
  private sessionId: string;
  private taskMemories: TaskMemory[];
  private entityKnowledge: Entity[];
  
  createTaskMemory(task: Task, result: TaskResult): void;
  addEntity(entity: Entity): void;
  compress(): CompressedSession;
  archive(): LongTermMemoryEntry;
}

// src/memory/long-term-memory.ts
export class LongTermMemory {
  private skills: SkillIndex;
  private agentNotes: AgentNote[];
  private patterns: SuccessPattern[];
  
  addSkill(skill: SkillEntry): void;
  addAgentNote(note: AgentNote): void;
  search(query: string, options: SearchOptions): MemoryEntry[];
  retrieveRelevant(context: RetrievalContext): Promise<RetrievedContext>;
}
```

#### 5.3 Memory Merger

```typescript
// src/memory/memory-merger.ts
export class MemoryMerger {
  merge(
    current: WorkingMemory,
    retrieved: RetrievedContext,
    maxTokens: number
  ): Promise<WorkingMemory>;
  
  prioritizeByRelevance(entries: MemoryEntry[]): MemoryEntry[];
  injectSnippet(memory: WorkingMemory, snippet: ContextSnippet): WorkingMemory;
}
```

**Deliverables:**
- WorkingMemory with message/file/todo management
- ShortTermMemory with session tracking
- LongTermMemory with semantic search capability
- Memory merger for context reconstruction

---

### Phase 6: Token Budget Management (Days 13-14)

**Objective:** Implement hierarchical token budget system.

#### 6.1 Token Tracking

| File | Responsibility |
|------|----------------|
| `src/token/token-tracker.ts` | Usage tracking per agent/task |
| `src/token/budget-allocator.ts` | Initial and dynamic allocation |
| `src/token/regulation-engine.ts` | Auto-regulation decisions |

#### 6.2 Token Interfaces

```typescript
// src/token/token-tracker.ts
export class TokenTracker {
  recordUsage(agentId: string, taskId: string, usage: TokenUsage): void;
  getGlobalUsage(): TokenUsage;
  getAgentUsage(agentId: string): TokenUsage;
  getTaskUsage(taskId: string): TokenUsage;
  getBudgetStatus(agentId: string, taskId?: string): BudgetStatus;
}

// src/token/budget-allocator.ts
export class BudgetAllocator {
  allocateInitial(config: BudgetConfig): BudgetAllocation;
  reallocate(allocation: BudgetAllocation, agentId: string, priority: number): BudgetAllocation;
  reserveEmergency(allocation: BudgetAllocation, tokens: number): BudgetAllocation;
}

// src/token/regulation-engine.ts
export class RegulationEngine {
  decide(agentId: string, usage: TokenUsage, budget: TokenBudget): RegulationAction;
  shouldCompress(agentId: string): boolean;
  shouldAbort(agentId: string): boolean;
}

export type RegulationAction =
  | { type: 'continue' }
  | { type: 'compress'; target: 'working' | 'short'; priority: number }
  | { type: 'summarize'; target: 'messages'; depth: 'light' | 'medium' | 'deep' }
  | { type: 'escalate'; reason: string }
  | { type: 'abort'; reason: string };
```

**Deliverables:**
- TokenTracker with per-agent/per-task tracking
- BudgetAllocator with weight-based distribution
- RegulationEngine with configurable thresholds
- Warning/critical/exceeded status handling

---

### Phase 7: Planning Generator (Days 15-17)

**Objective:** Implement PLANNING.md generation.

#### 7.1 Planning Generator

| File | Responsibility |
|------|----------------|
| `src/core/planning-generator.ts` | Main planning logic |
| `src/core/planning-templates.ts` | Output templates |

#### 7.2 Planning Interfaces

```typescript
// src/core/planning-generator.ts
export class PlanningGenerator {
  constructor(
    llm: BaseChatModel,
    workflowManager: WorkflowManager,
    memoryRetriever: MemoryRetrieval
  );
  
  async generatePlan(phase: Phase, context: PlanningContext): Promise<PlanningDocument>;
  async revisePlan(current: PlanningDocument, feedback: PlanningFeedback): Promise<PlanningDocument>;
  async validatePlan(plan: PlanningDocument): Promise<ValidationResult>;
}

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

export interface TaskNode {
  id: string;
  name: string;
  description: string;
  children: TaskNode[];
  estimatedTokens: number;
  dependencies: string[];
}
```

#### 7.3 Planning Output Format

```markdown
# PLANNING.md

## Task Decomposition

### Phase 2: 核心模块开发

#### 2.1 商品模块
- [ ] 2.1.1 后端 API 开发 (backend-dev)
  - REST API 端点设计
  - 数据库模型定义
  - 业务逻辑实现
- [ ] 2.1.2 前端组件开发 (frontend-dev)
  - 商品列表组件
  - 商品详情组件
  - 购物车组件

#### 2.2 人员管理模块
- [ ] 2.2.1 后端 API 开发 (backend-dev)
- [ ] 2.2.2 测试用例开发 (qa-engineer)

## Tech Stack

| 模块 | 技术选型 | 理由 |
|------|---------|------|
| 后端框架 | Express.js | 轻量、灵活 |
| 数据库 | PostgreSQL | 成熟稳定 |
| 前端框架 | React 18 | 生态完善 |

## File Structure

```
src/
├── product/
│   ├── controllers/
│   ├── models/
│   ├── services/
│   └── routes/
├── user/
│   └── ...
```

## API Contracts

### GET /api/products
- Request: Query params (page, limit, category)
- Response: { data: Product[], total: number }
```

**Deliverables:**
- PlanningGenerator with LLM integration (stubbed)
- PlanningDocument type and validation
- Template-based output generation
- Revision support with version tracking

---

### Phase 8: Agent Scheduler and Execution Engine (Days 18-21)

**Objective:** Implement multi-agent orchestration and task execution.

#### 8.1 Agent Scheduler

| File | Responsibility |
|------|----------------|
| `src/core/agent-scheduler.ts` | Sub-Agent instantiation and routing |
| `src/core/execution-engine.ts` | Task execution orchestration |

#### 8.2 Scheduler Interfaces

```typescript
// src/core/agent-scheduler.ts
export class AgentScheduler {
  constructor(
    agentFactory: AgentFactory,
    dag: DAG,
    tokenTracker: TokenTracker
  );
  
  async scheduleParallel(taskIds: string[]): Promise<ExecutionResult[]>;
  async scheduleSequential(taskIds: string[]): Promise<ExecutionResult[]>;
  async executePlan(plan: PlanningDocument): Promise<ExecutionReport>;
  detectConflicts(tasks: Task[]): ConflictReport[];
}

export interface ExecutionContext {
  parentState: WorkflowState;
  taskDescription: string;
  allowedTools: string[];
  budgetLimit: number;
  sandbox: SandboxConfig;
}

export interface ExecutionResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'failed' | 'skipped';
  output: TaskOutput;
  tokenUsage: TokenUsage;
  duration: number;
  logs: LogEntry[];
}
```

#### 8.3 Execution Engine

```typescript
// src/core/execution-engine.ts
export class ExecutionEngine {
  constructor(
    scheduler: AgentScheduler,
    workflowManager: WorkflowManager,
    qualityGate: QualityGate,
    checkpointManager: CheckpointManager
  );
  
  async executePhase(phaseId: string, options: ExecutionOptions): Promise<PhaseResult>;
  async resume(): Promise<void>;
  async pause(): Promise<void>;
  
  // HITL Integration
  awaitConfirmation(prompt: string): Promise<Confirmation>;
  requestApproval(operation: DangerousOperation): Promise<Approval>;
}

export interface ExecutionOptions {
  parallel: boolean;
  watch: boolean;
  skipQualityGate: boolean;
}
```

**Deliverables:**
- AgentScheduler with parallel/sequential execution
- ExecutionEngine with phase lifecycle management
- Context isolation for Sub-Agents
- Conflict detection and reporting
- HITL checkpoint integration

---

### Phase 9: Quality Gates (Days 22-23)

**Objective:** Implement automated quality verification.

#### 9.1 Quality Gate Components

| File | Responsibility |
|------|----------------|
| `src/quality/lint-checker.ts` | Lint execution wrapper |
| `src/quality/test-runner.ts` | Test execution wrapper |
| `src/quality/schema-validator.ts` | API schema validation |
| `src/quality/quality-gate.ts` | Gate orchestrator |

#### 9.2 Quality Interfaces

```typescript
// src/quality/quality-gate.ts
export class QualityGate {
  constructor(config: QualityGateConfig);
  
  async runChecks(target: string): Promise<QualityResult>;
  async runLint(target: string): Promise<LintResult>;
  async runTests(target: string): Promise<TestResult>;
  async runSchemaCheck(target: string): Promise<SchemaResult>;
}

export interface QualityResult {
  passed: boolean;
  checks: CheckResult[];
  summary: QualitySummary;
  artifacts: QualityArtifact[];
}

export interface LintResult {
  passed: boolean;
  errors: LintError[];
  warnings: LintWarning[];
  output: string;
}

export interface TestResult {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  coverage: CoverageReport;
  output: string;
}
```

**Deliverables:**
- LintChecker with configurable linters
- TestRunner with coverage reporting
- SchemaValidator for API contracts
- QualityGate orchestrator with fail-fast behavior
- Auto-revision trigger on failure

---

### Phase 10: CLI Implementation (Days 24-27)

**Objective:** Implement all CLI commands.

#### 10.1 Command Structure

| Command | File | Functionality |
|---------|------|---------------|
| `init` | `src/cli/commands/init.ts` | Initialize project structure |
| `run` | `src/cli/commands/run.ts` | Execute workflow phases |
| `confirm` | `src/cli/commands/confirm.ts` | Confirm PLANNING.md |
| `status` | `src/cli/commands/status.ts` | Show execution status |
| `logs` | `src/cli/commands/logs.ts` | Tail agent logs |
| `skip` | `src/cli/commands/skip.ts` | Skip a task |
| `rollback` | `src/cli/commands/rollback.ts` | Rollback a task |

#### 10.2 CLI Components

| File | Responsibility |
|------|----------------|
| `src/cli/index.ts` | Commander.js setup |
| `src/cli/presenter/progress.ts` | Real-time progress display |
| `src/cli/presenter/status-view.ts` | Status report renderer |

#### 10.3 Command Implementations

```typescript
// deepagents init --name <project>
export async function initProject(name: string, options: InitOptions): Promise<void> {
  // 1. Create project directory
  // 2. Generate workflow.md from template
  // 3. Generate agent.md from template
  // 4. Create PLANNING.md (empty)
  // 5. Create STATUS.md (initial)
  // 6. Create LOGS/ directory
}

// deepagents run --phase <plan|execute> [--parallel] [--watch] [--resume]
export async function runPhase(phase: string, options: RunOptions): Promise<void> {
  // 1. Load workflow.md and agent.md
  // 2. If --resume, restore from checkpoint
  // 3. Execute phase via ExecutionEngine
  // 4. Output real-time progress
  // 5. On HITL checkpoint, pause and prompt
}

// deepagents confirm --file <planning-file> [--revise]
export async function confirmPlanning(file: string, options: ConfirmOptions): Promise<void> {
  // 1. Load PLANNING.md
  // 2. If --revise, record revision history
  // 3. Validate planning structure
  // 4. Mark as confirmed
  // 5. Resume execution if paused
}

// deepagents status [--live]
export async function showStatus(live: boolean): Promise<void> {
  // Display current workflow progress
  // If --live, poll and refresh
}

// deepagents logs --agent <name> [--follow]
export async function showLogs(agent: string, follow: boolean): Promise<void> {
  // Read logs from LOGS/agents/<agent>/
  // If --follow, tail -f style
}

// deepagents skip --task <name>
export async function skipTask(taskName: string): Promise<void> {
  // Mark task as skipped in workflow state
  // Continue execution
}

// deepagents rollback --task <name>
export async function rollbackTask(taskName: string): Promise<void> {
  // Restore files from last checkpoint
  // Reset task status
  // Re-queue for execution
}
```

**Deliverables:**
- All 8 CLI commands implemented
- Real-time progress presenter
- Status view with color output
- Interactive confirmation prompts
- Log streaming with --follow

---

### Phase 11: VCS Integration (Days 28-29)

**Objective:** Implement version control operations.

#### 11.1 VCS Components

| File | Responsibility |
|------|----------------|
| `src/vcs/branch-manager.ts` | Branch creation/management |
| `src/vcs/commit-manager.ts` | Commit generation and push |
| `src/vcs/pr-manager.ts` | Pull request creation |

#### 11.2 VCS Interfaces

```typescript
// src/vcs/branch-manager.ts
export class BranchManager {
  async createBranch(name: string, base: string): Promise<Branch>;
  async listBranches(): Promise<Branch[]>;
  async deleteBranch(name: string): Promise<void>;
}

// src/vcs/commit-manager.ts
export class CommitManager {
  generateCommitMessage(changes: FileChange[]): string;
  async createCommit(message: string, files: string[]): Promise<Commit>;
  async push(branch: string, options: PushOptions): Promise<PushResult>;
  async pushForce(branch: string): Promise<PushResult>;
}

// src/vcs/pr-manager.ts
export class PRManager {
  async createPR(options: CreatePROptions): Promise<PR>;
  async getPRStatus(prId: string): Promise<PRStatus>;
}
```

**Deliverables:**
- Feature branch creation (feat/agent-{module})
- Conventional commit message generation
- Safe push with --force confirmation
- PR creation with description

---

### Phase 12: Sandbox Isolation (Days 30-31)

**Objective:** Define sandbox interfaces (implementation deferred).

#### 12.1 Sandbox Interface

| File | Responsibility |
|------|----------------|
| `src/tools/sandbox.ts` | Sandbox isolation interface |

#### 12.2 Sandbox Interface

```typescript
// src/tools/sandbox.ts
export interface SandboxConfig {
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  maxMemory?: number;
  maxDuration?: number;
}

export interface Sandbox {
  readonly id: string;
  readonly config: SandboxConfig;
  
  execute(command: string, args?: string[]): Promise<ExecutionResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(pattern: string): Promise<string[]>;
  
  destroy(): Promise<void>;
}

export interface SandboxFactory {
  create(config: SandboxConfig): Promise<Sandbox>;
  destroy(id: string): Promise<void>;
  list(): Sandbox[];
}
```

**Deliverables:**
- Sandbox interface definition
- SandboxFactory for lifecycle management
- Command whitelist validation

---

### Phase 13: Storage and Checkpointing (Days 32-34)

**Objective:** Implement state persistence and recovery.

#### 13.1 Storage Components

| File | Responsibility |
|------|----------------|
| `src/storage/session-store.ts` | Session CRUD operations |
| `src/storage/checkpoint-manager.ts` | Checkpoint lifecycle |
| `src/storage/snapshot-store.ts` | File snapshot management |

#### 13.2 Storage Interfaces

```typescript
// src/storage/session-store.ts
export interface SessionStore {
  createSession(metadata: SessionMetadata): Promise<Session>;
  saveSnapshot(sessionId: string, snapshot: SessionSnapshot): Promise<void>;
  loadSession(sessionId: string): Promise<Session | null>;
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
  deleteSession(sessionId: string): Promise<void>;
  searchSessions(query: string): Promise<SessionMatch[]>;
}

// src/storage/checkpoint-manager.ts
export class CheckpointManager {
  constructor(store: SessionStore);
  
  async createCheckpoint(workflowState: WorkflowState): Promise<Checkpoint>;
  async restoreCheckpoint(checkpointId: string): Promise<WorkflowState>;
  async listCheckpoints(): Promise<CheckpointSummary[]>;
  async deleteCheckpoint(checkpointId: string): Promise<void>;
  
  async snapshotFiles(paths: string[]): Promise<SnapshotId>;
  async restoreSnapshot(snapshotId: SnapshotId): Promise<void>;
}
```

**Deliverables:**
- SessionStore with SQLite backend (interface)
- CheckpointManager with automatic snapshots
- SnapshotStore for file state preservation
- Recovery procedures for --resume

---

### Phase 14: Integration and Testing (Days 35-38)

**Objective:** Integration tests and bug fixes.

#### 14.1 Test Structure

| Directory | Coverage |
|-----------|----------|
| `test/unit/` | Unit tests for each module |
| `test/integration/` | Integration tests for workflows |
| `test/e2e/` | End-to-end CLI tests |

#### 14.2 Unit Test Coverage

| Module | Test Cases |
|--------|-----------|
| `types/` | Zod schema validation |
| `config/` | workflow.md and agent.md parsing |
| `core/dag.ts` | DAG building, cycle detection, topological sort |
| `core/workflow-manager.ts` | Phase transitions, checkpointing |
| `memory/` | Memory operations, compression |
| `token/` | Budget tracking, regulation |
| `quality/` | Lint/Test execution (stubbed) |

#### 14.3 Integration Test Scenarios

1. **Workflow Parsing**: Parse valid workflow.md, verify DAG structure
2. **Phase Execution**: Execute single phase with mocked agents
3. **Parallel Execution**: Verify parallel tasks execute concurrently
4. **Checkpoint/Resume**: Simulate interruption, verify recovery
5. **Quality Gate Failure**: Trigger lint failure, verify revision

#### 14.4 E2E Test Scenarios

1. `deepagents init` creates valid project structure
2. `deepagents run --phase plan` generates PLANNING.md
3. `deepagents confirm` marks planning as confirmed
4. `deepagents status` displays accurate progress
5. `deepagents skip` marks task as skipped
6. `deepagents rollback` restores previous state

**Deliverables:**
- 80%+ code coverage
- All integration tests passing
- E2E smoke tests for CLI

---

### Phase 15: Documentation and Polish (Days 39-40)

**Objective:** Final documentation and cleanup.

#### 15.1 Documentation

| File | Content |
|------|---------|
| `README.md` | Project overview, quick start |
| `docs/ARCHITECTURE.md` | Architecture deep-dive |
| `docs/API.md` | API reference |
| `docs/CLI.md` | CLI command reference |
| `docs/CONTRIBUTING.md` | Development guide |

#### 15.2 Polish Items

- Error message localization
- Progress bar aesthetics
- Color output for terminals
- Debug mode logging
- Performance profiling hooks

**Deliverables:**
- Complete README with examples
- Architecture documentation
- API reference
- Contribution guide

---

## 5. Dependencies Between Modules

```
Phase 1: Foundation
    │
    ▼
Phase 2: Config Parsing
    │
    ▼
Phase 3: DAG & Workflow Manager ──────────────────┐
    │                                            │
    ▼                                            │
Phase 4: Agent Infrastructure                      │
    │                        │                    │
    ▼                        ▼                    │
Phase 5: Memory ─────────────┘                    │
    │                                             │
    ▼                                             │
Phase 6: Token Budget                              │
    │                                             │
    ▼                                             │
Phase 7: Planning Generator ──────────────────────┤
    │                                             │
    ▼                                             ▼
Phase 8: Agent Scheduler & Execution ◄─────────────┤
    │                          │                  │
    │                          ▼                  │
    │    Phase 9: Quality Gates ◄─────────────────┤
    │                          │                  │
    │    Phase 10: CLI ◄───────┴──────────────────┤
    │                          │                  │
    │    Phase 11: VCS ◄───────┴──────────────────┤
    │                          │                  │
    │    Phase 12: Sandbox ◄───┴──────────────────┤
    │                          │                  │
    │    Phase 13: Storage ◄────┴─────────────────┤
    │                          │                  │
    └──────────────────────────┴──────────────────┘
                    │
                    ▼
Phase 14: Integration & Testing
                    │
                    ▼
Phase 15: Documentation & Polish
```

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **LLM integration complexity** | High | High | Use stub implementations; interface-first design |
| **DAG cycle detection bugs** | Medium | High | Extensive unit tests; edge case coverage |
| **Memory leaks in long sessions** | Medium | Medium | Implement token budget enforcement; regular compression |
| **Parallel execution race conditions** | Medium | High | Use proper locking; isolate agent state |
| **Checkpoint corruption** | Low | High | Validate checkpoints; maintain backup snapshots |
| **Quality gate false positives** | Medium | Low | Configurable thresholds; allow overrides |
| **Sandbox escape** | Low | Critical | Interface-only for v1; defer implementation |
| **Circular dependencies in modules** | Medium | Medium | Dependency injection; interface segregation |

---

## 7. Testing Strategy

### 7.1 Unit Tests (Vitest)

```typescript
// test/unit/dag.test.ts
describe('DAG', () => {
  it('should detect cycles');
  it('should return correct topological order');
  it('should group parallelizable tasks');
});

// test/unit/workflow-manager.test.ts
describe('WorkflowManager', () => {
  it('should transition phases correctly');
  it('should save and restore checkpoints');
  it('should track task status');
});

// test/unit/token-tracker.test.ts
describe('TokenTracker', () => {
  it('should track per-agent usage');
  it('should detect budget exceeded');
  it('should trigger regulation at threshold');
});
```

### 7.2 Integration Tests

```typescript
// test/integration/workflow-parse.test.ts
describe('Workflow Parsing', () => {
  it('should parse valid workflow.md');
  it('should build correct DAG from phases');
  it('should identify parallel tasks');
});

// test/integration/execution.test.ts
describe('Execution', () => {
  it('should execute single task');
  it('should execute parallel tasks');
  it('should handle task failure');
  it('should resume from checkpoint');
});
```

### 7.3 E2E Tests

```typescript
// test/e2e/cli.test.ts
describe('CLI', () => {
  it('init should create project structure');
  it('run should execute plan phase');
  it('confirm should update planning status');
  it('status should show progress');
});
```

---

## 8. File Structure Summary

```
myAgent01/src/
├── index.ts                       # Entry point
├── types/
│   ├── index.ts
│   ├── workflow.ts
│   ├── agent.ts
│   ├── task.ts
│   ├── memory.ts
│   ├── token.ts
│   └── checkpoint.ts
├── cli/
│   ├── index.ts
│   ├── commands/
│   │   ├── init.ts
│   │   ├── run.ts
│   │   ├── confirm.ts
│   │   ├── status.ts
│   │   ├── logs.ts
│   │   ├── skip.ts
│   │   └── rollback.ts
│   └── presenter/
│       ├── progress.ts
│       └── status-view.ts
├── config/
│   ├── index.ts
│   ├── parser.ts
│   ├── workflow-parser.ts
│   └── agent-parser.ts
├── core/
│   ├── index.ts
│   ├── workflow-manager.ts
│   ├── dag.ts
│   ├── planning-generator.ts
│   ├── planning-templates.ts
│   ├── agent-scheduler.ts
│   └── execution-engine.ts
├── agents/
│   ├── index.ts
│   ├── base-agent.ts
│   ├── architect-agent.ts
│   ├── backend-dev-agent.ts
│   ├── frontend-dev-agent.ts
│   ├── qa-engineer-agent.ts
│   ├── main-agent.ts
│   └── agent-factory.ts
├── memory/
│   ├── index.ts
│   ├── working-memory.ts
│   ├── short-term-memory.ts
│   ├── long-term-memory.ts
│   ├── memory-retrieval.ts
│   └── memory-merger.ts
├── storage/
│   ├── index.ts
│   ├── session-store.ts
│   ├── checkpoint-manager.ts
│   └── snapshot-store.ts
├── tools/
│   ├── index.ts
│   ├── base-tool.ts
│   ├── file-tools.ts
│   ├── command-tools.ts
│   ├── git-tools.ts
│   ├── search-tools.ts
│   ├── sandbox.ts
│   └── tool-registry.ts
├── quality/
│   ├── index.ts
│   ├── lint-checker.ts
│   ├── test-runner.ts
│   ├── schema-validator.ts
│   └── quality-gate.ts
├── vcs/
│   ├── index.ts
│   ├── branch-manager.ts
│   ├── commit-manager.ts
│   └── pr-manager.ts
├── token/
│   ├── index.ts
│   ├── token-tracker.ts
│   ├── budget-allocator.ts
│   └── regulation-engine.ts
└── utils/
    ├── index.ts
    ├── logger.ts
    ├── file-utils.ts
    ├── id-generator.ts
    └── validation.ts
```

---

## 9. Success Criteria

### 9.1 Functional Criteria

- [ ] All 8 CLI commands operational
- [ ] workflow.md parses correctly with DAG construction
- [ ] PLANNING.md generates with all required sections
- [ ] All 4 Sub-Agent types instantiate correctly
- [ ] Parallel task execution works
- [ ] Checkpoint save/restore works
- [ ] Quality gates trigger on failure
- [ ] HITL pauses at planning confirmation

### 9.2 Quality Criteria

- [ ] TypeScript strict mode passes
- [ ] 80%+ test coverage
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] No lint errors
- [ ] Memory usage stable in long sessions

### 9.3 Performance Criteria

- [ ] Agent instantiation < 2s
- [ ] DAG construction < 100ms for 100 tasks
- [ ] Checkpoint save < 500ms
- [ ] CLI response time < 200ms

---

## 10. Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|-------------|
| Phase 1: Foundation | 2 days | 2 days |
| Phase 2: Config Parsing | 2 days | 4 days |
| Phase 3: DAG & Workflow | 2 days | 6 days |
| Phase 4: Agent Infrastructure | 3 days | 9 days |
| Phase 5: Memory Management | 3 days | 12 days |
| Phase 6: Token Budget | 2 days | 14 days |
| Phase 7: Planning Generator | 3 days | 17 days |
| Phase 8: Scheduler & Execution | 4 days | 21 days |
| Phase 9: Quality Gates | 2 days | 23 days |
| Phase 10: CLI | 4 days | 27 days |
| Phase 11: VCS | 2 days | 29 days |
| Phase 12: Sandbox | 2 days | 31 days |
| Phase 13: Storage | 3 days | 34 days |
| Phase 14: Integration & Testing | 4 days | 38 days |
| Phase 15: Documentation | 2 days | 40 days |

**Total Estimated: 8 weeks (40 working days)**

---

## 11. Implementation Notes

### 11.1 Immutability Principle

All state modifications MUST create new objects:

```typescript
// WRONG
function updateTask(task: Task, status: TaskStatus): Task {
  task.status = status; // Mutates original
  return task;
}

// CORRECT
function updateTask(task: Task, status: TaskStatus): Task {
  return { ...task, status }; // Returns new object
}
```

### 11.2 Error Handling

Every async function MUST have try/catch:

```typescript
async function executeTask(task: Task): Promise<TaskResult> {
  try {
    // Implementation
  } catch (error) {
    logger.error({ taskId: task.id, error }, 'Task execution failed');
    throw new TaskExecutionError(task.id, error);
  }
}
```

### 11.3 Interface-First Design

Define interfaces before implementations. LLM integration should be stubbed with clear interface contracts for future implementation.

### 11.4 File Organization

- Maximum 400 lines per file
- Group by feature/domain, not by type
- Co-locate tests with source files
