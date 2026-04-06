# 技术术语表

**文档日期:** 2026-04-06

---

## 1. Agent 相关术语

| 术语 | 定义 |
|------|------|
| **DeepAgent** | 基于 LangGraph 的生产级 AI Agent 类型，继承自 ReactAgent 并携带类型品牌 `~deepAgentTypes`，用于类型推断 |
| **DeepAgentTypeConfig** | 类型包，扩展 LangChain 的 `AgentTypeConfig`，添加 `Subagents` 字段用于类型安全的流式调用和委托 |
| **AnySubAgent** | 联合类型，表示三种子代理规范的联合：`SubAgent | CompiledSubAgent | AsyncSubAgent` |
| **SubAgent** | 自定义子代理规范对象，包含 `middleware` 数组、`name`、`description`、`systemPrompt` 等字段 |
| **CompiledSubAgent** | 预编译子代理，包含 `runnable` 属性（Runnable 对象），已编译为可执行图 |
| **AsyncSubAgent** | 异步子代理，包含 `graphId` 字段，用于连接远程 Agent Protocol 服务器 |
| **createDeepAgent()** | 工厂函数，作为构建 DeepAgent 的单一入口，负责参数验证、中间件编排和 Agent 创建 |
| **CreateDeepAgentParams** | 创建 DeepAgent 的参数接口，包含 model、tools、middleware、subagents、responseFormat 等配置项 |
| **GENERAL_PURPOSE_SUBAGENT** | 内置通用子代理，默认继承主 Agent 的所有工具和技能 |
| **ConfigurationError** | 配置错误类型，当工具名冲突等配置问题时抛出 |
| **TOOL_NAME_COLLISION** | 错误代码，表示用户提供的工具名与内置工具名重叠 |
| **BUILTIN_TOOL_NAMES** | 内置工具名集合，包含 todoMiddleware 等内置工具的名称 |
| **~deepAgentTypes** | Symbol 类型品牌，用于从 DeepAgent 实例提取完整的类型配置 |

---

## 2. Backend 相关术语

| 术语 | 定义 |
|------|------|
| **BackendProtocol** | Backend 模块的核心存储抽象层，为 AI Agent 提供统一的文件操作接口，将底层存储实现与上层工具调用解耦 |
| **BackendProtocolV1** | V1 协议接口（已废弃），read 返回 `string`，grep 返回 `GrepMatch[] \| string`，方法名为 `lsInfo`、`globInfo` |
| **BackendProtocolV2** | V2 协议接口（当前版本），所有操作返回统一的 Result 对象，方法名为 `ls`、`glob` |
| **StateBackend** | 内存存储后端，文件随对话存在，线程结束后消失（ephemeral），利用 LangGraph checkpoint 机制持久化状态 |
| **StoreBackend** | 持久化存储后端，跨对话线程共享，使用 LangGraph BaseStore，支持命名空间隔离 |
| **FilesystemBackend** | 本地文件系统后端，直接读写真实文件系统路径，支持虚拟模式限制路径遍历 |
| **CompositeBackend** | 多 Backend 组合，通过最长前缀匹配实现路径分发到不同后端，根路径 `/` 聚合所有子 Backend |
| **SandboxBackendProtocolV2** | 沙箱协议，继承自 `BackendProtocolV2`，额外添加 `execute()` 方法和 `id` 属性 |
| **BaseSandbox** | 沙箱抽象基类，实现文件操作（ls/read/write/edit/grep/glob），抽象 `execute()` 方法，依赖纯 POSIX shell 命令 |
| **LocalShellBackend** | 本地 shell 执行后端，继承 `FilesystemBackend`，直接在宿主机执行 shell 命令，无沙箱隔离 |
| **LangSmithSandbox** | LangSmith 沙箱云服务封装，连接远程沙箱执行环境，支持模板化创建和自动超时控制 |
| **adaptBackendProtocol** | 协议适配器函数，将 V1 Backend 自动适配为 V2，实现方法名映射和返回值包装 |
| **isSandboxProtocol** | 类型守卫函数，通过检查 `execute` 方法和 `id` 属性判断是否为 Sandbox 协议 |
| **SandboxClient** | LangSmith 沙箱客户端，用于创建和管理远程沙箱实例 |

---

## 3. Middleware 相关术语

| 术语 | 定义 |
|------|------|
| **AgentMiddleware** | 中间件类型定义，包含 `name`、`stateSchema`、`tools`、`beforeAgent`、`afterAgent`、`wrapModelCall` 属性 |
| **todoListMiddleware** | 任务管理中间件，内置于 langchain，提供 Todo 列表读写能力 |
| **createFilesystemMiddleware** | 文件系统中间件工厂函数，注册 read_file、write_file、edit_file、ls、glob、grep、mv、rm、mkdir、rmdir 等工具 |
| **createSubAgentMiddleware** | 子代理委托中间件，提供 `task` 工具，允许 Agent 委托复杂任务给专门的子代理 |
| **createSkillsMiddleware** | 技能加载中间件工厂函数，实现技能元数据加载与 prompt 注入，支持渐进式披露 |
| **createMemoryMiddleware** | 内存中间件工厂函数，加载 AGENTS.md 文件内容到系统提示词，实现长期记忆 |
| **createSummarizationMiddleware** | 上下文摘要中间件工厂函数，当对话历史接近模型上下文限制时自动摘要旧消息并卸载到后端存储 |
| **createPatchToolCallsMiddleware** | 工具调用修补中间件工厂函数，修复 AIMessage.tool_calls 与 ToolMessage 响应之间的不匹配问题 |
| **createAsyncSubAgentMiddleware** | 异步子代理中间件，连接远程 Agent Protocol 服务器，运行长时间后台任务 |
| **createCompletionCallbackMiddleware** | 完成回调中间件工厂函数，为异步子代理添加完成通知机制，通知父 Agent 的回调线程 |
| **createCacheBreakpointMiddleware** | 缓存断点中间件工厂函数，为 Anthropic 提示缓存创建断点，控制哪些内容被缓存 |
| **createAgentMemoryMiddleware** | Agent 内存中间件工厂函数（已废弃），使用直接 Node.js fs 访问加载 agent.md |
| **wrapModelCall** | 中间件钩子函数，拦截模型调用请求，可以修改 systemMessage、messages 或 tools |
| **beforeAgent** | 中间件钩子函数，在 Agent 执行前运行，返回状态更新对象 |
| **afterAgent** | 中间件钩子函数，在 Agent 执行后运行，可发送通知或进行状态更新 |
| **StateSchema** | 状态模式类型，定义中间件需要持久化的状态结构 |
| **ReducedValue** | 归约值类型，支持并发更新的自动合并，用于状态字段如 filesValue、skillsMetadata |
| **cacheMiddleware** | Anthropic 缓存控制中间件，在几乎所有内容都准备好后添加缓存控制断点 |
| **hitlMiddleware** | Human-in-the-Loop 中间件，在所有处理完成后、提交给模型之前拦截 |

---

## 4. Skill 相关术语

| 术语 | 定义 |
|------|------|
| **SKILL.md** | 技能定义文件格式，采用 YAML frontmatter + Markdown 正文，支持 name、description、license、compatibility、allowed-tools 等字段 |
| **SkillMetadata** | 技能元数据类型，包含 name、description、path、source、license、compatibility、metadata、allowedTools 字段 |
| **SkillMetadataEntry** | 技能元数据条目 Schema，用于类型验证和状态存储 |
| **SkillMetadataEntrySchema** | Zod Schema，验证技能元数据条目的结构和约束 |
| **listSkills()** | 技能列表加载入口函数，按优先级合并加载用户技能和项目技能，后加载的同名技能覆盖先加载的 |
| **listSkillsFromDir()** | 从文件系统目录加载技能的函数，遍历子目录查找包含 SKILL.md 的目录 |
| **listSkillsFromBackend()** | 从后端协议加载技能的函数，支持文件系统、状态存储等多种后端 |
| **parseSkillMetadata()** | 解析单个 SKILL.md 文件的函数，提取 YAML frontmatter 元数据并验证必填字段 |
| **parseSkillMetadataFromContent()** | 解析字符串内容的函数（用于后端无关场景），使用正则提取 frontmatter |
| **validateSkillName()** | 技能名称验证函数，验证 name 必须与目录名一致，符合 Unicode lowercase alphanumeric + 单连字符规范 |
| **skillsMetadataReducer** | 状态归约函数，按名称去重合并并行子代理的技能元数据 |
| **MAX_SKILL_FILE_SIZE** | 技能文件大小限制，默认 10MB |
| **MAX_SKILL_NAME_LENGTH** | 技能名称最大长度，默认 64 字符 |
| **MAX_SKILL_DESCRIPTION_LENGTH** | 技能描述最大长度，默认 1024 字符 |
| **progressive disclosure** | 渐进式披露模式，技能元数据早期注入 prompt，实际内容按需读取 |
| **userSkillsDir** | 用户技能目录，如 `~/.deepagents/<agent-name>/skills/` |
| **projectSkillsDir** | 项目技能目录，如 `<project>/.deepagents/skills/` |
| **source** | 技能来源标识，`"user"` 表示用户技能，`"project"` 表示项目技能 |

---

## 5. 协议与版本

| 术语 | 定义 |
|------|------|
| **BackendProtocolV1** | V1 协议接口（已废弃），read 返回 `string`，grep 返回 `GrepMatch[] \| string`，ls 方法名为 `lsInfo`，glob 方法名为 `globInfo`，错误处理为类型混合 |
| **BackendProtocolV2** | V2 协议接口（当前版本），所有操作返回统一的 Result 对象（包含 error/content 字段），方法名为 `ls`、`glob` |
| **adaptBackendProtocol** | 协议适配器，自动将 V1 Backend 适配为 V2，负责方法名映射和返回值包装 |
| **adaptSandboxProtocol** | 沙箱协议适配器，将 Sandbox 协议适配为标准 Backend 协议 |
| **isSandboxBackend** | 类型守卫函数，检查对象是否为沙箱后端实现 |
| **isSandboxProtocol** | 类型守卫函数，通过检查 `execute` 方法和 `id` 属性判断是否为 Sandbox 协议 |
| **MaybePromise** | 可能为 Promise 的类型包装器，用于支持同步和异步方法签名 |
| **Result** | 统一结果类型，包含 `error?: string` 字段，所有 V2 操作返回此类型 |

---

## 6. 状态与存储

| 术语 | 定义 |
|------|------|
| **State** | LangGraph Agent 状态对象，在中间件间传递，包含 messages、todos、files 等字段 |
| **filesValue** | 可复用的文件状态 ReducedValue，类似 LangGraph 的 `messagesValue`，支持并发更新的自动合并和文件删除 |
| **FileData** | 文件数据结构，包含 `content`（string 或 Uint8Array）、`mimeType`、`created_at`、`modified_at` 字段 |
| **FileDataV1** | V1 文件数据格式，使用 `content: string[]`（按行存储），不支持二进制 |
| **FileDataV2** | V2 文件数据格式，使用 `content: string | Uint8Array`，支持 MIME 类型 |
| **migrateToFileDataV2** | 迁移函数，将 V1 FileData 转换为 V2 格式 |
| **StateValue** | 状态值抽象，用于声明需要持久化的状态字段及其归约方式 |
| **ephemeral** | 临时性存储特性，文件随对话存在，线程结束后消失（如 StateBackend） |
| **persistent** | 持久化存储特性，跨对话线程共享（如 StoreBackend） |
| **ReducedValue** | 归约值类型，声明状态的输入Schema和归约函数，支持并行更新的自动合并 |
| **fileDataReducer** | 文件数据归约函数，处理并发更新的合并和删除（通过 `null` 值） |
| **StateSchema** | 状态模式，定义一组命名的状态字段及其类型 |
| **checkpoint** | LangGraph 检查点机制，用于持久化 Agent 状态，支持从中断点恢复执行 |
| **BaseCheckpointSaver** | LangGraph 检查点保存器接口 |
| **BaseStore** | LangGraph 基础存储接口，用于跨线程共享的持久化存储 |
| **namespace** | 命名空间，StoreBackend 用于隔离不同 Assistant 或组织的数据 |
| **filesUpdate** | 文件更新字段，用于 LangGraph 的 Command 对象，StateBackend 返回此字段触发状态更新 |
| **filesUpdate: null** | 约定，表示外部存储（Filesystem/Store）无需状态更新 |
| **Command** | LangGraph Command 对象，用于返回状态更新指令 |

---

## 附录：文件类型定义速查

| 术语 | 定义 |
|------|------|
| **LsResult** | `ls` 操作返回结构，包含 `error?: string` 和 `files?: FileInfo[]` |
| **ReadResult** | `read` 操作返回结构，包含 `error?: string`、`content?: string | Uint8Array`、`mimeType?: string` |
| **ReadRawResult** | `readRaw` 操作返回结构，包含 `error?: string` 和 `data?: FileData` |
| **WriteResult** | `write` 操作返回结构，包含 `error?: string`、`path?: string`、`filesUpdate?: Record<string, FileData> | null` |
| **EditResult** | `edit` 操作返回结构，包含 `error?: string`、`path?: string`、`occurrences?: number`、`filesUpdate?: ...` |
| **GrepResult** | `grep` 操作返回结构，包含 `error?: string` 和 `matches?: GrepMatch[]` |
| **GlobResult** | `glob` 操作返回结构，包含 `error?: string` 和 `files?: FileInfo[]` |
| **ExecuteResponse** | `execute` 操作返回结构，包含 `output: string`、`exitCode: number | null`、`truncated: boolean` |
| **FileInfo** | 文件信息结构，包含 `path`、`is_dir?: boolean`、`size?: number`、`modified_at?: string` |
| **GrepMatch** | grep 搜索匹配结果，包含 `path: string`、`line: number`（1-indexed）、`text: string` |
| **FileUploadResponse** | 文件上传响应，包含 `path: string`、`error: FileOperationError | null` |
| **FileDownloadResponse** | 文件下载响应，包含 `path: string`、`content: Uint8Array | null`、`error: FileOperationError | null` |
| **FileOperationError** | 文件操作错误码类型：`"file_not_found" | "permission_denied" | "is_directory" | "invalid_path"` |

---

*术语表生成完毕*
