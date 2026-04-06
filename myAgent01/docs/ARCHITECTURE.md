# DeepAgents Code Agent 系统架构文档

**文档版本:** 2.0  
**编制日期:** 2026-04-06  
**基于文档:** pro.md (产品说明书 v1.0.0)

---

## 1. 系统概述

### 1.1 项目定位

DeepAgents Code Agent 是一款基于 **LangChain** 深度定制的智能代码开发代理系统，旨在提供与 Claude Code 相近的**全自动化、可解释、可干预**的工程级代码生成能力。

### 1.2 核心架构理念

```
工作流驱动 + 规划先行 + 人机协同 + 多智能体并行
     ↓
解析 → 规划 → 确认 → 执行 → 校验 → 迭代
  ↑                                │
  └────────────────────────────────┘
                    (闭环)
```

### 1.3 技术选型

| 层级 | 技术组件 | 说明 |
|------|----------|------|
| **Agent 编排** | LangChain + LangGraph | 状态机、工具调用、记忆管理、并行 Chain |
| **调度引擎** | DeepAgents 自研异步任务调度器 | 事件驱动并行执行 |
| **LLM 兼容** | OpenAI / Anthropic / 本地模型 | Qwen/DeepSeek/Llama 无缝切换 |
| **状态管理** | SQLite/Redis + 文件快照 | 版本控制钩子 |
| **安全边界** | 沙盒隔离 + 命令白名单 | 人工确认强制拦截点 |

---

## 2. 系统架构图

### 2.1 高层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户交互层 (CLI / API)                        │
│  deepagents init | run | confirm | status | logs | skip | rollback     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           核心编排层 (Orchestration)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Workflow       │  │  Planning       │  │  Agent          │         │
│  │  Manager        │  │  Generator      │  │  Scheduler      │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Sub-Agent 执行层 (Multi-Agent)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Architect   │  │ Backend-Dev │  │ Frontend-Dev│  │ QA-Engineer│    │
│  │   Agent     │  │   Agent     │  │   Agent     │  │   Agent     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            工具层 (Tool Layer)                          │
│  文件操作 | 命令执行 | Git 操作 | LLM API | 代码质量 | 测试 | 搜索       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    状态与记忆层 (State & Memory)                        │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐│
│  │Working Memory │ │Short-term Mem│ │Long-term Mem │ │  Session    ││
│  │ (当前上下文)   │ │ (日会话聚合)  │ │ (跨会话持久)  │ │  持久化     ││
│  └───────────────┘ └───────────────┘ └───────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块分层依赖

```
CLI / API
    ↓
Orchestration (Workflow Manager / Planning Generator / Agent Scheduler)
    ↓
Agent Runtime (LangGraph State Machine / Middleware Pipeline / Sub-Agent Lifecycle)
    ↓
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Tool Layer  │     │ State Layer │     │Memory Layer │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 3. 核心模块设计

### 3.1 Workflow Manager

解析 `workflow.md`，构建 DAG，管理阶段推进。

```
workflow.md → Parser → DAG Builder → Phase Navigator → 执行
```

**关键接口:**

```typescript
interface WorkflowManager {
  parseWorkflow(filePath: string): WorkflowSpec;
  buildDAG(spec: WorkflowSpec): DAG;
  getNextPhase(currentPhase: string): Phase | null;
  canExecute(phase: string, completedPhases: string[]): boolean;
}
```

### 3.2 Planning Generator

根据任务拆解生成 `PLANNING.md`。

```
Phase/Task → Task Decomposer → Tech Selector → Contract Definer → PLANNING.md
```

**PLANNING.md 输出:**
- 任务拆解树
- 技术栈建议
- 文件结构规划
- API 接口契约
- 风险识别与预案

### 3.3 Agent Scheduler

基于 `agent.md` 动态实例化专业 Sub-Agent 并调度执行。

```
agent.md + PLANNING.md → Role Instantiator → Task Router → Parallel Executor
```

### 3.4 Sub-Agent 架构

每个 Sub-Agent 是一个完整的 LangGraph Agent，包含独立的中间件栈和工具集。

---

## 4. 安全架构

### 4.1 沙盒隔离

```
项目目录 (Project Root)
├── src/          ← Sub-Agent 可读写
├── workflow.md   ← Sub-Agent 只读
├── agent.md      ← Sub-Agent 只读
├── PLANNING.md   ← Sub-Agent 只读
├── node_modules/ ← 禁止修改
└── .git/        ← 禁止直接操作
```

### 4.2 命令白名单

| 类别 | 允许的命令 | 需二次确认 |
|------|-----------|-----------|
| **文件操作** | `read_file`, `write_file`, `edit_file`, `glob`, `grep` | - |
| **Git 操作** | `git status`, `git add`, `git commit`, `git branch` | `git push`, `git push --force` |
| **包管理** | `npm install`, `pip install` | `rm -rf node_modules` |
| **危险操作** | - | `rm -rf`, `sudo` |

### 4.3 人机协同拦截点

1. PLANNING.md 生成后 → 暂停 → 人工确认
2. 质量校验失败后 → 暂停 → 人工干预
3. 危险操作执行前 → 暂停 → 人工确认
4. Git push 前 → 暂停 → 人工确认

---

## 5. 状态与记忆管理

### 5.1 状态层次

```
┌─────────────────────────────────────────────────────────┐
│  Workflow State (工作流状态)                           │
│  - current_phase, completed_phases, task_status        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Agent State (Agent 运行时状态)                       │
│  - messages, files, todos, skillsMetadata              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Long-term Memory (持久化记忆)                         │
│  - SKILL.md, AGENTS.md, Checkpoint                    │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Checkpointing 机制

```typescript
interface Checkpoint {
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
  snapshots: {
    srcDir: string;
    logsDir: string;
  };
}
```

---

## 6. 记忆管理系统

### 6.1 记忆分层架构

| 层次 | 生命周期 | 存储位置 | 容量 |
|------|----------|----------|------|
| **Working Memory** | 单次对话 | 内存 | ~128K tokens |
| **Short-term Memory** | 单日会话 | SQLite/内存 | ~512K tokens |
| **Long-term Memory** | 跨会话持久化 | SQLite/文件系统 | 无限制 |

### 6.2 Working Memory (工作记忆)

LLM 直接访问，每次推理都加载，受 Token 预算硬性限制。

```typescript
interface WorkingMemory {
  messages: BaseMessage[];
  currentTask: { id: string; description: string; progress: number };
  files: Record<string, FileData>;
  todos: Todo[];
  skillsMetadata: Record<string, SkillMeta>;
}
```

### 6.3 Short-term Memory (短期记忆)

单日会话内累积，日终或达到容量阈值时压缩或归档。

```typescript
interface ShortTermMemory {
  sessionId: string;
  sessionStart: Date;
  conversationHistory: CompressedMessage[];
  taskMemories: TaskMemory[];    // 已完成任务经验
  entityKnowledge: Entity[];      // 实体信息
  compression: {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    lastCompressedAt: Date;
  };
}

interface TaskMemory {
  taskId: string;
  summary: string;           // LLM 生成的摘要
  keyDecisions: string[];
  learnings: string[];
  artifacts: Artifact[];
  completedAt: Date;
}

interface Entity {
  name: string;
  type: "project" | "module" | "file" | "person" | "concept";
  description: string;
  aliases: string[];
  lastReferencedAt: Date;
}
```

### 6.4 Long-term Memory (长期记忆)

跨会话持久化，支持语义检索和知识积累。

```typescript
interface LongTermMemory {
  skills: SkillEntry[];         // 技能定义库
  agentNotes: AgentNote[];      // Agent 内存笔记
  projectKnowledge: ProjectKnowledge[];  // 项目知识库
  patterns: SuccessPattern[];  // 成功模式库
}

interface SkillEntry {
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;     // SKILL.md 路径
  content: string;
  embedding: number[];    // 向量化表示
  usageCount: number;
  successRate: number;
  lastUsedAt: Date;
  tags: string[];
}

interface AgentNote {
  noteId: string;
  agentType: string;
  content: string;
  context: { project: string; taskType: string };
  createdAt: Date;
  updatedAt: Date;
}

interface SuccessPattern {
  patternId: string;
  name: string;
  description: string;
  context: string;        // 使用场景
  exampleCode: string;
  successMetrics: { readability: number; maintainability: number; performance: number };
  applicableProjects: string[];
}
```

### 6.5 记忆检索机制

```typescript
interface MemoryRetrieval {
  // 语义检索 (基于 Embedding)
  semanticSearch(query: string, options: {
    memoryType: "short" | "long" | "all";
    limit: number;
    threshold: number;
  }): Promise<MemoryEntry[]>;

  // 精确检索
  exactLookup(type: "entity" | "skill" | "pattern", identifier: string): Promise<MemoryEntry | null>;

  // 上下文感知检索
  contextAwareRetrieve(currentContext: {
    task: string;
    files: string[];
    entities: string[];
  }): Promise<MemoryEntry[]>;
}

interface MemoryEntry {
  content: string;
  source: "working" | "short" | "long";
  relevance: number;      // 0-1 相关度
  recency: number;         // 0-1 时效性
  authority: number;       // 0-1 权威性
  finalScore: number;       // 综合分数
}
```

### 6.6 记忆流转

```
[新对话开始]
     ↓
1. 加载 Long-term Memory (检索相关技能、知识、模式)
     ↓
2. 构建 Working Memory (加载相关记忆到上下文)
     ↓
3. 对话进行中 (Working Memory 持续增长)
     ↓
4. Token 达到阈值 → 自动压缩到 Short-term Memory
     ↓
5. 会话结束 → Short-term Memory 归档到 Long-term Memory
```

---

## 7. 会话持久化与上下文检索

### 7.1 会话持久化架构

```
Active Session (内存) ←→ Session Store (SQLite)
                              ↓
                    Session Snapshot
```

### 7.2 会话存储结构

```typescript
interface SessionStore {
  createSession(metadata: SessionMetadata): Promise<Session>;
  saveSnapshot(sessionId: string, snapshot: SessionSnapshot): Promise<void>;
  loadSession(sessionId: string): Promise<Session | null>;
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
  deleteSession(sessionId: string): Promise<void>;
  searchSessions(query: string): Promise<SessionMatch[]>;
}

interface SessionSnapshot {
  id: string;
  timestamp: Date;
  workflow: { currentPhase: string; completedPhases: string[]; taskStatus: Record<string, TaskStatus> };
  agent: { messages: SerializedMessage[]; files: Record<string, SerializedFile>; todos: SerializedTodo[] };
  memory: { working: WorkingMemory; shortTerm: ShortTermMemory };
  tokenUsage: TokenUsage;
  fileSnapshotPath: string;
}
```

### 7.3 上下文检索

```typescript
interface ContextRetrieval {
  retrieveRelevantSessions(query: {
    task: string;
    project?: string;
    agentType?: string;
    timeRange?: { start: Date; end: Date };
  }, options: {
    maxSessions: number;
    maxTokens: number;
  }): Promise<RetrievedContext>;

  extractRelevantSnippets(sessionId: string, query: string): Promise<ContextSnippet[]>;
}

interface RetrievedContext {
  sessions: SessionMatch[];
  totalTokens: number;
  snippets: ContextSnippet[];
}

interface SessionMatch {
  sessionId: string;
  projectPath: string;
  relevance: number;
  summary: string;
  keyDecisions: string[];
  artifacts: ArtifactRef[];
}
```

### 7.4 会话合并策略

```typescript
async function mergeContexts(
  current: WorkingMemory,
  retrieved: RetrievedContext,
  maxTokens: number
): Promise<WorkingMemory> {
  const snippets = sortByRelevance(retrieved.snippets);
  let merged: WorkingMemory = { ...current };
  let totalTokens = countTokens(current);

  for (const snippet of snippets) {
    const snippetTokens = countTokens(snippet.content);
    if (totalTokens + snippetTokens > maxTokens) break;
    merged = await injectSnippet(merged, snippet);
    totalTokens += snippetTokens;
  }
  return merged;
}
```

### 7.5 自动会话摘要

```typescript
interface AutoSummarizer {
  generateSessionSummary(session: Session): Promise<SessionSummary>;
  generateTaskSummary(taskId: string, messages: SerializedMessage[], artifacts: Artifact[]): Promise<TaskSummary>;
}

interface SessionSummary {
  sessionId: string;
  highLevelGoal: string;
  approach: string;
  keyDecisions: Decision[];
  completedTasks: string[];
  blockedTasks: string[];
  learnings: string[];
  suggestedNextSteps: string[];
}

interface Decision {
  context: string;
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
}
```

---

## 8. Token 预算管理

### 8.1 Token 预算层次

```
┌─────────────────────────────────────────────────────────────┐
│  全局预算 (Global Budget)                                    │
│  - 模型上下文窗口上限 (如 200K tokens)                       │
│  - 当前会话预算上限 (可配置)                                 │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Agent 预算 (Per-Agent Budget)                             │
│  Main Agent: 100K | Architect: 80K | Backend-Dev: 60K     │
│  Frontend-Dev: 60K | QA-Engineer: 40K                       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  任务预算 (Per-Task Budget)                                 │
│  Task 2.1.1: 30K | Task 2.1.2: 25K | Task 2.2.1: 20K     │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Token 追踪接口

```typescript
interface TokenTracker {
  getGlobalUsage(): TokenUsage;
  getGlobalBudget(): TokenBudget;
  getAgentUsage(agentId: string): TokenUsage;
  getAgentBudget(agentId: string): TokenBudget;
  getTaskUsage(taskId: string): TokenUsage;
  getTaskBudget(taskId: string): TokenBudget;
  recordUsage(agentId: string, taskId: string, usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  }): void;
  checkBudget(agentId: string, taskId?: string): BudgetStatus;
}

interface TokenBudget {
  limit: number;
  warningThreshold: number;    // 80% 警告
  criticalThreshold: number;  // 95% 触发压缩
}

interface BudgetStatus {
  withinBudget: boolean;
  usagePercent: number;       // 0-1
  status: "ok" | "warning" | "critical" | "exceeded";
  remainingTokens: number;
  estimatedCompletition: "likely" | "uncertain" | "unlikely";
}
```

### 8.3 预算分配策略

```typescript
interface BudgetAllocator {
  allocateInitialBudget(config: {
    globalLimit: number;
    modelContextWindow: number;
    agentWeights: Record<string, number>;
  }): BudgetAllocation;

  reallocate(current: BudgetAllocation, agentId: string, taskPriority: number): BudgetAllocation;
}

interface BudgetAllocation {
  global: TokenBudget;
  agents: Record<string, TokenBudget>;
  tasks: Record<string, TokenBudget>;
  reserved: { system: number; compression: number; emergency: number; };
}

// 按权重和优先级分配
function allocateBudget(
  globalLimit: number,
  agentWeights: Record<string, number>,
  agentPriorities: Record<string, number>
): Record<string, number> {
  const totalWeight = Object.entries(agentWeights)
    .reduce((sum, [, w]) => sum + w, 0);
  return Object.fromEntries(
    Object.entries(agentWeights).map(([agentId, weight]) => {
      const priority = agentPriorities[agentId] ?? 1;
      const allocation = (weight * priority * globalLimit) / totalWeight;
      return [agentId, Math.floor(allocation)];
    })
  );
}
```

### 8.4 自动调控机制

```typescript
type RegulationAction =
  | { type: "compress"; target: "working" | "short" | "long"; priority: number }
  | { type: "summarize"; target: "messages"; depth: "light" | "medium" | "deep" }
  | { type: "escalate"; reason: string }
  | { type: "abort"; reason: string };

class RegulationEngine {
  decide(agentId: string, usage: TokenUsage, budget: TokenBudget): RegulationAction {
    const usagePercent = usage.total / budget.limit;
    if (usagePercent >= 1.0) {
      return this.canCompress(agentId)
        ? { type: "compress", target: "working", priority: 1 }
        : { type: "abort", reason: "Token budget exceeded" };
    }
    if (usagePercent >= budget.criticalThreshold) {
      return { type: "compress", target: "working", priority: 1 };
    }
    if (usagePercent >= budget.warningThreshold && this.shouldCompress(agentId)) {
      return { type: "summarize", target: "messages", depth: "medium" };
    }
    return { type: "continue" };
  }
}
```

### 8.5 会话自动压缩

```typescript
interface SessionCompression {
  trigger: {
    tokenThreshold: number;         // 默认: 128K
    messageCountThreshold: number;  // 默认: 100 条
    timeThreshold: number;           // 默认: 30 分钟无交互
    budgetThreshold: number;         // 默认: 80% 预算使用
  };
  config: {
    preserveSystemPrompt: boolean;
    preserveRecentMessages: number;
    preserveDecisions: boolean;
    preserveArtifacts: boolean;
    summaryModel: string;
  };
}

async function compressSession(session: Session, config: SessionCompression): Promise<CompressedSession> {
  const toPreserve = await identifyPreserve(session.messages, {
    recentCount: config.preserveRecentMessages,
    decisions: config.preserveDecisions,
    artifacts: config.preserveArtifacts,
  });
  const toCompress = session.messages.filter(m => !toPreserve.includes(m));
  const summary = await generateSummary(toCompress, config.summaryModel);
  return {
    originalTokens: countTokens(session.messages),
    compressedTokens: countTokens([...toPreserve, summary]),
    compressionRatio: countTokens(summary) / countTokens(toCompress),
    messages: [...toPreserve, summary],
    artifacts: toPreserve.artifacts,
    decisions: toPreserve.decisions,
  };
}
```

---

## 9. 并行调度架构

### 9.1 DAG 与调度

```
workflow.md → DAG → 并行节点识别 → 调度执行
```

```
Phase 1 (串行) → Phase 2 (并行: Task A ∥ Task B) → Phase 3 (串行)
```

### 9.2 上下文隔离

```typescript
const EXCLUDED_STATE_KEYS = [
  "messages",             // 用任务描述替换
  "todos",               // 子代理独立的 TodoList
  "structuredResponse",   // 不共享
  "skillsMetadata",       // 子代理加载自己的技能
  "memoryContents",        // 子代理加载自己的内存
] as const;

function filterStateForSubagent(parentState: State): SubagentState {
  return {
    ...pick(parentState, ["files", "config"]),
    messages: [new HumanMessage(taskDescription)],
  };
}
```

---

## 10. 扩展性设计

### 10.1 自定义 Agent 角色

```markdown
## Roles
- my-custom-agent:
    description: 自定义 Agent
    tools: [custom_tool_1, custom_tool_2]
    model: claude-sonnet-4-6
    middleware: [CustomMiddleware]
```

### 10.2 自定义 Middleware

```typescript
const MyCustomMiddleware = createMiddleware({
  name: "myCustomMiddleware",
  beforeAgent: async (request, { continue }) => continue(),
  wrapModelCall: async (request, handler) => handler(request),
  afterAgent: async (response, { continue }) => continue(response),
});
```

---

## 11. 部署架构

### 11.1 本地开发模式

适用于开发、调试、离线环境。

```
Developer Workstation
    ↓
DeepAgents CLI (init / run / confirm / status)
    ↓
Local LLM (Ollama) / Cloud LLM (OpenAI/Anthropic)
    ↓
Local Sandbox (文件系统隔离)
```

### 11.2 远程协作模式

```
Developer A (架构师/PM)
    ↓
Shared Git Repository (workflow.md, agent.md)
    ↓
Developer B (Backend) ∥ Developer C (Frontend) ∥ Developer D (QA)
```

---

## 12. 监控与可观测性

### 12.1 日志体系

```
LOGS/
├── workflow/           # 工作流日志
│   ├── phase-1-architect.log
│   └── phase-2-backend-dev.log
├── agents/            # Agent 执行日志
│   ├── architect/
│   │   ├── input-prompt.json
│   │   ├── output-response.json
│   │   └── metrics.json
│   └── backend-dev/
└── quality/           # 质量报告
    ├── lint-report.json
    └── test-report.json
```

### 12.2 实时看板

```
┌────────────────────────────────────────────────────────────┐
│  📊 DeepAgents Code Agent - 实时进度                    │
├────────────────────────────────────────────────────────────┤
│  Phase: [2/3] 核心模块开发                              │
│  ├─ ✅ Phase 1: 架构设计 (100%)                        │
│  ├─ 🔄 Phase 2: 核心模块开发                           │
│  │    ├─ ✅ 商品模块 (100%)                            │
│  │    └─ ⏳ 人员管理 (40%)                              │
│  └─ 🔒 Phase 3: 联调与测试 (等待 Phase 2)              │
├────────────────────────────────────────────────────────────┤
│  Tokens: 45,230 | 耗时: 2m 15s | 错误: 0               │
└────────────────────────────────────────────────────────────┘
```

---

## 13. 技术栈汇总

| 层级 | 技术 | 职责 |
|------|------|------|
| **用户交互** | Commander.js / Inquirer.js | CLI 交互 |
| **工作流解析** | markdown-it / yaml | workflow.md 解析 |
| **Agent 编排** | LangChain + LangGraph | Agent 创建、调用、状态机 |
| **多 Agent 调度** | DeepAgents 自研调度器 | DAG 构建、并行调度 |
| **工具层** | LangChain Tools | 文件、命令、Git、搜索 |
| **LLM 适配** | LangChain Chat Models | OpenAI / Anthropic / Ollama |
| **状态持久化** | SQLite / Redis | Checkpoint / Snapshot |
| **安全沙盒** | chroot / container | 进程隔离 |
| **日志** | pino / winston | 结构化日志 |
| **记忆存储** | SQLite + Embeddings | 语义检索 |

---

**文档结束**
