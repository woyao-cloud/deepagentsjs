# Agent 模块系统设计

**文档日期:** 2026-04-06

---

## 1. 模块概述

### 功能定位

Agent 模块是 deepagents 库的核心入口，提供基于 LangGraph 的生产级 AI Agent 构建能力。该模块将 Filesystem、Tasks、Subagents、Summarization 等能力封装为可组合的中间件系统，同时保持与 Python 版 deepagents 的 1:1 兼容性。

### 核心职责

- **工厂函数**: 提供 `createDeepAgent()` 作为构建 Agent 的单一入口
- **中间件编排**: 按确定性顺序组合内置中间件和自定义中间件
- **类型推断**: 通过复杂的泛型类型系统提供完整的类型安全
- **配置验证**: 在构造时检测无效配置（如工具名冲突）
- **子代理管理**: 支持同步、编译后、异步三种子代理类型

---

## 2. 类型定义

### 2.1 DeepAgentTypeConfig

```typescript
// libs/deepagents/src/types.ts
export interface DeepAgentTypeConfig<
  TResponse extends Record<string, any> | ResponseFormatUndefined =
    | Record<string, any>
    | ResponseFormatUndefined,
  TState extends AnyAnnotationRoot | InteropZodObject | undefined =
    | AnyAnnotationRoot
    | InteropZodObject
    | undefined,
  TContext extends AnyAnnotationRoot | InteropZodObject =
    | AnyAnnotationRoot
    | InteropZodObject,
  TMiddleware extends readonly AgentMiddleware[] = readonly AgentMiddleware[],
  TTools extends readonly (ClientTool | ServerTool)[] = readonly (
    | ClientTool
    | ServerTool
  )[],
  TSubagents extends readonly AnySubAgent[] = readonly AnySubAgent[],
> extends AgentTypeConfig<TResponse, TState, TContext, TMiddleware, TTools> {
  /** The subagents array type for type-safe streaming */
  Subagents: TSubagents;
}
```

**作用:** 类型包，扩展 LangChain 的 `AgentTypeConfig`，添加 `Subagents` 字段用于类型安全的流式调用和委托。

### 2.2 DeepAgent

```typescript
// libs/deepagents/src/types.ts
export type DeepAgent<
  TTypes extends DeepAgentTypeConfig = DeepAgentTypeConfig,
> = ReactAgent<TTypes> & {
  /** Type brand for DeepAgent type inference */
  readonly "~deepAgentTypes": TTypes;
};
```

**作用:** DeepAgent 实例类型，继承自 ReactAgent 并携带类型品牌 `~deepAgentTypes`，用于类型推断。

### 2.3 AnySubAgent

```typescript
// libs/deepagents/src/types.ts
export type AnySubAgent = SubAgent | CompiledSubAgent | AsyncSubAgent;
```

**作用:** 联合类型，表示三种子代理规范：

| 类型 | 来源 | 特点 |
|------|------|------|
| `SubAgent` | 自定义规范对象 | 包含 middleware 数组 |
| `CompiledSubAgent` | 预编译子代理 | 包含 `runnable` 属性 |
| `AsyncSubAgent` | 异步子代理 | 包含 `graphId` 字段 |

### 2.4 CreateDeepAgentParams

```typescript
// libs/deepagents/src/types.ts
export interface CreateDeepAgentParams<
  TResponse extends SupportedResponseFormat = SupportedResponseFormat,
  ContextSchema extends AnnotationRoot<any> | InteropZodObject =
    AnnotationRoot<any>,
  TMiddleware extends readonly AgentMiddleware[] = readonly AgentMiddleware[],
  TSubagents extends readonly AnySubAgent[] = readonly AnySubAgent[],
  TTools extends readonly (ClientTool | ServerTool)[] = readonly (
    | ClientTool
    | ServerTool
  )[],
> {
  model?: BaseLanguageModel | string;
  tools?: TTools | StructuredTool[];
  systemPrompt?: string | SystemMessage;
  middleware?: TMiddleware;
  subagents?: TSubagents;
  responseFormat?: TResponse;
  contextSchema?: ContextSchema;
  checkpointer?: BaseCheckpointSaver | boolean;
  store?: BaseStore;
  backend?:
    | AnyBackendProtocol
    | ((config: { state: unknown; store?: BaseStore }) => AnyBackendProtocol);
  interruptOn?: Record<string, boolean | InterruptOnConfig>;
  name?: string;
  memory?: string[];
  skills?: string[];
}
```

### 2.5 类型关系图

```
AnySubAgent
├── SubAgent (middleware: AgentMiddleware[])
├── CompiledSubAgent (runnable: Runnable)
└── AsyncSubAgent (graphId: string)

DeepAgentTypeConfig
├── TResponse: Record<string, any> | ResponseFormatUndefined
├── TState: AnnotationRoot | InteropZodObject | undefined
├── TContext: AnnotationRoot | InteropZodObject
├── TMiddleware: readonly AgentMiddleware[]
├── TTools: readonly (ClientTool | ServerTool)[]
└── TSubagents: readonly AnySubAgent[]

DeepAgent<TTypes>
└── extends ReactAgent<TTypes>
    └── + "~deepAgentTypes": TTypes (type brand)
```

---

## 3. API 设计

### createDeepAgent()

**文件位置:** `libs/deepagents/src/agent.ts`

```typescript
export function createDeepAgent<
  TResponse extends SupportedResponseFormat = SupportedResponseFormat,
  ContextSchema extends InteropZodObject = InteropZodObject,
  const TMiddleware extends readonly AgentMiddleware[] = readonly [],
  const TSubagents extends readonly AnySubAgent[] = readonly [],
  const TTools extends readonly (ClientTool | ServerTool)[] = readonly [],
>(
  params: CreateDeepAgentParams<
    TResponse,
    ContextSchema,
    TMiddleware,
    TSubagents,
    TTools
  > = {} as CreateDeepAgentParams<...>,
): DeepAgent<DeepAgentTypeConfig<...>>
```

**参数说明:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | `BaseLanguageModel \| string` | `ChatAnthropic("claude-sonnet-4-6")` | 语言模型 |
| `tools` | `(ClientTool \| ServerTool)[]` | `[]` | Agent 可用工具 |
| `systemPrompt` | `string \| SystemMessage` | 基础提示词 | 自定义系统提示 |
| `middleware` | `AgentMiddleware[]` | `[]` | 自定义中间件 |
| `subagents` | `AnySubAgent[]` | `[]` | 子代理规范 |
| `responseFormat` | `SupportedResponseFormat` | `null` | 结构化输出格式 |
| `contextSchema` | `AnnotationRoot \| InteropZodObject` | - | 上下文模式（不持久化） |
| `checkpointer` | `BaseCheckpointSaver \| boolean` | - | 状态持久化检查点 |
| `store` | `BaseStore` | - | 长期记忆存储 |
| `backend` | `AnyBackendProtocol \| function` | `StateBackend` | 文件系统后端 |
| `interruptOn` | `Record<string, boolean \| InterruptOnConfig>` | - | 人工介入配置 |
| `name` | `string` | - | Agent 名称 |
| `memory` | `string[]` | - | 记忆文件路径列表 |
| `skills` | `string[]` | - | 技能源路径列表 |

**返回值:**

返回 `DeepAgent<DeepAgentTypeConfig<...>>` 实例，包含类型品牌 `~deepAgentTypes` 用于类型推断。

**示例:**

```typescript
// libs/deepagents/src/agent.ts
const ResearchMiddleware = createMiddleware({
  name: "ResearchMiddleware",
  stateSchema: z.object({ research: z.string().default("") }),
});

const agent = createDeepAgent({
  middleware: [ResearchMiddleware],
  subagents: [
    { name: "researcher", description: "...", middleware: [CounterMiddleware] }
  ] as const,
});

const result = await agent.invoke({ messages: [...] });
// result.research is properly typed as string
```

---

## 4. 生命周期

Agent 从创建到销毁经历以下阶段：

### 4.1 创建阶段 (createDeepAgent)

```
参数解构 → 配置验证 → 中间件标准化 → 中间件数组组装 → Agent 创建
```

**步骤详解:**

1. **参数解构**: 从 `CreateDeepAgentParams` 提取各配置项
2. **配置验证**:
   - 检查工具名是否与内置工具冲突（`TOOL_NAME_COLLISION`）
3. **子代理标准化** (`normalizeSubagentSpec`):
   - 为自定义 SubAgent 添加默认中间件栈
   - 仅为自定义子代理添加 SkillsMiddleware（主 Agent 的技能不自动继承）
4. **内置中间件构建**:
   ```
   [todoMiddleware, fsMiddleware, subagentMiddleware, summarizationMiddleware, patchToolCallsMiddleware]
   ```
5. **运行时中间件数组组装**（确定性顺序）:
   ```
   [builtin...] → [skills] → [asyncSubAgents] → [customMiddleware] → [cacheMiddleware] → [memory] → [hitl]
   ```
6. **系统提示词组合**: 将用户提供的 `systemPrompt` 与 `BASE_AGENT_PROMPT` 合并
7. **Agent 创建**: 调用 LangChain 的 `createAgent()` 并配置 `recursionLimit: 10_000`

### 4.2 执行阶段 (invoke/stream)

Agent 通过 LangChain 的 `invoke` 或 `stream` 方法执行推理，LangGraph 运行时按配置执行中间件链。

### 4.3 销毁阶段

Agent 是无状态的函数调用，销毁时只需释放引用。带 checkpointer 的 Agent 需显式清理检查点存储。

---

## 5. 状态管理

### 5.1 filesValue

**文件位置:** `libs/deepagents/src/values.ts`

```typescript
export const filesValue = new ReducedValue(
  z.record(z.string(), FileDataSchema).default(() => ({})),
  {
    inputSchema: z.record(z.string(), FileDataSchema.nullable()).optional(),
    reducer: fileDataReducer,
  },
);
```

**用途:** 提供可复用的文件状态 ReducedValue，类似于 LangGraph 的 `messagesValue`。支持：

- 并发更新的自动合并
- 文件删除（通过 `null` 值）
- 键值对形式存储文件路径到 FileData 的映射

### 5.2 状态传递机制

状态通过 LangGraph 的 StateSchema 在中间件间传递：

1. **中间件定义状态**: 通过 `createMiddleware({ stateSchema: z.object({...}) })` 定义
2. **状态归约**: 并行子代理的状态更新通过 reducer 自动合并
3. **子代理状态提取**:

```typescript
// libs/deepagents/src/types.ts
export type FlattenSubAgentMiddleware<T extends readonly AnySubAgent[]> =
  T extends readonly []
    ? readonly []
    : T extends readonly [infer First, ...infer Rest]
      ? Rest extends readonly AnySubAgent[]
        ? readonly [
            ...ExtractSubAgentMiddleware<First>,
            ...FlattenSubAgentMiddleware<Rest>,
          ]
        : ExtractSubAgentMiddleware<First>
      : readonly [];

export type MergedDeepAgentState<
  TMiddleware extends readonly AgentMiddleware[],
  TSubagents extends readonly AnySubAgent[],
> = InferMiddlewareStates<TMiddleware> &
  InferSubAgentMiddlewareStates<TSubagents>;
```

---

## 6. 错误处理

### 6.1 ConfigurationError

**文件位置:** `libs/deepagents/src/errors.ts`

```typescript
export type ConfigurationErrorCode = "TOOL_NAME_COLLISION";

export class ConfigurationError extends Error {
  [CONFIGURATION_ERROR_SYMBOL] = true as const;

  override readonly name: string = "ConfigurationError";

  constructor(
    message: string,
    public readonly code: ConfigurationErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }

  static isInstance(error: unknown): error is ConfigurationError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[CONFIGURATION_ERROR_SYMBOL] === true
    );
  }
}
```

### 6.2 错误使用场景

| 场景 | Code | 触发条件 |
|------|------|----------|
| 工具名冲突 | `TOOL_NAME_COLLISION` | 用户提供的工具名与内置工具名（BUILTIN_TOOL_NAMES）重叠 |

**示例:**

```typescript
// libs/deepagents/src/agent.ts
const collidingTools = tools
  .map((t) => t.name)
  .filter((n) => typeof n === "string" && BUILTIN_TOOL_NAMES.has(n));

if (collidingTools.length > 0) {
  throw new ConfigurationError(
    `Tool name(s) [${collidingTools.join(", ")}] conflict with built-in tools. ` +
      `Rename your custom tools to avoid this.`,
    "TOOL_NAME_COLLISION",
  );
}
```

### 6.3 错误处理模式

- **静态类型守卫**: `ConfigurationError.isInstance(error)` 用于安全类型收窄
- **Symbol 标记**: 使用 `CONFIGURATION_ERROR_SYMBOL` 实现跨 Realm 类型检查
- **链式错误**: 支持 `cause` 参数保留原始错误

---

## 7. 设计决策

### 7.1 中间件顺序确定性

**决策:** 中间件按固定顺序组合，不允许用户自定义顺序。

**理由:**
- 避免中间件依赖关系冲突（如 cache middleware 必须在特定中间件之后）
- 简化调试和可重复性
- 保持与 Python 版本的行为一致

### 7.2 内置中间件不可跳过

**决策:** 内置中间件（todo、filesystem、subagent、summarization、patchToolCalls）总是启用。

**理由:**
- 这些中间件提供核心功能（任务管理、文件系统、子代理委托、历史摘要）
- 允许用户通过参数（`skills`, `memory`, `interruptOn`）控制功能开关，但不提供完全禁用内置中间件的选项

### 7.3 子代理不自动继承主 Agent 技能

**决策:** 自定义子代理默认不继承主 Agent 的 `skills`，只有 `GENERAL_PURPOSE_SUBAGENT` 继承。

**理由:**
- 子代理通常专注于特定任务，不需要主 Agent 的全部技能
- 避免技能冲突和性能开销
- 显式配置更清晰：`subagent.skills = mainAgentSkills` 如有需要

### 7.4 默认模型选择

**决策:** 默认使用 `claude-sonnet-4-6`。

**理由:**
- Sonnet 在成本和能力之间取得平衡
- 与 Python deepagents 的默认行为一致
- Anthropic 模型检测通过 `isAnthropicModel()` 函数实现，用于启用 prompt caching 优化

### 7.5 类型品牌模式

**决策:** 使用 `~deepAgentTypes` Symbol 作为类型品牌。

**理由:**
- 允许从 `DeepAgent` 实例提取完整的类型配置
- 支持 `ResolveDeepAgentTypeConfig`、`InferDeepAgentType` 等工具类型
- 不干扰运行时行为，仅用于编译时类型推断

### 7.6 Backend 工厂模式

**决策:** `backend` 参数可以是实例或工厂函数。

**理由:**
- 工厂函数接收 `{ state, store }` 参数，允许根据运行时状态创建后端
- 保持与 Python 版本的 API 兼容性
- 支持依赖注入模式，便于测试

---

*设计文档生成完毕*
