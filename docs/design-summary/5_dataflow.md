# Dataflow 数据流设计文档

**文档日期:** 2026-04-06

---

## 1. 模块概述

本文档描述 deepagents 框架的核心数据流，包括 Agent 创建、请求处理、工具执行、状态持久化、子代理调用和中间件协作等关键流程。

### 1.1 核心组件关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户调用层                                    │
│   agent.invoke({ messages, ... })                                    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LangGraph 运行时                              │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  中间件管道 (Middleware Pipeline)                           │    │
│   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │    │
│   │  │ todo │→│ fs   │→│ sub  │→│summa │→│patch │→│cache │→... │    │    │
│   │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                 │                                    │
│                                 ▼                                    │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  模型调用 (Model Call) → LLM API                             │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                 │                                    │
│                                 ▼                                    │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  工具执行 (Tool Execution)                                   │    │
│   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │    │
│   │  │  ls    │ │read_file│ │write_file│ │ edit_file │         │    │
│   │  └────────┘ └────────┘ └────────┘ └────────┘               │    │
│   │       │            │            │            │                │    │
│   │       ▼            ▼            ▼            ▼                │    │
│   │  ┌─────────────────────────────────────────────┐            │    │
│   │  │              Backend 抽象层                  │            │    │
│   │  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐  │            │    │
│   │  │  │StateBack│ │StoreBack│ │FilesystemBack│ │            │    │
│   │  │  └─────────┘ └─────────┘ └─────────────┘  │            │    │
│   │  └─────────────────────────────────────────────┘            │    │
│   └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent 创建流程

### 2.1 createDeepAgent() 初始化链路

```
用户代码
    │
    ▼
createDeepAgent(params)
    │
    ├─── 1. 参数解构
    │       ├── model = "claude-sonnet-4-6" (默认)
    │       ├── backend = (config) => new StateBackend(config)
    │       ├── middleware = []
    │       └── subagents = []
    │
    ├─── 2. 配置验证
    │       └── 检查工具名冲突 (BUILTIN_TOOL_NAMES)
    │
    ├─── 3. Anthropic 模型检测
    │       └── isAnthropicModel(model) → cacheMiddleware?
    │
    ├─── 4. 子代理标准化 (normalizeSubagentSpec)
    │       └── 为每个 SubAgent 添加默认中间件栈
    │
    ├─── 5. 内置中间件构建
    │       └── builtInMiddleware = [
    │           todoListMiddleware(),
    │           createFilesystemMiddleware({ backend }),
    │           createSubAgentMiddleware({ ... }),
    │           createSummarizationMiddleware({ ... }),
    │           createPatchToolCallsMiddleware(),
    │       ]
    │
    ├─── 6. 运行时中间件数组组装
    │       └── middleware = [
    │           ...builtInMiddleware,
    │           ...skillsMiddleware,        // 可选
    │           ...asyncSubAgentMiddleware, // 可选
    │           ...customMiddleware,
    │           ...cacheMiddleware,
    │           ...memoryMiddleware,       // 可选
    │           ...hitlMiddleware,          // 可选
    │       ]
    │
    ├─── 7. 系统提示词组合
    │       └── finalSystemPrompt = systemPrompt + BASE_AGENT_PROMPT
    │
    └─── 8. Agent 创建
            └── createAgent({
                    model,
                    systemPrompt: finalSystemPrompt,
                    tools,
                    middleware,
                    responseFormat,
                    contextSchema,
                    checkpointer,
                    store,
                    name,
                }).withConfig({
                    recursionLimit: 10_000,
                    metadata: { ls_integration: "deepagents" },
                })
```

### 2.2 子代理标准化详细流程

```typescript
// normalizeSubagentSpec 为每个子代理添加默认中间件栈
function normalizeSubagentSpec(input: SubAgent): SubAgent {
  const subagentMiddleware = [
    todoListMiddleware(),
    createFilesystemMiddleware({ backend }),
    createSummarizationMiddleware({ backend, model }),
    createPatchToolCallsMiddleware(),
    // 仅当子代理显式指定 skills 时才添加
    ...(input.skills?.length > 0
      ? [createSkillsMiddleware({ backend, sources: input.skills })]
      : []),
    ...(input.middleware ?? []),           // 自定义中间件
    ...cacheMiddleware,                    // Anthropic 缓存
  ];

  return {
    ...input,
    tools: input.tools ?? [],
    middleware: subagentMiddleware,
  };
}
```

**关键设计点:**
- 自定义子代理 **不自动继承** 主 Agent 的技能
- 只有 `general-purpose` 子代理通过 `skills` 参数继承主 Agent 技能
- 中间件按固定顺序组合，保证确定性

---

## 3. 请求处理流程

### 3.1 完整时序图

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  用户    │     │   LangGraph  │     │  中间件管道  │     │  模型调用 │     │   LLM    │
│  代码    │     │   运行时    │     │  (11个)    │     │  包装器    │     │   API    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │                │
     │ invoke()       │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ beforeAgent     │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ ┌────────────────────────────────┐
     │                │                │ │ 1. todoMiddleware.beforeAgent  │
     │                │                │ │ 2. fsMiddleware.beforeAgent    │
     │                │                │ │ 3. subagentMiddleware.beforeAgent │
     │                │                │ │ 4. summarizationMiddleware.beforeAgent │
     │                │                │ │ 5. patchToolCallsMiddleware.beforeAgent │
     │                │                │ │ 6. ... 其他中间件              │
     │                │                │ └────────────────────────────────┘
     │                │                │                │                │
     │                │<───────────────│ (状态合并)     │                │
     │                │                │                │                │
     │                │                │ wrapModelCall  │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ ┌────────────────────────────────┐
     │                │                │                │ │ 1. todoMiddleware.wrapModelCall │
     │                │                │                │ │ 2. skillsMiddleware.wrapModelCall │
     │                │                │                │ │ 3. fsMiddleware.wrapModelCall │
     │                │                │                │ │ 4. subagentMiddleware.wrapModelCall │
     │                │                │                │ │ 5. summarizationMiddleware.wrapModelCall │
     │                │                │                │ │ 6. patchToolCallsMiddleware.wrapModelCall │
     │                │                │                │ │ 7. asyncSubAgentMiddleware.wrapModelCall │
     │                │                │                │ │ 8. customMiddleware.wrapModelCall │
     │                │                │                │ │ 9. cacheMiddleware.wrapModelCall │
     │                │                │                │ │ 10. memoryMiddleware.wrapModelCall │
     │                │                │                │ │ 11. hitlMiddleware.wrapModelCall │
     │                │                │                │ └────────────────────────────────┘
     │                │                │                │                │
     │                │                │                │<──LLM 调用───>│
     │                │                │                │                │
     │                │                │<───────────────│ (响应)       │
     │                │                │                │                │
     │                │ afterAgent     │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ ┌────────────────────────────────┐
     │                │                │ │ 1. todoMiddleware.afterAgent   │
     │                │                │ │ 2. ... 其他中间件              │
     │                │                │ └────────────────────────────────┘
     │                │                │                │                │
     │                │<───────────────│ (状态更新)     │                │
     │                │                │                │                │
     │<───────────────│ (最终结果)     │                │                │
     │                │                │                │                │
```

### 3.2 中间件钩子执行顺序

| 阶段 | 钩子 | 执行内容 |
|------|------|----------|
| **准备阶段** | `beforeAgent` | 状态初始化、技能加载、内存读取 |
| **模型调用** | `wrapModelCall` | 请求修改、系统提示词注入、缓存控制 |
| **后处理阶段** | `afterAgent` | 异步任务通知、状态清理 |

### 3.3 请求对象传递

`wrapModelCall` 中的请求对象结构:

```typescript
interface ModelRequest {
  messages: BaseMessage[];       // 对话历史
  systemMessage: SystemMessage; // 系统提示词
  tools: (ServerTool | ClientTool)[]; // 可用工具
  state: Record<string, unknown>;     // 当前状态
  runtime: Runtime;                    // 运行时上下文
}
```

中间件可以修改请求后传递给下一个中间件:

```typescript
wrapModelCall(request, handler) {
  const modifiedRequest = {
    ...request,
    systemMessage: request.systemMessage.concat(newSkillsSection),
    messages: patchedMessages,
  };
  return handler(modifiedRequest);
}
```

---

## 4. 工具执行流程

### 4.1 工具调用发起 → Backend 执行 → 结果返回

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│   LLM   │     │  Agent  │     │  工具   │     │ Backend │     │ 文件    │     │  结果   │
│         │     │  循环   │     │  包装   │     │ 抽象层  │     │  系统   │     │  组装   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
     │                │                │                │                │                │
     │ tool_call      │                │                │                │                │
     │──────────────>│                │                │                │                │
     │                │                │                │                │                │
     │                │ invoke_tool    │                │                │                │
     │                │──────────────>│                │                │                │
     │                │                │                │                │                │
     │                │                │ 解析工具名和参数 │                │                │
     │                │                │                │                │                │
     │                │                │ ┌────────────────────────────────┐
     │                │                │ │ switch(toolName):              │
     │                │                │ │   "ls"         → ls tool       │
     │                │                │ │   "read_file"  → read tool     │
     │                │                │ │   "write_file" → write tool    │
     │                │                │ │   "edit_file"  → edit tool     │
     │                │                │ │   "glob"       → glob tool      │
     │                │                │ │   "grep"       → grep tool       │
     │                │                │ │   "execute"    → execute tool  │
     │                │                │ └────────────────────────────────┘
     │                │                │                │                │                │
     │                │                │ backend.ls/read/write/...       │                │
     │                │                │───────────────>│                │                │
     │                │                │                │                │                │
     │                │                │                │ StateBackend? │                │
     │                │                │                │ StoreBackend? │                │
     │                │                │                │ FilesystemBackend?               │
     │                │                │                │──────────────>│                │
     │                │                │                │                │                │
     │                │                │                │<──────────────│                │
     │                │                │                │                │                │
     │                │            ToolMessage       │                │                │
     │                │<───────────────│                │                │                │
     │                │                │                │                │                │
     │                │ (决策)        │                │                │                │
     │                │   └── 继续循环? (更多工具调用?) │                │                │
     │                │   └── 结束? (返回最终结果)      │                │                │
     │                │                │                │                │                │
```

### 4.2 文件系统工具详细流程

以 `read_file` 工具为例:

```typescript
// fs.ts 中的工具定义
const readFileTool = tool(
  async (input: { file_path: string; offset?: number; limit?: number }, config) => {
    const { file_path, offset = 0, limit = 100 } = input;

    // 1. 解析后端
    const resolvedBackend = await resolveBackend(backend, { state: getCurrentTaskInput() });

    // 2. 调用后端读取
    const result = await resolvedBackend.read(file_path, offset, limit);

    // 3. 处理结果
    if (result.error) {
      throw new Error(result.error);
    }

    // 4. 类型判断
    if (result.mimeType && !isTextMimeType(result.mimeType)) {
      // 二进制文件处理...
    }

    return result.content;
  },
  {
    name: "read_file",
    description: "...",
    schema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  }
);
```

### 4.3 工具结果截断 (Eviction) 流程

当工具结果过大时，FilesystemMiddleware 会将其卸载到文件系统:

```
工具结果过大?
    │
    ├─── 否 → 直接返回结果给 LLM
    │
    └─── 是
            │
            ├─── 1. 将结果写入后端 (StateBackend.write)
            │
            ├─── 2. 构建预览 (head + tail + truncation notice)
            │
            ├─── 3. 返回替换消息给 LLM:
            │   "Tool result too large, saved at: {file_path}
            │    Preview: {content_sample}"
            │
            └─── 4. LLM 决定是否读取完整内容
                    └── read_file(file_path, offset, limit)
```

---

## 5. 状态持久化时序

### 5.1 StateBackend 写入时机

StateBackend 将文件内容存储在 LangGraph Agent State 中:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   工具调用  │     │  Backend    │     │  LangGraph  │     │   Checkpoint │
│            │     │   抽象层    │     │   状态更新  │     │   持久化    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                │                │                │                │
     │ write_file     │                │                │                │
     │──────────────>│                │                │                │
     │                │                │                │                │
     │                │ StateBackend.write(path, content)               │
     │                │                │                │                │
     │                │ ┌─────────────────────────────────────────────┐
     │                │ │ filesUpdate = {                               │
     │                │ │   [path]: {                                  │
     │                │ │     content: string | Uint8Array,            │
     │                │ │     mimeType: string,                        │
     │                │ │     created_at: ISO8601,                     │
     │                │ │     modified_at: ISO8601,                    │
     │                │ │   }                                          │
     │                │ │ }                                            │
     │                │ └─────────────────────────────────────────────┘
     │                │                │                │                │
     │                │ 返回 Command({ files: filesUpdate })           │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ __pregel_send([["files", update]]) │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ 更新内存状态   │
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │ 写入持久化存储│
     │                │                │                │                │
```

### 5.2 StoreBackend 写入时机

StoreBackend 用于跨会话的持久化存储:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   工具调用  │     │  Backend    │     │  BaseStore  │     │   持久化    │
│            │     │   抽象层    │     │   操作      │     │   存储      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                │                │                │                │
     │ write_file     │                │                │                │
     │──────────────>│                │                │                │
     │                │                │                │                │
     │                │ StoreBackend.write(path, content)               │
     │                │                │                │                │
     │                │                │ store.put(namespace, key, value) │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ 写入 KV 存储  │
     │                │                │                │ (跨会话持久)  │
     │                │                │                │                │
     │                │<──────────────│                │                │
     │                │                │                │                │
     │ 返回 ToolMessage (确认消息)      │                │                │
     │<──────────────│                │                │                │
```

### 5.3 状态更新 Command 结构

```typescript
// LangGraph Command 结构
new Command({
  update: {
    // 文件状态更新
    files: {
      "/path/to/file.txt": {
        content: "file content",
        mimeType: "text/plain",
        created_at: "2026-04-06T10:00:00Z",
        modified_at: "2026-04-06T10:00:00Z",
      },
    },
    // 中间件特定状态
    skillsMetadata: [...],
    asyncTasks: {...},
    // 消息追加
    messages: [new HumanMessage({ content: "..." })],
  },
  // 可选的 goto 命令
  goto?: "my_node",
});
```

---

## 6. 子代理调用流程

### 6.1 SubAgentMiddleware 如何委托任务

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│   LLM   │     │   Agent │     │  Task   │     │ SubAgent│     │  子代理  │
│         │     │  循环   │     │  工具   │     │  工厂   │     │  实例    │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
     │                │                │                │                │
     │ task tool_call │                │                │                │
     │──────────────>│                │                │                │
     │                │                │                │                │
     │                │ 解析参数:      │                │                │
     │                │ { description, subagent_type } │                │
     │                │                │                │                │
     │                │ taskTool.invoke(input, config) │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 验证 subagent_type               │
     │                │                │──────────────>│                │
     │                │                │                │                │
     │                │                │                │ 创建子代理实例│
     │                │                │                │──────────────>│
     │                │                │                │                │
     │                │                │ 过滤状态 (filterStateForSubagent) │
     │                │                │ ┌────────────────────────────────┐
     │                │                │ │ 排除:                          │
     │                │                │ │ - messages (用新 HumanMessage)  │
     │                │                │ │ - todos                         │
     │                │                │ │ - structuredResponse           │
     │                │                │ │ - skillsMetadata                │
     │                │                │ │ - memoryContents                │
     │                │                │ └────────────────────────────────┘
     │                │                │                │                │
     │                │                │ subagentState = {                │
     │                │                │   ...filteredState,              │
     │                │                │   messages: [HumanMessage({     │
     │                │                │     content: description         │
     │                │                │   })]                            │
     │                │                │ }                │                │
     │                │                │                │                │
     │                │                │ subagent.invoke(subagentState)   │
     │                │                │───────────────────────────────>│
     │                │                │                │                │
     │                │                │                │ 子代理执行     │
     │                │                │                │ (独立中间件链) │
     │                │                │                │                │
     │                │                │<──────────────────────────────│
     │                │                │                │                │
     │                │ 返回结果      │                │                │
     │                │<──────────────│                │                │
     │                │                │                │                │
     │                │ 提取最后消息或 structuredResponse              │
     │                │                │                │                │
     │                │ 构建 ToolMessage              │                │
     │                │ 包含子代理返回内容            │                │
     │                │                │                │                │
```

### 6.2 状态过滤逻辑

```typescript
// subagents.ts
const EXCLUDED_STATE_KEYS = [
  "messages",           // 用新的 HumanMessage 替代
  "todos",              // 子代理不继承父代理任务列表
  "structuredResponse", // 结构化响应由子代理自己处理
  "skillsMetadata",     // 子代理加载自己的技能元数据
  "memoryContents",     // 子代理读取自己的内存
] as const;

function filterStateForSubagent(state: Record<string, unknown>) {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!EXCLUDED_STATE_KEYS.includes(key as never)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
```

### 6.3 子代理中间件栈

```
子代理中间件栈 (按执行顺序)
├── todoListMiddleware         (任务管理)
├── createFilesystemMiddleware  (文件系统工具)
├── createSummarizationMiddleware (上下文摘要)
├── createPatchToolCallsMiddleware (工具调用修补)
├── createSkillsMiddleware     (可选：子代理自己的技能)
├── customMiddleware           (子代理自定义中间件)
└── anthropic cacheMiddleware  (可选：Anthropic 缓存)
```

---

## 7. 中间件协作流程

### 7.1 中间件链式调用模型

```
请求进入
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Middleware[0].wrapModelCall(request, Middleware[1].wrapModelCall) │
│                         │                                    │
│                         ▼                                    │
│              ┌────────────────────────────────────────┐      │
│              │ Middleware[1].wrapModelCall(request,   │      │
│              │              Middleware[2].wrapModelCall)│      │
│              │                    │                      │      │
│              │                    ▼                      │      │
│              │         ┌────────────────────┐           │      │
│              │         │ Middleware[N].wrap │           │      │
│              │         │ Call(request,     │           │      │
│              │         │   LLM调用)         │           │      │
│              │         └────────────────────┘           │      │
│              │                    │                      │      │
│              │<───────────────────┘                      │      │
│              └────────────────────────────────────────────┘      │
│                         │                                    │
│<────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
响应返回
```

### 7.2 中间件数据传递示例

以 `skillsMiddleware` + `memoryMiddleware` 为例:

```
初始请求:
{
  systemMessage: SystemMessage("You are a helpful assistant..."),
  messages: [HumanMessage("...")],
  tools: [...],
  state: { skillsMetadata: [], memoryContents: {} },
}

───────────────────────────────────────────────────────────────

SkillsMiddleware.wrapModelCall:
  输入: request.systemMessage
  处理: 追加 SKILLS_SYSTEM_PROMPT 段落
  输出: handler({
    ...request,
    systemMessage: request.systemMessage + skillsSection,
  })

───────────────────────────────────────────────────────────────

MemoryMiddleware.wrapModelCall:
  输入: request.systemMessage (已包含 skillsSection)
  处理: 追加 AGENTS.md 内容
  输出: handler({
    ...request,
    systemMessage: request.systemMessage + memorySection,
  })

───────────────────────────────────────────────────────────────

CacheMiddleware.wrapModelCall:
  输入: request.systemMessage (已包含 skills + memory)
  处理: 为最后一个 block 添加 cache_control: { type: "ephemeral" }
  输出: handler(request)  // 仅修改，不传递修改后的请求

───────────────────────────────────────────────────────────────

最终发送给 LLM:
{
  systemMessage: SystemMessage([
    { type: "text", text: "You are a helpful assistant..." },
    { type: "text", text: skillsSection },      // 被缓存
    { type: "text", text: memorySection },       // 被缓存
    { type: "text", text: "...", cache_control: { type: "ephemeral" } }, // 缓存断点
  ]),
  messages: [...],
  tools: [...],
}
```

### 7.3 状态合并规则

当多个中间件的 `beforeAgent` 返回状态更新时:

```typescript
// LangGraph 自动合并状态更新
// 遵循 StateSchema 中定义的 reducer 规则

// 示例：skillsMetadata 使用 ReducedValue
{
  skillsMetadata: new ReducedValue(
    z.array(SkillMetadataEntrySchema),
    { reducer: skillsMetadataReducer }  // 按 name 去重
  ),
}

// 示例：asyncTasks 使用 ReducedValue
{
  asyncTasks: new ReducedValue(
    z.record(z.string(), AsyncTaskSchema),
    { reducer: asyncTasksReducer }  // 合并任务映射
  ),
}
```

---

## 8. 关键时序图

### 8.1 完整请求处理时序

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│  用户  │  │ Agent  │  │ before │  │ wrap   │  │   LLM  │  │ after  │  │ 结果   │
│       │  │invoke  │  │ Agent  │  │Model   │  │       │  │ Agent  │  │       │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
   │          │           │           │           │           │           │
   │invoke()  │           │           │           │           │           │
   │─────────>│           │           │           │           │           │
   │          │           │           │           │           │           │
   │          │ beforeAgent           │           │           │           │
   │          │──────────>│           │           │           │           │
   │          │           │           │           │           │           │
   │          │           │1.todo.beforeAgent    │           │           │
   │          │           │───────────│           │           │           │
   │          │           │2.fs.beforeAgent      │           │           │
   │          │           │───────────│           │           │           │
   │          │           │3.sub.beforeAgent     │           │           │
   │          │           │───────────│           │           │           │
   │          │           │4.summa.beforeAgent    │           │           │
   │          │           │───────────│           │           │           │
   │          │           │5.patch.beforeAgent   │           │           │
   │          │           │───────────│           │           │           │
   │          │           │<──────────│           │           │           │
   │          │           │状态合并   │           │           │           │
   │          │           │           │           │           │           │
   │          │           │wrapModelCall         │           │           │
   │          │           │──────────>│           │           │           │
   │          │           │           │           │           │           │
   │          │           │           │1.todo.wrapModelCall│           │
   │          │           │           │───────────│           │           │
   │          │           │           │2.skills.wrapModelCall           │
   │          │           │           │───────────│           │           │
   │          │           │           │3.fs.wrapModelCall   │           │
   │          │           │           │───────────│           │           │
   │          │           │           │4.sub.wrapModelCall  │           │
   │          │           │           │───────────│           │           │
   │          │           │           │5.summa.wrapModelCall │           │
   │          │           │           │───────────│           │           │
   │          │           │           │6.patch.wrapModelCall │           │
   │          │           │           │───────────│           │           │
   │          │           │           │7.cache.wrapModelCall │           │
   │          │           │           │───────────│           │           │
   │          │           │           │8.memory.wrapModelCall           │
   │          │           │           │───────────│           │           │
   │          │           │           │<───────────│           │           │
   │          │           │           │           │           │           │
   │          │           │           │ LLM API 调用            │
   │          │           │           │──────────>│           │           │
   │          │           │           │           │           │           │
   │          │           │           │           │ LLM响应   │
   │          │           │           │<──────────│           │           │
   │          │           │           │           │           │           │
   │          │           │afterAgent │           │           │           │
   │          │           │<──────────│           │           │           │
   │          │           │           │           │           │           │
   │          │           │1.todo.afterAgent     │           │           │
   │          │           │───────────│           │           │           │
   │          │           │2.completion.afterAgent           │           │
   │          │           │───────────│           │           │           │
   │          │           │           │           │           │           │
   │          │<─────────│           │           │           │           │
   │          │           │           │           │           │           │
   │返回结果  │           │           │           │           │           │
   │<─────────│           │           │           │           │           │
```

### 8.2 工具执行详细时序

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│  LLM   │  │ Agent  │  │ Tool   │  │Backend │  │State/  │  │ 文件   │  │ Tool   │
│       │  │ Loop   │  │Handler │  │抽象层  │  │Store   │  │ 系统   │  │ Result │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
   │          │           │           │           │           │           │
   │tool_call │           │           │           │           │           │
   │─────────>│           │           │           │           │           │
   │          │           │           │           │           │           │
   │          │invoke_tool           │           │           │           │
   │          │──────────>│           │           │           │           │
   │          │           │           │           │           │           │
   │          │           │解析工具名 │           │           │           │
   │          │           │──────────│           │           │           │
   │          │           │           │           │           │           │
   │          │           │ ┌─────────────────────────────────────────┐
   │          │           │ │ switch(toolName):                        │
   │          │           │ │   "ls" → lsTool                         │
   │          │           │ │   "read_file" → readFileTool           │
   │          │           │ │   "write_file" → writeFileTool         │
   │          │           │ │   "edit_file" → editFileTool          │
   │          │           │ │   "glob" → globTool                    │
   │          │           │ │   "grep" → grepTool                    │
   │          │           │ └─────────────────────────────────────────┘
   │          │           │           │           │           │           │
   │          │           │ backend.operation()│           │           │
   │          │           │───────────────────>│           │           │
   │          │           │           │           │           │           │
   │          │           │           │ StateBackend?│           │           │
   │          │           │           │ StoreBackend? │           │           │
   │          │           │           │ FilesystemBackend?          │           │
   │          │           │           │──────────────>│           │           │
   │          │           │           │           │           │           │
   │          │           │           │           │ read/write/list       │
   │          │           │           │           │────────────>│           │
   │          │           │           │           │           │ 成功      │
   │          │           │           │           │<────────────│           │
   │          │           │           │<──────────│           │           │
   │          │           │           │           │           │           │
   │          │           │ToolMessage│           │           │           │
   │          │<──────────│           │           │           │           │
   │          │           │           │           │           │           │
   │ 决策     │           │           │           │           │           │
   │ └─需要更多工具调用?─>│           │           │           │           │
   │ └─返回最终结果<───────│           │           │           │           │
```

### 8.3 子代理调用时序

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│  LLM   │  │  Task  │  │ Sub    │  │ 状态   │  │ 子代理 │  │子代理  │  │ 结果   │
│       │  │ Tool   │  │ 工厂   │  │ 过滤   │  │ 实例   │  │中间件  │  │ 提取   │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
   │          │           │           │           │           │           │
   │task()    │           │           │           │           │           │
   │─────────>│           │           │           │           │           │
   │          │           │           │           │           │           │
   │          │验证type   │           │           │           │           │
   │          │──────────>│           │           │           │           │
   │          │           │           │           │           │           │
   │          │           │获取当前状态           │           │           │
   │          │           │<──────────│           │           │           │
   │          │           │           │           │           │           │
   │          │           │过滤状态   │           │           │           │
   │          │           │──────────>│           │           │           │
   │          │           │           │           │           │           │
   │          │           │           │排除:msgs,todos,structResponse   │
   │          │           │           │<──────────│           │           │
   │          │           │           │           │           │           │
   │          │           │子代理State│           │           │           │
   │          │           │──────────>│           │           │           │
   │          │           │           │           │           │           │
   │          │           │           │ subagent.invoke(state)        │
   │          │           │           │──────────────────────────────>│
   │          │           │           │           │           │           │
   │          │           │           │           │ │1.beforeAgent      │
   │          │           │           │           │ │2.wrapModelCall    │
   │          │           │           │           │ │3.LLM调用         │
   │          │           │           │           │ │4.afterAgent      │
   │          │           │           │           │           │           │
   │          │           │           │<──────────────────────────────│
   │          │           │           │           │    子代理结果    │
   │          │           │           │           │           │           │
   │          │提取最后消息│           │           │           │           │
   │          │<──────────│           │           │           │           │
   │          │           │           │           │           │           │
   │          │ToolMessage│           │           │           │           │
   │<─────────│           │           │           │           │           │
```

---

## 9. 附录：数据类型速查

### 9.1 Request/Response 类型

| 类型 | 文件 | 说明 |
|------|------|------|
| `ModelRequest` | langchain | wrapModelCall 输入 |
| `ModelResponse` | langchain | LLM 响应 |
| `ToolMessage` | @langchain/core | 工具结果消息 |
| `Command` | @langchain/langgraph | 状态更新命令 |

### 9.2 Backend 类型

| 类型 | 文件 | 说明 |
|------|------|------|
| `StateBackend` | state.ts | 内存状态存储 |
| `StoreBackend` | store.ts | 持久化存储 |
| `FilesystemBackend` | filesystem.ts | 本地文件系统 |
| `CompositeBackend` | composite.ts | 多后端组合 |
| `SandboxBackend` | sandbox.ts | 沙箱执行 |

### 9.3 Middleware 关键类型

| 类型 | 文件 | 说明 |
|------|------|------|
| `AgentMiddleware` | langchain | 中间件类型定义 |
| `createMiddleware` | langchain | 中间件工厂 |
| `SubAgentMiddleware` | subagents.ts | 子代理中间件 |

---

*设计文档生成完毕*
