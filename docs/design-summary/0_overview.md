# DeepAgents 系统概述

**文档日期:** 2026-04-06

---

## 1. 项目定位

### 1.1 DeepAgents 是什么

DeepAgents 是一个 TypeScript 语言实现的 AI Agent 框架，基于 LangGraph 构建，专注于为 AI Agent 提供**深度任务执行能力**。它是从 Python 版 [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) 移植而来，保持 1:1 兼容性。

### 1.2 解决什么问题

传统 LLM Agent 仅通过"工具调用循环"实现，架构浅层，难以规划和执行复杂的长任务。DeepAgents 借鉴 **Deep Research**、**Manus**、**Claude Code** 等成功应用的架构，通过以下组合突破这一限制：

| 能力 | 作用 |
|------|------|
| **规划工具 (Planning Tool)** | 战略级任务分解，将复杂任务拆解为可管理的步骤 |
| **子代理 (Sub-Agents)** | 专业化委托，将子任务交给专注的代理执行 |
| **文件系统 (File System)** | 持久化状态和记忆管理，防止上下文窗口溢出 |
| **详细提示词 (Detailed Prompts)** | 上下文丰富的指令，引导 Agent 按最佳实践执行 |

### 1.3 核心特性

- **任务规划与分解** - 内置 `write_todos` 工具，支持复杂任务的步骤分解和进度跟踪
- **子代理架构** - 通过 `task` 工具委托专业化工作，保持主代理上下文清洁
- **文件系统集成** - 提供 `ls`、`read_file`、`write_file`、`edit_file`、`glob`、`grep` 等工具
- **流式支持** - 实时更新、Token 流式传输、进度追踪
- **LangGraph 驱动** - 构建于 LangGraph 框架之上，可与任何 LangGraph Agent 一样交互
- **TypeScript 优先** - 完整的类型安全和 IntelliSense 支持
- **可扩展** - 中间件系统支持自定义和扩展

---

## 2. 技术栈

### 2.1 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| **TypeScript** | 5.0+ | 开发语言 |
| **LangGraph** | 最新 | Agent 执行引擎和状态管理 |
| **LangChain Core** | 最新 | 工具定义、消息处理、模型集成 |
| **Zod** | 最新 | Schema 验证和类型推导 |
| **yaml** | - | SKILL.md frontmatter 解析 |

### 2.2 关键集成

| 集成 | 用途 |
|------|------|
| **LangSmith** | 云端沙箱托管 (可选) |
| **Agent Client Protocol (ACP)** | 支持 Zed、JetBrains 等 IDE 集成 |
| **Anthropic Models** | 默认模型支持 (Sonnet 4.6)，含提示缓存优化 |

### 2.3 项目结构

```
deepagentsjs/
├── libs/
│   └── deepagents/           # 核心库
│       └── src/
│           ├── agent.ts      # createDeepAgent 工厂函数
│           ├── types.ts      # 类型定义
│           ├── config.ts     # 配置管理
│           ├── errors.ts     # 错误类型
│           ├── values.ts     # 共享状态值
│           ├── backends/     # 存储后端抽象
│           ├── middleware/    # 中间件实现
│           └── skills/       # 技能加载器
└── docs/
    └── design-summary/       # 设计文档
```

---

## 3. 系统架构图

### 3.1 高层分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户代码                                         │
│                                                                              │
│   const agent = createDeepAgent({                                           │
│     model: new ChatAnthropic(...),                                          │
│     tools: [internetSearch],                                                 │
│     systemPrompt: "...",                                                     │
│     subagents: [...],                                                        │
│     middleware: [...],                                                       │
│   });                                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         createDeepAgent()                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. 配置验证 → 2. 中间件标准化 → 3. 内置中间件构建 → 4. 顺序组装       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Agent 实例                                         │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     LangGraph React Agent                              │  │
│  │                                                                       │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │                    Middleware Pipeline                          │ │  │
│  │   │                                                                  │ │  │
│  │   │  1. todoMiddleware          (任务规划)                           │ │  │
│  │   │  2. skillsMiddleware        (技能加载) ←── Backend Protocol     │ │  │
│  │   │  3. fsMiddleware             (文件系统) ←── Backend Protocol     │ │  │
│  │   │  4. subagentMiddleware       (子代理委托)                        │ │  │
│  │   │  5. summarizationMiddleware  (上下文摘要)                       │ │  │
│  │   │  6. patchToolCallsMiddleware (工具调用修补)                     │ │  │
│  │   │  7. asyncSubAgentMiddleware  (异步子代理)                        │ │  │
│  │   │  8. customMiddleware         (用户自定义)                        │ │  │
│  │   │  9. cacheMiddleware          (Anthropic 缓存)                    │ │  │
│  │   │  10. memoryMiddleware        (长期记忆) ←── Backend Protocol    │ │  │
│  │   │  11. hitlMiddleware          (人工介入)                          │ │  │
│  │   │                                                                  │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                          │  │
│  │                              ▼                                          │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │                    Model (LLM)                                   │ │  │
│  │   │            Anthropic / OpenAI / 本地模型                         │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Backend Protocol                                     │
│                                                                              │
│    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│    │ StateBackend │   │ StoreBackend │   │ Filesystem   │                  │
│    │   (内存)     │   │   (持久化)   │   │   Backend    │                  │
│    └──────────────┘   └──────────────┘   └──────────────┘                  │
│                                                                              │
│    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│    │ Composite    │   │  Sandbox     │   │ LocalShell   │                  │
│    │   Backend    │   │   Backends   │   │   Backend    │                  │
│    └──────────────┘   └──────────────┘   └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            存储层                                             │
│                                                                              │
│     LangGraph State   │   LangGraph Store   │   本地文件系统                  │
│     (对话内临时)      │   (跨对话持久化)     │   (真实文件)                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│  invoke({ messages: [...] })               │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  LangGraph 运行时                            │
│                                             │
│  1. beforeAgent(state)                      │
│     - 中间件预处理 (skills 加载, memory 加载) │
│                                             │
│  2. 模型调用 (wrapModelCall)                 │
│     - 技能元数据注入 system prompt           │
│     - 缓存断点标记                           │
│                                             │
│  3. LLM 推理                                 │
│                                             │
│  4. 工具调用处理                             │
│     - task 工具 → 子代理委托                 │
│     - 文件系统工具 → Backend 执行            │
│                                             │
│  5. afterAgent(state, response)             │
│     - 回调通知等后处理                       │
│                                             │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Agent 响应 (DeepAgent 类型)                │
└─────────────────────────────────────────────┘
```

---

## 4. 核心设计原则

### 4.1 Backend 抽象

**原则: 接口与实现分离**

所有文件操作通过 `BackendProtocol` 抽象，不绑定具体存储技术：

```
Agent 工具 (read_file, write_file, ...)
    │
    ▼
BackendProtocol 接口 (统一方法签名)
    │
    ├── StateBackend    → LangGraph State (内存，对话结束消失)
    ├── StoreBackend    → LangGraph Store (持久化，跨对话)
    ├── FilesystemBackend → 本地文件系统 (真实文件)
    ├── CompositeBackend → 前缀路由组合
    └── SandboxBackend  → 远程沙箱 (LangSmith 等)
```

**收益:**
- Agent 代码与存储实现解耦
- 便于测试 (注入 MockBackend)
- 支持混合存储策略

### 4.2 中间件编排

**原则: 确定性顺序，可组合**

中间件按固定顺序执行，确保可预测性和可调试性：

```
用户代码 → createDeepAgent({ middleware: [...] })
                │
                ▼
        ┌───────────────────┐
        │  内置中间件 (固定)  │
        │  todoMiddleware   │
        │  fsMiddleware     │
        │  subagentMiddleware│
        │  summarization... │
        └───────────────────┘
                │
                ▼
        ┌───────────────────┐
        │  可选中间件 (可选)  │
        │  skillsMiddleware │
        │  memoryMiddleware │
        │  hitlMiddleware   │
        └───────────────────┘
                │
                ▼
        ┌───────────────────┐
        │  自定义中间件      │
        │  customMiddleware  │
        └───────────────────┘
```

### 4.3 技能系统

**原则: 渐进式披露 (Progressive Disclosure)**

技能系统只加载元数据到 prompt，实际内容按需读取：

```
阶段1: 感知
├── 系统提示词包含技能清单 (名称 + 描述)
└── Agent 知道存在哪些技能，但不加载具体内容

阶段2: 触发
├── Agent 判断任务匹配某技能
└── 使用 read_file 工具读取 SKILL.md 路径

阶段3: 执行
├── 解析 Markdown 正文中的工作流程
└── 按技能指令执行任务
```

### 4.4 类型安全

**原则: 编译时类型推断，零运行时开销**

通过复杂的泛型类型系统提供完整的类型安全：

```typescript
// 创建时类型推断
const agent = createDeepAgent({
  subagents: [customSubagent],
  middleware: [customMiddleware],
} as const);

// 调用时类型自动推导
const result = await agent.invoke({ messages: [...] });
// result.* 类型正确推断
```

---

## 5. 与 LangGraph/LangChain 的关系

### 5.1 依赖关系

```
deepagents
    │
    ├── 依赖 langchain (工具、消息、模型)
    │
    └── 依赖 langgraph (Agent 运行时、状态管理)

LangChain 生态
    │
    ├── langchain-core      → 核心抽象 (BaseChatModel, BaseTool, ...)
    │
    ├── langgraph           → Agent 执行引擎
    │
    └── @langchain/*         → 各种集成 (Anthropic, OpenAI, Tavily, ...)
```

### 5.2 在 LangChain 生态中的定位

DeepAgents 位于 LangChain 生态的应用层：

```
┌─────────────────────────────────────────────┐
│           应用层 (Your Application)          │
├─────────────────────────────────────────────┤
│              DeepAgents                      │
│  - createDeepAgent() 工厂函数               │
│  - 预置中间件组合                            │
│  - 技能系统、文件后端                        │
├─────────────────────────────────────────────┤
│           LangChain 核心层                   │
│  - createAgent()                            │
│  - 工具定义 (tool)                           │
│  - 中间件系统                                │
│  - 消息处理                                  │
├─────────────────────────────────────────────┤
│            LangGraph 层                      │
│  - State 管理                                │
│  - Checkpoint                               │
│  - Store (持久化)                            │
└─────────────────────────────────────────────┘
```

### 5.3 兼容性保证

- **Python 1:1 兼容**: API 设计与 Python 版保持一致
- **LangChain 兼容**: 使用标准 LangChain 类型和接口
- **LangGraph 兼容**: 返回的 Agent 可用标准 LangGraph API 操作

```typescript
// deepagents 返回的 agent 本质上是 LangGraph Agent
const agent = createDeepAgent({ ... });

// 可以用标准 LangGraph API 操作
const result = await agent.invoke({ messages: [...] });
const stream = await agent.stream({ messages: [...] });

// 支持 LangGraph 的所有特性
agent.checkpointer = new MemorySaver();
agent.store = new InMemoryStore();
```

---

## 6. 快速开始

### 6.1 安装

```bash
npm install deepagents
```

### 6.2 基本使用

```typescript
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import { createDeepAgent } from "deepagents";
import { z } from "zod";

// 定义工具
const internetSearch = tool(async ({ query, maxResults = 5 }) => {
  const tavilySearch = new TavilySearch({ maxResults });
  return await tavilySearch._call({ query });
}, {
  name: "internet_search",
  description: "Run a web search",
  schema: z.object({
    query: z.string().describe("The search query"),
    maxResults: z.number().optional().default(5),
  }),
});

// 创建 Agent
const agent = createDeepAgent({
  tools: [internetSearch],
  systemPrompt: "You are an expert researcher...",
});

// 调用
const result = await agent.invoke({
  messages: [{ role: "user", content: "What is LangGraph?" }],
});
```

---

*系统概述文档: 2026-04-06*
