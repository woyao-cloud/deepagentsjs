# SubAgents 实现详解

**分析日期:** 2026-04-06

---

## 1. 功能概述

SubAgents（子代理）是 DeepAgents 中用于**任务委托**的核心机制。当主代理（Supervisor）遇到复杂、多步骤、或可独立执行的任务时，可以将任务委托给子代理处理，子代理完成后返回结构化结果给主代理。

**解决的问题：**
- **上下文隔离**：将高消耗任务（研究、代码分析）隔离到独立上下文，避免污染主对话
- **并行执行**：多个独立子任务可同时委托给不同子代理，提高吞吐量
- **专业分工**：为不同领域（研究、编码、审查）配置专用代理
- **资源控制**：子代理有独立的 token 预算和工具集

**两种子代理类型：**

| 类型 | 实现 | 执行方式 | 状态管理 |
|------|------|----------|----------|
| **Sync SubAgent** | `SubAgent` / `CompiledSubAgent` | 同步调用 `invoke()`，等待完成 | 通过 `EXCLUDED_STATE_KEYS` 过滤返回状态 |
| **Async SubAgent** | `AsyncSubAgent` | 远程 Agent Protocol 服务器，后台运行 | 通过 `asyncTasks` 状态通道追踪 |

---

## 2. 类型系统

### 2.1 Sync SubAgent 类型

```typescript
// libs/deepagents/src/middleware/subagents.ts:267-337
export interface SubAgent {
  /** 唯一标识符，task 工具选择子代理时使用 */
  name: string;

  /** 描述，供 LLM 判断何时使用该子代理 */
  description: string;

  /** 系统提示词 */
  systemPrompt: string;

  /** 子代理工具集，默认为 defaultTools */
  tools?: StructuredTool[];

  /** 模型，默认使用主代理模型 */
  model?: LanguageModelLike | string;

  /** 附加中间件（追加在默认中间件之后） */
  middleware?: readonly AgentMiddleware[];

  /** 人机交互配置 */
  interruptOn?: Record<string, boolean | InterruptOnConfig>;

  /** 技能源路径列表 */
  skills?: string[];

  /** 结构化输出格式 */
  responseFormat?: CreateAgentParams["responseFormat"];
}
```

**CompiledSubAgent**：预编译的子代理（已有 `runnable`）

```typescript
// libs/deepagents/src/middleware/subagents.ts:226-235
export interface CompiledSubAgent<
  TRunnable extends ReactAgent<any> | Runnable = ReactAgent<any> | Runnable,
> {
  name: string;
  description: string;
  runnable: TRunnable; // 预编译的 agent 实例
}
```

### 2.2 Async SubAgent 类型

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:26-41
export interface AsyncSubAgent {
  /** 唯一标识符 */
  name: string;
  /** 描述 */
  description: string;
  /** Agent Protocol 服务器上的 graph 名称 */
  graphId: string;
  /** 服务器 URL */
  url?: string;
  /** 自定义认证头 */
  headers?: Record<string, string>;
}
```

### 2.3 Async Task 追踪状态

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:65-92
export interface AsyncTask {
  taskId: string;       // 与 threadId 相同
  agentName: string;
  threadId: string;
  runId: string;
  status: AsyncTaskStatus; // "pending" | "running" | "success" | "error" | "cancelled" | "timeout" | "interrupted"
  createdAt: string;
  description?: string;
  updatedAt?: string;
  checkedAt?: string;
}
```

### 2.4 类型并集

```typescript
// libs/deepagents/src/types.ts:36
export type AnySubAgent = SubAgent | CompiledSubAgent | AsyncSubAgent;
```

### 2.5 类型层次图

```
AnySubAgent
├── SubAgent (动态创建)
│   ├── name, description, systemPrompt (必填)
│   ├── tools, model, middleware, skills, interruptOn, responseFormat (可选)
│   └── via createAgent() 创建新的 ReactAgent
│
├── CompiledSubAgent (预编译)
│   ├── name, description, runnable (必填)
│   └── 直接使用传入的 runnable，无须创建新 agent
│
└── AsyncSubAgent (远程执行)
    ├── name, description, graphId (必填)
    ├── url, headers (可选)
    └── 通过 LangGraph SDK 连接远程服务器
```

---

## 3. SubAgentMiddleware 完整实现分析

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    主 Agent (Supervisor)                 │
├─────────────────────────────────────────────────────────┤
│  Middleware Pipeline:                                    │
│  → beforeAgent → wrapModelCall → afterAgent             │
├─────────────────────────────────────────────────────────┤
│  Tools:                                                 │
│  └── task(description, subagent_type)  ← task 工具      │
│       │                                                 │
│       │ ToolCall                                        │
│       ▼                                                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │            task 工具实现                           │  │
│  │  1. 验证 subagent_type 存在                        │  │
│  │  2. 获取当前状态，过滤敏感字段                       │  │
│  │  3. 构建子代理输入状态                             │  │
│  │  4. 调用 subagent.invoke(subagentState)           │  │
│  │  5. 处理返回值（Command 或 string）                │  │
│  └──────────────────────────────────────────────────┘  │
│                       │                                 │
│                       ▼                                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │              子代理 (Ephemeral Agent)              │  │
│  │  • 独立中间件栈                                   │  │
│  │  • 独立上下文（过滤后状态 + 任务描述）              │  │
│  │  • 独立工具集                                     │  │
│  │  • 独立模型（可选覆盖）                           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心常量

```typescript
// libs/deepagents/src/middleware/subagents.ts:45-51
/**
 * 在传递给子代理和从子代理返回时排除的状态 key
 */
const EXCLUDED_STATE_KEYS = [
  "messages",           // messages 由 ToolMessage 显式处理
  "todos",              // 无 reducer，无明确语义
  "structuredResponse", // 无 reducer
  "skillsMetadata",      // 子代理加载自己的技能，防止泄露
  "memoryContents",      // 子代理加载自己的内存
] as const;
```

### 3.3 状态过滤函数

```typescript
// libs/deepagents/src/middleware/subagents.ts:388-398
function filterStateForSubagent(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!EXCLUDED_STATE_KEYS.includes(key as never)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
```

**设计意图：** 子代理只应看到它需要知道的状态，防止父代理的内部状态（如 `skillsMetadata`）污染子代理。

### 3.4 返回值处理

```typescript
// libs/deepagents/src/middleware/subagents.ts:412-449
function returnCommandWithStateUpdate(
  result: Record<string, unknown>,
  toolCallId: string,
): Command {
  const stateUpdate = filterStateForSubagent(result);

  let content: string | ContentBlock[];

  if (result.structuredResponse != null) {
    // 结构化响应优先
    content = JSON.stringify(result.structuredResponse);
  } else {
    // 提取最后一条消息
    const messages = result.messages as BaseMessage[];
    const lastMessage = messages?.[messages.length - 1];
    content = lastMessage?.content || "Task completed";

    // 过滤无效块（tool_use, thinking, redacted_thinking）
    if (Array.isArray(content)) {
      content = content.filter(
        (block) => !INVALID_TOOL_MESSAGE_BLOCK_TYPES.includes(block.type),
      );
      if (content.length === 0) {
        content = "Task completed";
      }
    }
  }

  return new Command({
    update: {
      ...stateUpdate,
      messages: [
        new ToolMessage({
          content,
          tool_call_id: toolCallId,
          name: "task",
        }),
      ],
    },
  });
}
```

### 3.5 task 工具创建

```typescript
// libs/deepagents/src/middleware/subagents.ts:580-651
function createTaskTool(options) {
  // ...
  return tool(
    async (input, config): Promise<Command | string> => {
      const { description, subagent_type } = input;

      // 1. 验证 subagent 类型
      if (!(subagent_type in subagentGraphs)) {
        throw new Error(`Error: invoked agent of type ${subagent_type}...`);
      }

      const subagent = subagentGraphs[subagent_type];

      // 2. 获取当前状态并过滤
      const currentState = getCurrentTaskInput<Record<string, unknown>>();
      const subagentState = filterStateForSubagent(currentState);

      // 3. 构建输入消息
      subagentState.messages = [new HumanMessage({ content: description })];

      // 4. 调用子代理
      const result = (await subagent.invoke(subagentState, config)) as Record<string, unknown>;

      // 5. 处理返回
      if (!config.toolCall?.id) {
        // 无 toolCallId 时返回 string
        // ...
      }
      return returnCommandWithStateUpdate(result, config.toolCall.id);
    },
    { name: "task", description: finalTaskDescription, schema: ... }
  );
}
```

### 3.6 子代理实例创建

```typescript
// libs/deepagents/src/middleware/subagents.ts:454-538
function getSubagents(options) {
  // ...
  // 1. 创建 general-purpose 子代理（如启用）
  if (generalPurposeAgent) {
    // general-purpose 子代理继承主代理的技能
    const generalPurposeMiddleware = [...generalPurposeMiddlewareBase];
    agents["general-purpose"] = createAgent({
      model: defaultModel,
      systemPrompt: DEFAULT_SUBAGENT_PROMPT,
      tools: defaultTools,
      middleware: generalPurposeMiddleware,
      name: "general-purpose",
    });
  }

  // 2. 创建自定义子代理
  for (const agentParams of subagents) {
    if ("runnable" in agentParams) {
      // CompiledSubAgent：直接使用
      agents[agentParams.name] = agentParams.runnable;
    } else {
      // SubAgent：创建新 agent
      // 自定义子代理不使用 general-purpose 的技能中间件
      const middleware = agentParams.middleware
        ? [...defaultSubagentMiddleware, ...agentParams.middleware]
        : [...defaultSubagentMiddleware];

      agents[agentParams.name] = createAgent({
        model: agentParams.model ?? defaultModel,
        systemPrompt: agentParams.systemPrompt,
        tools: agentParams.tools ?? defaultTools,
        middleware,
        name: agentParams.name,
        responseFormat: agentParams.responseFormat,
      });
    }
  }

  return { agents, descriptions: subagentDescriptions };
}
```

### 3.7 中间件工厂

```typescript
// libs/deepagents/src/middleware/subagents.ts:683-722
export function createSubAgentMiddleware(options: SubAgentMiddlewareOptions) {
  const taskTool = createTaskTool({ /* ... */ });

  return createMiddleware({
    name: "subAgentMiddleware",
    tools: [taskTool],
    wrapModelCall: async (request, handler) => {
      // 追加 TASK_SYSTEM_PROMPT 到系统消息
      if (systemPrompt !== null) {
        return handler({
          ...request,
          systemMessage: request.systemMessage.concat(
            new SystemMessage({ content: systemPrompt }),
          ),
        });
      }
      return handler(request);
    },
  });
}
```

**关键点：** `wrapModelCall` 拦截 LLM 调用，在系统消息中追加 `TASK_SYSTEM_PROMPT`，告知主代理如何使用 `task` 工具。

---

## 4. AsyncSubAgentMiddleware 完整实现分析

### 4.1 架构对比

| 特性 | Sync SubAgent | Async SubAgent |
|------|---------------|----------------|
| 执行方式 | 同步 `invoke()` | 远程后台执行 |
| 状态追踪 | 无持久化状态通道 | `asyncTasks` 状态通道 |
| 工具数量 | 1 个 (`task`) | 5 个 (`start/check/update/cancel/list`) |
| 生命周期 | 调用即执行 | 启动 → 后台运行 → 检查 → 取消 |
| 使用场景 | 短任务、上下文隔离 | 长任务、外部系统 |

### 4.2 五个工具

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:260-266
export const ASYNC_TASK_TOOL_NAMES = [
  "start_async_task",   // 启动后台任务
  "check_async_task",    // 检查任务状态
  "update_async_task",   // 向运行中任务发送更新
  "cancel_async_task",   // 取消任务
  "list_async_tasks",    // 列出所有追踪的任务
] as const;
```

### 4.3 状态 Schema

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:156-164
const AsyncTaskStateSchema = new StateSchema({
  asyncTasks: new ReducedValue(
    z.record(z.string(), AsyncTaskSchema).default(() => ({})),
    {
      inputSchema: z.record(z.string(), AsyncTaskSchema).optional(),
      reducer: asyncTasksReducer, // 浅合并
    },
  ),
});
```

**Reducer 实现：**

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:177-182
export function asyncTasksReducer(
  existing?: Record<string, AsyncTask>,
  update?: Record<string, AsyncTask>,
): Record<string, AsyncTask> {
  return { ...(existing || {}), ...(update || {}) };
}
```

### 4.4 ClientCache

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:394-445
/**
 * 懒加载、缓存的 LangGraph SDK Client
 * 相同 URL + headers 的 Agent 复用同一个 Client 实例
 */
export class ClientCache {
  private clients = new Map<string, Client>();

  getClient(name: string): Client {
    const spec = this.agents[name];
    const key = this.cacheKey(spec);

    const existing = this.clients.get(key);
    if (existing) return existing;

    const client = new Client({
      apiUrl: spec.url,
      defaultHeaders: headers,
    });
    this.clients.set(key, client);
    return client;
  }
}
```

### 4.5 start_async_task 工具

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:475-547
export function buildStartTool(agentMap, clients, toolDescription) {
  return tool(
    async (input, runtime): Promise<Command | string> => {
      // 1. 验证 agent 类型
      if (!(input.agentName in agentMap)) { /* error */ }

      // 2. 创建远程线程
      const client = clients.getClient(input.agentName);
      const thread = await client.threads.create();

      // 3. 启动运行
      const run = await client.runs.create(thread.thread_id, spec.graphId, {
        input: {
          messages: [{ role: "user", content: input.description }],
          ...callbackContext, // 可选的回调线程 ID
        },
      });

      // 4. 构建 AsyncTask
      const task: AsyncTask = {
        taskId: thread.thread_id,
        agentName: input.agentName,
        threadId: thread.thread_id,
        runId: run.run_id,
        status: "running",
        createdAt: new Date().toISOString(),
        description: input.description,
      };

      // 5. 返回 Command 更新状态
      return new Command({
        update: {
          messages: [new ToolMessage({ content: `Launched async subagent. taskId: ${taskId}`, ... })],
          asyncTasks: { [taskId]: task },
        },
      });
    },
    { name: "start_async_task", schema: ... }
  );
}
```

### 4.6 check_async_task 工具

```typescript
// libs/deepagents/src/middleware/async_subagents.ts:555-622
export function buildCheckTool(clients) {
  return tool(
    async (input, runtime): Promise<Command | string> => {
      // 1. 从状态中获取追踪的任务
      const task = resolveTrackedTask(input.taskId, runtime.state);
      if (typeof task === "string") return task;

      // 2. 获取运行状态
      const run = await client.runs.get(task.threadId, task.runId);

      // 3. 如果成功，获取线程状态提取结果
      if (run.status === "success") {
        const threadState = await client.threads.getState(task.threadId);
        threadValues = threadState.values || {};
      }

      // 4. 构建 CheckResult
      const result = buildCheckResult(run, task.threadId, threadValues);

      // 5. 返回状态更新
      return new Command({
        update: {
          messages: [new ToolMessage({ content: JSON.stringify(result), ... })],
          asyncTasks: { [task.taskId]: updatedTask },
        },
      });
    }
  );
}
```

---

## 5. 执行流程

### 5.1 完整调用时序图

```
用户
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│                      主 Agent (Supervisor)                   │
│  Middleware:                                                 │
│    1. todoListMiddleware                                     │
│    2. filesystemMiddleware                                   │
│    3. subAgentMiddleware ← task 工具在此注册                 │
│    4. summarizationMiddleware                                │
│    5. patchToolCallsMiddleware                               │
└─────────────────────────────────────────────────────────────┘
  │
  │ LLM 选择 task 工具
  │ tool_call: { name: "task", args: { description: "...", subagent_type: "researcher" } }
  ▼
┌─────────────────────────────────────────────────────────────┐
│                    task 工具执行                             │
│  1. getCurrentTaskInput() 获取当前状态                       │
│  2. filterStateForSubagent() 过滤敏感状态                    │
│  3. 构建 subagentState:                                       │
│     { ...filteredState, messages: [HumanMessage(description)] }│
│  4. subagent.invoke(subagentState, config)                  │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│                 子代理 (researcher)                          │
│  • 中间件栈: todoListMiddleware + filesystemMiddleware +   │
│             summarizationMiddleware + 自定义 middleware      │
│  • 工具集: 自定义工具或 defaultTools                         │
│  • 模型: 自定义或 defaultModel                              │
│  • 技能: 无（除非显式指定 skills）                          │
└─────────────────────────────────────────────────────────────┘
  │
  │ 返回 result（包含 messages, structuredResponse 等）
  ▼
┌─────────────────────────────────────────────────────────────┐
│                  返回值处理                                  │
│  if (structuredResponse)                                    │
│    content = JSON.stringify(structuredResponse)             │
│  else                                                       │
│    content = lastMessage.content                           │
│    过滤无效块（tool_use, thinking）                          │
│                                                             │
│  returnCommandWithStateUpdate(result, toolCallId)          │
│  → Command { update: { ...filteredState,                    │
│                         messages: [ToolMessage(content)] }}│
└─────────────────────────────────────────────────────────────┘
  │
  ▼
主 Agent 状态更新，继续执行
```

### 5.2 一般用途子代理 vs 自定义子代理

```
createDeepAgent({ skills: ["/skills/"], subagents: [...] })
                              │
                              ▼
                    ┌─────────────────────┐
                    │  general-purpose     │
                    │  middleware 包含：    │
                    │  主 agent 的 Skills   │
                    │  Middleware           │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  自定义子代理        │
                    │  middleware 不包含   │
                    │  主 agent 的 Skills  │
                    │  除非显式指定 skills │
                    └─────────────────────┘
```

---

## 6. 状态隔离与共享

### 6.1 传递给子代理的状态

```typescript
// 过滤前（主 Agent 状态）
{
  messages: [...],
  files: { "/code/main.ts": {...} },
  todos: [...],
  skillsMetadata: {...},        // ← 排除
  memoryContents: {...},        // ← 排除
  lc_attributes: {...},
}

// 过滤后（子代理状态）
{
  files: { "/code/main.ts": {...} },
  lc_attributes: {...},
  // messages 被替换为 [HumanMessage(description)]
}
```

### 6.2 从子代理返回的状态

```typescript
// EXCLUDED_STATE_KEYS 定义了返回时也排除的 key
// 确保 skillsMetadata, memoryContents 等不泄露到父状态
```

### 6.3 Structured Response 处理

```typescript
// 当子代理设置了 structuredResponse 时
const result = subagent.invoke(subagentState, config);
// result.structuredResponse = { findings: "...", confidence: 0.9 }

// 返回给父代理时
if (result.structuredResponse != null) {
  content = JSON.stringify(result.structuredResponse);
  // → ToolMessage(content: '{"findings":"...","confidence":0.9}')
}
```

---

## 7. 与 LangGraph 的集成

### 7.1 子代理作为 LangGraph 节点

```
┌─────────┐     tool_call: task     ┌───────────────┐
│ Supervisor│ ─────────────────────▶│  task 工具     │
│  Agent   │                        │  (同步调用)    │
└─────────┘                          └───────┬───────┘
      ▲                                      │
      │ Command { update: { messages: [...] }} │
      │                                      ▼
      │                               ┌───────────────┐
      └───────────────────────────────│   researcher   │
            返回 ToolMessage          │   (子代理)     │
                                      └───────────────┘
```

### 7.2 interrupt 和 Human-in-the-Loop

子代理支持 `interruptOn` 配置：

```typescript
// libs/deepagents/src/middleware/subagents.ts:520-522
const interruptOn = agentParams.interruptOn || defaultInterruptOn;
if (interruptOn)
  middleware.push(humanInTheLoopMiddleware({ interruptOn }));
```

---

## 8. 测试用例分析

### 8.1 技能隔离测试

```typescript
// libs/deepagents/src/middleware/subagent.test.ts:54-135
it("should NOT inherit skills for custom subagents", async () => {
  // 主代理配置了 skills: ["/skills/"]
  // 自定义子代理没有指定 skills
  // → 验证子代理系统提示中不包含技能内容
});

it("should inherit skills for general-purpose subagent", async () => {
  // general-purpose 子代理应该继承主代理的技能
  // → 验证子代理系统提示中包含技能内容
});
```

### 8.2 内容块过滤测试

```typescript
// libs/deepagents/src/middleware/subagent.test.ts:289-447
it("should filter tool_use blocks from subagent response content", async () => {
  // 子代理返回内容包含 { type: "tool_use", ... }
  // → 验证 ToolMessage 中已过滤
});

it("should filter thinking blocks from subagent response content", async () => {
  // 子代理返回内容包含 { type: "thinking", ... }
  // → 验证 ToolMessage 中已过滤
});
```

### 8.3 结构化响应测试

```typescript
// libs/deepagents/src/middleware/subagent.test.ts:589-659
it("should serialize structuredResponse as ToolMessage content", async () => {
  // 子代理返回 { messages: [...], structuredResponse: { findings: "..." } }
  // → 验证 ToolMessage content = JSON.stringify(structuredResponse)
});
```

---

## 9. 设计决策

### 9.1 为什么要 EXCLUDED_STATE_KEYS？

- **安全隔离**：防止父代理的内部状态（如 `skillsMetadata`）影响子代理行为
- **避免状态泄露**：子代理加载自己的技能，不应继承父代理的技能元数据
- **语义一致性**：`messages` 在子代理中有不同语义（只有任务描述），所以用 `HumanMessage` 替换

### 9.2 为什么一般用途子代理继承技能，而自定义子代理不继承？

```typescript
// libs/deepagents/src/agent.ts:206-210
/**
 * Custom subagents do NOT inherit skills from the main agent by default.
 * Only the general-purpose subagent inherits the main agent's skills.
 */
```

- **一般用途子代理**被视为主代理的扩展，应有相同能力
- **自定义子代理**通常有特定职责，不需要父代理的全部技能

### 9.3 为什么用 `Runnable` 而非直接用 `ReactAgent`？

```typescript
// CompiledSubAgent 支持任意 runnable
interface CompiledSubAgent<
  TRunnable extends ReactAgent<any> | Runnable = ReactAgent<any> | Runnable,
> {
  runnable: TRunnable;
}
```

- 允许嵌入 `DeepAgent` 作为子代理（层级代理）
- 允许嵌入 `RunnableLambda` 等自定义 runnable
- 最大灵活性

### 9.4 为什么 Async SubAgent 用 5 个工具而非 1 个？

```
Sync:   task(description, subagent_type) → 同步执行 → 返回结果
Async:  start → 返回 taskId → check(taskId) → status/result
        update(taskId, message) → 发送更新
        cancel(taskId) → 停止
        list(statusFilter) → 批量查看
```

- 异步任务需要**生命周期管理**
- **不自动轮询**（Critical Rule），用户显式请求时才检查
- 任务状态通过 `asyncTasks` 状态通道持久化

### 9.5 为什么 content filter 要过滤 tool_use, thinking, redacted_thinking？

这些块类型在 `AIMessage.content` 中可能存在，但在 `ToolMessage.content` 中是无效的：

- `tool_use`：工具调用块，不应作为工具结果内容
- `thinking` / `redacted_thinking`：Anthropic 扩展思考块，不应暴露给父代理
