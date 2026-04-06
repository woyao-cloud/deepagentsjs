# DeepAgents 设计文档索引

**文档日期:** 2026-04-06

---

## 1. 文档目的

本设计文档系列旨在为 DeepAgents TypeScript 实现提供全面的技术参考，涵盖从高层架构到具体实现的各个层面。适用于以下场景：

- **新成员 onboarding** - 理解系统设计，快速融入开发
- **功能开发** - 了解相关模块的设计决策和实现细节
- **代码审查** - 参照设计文档评估实现方案
- **问题排查** - 定位问题根因，理解模块间交互

---

## 2. 文档结构

```
docs/design-summary/
├── README.md          (本文档) - 文档索引与阅读指南
├── 0_overview.md      - 系统概述、技术栈、架构图
├── 1_agent.md         - Agent 模块设计
├── 2_backend.md       - Backend 存储抽象
├── 3_middleware.md    - 中间件系统
└── 4_skills.md        - 技能加载系统
```

---

## 3. 阅读顺序建议

### 3.1 推荐阅读路径

| 角色               | 推荐顺序          | 理由                                 |
| ------------------ | ----------------- | ------------------------------------ |
| **新成员**         | 0 → 1 → 3 → 2 → 4 | 先全局概览，再核心模块，再到具体实现 |
| **中间件开发者**   | 0 → 3 → 1 → 4     | 中间件是核心扩展机制，需优先掌握     |
| **后端存储开发者** | 0 → 2 → 3 → 4     | Backend 是基础设施，后加载           |
| **Bug 修复**       | 直接查阅相关模块  | 按问题定位文档                       |

### 3.2 阅读时间估算

| 文档              | 预计时间 | 难度 |
| ----------------- | -------- | ---- |
| `0_overview.md`   | 10 分钟  | 入门 |
| `1_agent.md`      | 20 分钟  | 中级 |
| `2_backend.md`    | 25 分钟  | 中级 |
| `3_middleware.md` | 30 分钟  | 高级 |
| `4_skills.md`     | 20 分钟  | 中级 |

---

## 4. 各章节概述

### 4.1 0_overview.md - 系统概述

**核心要点:**

- DeepAgents 定位: 基于 LangGraph 的深度任务执行 Agent 框架
- 解决"浅层 Agent"问题，通过规划工具、子代理、文件系统、详细提示词实现复杂任务处理
- TypeScript + LangGraph + LangChain Core + Zod 技术栈
- Backend 抽象 + 中间件编排 + 渐进式技能披露 三大设计原则

**关键架构图:**

- 高层分层架构 (用户代码 → createDeepAgent → Agent 实例 → Backend → 存储层)
- 数据流图 (invoke → LangGraph 运行时 → 各中间件 → 模型 → 工具处理)

**快速定位:**

- 想了解系统全貌: 阅读此文档
- 想理解技术选型: 阅读"技术栈"和"核心设计原则"章节

---

### 4.2 1_agent.md - Agent 模块设计

**核心要点:**

- `createDeepAgent()` 是唯一入口，负责参数验证、中间件组装、类型推断
- 三种子代理类型: `SubAgent` (规范对象)、`CompiledSubAgent` (预编译)、`AsyncSubAgent` (异步)
- 内置中间件按固定顺序组合，无法自定义顺序
- `ConfigurationError` 统一配置错误处理

**关键类型:**

```typescript
DeepAgent<DeepAgentTypeConfig>;
AnySubAgent = SubAgent | CompiledSubAgent | AsyncSubAgent;
CreateDeepAgentParams;
```

**关键文件:**

- `libs/deepagents/src/agent.ts` - createDeepAgent 实现
- `libs/deepagents/src/types.ts` - 类型定义
- `libs/deepagents/src/errors.ts` - 错误类型

**快速定位:**

- 想创建自定义 Agent: 阅读"API 设计"章节
- 想理解子代理机制: 阅读"类型定义"和"子代理标准化"章节
- 想修改中间件顺序: 阅读"生命周期"章节

---

vtdhjkl'xcvbnnmmm//

### 4.3 2_backend.md - Backend 存储抽象

**核心要点:**

- `BackendProtocol` 统一接口，解耦 Agent 与存储实现
- V1 → V2 协议演进，通过适配器保持向后兼容
- 五种 Backend 类型: State、Store、Filesystem、Composite、Sandbox
- BaseSandbox 零运行时依赖设计，所有文件操作通过 POSIX shell 命令实现

**Backend 类型对比:**

| 类型              | 存储介质        | 生命周期 | 适用场景       |
| ----------------- | --------------- | -------- | -------------- |
| StateBackend      | LangGraph State | 对话内   | 默认，临时文件 |
| StoreBackend      | LangGraph Store | 跨对话   | 持久化记忆     |
| FilesystemBackend | 本地文件系统    | 手动管理 | 真实文件访问   |
| CompositeBackend  | 多 Backend 组合 | 视配置   | 混合存储策略   |
| SandboxBackend    | 远程/本地沙箱   | 独立管理 | 隔离执行环境   |

nn
**关键接口契约:**

- `ls(path)` → `LsResult`
- `read(path, offset?, limit?)` → `ReadResult`
- `write(path, content)` → `WriteResult`
- `edit(path, old, new)` → `EditResult`
- `grep(pattern, path?, glob?)` → `GrepResult`
- `glob(pattern, path?)` → `GlobResult`

**关键文件:**

- `libs/deepagents/src/backends/protocol.ts` - 协议定义
- `libs/deepagents/src/backends/state.ts` - StateBackend
- `libs/deepagents/src/backends/filesystem.ts` - FilesystemBackend
- `libs/deepagents/src/backends/sandbox.ts` - BaseSandbox

**快速定位:**

- 想添加新 Backend: 阅读"协议分层"和现有 Backend 实现
- 想理解路径安全: 阅读 FilesystemBackend 的"虚拟模式路径解析"
- 想理解 Composite 路由: 阅读"Composite 路由"章节

---

### 4.4 3_middleware.md - 中间件系统

**核心要点:**

- 11 个中间件按确定性顺序执行，遵循"先静态后动态，先基础后高级"原则
- 三大钩子函数: `beforeAgent`、`afterAgent`、`wrapModelCall`
- Backend 抽象让中间件可在不同环境移植
- 渐进式披露模式: 摘要中间件在接近上下文限制时才执行

**中间件分类:**

| 类别       | 中间件                       | 职责                   |
| ---------- | ---------------------------- | ---------------------- |
| 任务管理   | todoMiddleware               | Todo 列表读写          |
| 文件系统   | fsMiddleware                 | 文件系统工具注册       |
| 代理委托   | subagentMiddleware           | task 工具 + 子代理分发 |
| 技能系统   | skillsMiddleware             | 技能元数据加载         |
| 内存管理   | memoryMiddleware             | AGENTS.md 加载         |
| 上下文摘要 | summarizationMiddleware      | 历史摘要卸载           |
| 工具修补   | patchToolCallsMiddleware     | 修复工具调用不匹配     |
| 异步代理   | asyncSubAgentMiddleware      | 远程 Agent Protocol    |
| 完成回调   | completionCallbackMiddleware | 异步任务完成通知       |
| 缓存控制   | cacheMiddleware              | Anthropic 提示缓存断点 |
| 人工介入   | hitlMiddleware               | Human-in-the-Loop      |

**状态传递机制:**

- 中间件通过 `stateSchema` 声明持久化状态
- `ReducedValue` 支持并行子代理的状态合并
- `beforeAgent` 返回更新对象，合并到状态
- `wrapModelCall` 返回 `Command` 对象进行状态更新

**关键文件:**

- `libs/deepagents/src/middleware/fs.ts` - 文件系统中间件
- `libs/deepagents/src/middleware/subagents.ts` - 子代理中间件
- `libs/deepagents/src/middleware/skills.ts` - 技能中间件
- `libs/deepagents/src/middleware/summarization.ts` - 摘要中间件

**快速定位:**

- 想添加自定义中间件: 阅读"中间件类型系统"和现有中间件实现
- 想理解顺序设计: 阅读"中间件编排顺序"章节
- 想调试中间件问题: 阅读"中间件间数据传递"章节

---

### 4.5 4_skills.md - 技能加载系统

**核心要点:**

- 遵循 Anthropic Agent Skills 规范 (agentskills.io/specification)
- SKILL.md 文件格式: YAML frontmatter + Markdown 内容
- 渐进式披露: 前端只加载元数据，实际内容按需读取
- 多源分层: 用户技能 → 项目技能 (后者覆盖前者)

**技能定义格式:**

```markdown
---
name: web-research
description: 使用此技能处理网络研究请求
license: MIT
compatibility: Node.js 18+
allowed-tools: read_file write_file web_search
---

# Web Research Skill

## When to Use

- 用户要求研究某个主题时使用
  ...
```

**加载流程:**

1. `listSkills()` 遍历技能目录
2. `parseSkillMetadata()` 解析 YAML frontmatter
3. `validateSkillName()` 校验名称规范
4. SkillsMiddleware 在 `beforeAgent` 时加载元数据
5. `wrapModelCall` 将技能清单注入系统提示词

**关键文件:**

- `libs/deepagents/src/skills/loader.ts` - 技能加载核心
- `libs/deepagents/src/skills/index.ts` - 公共 API
- `libs/deepagents/src/middleware/skills.ts` - 中间件实现

**快速定位:**

- 想创建新技能: 阅读"技能定义格式"和"字段规范"章节
- 想理解加载流程: 阅读"技能加载流程"章节
- 想修改技能发现机制: 阅读"技能分类与发现"章节

---

## 5. 快速链接

### 5.1 核心 API

| API                            | 文档位置          | 说明                  |
| ------------------------------ | ----------------- | --------------------- |
| `createDeepAgent()`            | `1_agent.md`      | 创建 Agent 的唯一入口 |
| `BackendProtocol`              | `2_backend.md`    | 存储后端接口契约      |
| `createSkillsMiddleware()`     | `4_skills.md`     | 技能中间件工厂        |
| `createFilesystemMiddleware()` | `3_middleware.md` | 文件系统中间件工厂    |
| `createSubAgentMiddleware()`   | `3_middleware.md` | 子代理中间件工厂      |

### 5.2 关键类型

| 类型                | 文档位置       | 说明             |
| ------------------- | -------------- | ---------------- |
| `DeepAgent`         | `1_agent.md`   | Agent 实例类型   |
| `AnySubAgent`       | `1_agent.md`   | 子代理联合类型   |
| `BackendProtocolV2` | `2_backend.md` | 当前版本协议接口 |
| `SkillMetadata`     | `4_skills.md`  | 技能元数据类型   |

### 5.3 关键文件索引

**Agent 模块:**

- `libs/deepagents/src/agent.ts` - createDeepAgent 实现
- `libs/deepagents/src/types.ts` - 类型定义
- `libs/deepagents/src/errors.ts` - ConfigurationError

**Backend 模块:**

- `libs/deepagents/src/backends/protocol.ts` - 协议定义
- `libs/deepagents/src/backends/state.ts` - StateBackend
- `libs/deepagents/src/backends/store.ts` - StoreBackend
- `libs/deepagents/src/backends/filesystem.ts` - FilesystemBackend
- `libs/deepagents/src/backends/composite.ts` - CompositeBackend
- `libs/deepagents/src/backends/sandbox.ts` - BaseSandbox

**Middleware 模块:**

- `libs/deepagents/src/middleware/fs.ts` - 文件系统
- `libs/deepagents/src/middleware/subagents.ts` - 子代理
- `libs/deepagents/src/middleware/skills.ts` - 技能
- `libs/deepagents/src/middleware/memory.ts` - 内存
- `libs/deepagents/src/middleware/summarization.ts` - 摘要
- `libs/deepagents/src/middleware/patch_tool_calls.ts` - 工具修补

**Skills 模块:**

- `libs/deepagents/src/skills/loader.ts` - 加载器
- `libs/deepagents/src/skills/index.ts` - 公共 API

---

## 6. 相关资源

- **GitHub 仓库**: https://github.com/langchain-ai/deepagentsjs
- **npm 包**: https://www.npmjs.com/package/deepagents
- **Python 版本**: https://github.com/langchain-ai/deepagents
- **LangChain 文档**: https://js.langchain.com/docs/
- **LangGraph 文档**: https://langchain-ai.github.io/langgraph/

---

_文档索引: 2026-04-06_
