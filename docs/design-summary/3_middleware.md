# Middleware 模块设计文档

**分析日期:** 2026-04-06

---

## 1. 模块概述

### 1.1 功能定位

Middleware 模块是 deepagents 框架的核心扩展机制，位于 Agent 与 LLM 之间，负责在模型调用前后对请求/响应进行拦截、处理和增强。该模块实现了文件系统访问、子代理委托、技能加载、内存管理、上下文摘要、工具调用修补等关键功能。

### 1.2 设计理念

**中间件编排模式 (Middleware Pipeline):**
- 采用 **洋葱模型 (Onion Model)** 的变体，每个中间件可以选择性地修改请求 (wrapModelCall)、修改状态 (beforeAgent/afterAgent)、或添加工具
- 中间件按确定性顺序执行，确保可预测性和可调试性
- 每个中间件都是独立的、无状态的，通过状态 Schema 声明需要持久化的数据

**Backend 抽象:**
- 技能 (Skills) 和内存 (Memory) 中间件使用 BackendProtocol 抽象，支持文件系统、状态存储等多种后端
- 这使得中间件可以在不同环境中移植（本地开发、远程服务器等）

**渐进式披露 (Progressive Disclosure):**
- 技能系统只加载元数据到 prompt，实际内容按需读取
- 摘要中间件在接近上下文限制时才执行，而非每次调用都执行

---

## 2. 中间件类型系统

### 2.1 Middleware Type Definition

```typescript
// 来自 langchain 的核心类型
type AgentMiddleware = {
  name?: string;
  stateSchema?: z.ZodType;
  tools?: (StructuredTool | Tool)[];
  
  // 钩子函数
  beforeAgent?: (state: Record<string, unknown>) => Promise<any | void>;
  afterAgent?: (state: Record<string, unknown>, runtime: Runtime) => Promise<any | void>;
  wrapModelCall?: (request: ModelRequest, handler: Handler) => Promise<any>;
};
```

### 2.2 中间件如何组合

**创建流程 (`createDeepAgent`):**

```typescript
// libs/deepagents/src/agent.ts
const builtInMiddleware = [
  todoListMiddleware(),                    // 1. Todo 列表
  createFilesystemMiddleware({ backend }), // 2. 文件系统
  createSubAgentMiddleware({ ... }),       // 3. 子代理
  createSummarizationMiddleware({ ... }), // 4. 摘要
  createPatchToolCallsMiddleware(),        // 5. 工具调用修补
] as const;

// 运行时组合
const middleware = [
  todoMiddleware,
  ...skillsMiddleware,           // 可选：技能加载
  fsMiddleware,
  subagentMiddleware,
  summarizationMiddleware,
  patchToolCallsMiddleware,
  ...(asyncSubAgents.length > 0 ? [createAsyncSubAgentMiddleware({ asyncSubAgents })] : []),
  ...customMiddleware,           // 用户自定义
  ...cacheMiddleware,            // Anthropic 缓存控制
  ...(memory?.length > 0 ? [createMemoryMiddleware({ ... })] : []),
  ...(interruptOn ? [humanInTheLoopMiddleware({ interruptOn })] : []),
];
```

**执行顺序:** 中间件数组按索引顺序执行，每个中间件的 `wrapModelCall` 形成调用链。

---

## 3. 中间件分类

| 类别 | 中间件 | 文件 | 职责 |
|------|--------|------|------|
| **任务管理** | todoListMiddleware | langchain 内置 | Todo 列表读写 |
| **文件系统** | fs.ts | `createFilesystemMiddleware` | 文件系统工具注册与访问 |
| **代理委托** | subagents.ts | `createSubAgentMiddleware` | 同步子代理分发 |
| **技能系统** | skills.ts | `createSkillsMiddleware` | 技能元数据加载与 prompt 注入 |
| **内存管理** | memory.ts | `createMemoryMiddleware` | AGENTS.md 内存加载 |
| **上下文摘要** | summarization.ts | `createSummarizationMiddleware` | 上下文溢出时的历史摘要 |
| **工具修补** | patch_tool_calls.ts | `createPatchToolCallsMiddleware` | 修复工具调用/响应不匹配 |
| **异步代理** | async_subagents.ts | `createAsyncSubAgentMiddleware` | 远程 Agent Protocol 服务器 |
| **完成回调** | completion_callback.ts | `createCompletionCallbackMiddleware` | 异步任务完成通知 |
| **Agent 内存** | agent-memory.ts | `createAgentMemoryMiddleware` | (已废弃) agent.md 长期记忆 |
| **缓存断点** | cache.ts | `createCacheBreakpointMiddleware` | Anthropic 提示缓存控制 |

---

## 4. 中间件编排顺序

### 4.1 完整执行顺序 (11 个中间件)

```
1.  todoMiddleware          (langchain 内置)
2.  skillsMiddleware         (可选)
3.  fsMiddleware             (文件系统工具)
4.  subagentMiddleware       (task 工具 + 子代理)
5.  summarizationMiddleware  (上下文摘要)
6.  patchToolCallsMiddleware (工具调用修补)
7.  asyncSubAgentMiddleware  (可选, 异步子代理)
8.  customMiddleware         (用户自定义)
9.  cacheMiddleware          (Anthropic 缓存控制)
10. memoryMiddleware         (可选, AGENTS.md)
11. hitlMiddleware           (可选, Human-in-the-Loop)
```

### 4.2 顺序设计理由

**核心原则: 先静态后动态，先基础后高级**

| 位置 | 设计理由 |
|------|----------|
| **1. todoMiddleware** | Todo 列表是任务跟踪的基础设施，其他中间件可能依赖 todo 状态 |
| **2. skillsMiddleware** | 技能元数据是相对静态的配置，在 prompt 早期注入 |
| **3. fsMiddleware** | 注册文件系统工具，供后续中间件和子代理使用 |
| **4. subagentMiddleware** | task 工具需要文件系统工具作为基础 |
| **5. summarizationMiddleware** | 在上下文接近限制时压缩历史，位于工具之后确保能处理工具调用 |
| **6. patchToolCallsMiddleware** | 修复任何工具调用的不一致性，在 summarization 之后执行确保数据完整 |
| **7. asyncSubAgentMiddleware** | 异步任务工具可能需要查询状态，此时工具调用已修复 |
| **8. customMiddleware** | 用户自定义中间件在标准流程之后执行 |
| **9. cacheMiddleware** | 在几乎所有内容都准备好后添加缓存控制断点 |
| **10. memoryMiddleware** | 内存内容是动态变化的，放到最后确保能访问所有状态 |
| **11. hitlMiddleware** | Human-in-the-Loop 需要在所有处理完成后、提交给模型之前拦截 |

**为什么 summarization 在 fs 和 subagent 之后?**
- summarization 需要处理包含工具调用的消息历史
- 如果在工具注册之前执行，工具参数截断等功能无法正常工作

**为什么 patchToolCalls 在 summarization 之后?**
- summarization 可能引入或暴露工具调用不匹配的问题
- 在最后修复确保模型收到完整一致的调用列表

**为什么 memoryMiddleware 在最后?**
- 内存内容可能依赖于前面中间件计算出的状态
- 缓存在最末尾确保动态内容不被意外缓存

---

## 5. 各中间件详细设计

### 5.1 fs.ts - 文件系统工具

**文件路径:** `libs/deepagents/src/middleware/fs.ts`

**功能定位:** 注册文件系统工具到 Agent，提供 read_file、write_file、edit_file、ls 等操作能力。

**核心组件:**
```typescript
// 导出
FILESYSTEM_TOOL_NAMES = ["read_file", "write_file", "edit_file", "ls", ...]
createFilesystemMiddleware(options: { backend: AnyBackendProtocol })
```

**设计要点:**
- 使用 BackendProtocol 抽象，支持多种后端
- 工具列表通过 `TOOLS_EXCLUDED_FROM_EVICTION` 控制内容保留策略
- 提供 `createContentPreview` 用于生成文件预览

**状态 Schema:** 无持久化状态

**工具:** read_file, write_file, edit_file, ls, glob, grep, mv, rm, mkdir, rmdir

---

### 5.2 subagents.ts - 子代理委托

**文件路径:** `libs/deepagents/src/middleware/subagents.ts`

**功能定位:** 提供 `task` 工具，允许 Agent 委托复杂任务给专门的子代理。

**核心组件:**
```typescript
// 关键类型
interface SubAgent {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: StructuredTool[];
  model?: LanguageModelLike;
  middleware?: readonly AgentMiddleware[];
  skills?: string[];
  responseFormat?: CreateAgentParams["responseFormat"];
}

// 导出的常量
GENERAL_PURPOSE_SUBAGENT = { name: "general-purpose", ... }
TASK_SYSTEM_PROMPT = `## \`task\` (subagent spawner)...`
```

**设计要点:**
- 内置 general-purpose 子代理，默认继承主 Agent 的所有工具和技能
- 自定义子代理不继承主 Agent 技能，需要显式指定 `skills` 数组
- `EXCLUDED_STATE_KEYS` 排除 messages、todos、structuredResponse 等在父子代理间传递

**状态 Schema:**
```typescript
// 无新增状态通道，stateUpdate 通过 filterStateForSubagent 过滤
EXCLUDED_STATE_KEYS = ["messages", "todos", "structuredResponse", "skillsMetadata", "memoryContents"]
```

**工具:** task (接收 `description` + `subagent_type` 参数)

---

### 5.3 skills.ts - 技能加载

**文件路径:** `libs/deepagents/src/middleware/skills.ts`

**功能定位:** 实现 Agent Skills 规范，加载技能元数据到 prompt，支持渐进式披露。

**核心组件:**
```typescript
// 常量
MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024  // 10MB
MAX_SKILL_NAME_LENGTH = 64
MAX_SKILL_DESCRIPTION_LENGTH = 1024

// 状态 Reducer
skillsMetadataReducer = (current, update) => { /* 按 name 去重 */ }
```

**状态 Schema:**
```typescript
const SkillsStateSchema = new StateSchema({
  skillsMetadata: new ReducedValue(
    z.array(SkillMetadataEntrySchema).default(() => []),
    { reducer: skillsMetadataReducer }
  ),
  files: filesValue,
});
```

**设计要点:**
- SKILL.md 文件格式: YAML frontmatter + Markdown 内容
- 前端只加载元数据 (name、description、path)，实际内容按需读取
- 支持多源加载 (`sources`)，后加载的同名技能覆盖先加载的
- 使用 `adaptBackendProtocol` 统一后端接口

---

### 5.4 memory.ts - AGENTS.md 内存

**文件路径:** `libs/deepagents/src/middleware/memory.ts`

**功能定位:** 加载 AGENTS.md 文件内容到系统提示词，实现长期记忆。

**核心组件:**
```typescript
// 选项
interface MemoryMiddlewareOptions {
  backend: AnyBackendProtocol | BackendFactory;
  sources: string[];  // 如 ["~/.deepagents/AGENTS.md", "./.deepagents/AGENTS.md"]
  addCacheControl?: boolean;  // 是否添加缓存断点
}

// 状态
const MemoryStateSchema = new StateSchema({
  memoryContents: z.record(z.string(), z.string()).optional(),
  files: filesValue,
});
```

**设计要点:**
- 支持多个 AGENTS.md 源，内容按顺序拼接
- `addCacheControl` 选项为 Anthropic 提示缓存添加断点
- 内存内容在 `wrapModelCall` 时追加到 systemMessage

---

### 5.5 summarization.ts - 上下文摘要

**文件路径:** `libs/deepagents/src/middleware/summarization.ts`

**功能定位:** 当对话历史接近模型上下文限制时，自动摘要旧消息并卸载到后端存储。

**核心组件:**
```typescript
// 配置接口
interface SummarizationMiddlewareOptions {
  model: string | BaseChatModel | BaseLanguageModel;
  backend: AnyBackendProtocol | BackendFactory;
  trigger?: ContextSize | ContextSize[];  // 触发阈值
  keep?: ContextSize;                      // 保留策略
  truncateArgsSettings?: TruncateArgsSettings;  // 工具参数截断
  historyPathPrefix?: string;              // 历史文件路径前缀
}

// 状态
const SummarizationStateSchema = z.object({
  _summarizationSessionId: z.string().optional(),
  _summarizationEvent: SummarizationEventSchema.optional(),
});
```

**关键算法:**
```typescript
// findSafeCutoffPoint - 找到不切割 AI/Tool 消息对的截断点
// 策略1: 向后移动包含对应的 AIMessage
// 策略2: 向前跳过所有连续 ToolMessage

// compactToolResults - 当所有消息都要被摘要时，截断工具结果而非完全摘要
// 避免模型丢失工具调用上下文导致无限循环
```

**设计要点:**
- 支持按消息数、token 数、上下文比例三种触发方式
- 摘要事件记录 `_summarizationEvent` 用于重建有效消息列表
- 使用 `tokenEstimationMultiplier` 校准 token 估算误差
- 卸载历史到 `/conversation_history/{session_id}.md`

---

### 5.6 patch_tool_calls.ts - 工具调用修补

**文件路径:** `libs/deepagents/src/middleware/patch_tool_calls.ts`

**功能定位:** 修复 AIMessage.tool_calls 与 ToolMessage 响应之间的不匹配问题。

**核心函数:**
```typescript
patchDanglingToolCalls(messages: BaseMessage[]) => {
  // 两遍扫描:
  // 1. 收集所有 AIMessage 中的 tool_call_ids
  // 2. 构建修补后的消息列表
  //   - 跳过孤儿 ToolMessage (无对应 tool_call_id)
  //   - 为悬空 tool_call 注入合成取消 ToolMessage
}
```

**设计要点:**
- `beforeAgent`: 在 Agent 循环开始时修补状态
- `wrapModelCall`: 作为安全网，处理 HITL 拒绝等边界情况
- 某些 Provider (如 Google Gemini) 要求严格的 1:1 对应关系

---

### 5.7 async_subagents.ts - 异步子代理

**文件路径:** `libs/deepagents/src/middleware/async_subagents.ts`

**功能定位:** 连接远程 Agent Protocol 服务器，运行长时间后台任务。

**核心类型:**
```typescript
interface AsyncSubAgent {
  name: string;
  description: string;
  graphId: string;  // 关键字段，区分同步/异步子代理
  url?: string;
  headers?: Record<string, string>;
}

interface AsyncTask {
  taskId: string;      // 与 threadId 相同
  agentName: string;
  threadId: string;
  runId: string;
  status: AsyncTaskStatus;
  createdAt: string;
  updatedAt?: string;
  checkedAt?: string;
}
```

**状态 Schema:**
```typescript
const AsyncTaskStateSchema = new StateSchema({
  asyncTasks: new ReducedValue(
    z.record(z.string(), AsyncTaskSchema).default(() => ({})),
    { reducer: asyncTasksReducer }
  ),
});
```

**工具 (5 个):**
- `start_async_task` - 启动后台任务，立即返回 taskId
- `check_async_task` - 查询任务状态
- `update_async_task` - 发送新指令到运行中的任务
- `cancel_async_task` - 取消任务
- `list_async_tasks` - 列出所有跟踪的任务

**设计要点:**
- 使用 `ClientCache` 复用 SDK Client 实例
- `TERMINAL_STATUSES` 缓存终止状态避免不必要的 API 调用
- 使用 `Command` 返回状态更新

---

### 5.8 completion_callback.ts - 完成回调

**文件路径:** `libs/deepagents/src/middleware/completion_callback.ts`

**功能定位:** 为异步子代理添加完成通知机制，通知父 Agent 的回调线程。

**核心流程:**
```
Subagent 完成 → CompletionCallbackMiddleware.afterAgent →
→ 读取 callbackThreadId → 调用 runs.create() 通知父线程
```

**状态 Schema:**
```typescript
const CompletionCallbackStateSchema = z.object({
  callbackThreadId: z.string().optional(),
});
```

**设计要点:**
- `callbackThreadId` 由父 Agent 的 `start_async_task` 工具写入
- `afterAgent`: 成功完成时提取最后消息作为摘要发送
- `wrapModelCall`: 模型调用错误时发送错误通知
- 通知是尽力而为的，失败仅记录警告

---

### 5.9 agent-memory.ts - Agent 内存

**文件路径:** `libs/deepagents/src/middleware/agent-memory.ts`

**功能定位:** (已废弃) 使用直接 Node.js fs 访问加载 agent.md

**状态 Schema:**
```typescript
const AgentMemoryStateSchema = z.object({
  userMemory: z.string().optional(),
  projectMemory: z.string().optional(),
});
```

**迁移路径:**
```typescript
// 已废弃，使用 memory.ts 替代
import { createMemoryMiddleware } from "./memory.js";
const middleware = createMemoryMiddleware({
  backend: new FilesystemBackend({ rootDir: "/" }),
  sources: ["~/.deepagents/AGENTS.md", "./.deepagents/AGENTS.md"],
});
```

---

### 5.10 cache.ts - 缓存断点

**文件路径:** `libs/deepagents/src/middleware/cache.ts`

**功能定位:** 为 Anthropic 提示缓存创建断点，控制哪些内容被缓存。

**核心函数:**
```typescript
createCacheBreakpointMiddleware() => {
  wrapModelCall: (request, handler) => {
    // 获取 systemMessage 的 content blocks
    // 找到最后一个 block，添加 cache_control: { type: "ephemeral" }
    // 这会将之前所有中间件添加的静态内容作为一个缓存单元
  }
}
```

**设计要点:**
- 只标记最后一个 block 为 ephemeral
- 配合 `memoryMiddleware` 的 `addCacheControl` 选项，可创建多个缓存断点
- 非 Anthropic 模型此中间件不启用

---

## 6. 中间件间数据传递

### 6.1 状态通道 (State Schema)

每个中间件通过声明 `stateSchema` 来定义需要持久化的状态:

```typescript
// 例子：summarization 状态
const SummarizationStateSchema = z.object({
  _summarizationSessionId: z.string().optional(),
  _summarizationEvent: SummarizationEventSchema.optional(),
});

// 例子：skills 状态 (使用 ReducedValue 支持并行子代理)
const SkillsStateSchema = new StateSchema({
  skillsMetadata: new ReducedValue(
    z.array(SkillMetadataEntrySchema).default(() => []),
    { reducer: skillsMetadataReducer }
  ),
  files: filesValue,
});
```

### 6.2 状态更新流程

**beforeAgent → 返回更新对象:**
```typescript
// memory.ts 示例
async beforeAgent(state) {
  // 从 backend 加载内存
  const contents = await loadMemoryFromBackend(backend, sources);
  // 返回更新对象，合并到状态
  return { memoryContents: contents };
}
```

**afterAgent → 返回更新对象:**
```typescript
// completion_callback.ts 示例
async afterAgent(state, runtime) {
  const summary = extractLastMessage(state);
  await sendNotification(callbackThreadId, summary);
  return undefined; // 不修改状态
}
```

**wrapModelCall → 返回 Command:**
```typescript
// summarization.ts 示例
return new Command({
  update: {
    _summarizationEvent: { cutoffIndex, summaryMessage, filePath },
    _summarizationSessionId: sessionId,
  },
});
```

### 6.3 Request 对象传递

```typescript
wrapModelCall(request, handler) {
  // request 对象包含:
  // - messages: BaseMessage[]
  // - systemMessage: SystemMessage
  // - tools: (ServerTool | ClientTool)[]
  // - state: Record<string, unknown>
  // - runtime: Runtime
  
  // 可以修改后传递给 handler
  return handler({
    ...request,
    systemMessage: newSystemMessage,
    messages: patchedMessages,
  });
}
```

---

## 7. 设计决策

### 7.1 中间件顺序决策

**问题: 为什么 skills 在 fs 之前?**
- 技能元数据是"关于工具的知识"，不是工具本身
- 技能系统不需要文件系统工具就能工作
- 技能定义的路径在加载时解析，不是每次调用时

**问题: 为什么 subagent 在 fs 之后?**
- 子代理可能需要文件系统工具
- general-purpose 子代理继承主 Agent 的所有工具，包括文件系统

**问题: 为什么 summarization 在 subagent 和 fs 之后?**
- summarization 需要处理工具调用的消息
- fsMiddleware 注册工具到 Agent
- subagentMiddleware 使 Agent 能够委托任务

### 7.2 组合模式决策

**使用数组展平 (spread) 而非嵌套:**
```typescript
// 好：保持扁平，可预测的执行顺序
const middleware = [
  ...builtIn,
  ...optional,
  ...custom,
];

// 避免：嵌套中间件使执行顺序不透明
const middleware = [
  outer(outerOptions, [inner1, inner2]),
];
```

**为什么 customMiddleware 在缓存之前?**
- 用户自定义中间件通常需要处理业务逻辑
- 缓存应该包含尽可能完整的内容
- 用户可能需要控制哪些内容被缓存

**为什么 memory 在最后 (除 HITL 外)?**
- 内存内容可能依赖于 Agent 状态的计算结果
- 内存是动态的，每次调用可能不同
- 太早添加会导致动态内容被意外缓存

### 7.3 Backend 抽象决策

**问题: 为什么 skills 和 memory 使用 BackendProtocol 而 fs 不使用?**

- `fs.ts` 直接注册工具，工具内部使用 backend
- `skills.ts` 和 `memory.ts` 需要在中间件初始化时扫描/加载文件
- BackendProtocol 提供了统一的后端接口，支持:
  - FilesystemBackend (本地文件系统)
  - StateBackend (状态存储)
  - 远程存储适配器

---

*设计文档生成: 2026-04-06*
