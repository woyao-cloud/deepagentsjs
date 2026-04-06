# DeepAgents Code Agent 项目需求规格说明书

**文档版本:** 1.0  
**编制日期:** 2026-04-06  
**基于文档:** pro.md (产品说明书 v1.0.0)

---

## 1. 项目概述

### 1.1 项目名称与目标

**项目名称:** DeepAgents Code Agent

**项目目标:** 打造与 Claude Code 相近的**全自动化、可解释、可干预的工程级代码生成系统**，适用于中大型项目的标准化研发流水线。

### 1.2 项目定位

系统以"**工作流驱动 + 规划先行 + 人机协同 + 多智能体并行**"为核心架构，通过读取结构化配置文件，实现从架构设计到代码落地的端到端自动化交付。

### 1.3 核心价值

| 价值点 | 说明 |
|--------|------|
| **工作流驱动** | 自动化解析 workflow.md，支持阶段划分、依赖配置、并行标记与质量门禁 |
| **规划先行** | 强制生成 PLANNING.md，提供结构化开发蓝图，支持人工批注与确认拦截 |
| **多智能体协同** | 动态实例化专业 Sub-Agent（架构师、前后端开发、测试专家、DevOps 等） |
| **并行执行** | 自动识别无依赖模块，并发调度 Sub-Agent，大幅提升交付吞吐 |
| **人机协同** | 关键节点支持人工暂停、修改规划、跳过或回退任务 |

---

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| **DeepAgents** | 基于 LangChain 深度定制的智能代理框架 |
| **Main Agent (Supervisor)** | 主代理，负责解析配置、生成规划、调度 Sub-Agent |
| **Sub-Agent** | 子代理，专业化代理（如 architect、backend-dev），执行具体任务 |
| **workflow.md** | 工作流配置文件，定义开发阶段、任务依赖、模块划分与交付标准 |
| **agent.md** | 智能体角色定义文件，定义 Agent 类型、路由规则 |
| **PLANNING.md** | 规划文档，主 Agent 自动拆解任务后输出的开发蓝图 |
| **DAG** | 有向无环图 (Directed Acyclic Graph)，用于任务调度与依赖管理 |
| **Quality Gate** | 质量门禁，自动化校验（Lint/Test/SchemaCheck） |

---

## 3. 配置文件规范

### 3.1 workflow.md

**用途:** 定义项目的开发流程、阶段划分、任务依赖与交付标准

**规范:**

```markdown
# Workflow Configuration

## Phases

- [Phase N] 阶段名称 (depends: 依赖阶段)
  - Task: 任务名称 (parallel: true/false, owner: 负责人)
```

**示例:**

```markdown
# Workflow Configuration

## Phases

- [Phase 1] 需求分析与架构设计 (depends: none)
- [Phase 2] 核心模块开发 (depends: Phase 1)
  - Task: 商品模块 (parallel: true, owner: backend-dev, frontend-dev)
  - Task: 人员管理模块 (parallel: true, owner: backend-dev, qa-engineer)
- [Phase 3] 联调与测试 (depends: Phase 2)

## Rules

- 每阶段输出必须通过自动化校验（Lint/Test/SchemaCheck）
- 并行任务需使用独立命名空间，避免文件冲突
- 所有变更需自动生成 Commit Message 并推送至 Feature Branch
```

### 3.2 agent.md

**用途:** 定义智能体角色、能力、工具集与任务路由规则

**规范:**

```markdown
# Agent Registry

## Roles

- 角色名: 角色职责说明

## Routing Rules

- 模块名 -> 角色1 + 角色2 (并发/串行)
```

**示例:**

```markdown
# Agent Registry

## Roles

- architect: 负责架构设计、技术选型、PLANNING.md 生成与接口契约定义
- backend-dev: 精通 Python/Go/Java，负责业务逻辑、API 与数据库设计
- frontend-dev: 精通 Vue/React，负责 UI 组件、状态管理与路由
- qa-engineer: 负责单元测试、集成测试用例生成与覆盖率校验

## Routing Rules

- 商品模块 -> backend-dev + frontend-dev (并发)
- 人员管理模块 -> backend-dev + qa-engineer (并发)
- 全局架构/联调 -> architect (串行主导)
```

---

## 4. 功能需求

### 4.1 工作流解析模块 (FR-WF-001)

**需求描述:** 自动解析 `workflow.md` 的 Markdown/YAML 语法，提取开发阶段、任务依赖、模块划分与质量门禁规则。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-WF-001.1 | 工作流解析 | MUST | 解析 Phases、Tasks、depends、parallel 等语法 |
| FR-WF-001.2 | DAG 构建 | MUST | 将任务转换为有向无环图，自动识别可并行叶子节点 |
| FR-WF-001.3 | 规则验证 | MUST | 验证 Rules 语法与语义完整性 |
| FR-WF-001.4 | 阶段推进 | MUST | 读取 workflow.md 下一步指示，自动推进流程 |

**验收标准:**

- [ ] 给定有效 workflow.md，系统能解析所有 Phases 和 Tasks
- [ ] 给定包含依赖的 Phases，系统能构建正确的 DAG
- [ ] 给定 parallel: true 的 Tasks，系统能识别为可并行执行
- [ ] 每阶段执行完成后，系统能读取 workflow.md 进入下一阶段

### 4.2 规划生成模块 (FR-PLAN-001)

**需求描述:** 主 Agent 自动拆解任务，输出结构化 `PLANNING.md`。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-PLAN-001.1 | 任务拆解 | MUST | 将 Phase/Task 拆解为可执行的子任务树 |
| FR-PLAN-001.2 | 规划输出 | MUST | 生成包含技术栈、文件结构、接口契约的 PLANNING.md |
| FR-PLAN-001.3 | 风险预案 | SHOULD | 提供风险识别与应对预案 |
| FR-PLAN-001.4 | 版本对比 | SHOULD | 支持 PLANNING.md 版本对比与人工批注 |
| FR-PLAN-001.5 | 确认拦截 | MUST | 人工确认前不进入执行态 |

**验收标准:**

- [ ] 给定 Phase/Task，系统生成包含任务树、技术栈、文件结构的 PLANNING.md
- [ ] PLANNING.md 包含明确的接口契约（API Schema、数据模型）
- [ ] 规划文档生成后，系统暂停等待人工确认
- [ ] 人工确认后，系统进入执行态

### 4.3 多智能体调度模块 (FR-AGENT-001)

**需求描述:** 基于 `agent.md` 动态实例化专业 Sub-Agent 并调度执行。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-AGENT-001.1 | 角色实例化 | MUST | 根据 agent.md 动态创建 Sub-Agent 实例 |
| FR-AGENT-001.2 | 任务路由 | MUST | 根据 Routing Rules 将任务分配给对应 Agent |
| FR-AGENT-001.3 | 并行调度 | MUST | 自动识别无依赖模块，并发调度 Sub-Agent |
| FR-AGENT-001.4 | 上下文隔离 | MUST | 每个 Sub-Agent 运行在独立沙盒环境中 |
| FR-AGENT-001.5 | 冲突解决 | SHOULD | 共享依赖冲突时自动检测并生成 CONFLICT_REPORT.md |

**验收标准:**

- [ ] 给定 agent.md，系统能实例化 architect、backend-dev 等角色
- [ ] 给定并行任务（如商品模块 + 人员管理模块），系统能并发调度
- [ ] Sub-Agent 之间上下文隔离，不相互干扰
- [ ] 检测到文件冲突时，系统自动生成冲突报告

### 4.4 智能执行模块 (FR-EXEC-001)

**需求描述:** 按规划调度对应 Sub-Agent 进行编码、测试、文档生成。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-EXEC-001.1 | 任务执行 | MUST | Sub-Agent 执行分配的代码开发任务 |
| FR-EXEC-001.2 | 工具调用 | MUST | 支持 LangChain Tool 规范（文件读写、命令执行等） |
| FR-EXEC-001.3 | 记忆管理 | SHOULD | 跨任务保持上下文记忆 |
| FR-EXEC-001.4 | 状态持久化 | MUST | 支持断点续跑（输入 Prompt、输出代码、Token 消耗） |

**验收标准:**

- [ ] Sub-Agent 能执行代码编写、测试生成、文档生成任务
- [ ] 支持代码生成、Lint 检查、单元测试执行等工具调用
- [ ] 中断后使用 --resume 参数能完整恢复执行状态

### 4.5 进度追踪模块 (FR-PROGRESS-001)

**需求描述:** 提供实时进度追踪与可观测性。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-PROGRESS-001.1 | 实时看板 | MUST | 终端输出实时进度（如 Phase 2/3 | 商品模块 85%） |
| FR-PROGRESS-001.2 | 状态报告 | MUST | 自动生成 STATUS.md 与 LOGS/ 目录 |
| FR-PROGRESS-001.3 | 日志记录 | MUST | 记录每个 Sub-Agent 的输入、输出、耗时、Token 消耗 |
| FR-PROGRESS-001.4 | 失败重试 | SHOULD | 任务失败时自动重试并记录错误堆栈 |

**验收标准:**

- [ ] 终端实时显示各模块进度百分比
- [ ] 执行完成后生成 STATUS.md 状态报告
- [ ] LOGS/ 目录包含各 Sub-Agent 的详细执行日志
- [ ] 失败任务自动重试（最多 3 次）

### 4.6 人机协同模块 (FR-HITL-001)

**需求描述:** 关键节点支持人工干预。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-HITL-001.1 | 人工确认 | MUST | 规划阶段、执行前等关键节点暂停等待确认 |
| FR-HITL-001.2 | 规划修改 | MUST | 人工可修改 PLANNING.md 内容 |
| FR-HITL-001.3 | 技术栈指定 | MUST | 人工可指定或覆盖技术选型 |
| FR-HITL-001.4 | 任务跳过/回退 | SHOULD | 人工可跳过或回退指定任务 |

**验收标准:**

- [ ] PLANNING.md 生成后系统暂停，等待人工确认
- [ ] 人工可编辑 PLANNING.md，系统重新加载
- [ ] 人工可指定技术栈（如强制使用 Python 3.11+）
| FR-HITL-001.5 | 安全拦截 | MUST | 危险操作（rm -rf、sudo）需人工二次确认 |

### 4.7 质量门禁模块 (FR-QA-001)

**需求描述:** 集成质量校验，失败时触发修订流程。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-QA-001.1 | Lint 检查 | MUST | 自动运行代码 Lint 校验 |
| FR-QA-001.2 | 单元测试 | MUST | 自动运行单元测试 |
| FR-QA-001.3 | Schema 检查 | SHOULD | API Schema 校验 |
| FR-QA-001.4 | 安全扫描 | SHOULD | 敏感信息泄露扫描 |
| FR-QA-001.5 | 修订流程 | MUST | 失败时自动修订 PLANNING.md 并标记阻塞项 |

**验收标准:**

- [ ] 每阶段输出必须通过 Lint 检查
- [ ] 每阶段输出必须通过单元测试
- [ ] 校验失败时自动触发 PLANNING.md 修订流程

### 4.8 版本控制模块 (FR-VCS-001)

**需求描述:** 自动生成 Git 提交并推送至 Feature Branch。

**详细需求:**

| ID | 需求项 | 优先级 | 说明 |
|----|--------|--------|------|
| FR-VCS-001.1 | 分支创建 | MUST | Sub-Agent 完成模块开发自动创建 feat/agent-{module} 分支 |
| FR-VCS-001.2 | 提交生成 | MUST | 自动生成符合规范的 Commit Message |
| FR-VCS-001.3 | PR 生成 | SHOULD | 支持自动化 Pull Request 生成 |

**验收标准:**

- [ ] 每次 Sub-Agent 完成自动创建 Feature Branch
- [ ] Commit Message 包含任务描述与变更内容
- [ ] 支持自动创建 Pull Request

---

## 5. 非功能需求

### 5.1 性能需求

| ID | 需求项 | 目标值 |
|----|--------|--------|
| NF-PERF-001 | 并行任务加速比 | 3 个并行任务时加速比 ≥ 2.5x |
| NF-PERF-002 | 单任务响应时间 | Sub-Agent 任务启动时间 < 5s |
| NF-PERF-003 | 断点续跑恢复时间 | < 30s 恢复到中断前状态 |

### 5.2 安全性需求

| ID | 需求项 | 说明 |
|----|--------|------|
| NF-SEC-001 | 沙盒隔离 | Sub-Agent 文件读写限制在项目目录内 |
| NF-SEC-002 | 命令白名单 | 仅允许预定义的安全命令执行 |
| NF-SEC-003 | 二次确认 | 危险操作（rm、git push --force）需人工确认 |
| NF-SEC-004 | 敏感信息过滤 | 禁止在日志中输出 API Key、Token 等 |

### 5.3 可用性需求

| ID | 需求项 | 说明 |
|----|--------|------|
| NF-USA-001 | 离线运行 | 支持本地 LLM（Ollama/vLLM）离线运行 |
| NF-USA-002 | 断点续跑 | 支持 --resume 从中断节点恢复 |
| NF-USA-003 | 多模型切换 | 支持 OpenAI / Anthropic / 本地模型无缝切换 |

### 5.4 可维护性需求

| ID | 需求项 | 说明 |
|----|--------|------|
| NF-MTN-001 | 配置即代码 | 所有配置通过 workflow.md 和 agent.md 管理 |
| NF-MTN-002 | 日志可追溯 | 所有 Agent 操作完整记录于 LOGS/ 目录 |

---

## 6. 用例分析 (Use Cases)

### 6.1 用例图

```
                        ┌─────────────────────────────────────────────────────────┐
                        │              DeepAgents Code Agent                      │
                        │                                                        │
  ┌─────────┐           │  ┌──────────────┐    ┌──────────────┐                  │
  │ Developer│──────────│──│ 初始化项目   │    │   启动执行   │                  │
  └─────────┘           │  └──────────────┘    └──────────────┘                  │
                        │        │                     │                          │
                        │        ▼                     ▼                          │
                        │  ┌──────────────────────────────────┐                   │
                        │  │     UC-1: 初始化项目 (init)      │                   │
                        │  │  - deepagents init --name xxx    │                   │
                        │  │  - 生成 workflow.md, agent.md    │                   │
                        │  └──────────────────────────────────┘                   │
                        │                                                        │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-2: 启动规划阶段 (plan)       │                   │
                        │  │  - deepagents run --phase plan  │                   │
                        │  │  - 生成 PLANNING.md              │                   │
                        │  │  - 等待人工确认                  │                   │
                        │  └──────────────────────────────────┘                   │
                        │                    │                                   │
                        │                    ▼                                   │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-3: 确认规划 (confirm)        │                   │
                        │  │  - 编辑/批注 PLANNING.md        │                   │
                        │  │  - deepagents confirm           │                   │
                        │  └──────────────────────────────────┘                   │
                        │                    │                                   │
                        │                    ▼                                   │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-4: 执行阶段 (execute)         │                   │
                        │  │  - 调度 Sub-Agent                │                   │
                        │  │  - 并行/串行执行                  │                   │
                        │  │  - 实时进度追踪                  │                   │
                        │  └──────────────────────────────────┘                   │
                        │                    │                                   │
                        │        ┌───────────┼───────────┐                      │
                        │        ▼           ▼           ▼                      │
                        │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
                        │  │ Architect│ │BackendDev│ │ Frontend │                │
                        │  │  Agent   │ │  Agent   │ │   Dev   │                │
                        │  └──────────┘ └──────────┘ └──────────┘                │
                        │                    │                                   │
                        │                    ▼                                   │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-5: 质量校验 (quality gate)   │                   │
                        │  │  - Lint / Test / SchemaCheck    │                   │
                        │  │  - 失败则修订 PLANNING.md       │                   │
                        │  └──────────────────────────────────┘                   │
                        │                                                        │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-6: 查看状态 (status)         │                   │
                        │  │  - deepagents status --live     │                   │
                        │  │  - deepagents logs --follow    │                   │
                        │  └──────────────────────────────────┘                   │
                        │                                                        │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-7: 断点续跑 (resume)          │                   │
                        │  │  - deepagents run --resume      │                   │
                        │  │  - 恢复中断前状态                │                   │
                        │  └──────────────────────────────────┘                   │
                        │                                                        │
                        │  ┌──────────────────────────────────┐                   │
                        │  │  UC-8: 人机协同 (intervention)   │                   │
                        │  │  - 修改 PLANNING.md              │                   │
                        │  │  - 跳过/回退任务                 │                   │
                        │  │  - 二次确认危险操作              │                   │
                        │  └──────────────────────────────────┘                   │
                        └─────────────────────────────────────────────────────────┘
```

---

### 6.1 UC-1: 初始化项目

**用例编号:** UC-1  
**用例名称:** 初始化项目 (Initialize Project)  
**参与者:** Developer（开发者）

**前置条件:** 开发环境已安装 DeepAgents CLI

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents init --name ecommerce-system` | 系统在当前目录创建项目结构 |
| 2 | | 系统生成 `workflow.md`（默认模板） |
| 3 | | 系统生成 `agent.md`（默认角色定义） |
| 4 | | 系统输出初始化成功信息 |

**项目结构:**

```
ecommerce-system/
├── workflow.md      # 开发流程定义
├── agent.md         # Agent 角色定义
├── PLANNING.md      # 规划文档（初始为空）
├── STATUS.md        # 状态报告（执行后生成）
├── LOGS/            # 日志目录（执行后生成）
└── src/             # 源代码目录（Sub-Agent 生成）
```

**后置条件:** 项目目录包含 `workflow.md` 和 `agent.md` 配置文件

---

### 6.2 UC-2: 启动规划阶段

**用例编号:** UC-2  
**用例名称:** 启动规划阶段 (Start Planning Phase)  
**参与者:** Developer

**前置条件:** 项目目录包含有效的 `workflow.md` 和 `agent.md`

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents run --phase plan` | 系统解析 `workflow.md`，识别所有 Phases |
| 2 | | 系统解析 `agent.md`，实例化角色 |
| 3 | | 主 Agent 分析任务依赖，构建 DAG |
| 4 | | 主 Agent 拆解 Phase 1 任务，生成子任务树 |
| 5 | | 系统生成 `PLANNING.md`（技术栈、文件结构、接口契约） |
| 6 | | 系统输出"等待确认"提示，暂停执行 |

**PLANNING.md 输出内容:**

- 任务拆解树
- 技术栈建议
- 文件结构规划
- API 接口契约（Schema）
- 风险识别与预案
- 预期交付物

**后置条件:** `PLANNING.md` 已生成，系统处于暂停等待确认状态

---

### 6.3 UC-3: 确认规划

**用例编号:** UC-3  
**用例名称:** 确认规划 (Confirm Planning)  
**参与者:** Developer

**前置条件:** `PLANNING.md` 已生成，系统处于暂停状态

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | （可选）编辑 `PLANNING.md`，修改技术栈/任务划分 | Developer 修改规划内容 |
| 2 | （可选）添加批注说明修订原因 | Developer 标注修订点 |
| 3 | 执行 `deepagents confirm --file PLANNING.md` | 系统加载修订后的 `PLANNING.md` |
| 4 | | 系统验证 `PLANNING.md` 格式完整性 |
| 5 | | 系统进入执行态，输出"确认完成，开始执行" |

**备选事件流 - 修订规划:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 3a | 执行 `deepagents confirm --file PLANNING.md --revise` | 系统记录修订历史 |
| 4a | | 系统重新解析修订后的规划 |
| 5a | | 系统输出修订对比，进入确认态 |

**后置条件:** 系统进入执行态，开始调度 Sub-Agent

---

### 6.4 UC-4: 执行阶段

**用例编号:** UC-4  
**用例名称:** 执行阶段 (Execute Phase)  
**参与者:** Developer, Sub-Agent（自动触发）

**前置条件:** 开发者已确认 `PLANNING.md`

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents run --phase execute --parallel --watch` | 系统读取 PLANNING.md |
| 2 | | 系统识别 Phase 2 的并行任务（商品模块 + 人员管理模块） |
| 3 | | 系统并发调度 backend-dev 和 frontend-dev 执行商品模块 |
| 4 | | 系统并发调度 backend-dev 和 qa-engineer 执行人员管理模块 |
| 5 | | 各 Sub-Agent 在独立沙盒中执行任务 |
| 6 | | 实时终端输出进度：`📊 Phase 2/3 \| ✅ 商品模块 (85%)` |
| 7 | | Sub-Agent 完成后，系统合并结果 |
| 8 | | 系统进入 Phase 3（联调与测试） |

**并行执行时序:**

```
Developer
    │
    │ deepagents run --phase execute --parallel
    ▼
Main Agent (Supervisor)
    │
    ├────────────────────────────────────────────┐
    │                                            │
    ▼                                            ▼
Backend-Dev                              Backend-Dev
(商品模块)                                (人员管理模块)
    │                                            │
    ▼                                            ▼
Frontend-Dev                         QA-Engineer
(商品模块)                              (人员管理模块)
    │                                            │
    └──────────────────┬─────────────────────────┘
                       │
                       ▼
                 Main Agent (合并结果)
                       │
                       ▼
               Phase 3: 联调与测试
```

**后置条件:** 当前 Phase 所有任务完成，系统进入下一 Phase 或结束

---

### 6.5 UC-5: 质量校验

**用例编号:** UC-5  
**用例名称:** 质量校验 (Quality Gate)  
**参与者:** System（自动触发）

**前置条件:** Sub-Agent 完成代码编写

**基本事件流:**

| 步骤 | 系统动作 | 说明 |
|------|---------|------|
| 1 | 运行 Lint 检查（ESLint/Pylint） | 代码风格校验 |
| 2 | 运行单元测试（Vitest/Jest/Pytest） | 功能正确性校验 |
| 3 | （可选）运行 Schema 检查 | API 契约校验 |
| 4 | （可选）运行安全扫描 | 敏感信息泄露检测 |
| 5 | 汇总校验结果 | 生成质量报告 |

**校验通过时:**

| 步骤 | 系统动作 |
|------|---------|
| 6 | 输出 `✅ Lint 通过`、`✅ 测试通过` |
| 7 | 自动提交代码到 Feature Branch |
| 8 | 推进到下一任务/Phase |

**校验失败时:**

| 步骤 | 系统动作 |
|------|---------|
| 6 | 输出 `❌ Lint 失败`、`❌ 测试失败` |
| 7 | 生成失败详情报告（LOGS/） |
| 8 | 自动修订 PLANNING.md，标记阻塞项 |
| 9 | 暂停执行，等待人工处理 |

**后置条件:** 校验通过则推进流程；失败则暂停等待人工干预

---

### 6.6 UC-6: 查看状态

**用例编号:** UC-6  
**用例名称:** 查看状态 (Check Status)  
**参与者:** Developer

**前置条件:** 系统正在执行或已执行过任务

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents status --live` | 系统输出实时进度看板 |
| 2 | | 格式：`📊 [Progress] Phase N/M \| ✅ 模块名 (XX%) \| ⏳ 模块名 (YY%)` |
| 3 | 执行 `deepagents logs --agent backend-dev --follow` | 系统输出指定 Agent 的执行日志 |
| 4 | | 日志包含：输入 Prompt、输出代码、Token 消耗、错误堆栈 |

**实时看板示例:**

```
📊 [Progress] Phase 2/3 | ✅ 商品模块 (100%) | ⏳ 人员管理 (40%) | 🔒 依赖校验通过

[backend-dev] 商品模块: ✅ 完成 (耗时: 45s, Tokens: 12,500)
[frontend-dev] 商品模块: ✅ 完成 (耗时: 38s, Tokens: 9,800)
[backend-dev] 人员管理: ⏳ 执行中... (75%)
[qa-engineer] 人员管理: ⏳ 等待 backend-dev 完成...
```

**后置条件:** 无（只读操作）

---

### 6.7 UC-7: 断点续跑

**用例编号:** UC-7  
**用例名称:** 断点续跑 (Resume Execution)  
**参与者:** Developer

**前置条件:** 之前的执行被中断（Ctrl+C、网络中断等）

**基本事件流:**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents run --resume` | 系统读取 LOGS/ 目录中的状态快照 |
| 2 | | 系统恢复：输入 Prompt、输出代码、对话历史 |
| 3 | | 系统定位中断位置（最后成功执行的任务） |
| 4 | | 系统从中断点恢复执行 |
| 5 | | 输出：`🔄 从任务 X 恢复执行` |

**状态快照内容:**

- 已生成的代码文件
- Sub-Agent 内存状态
- 对话历史
- 已完成的 Task 列表
- Token 消耗累计

**后置条件:** 系统从中断点继续执行

---

### 6.8 UC-8: 人机协同

**用例编号:** UC-8  
**用例名称:** 人机协同 (Human-in-the-Loop Intervention)  
**参与者:** Developer

**前置条件:** 系统处于暂停状态（等待确认或质量校验失败）

**干预场景 1: 修改规划**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 编辑 `PLANNING.md`，修改技术选型 | Developer 修改规划 |
| 2 | 执行 `deepagents confirm --file PLANNING.md` | 系统重新加载修订后的规划 |
| 3 | | 系统调整执行计划，应用新规划 |

**干预场景 2: 跳过任务**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents skip --task "文档生成"` | 系统标记任务为跳过 |
| 2 | | 系统推进到下一任务 |

**干预场景 3: 回退任务**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | 执行 `deepagents rollback --task "商品模块"` | 系统撤销商品模块的代码变更 |
| 2 | | 系统重新调度该任务 |

**干预场景 4: 危险操作二次确认**

| 步骤 | 参与者动作 | 系统响应 |
|------|-----------|----------|
| 1 | Sub-Agent 尝试执行 `rm -rf node_modules` | 系统暂停，输出警告 |
| 2 | | 等待 Developer 确认 |
| 3 | Developer 确认执行 | 系统执行危险操作 |
| 3a | Developer 拒绝执行 | 系统跳过该操作，输出警告日志 |

**后置条件:** 人工干预完成后，系统继续执行

---

## 7. 接口需求

### 7.1 CLI 命令接口

```bash
# 初始化项目
deepagents init --name <project-name>

# 启动执行
deepagents run --phase <plan|execute> [--parallel] [--watch] [--resume]

# 确认规划
deepagents confirm --file <planning-file> [--revise]

# 查看状态
deepagents status [--live]
deepagents logs --agent <agent-name> [--follow]

# 人工干预
deepagents skip --task <task-name>
deepagents rollback --task <task-name>

# 危险操作确认
deepagents approve --operation <operation-id>
deepagents reject --operation <operation-id>
```

### 7.2 配置文件接口

**workflow.md 结构:**

```yaml
Phases:
  - name: Phase 1
    depends: none
  - name: Phase 2
    depends: Phase 1
    tasks:
      - name: 任务名
        parallel: true/false
        owner: [agent1, agent2]

Rules:
  - rule: 规则描述
```

**agent.md 结构:**

```yaml
Roles:
  - name: architect
    description: 职责描述
    tools: [tool1, tool2]
  - name: backend-dev
    description: 职责描述
    tools: [tool1, tool2]

RoutingRules:
  - module: 模块名
    agents: [agent1, agent2]
    mode: parallel/sequential
```

---

## 8. 数据流

### 8.1 主数据流

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ workflow.md │────▶│ Main Agent   │────▶│ PLANNING.md  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                    │
                            ▼                    ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   agent.md   │     │  Developer   │
                     └──────────────┘     └──────────────┘
                            │                    │
                            ▼                    ▼
                     ┌──────────────────────────────────┐
                     │        Sub-Agent 调度            │
                     │  ┌─────────┐  ┌─────────┐       │
                     │  │Architect│  │Backend  │ ...   │
                     │  │ Agent   │  │  Dev    │       │
                     │  └────┬────┘  └────┬────┘       │
                     └───────┼────────────┼─────────────┘
                             │            │
                             ▼            ▼
                     ┌──────────────┐ ┌──────────────┐
                     │  质量校验    │ │  代码输出    │
                     │  (Lint/Test)│ │  (src/)     │
                     └──────────────┘ └──────────────┘
                             │            │
                             └─────┬──────┘
                                   ▼
                            ┌──────────────┐
                            │  STATUS.md  │
                            │  + LOGS/    │
                            └──────────────┘
```

---

## 9. 验收标准汇总

### 9.1 功能验收

| 需求ID | 验收标准 | 测试方法 |
|--------|----------|----------|
| FR-WF-001.1 | 解析所有 Phases 和 Tasks | 给定 workflow.md，验证解析结果完整性 |
| FR-WF-001.2 | 构建正确的 DAG | 给定依赖关系，验证拓扑排序正确 |
| FR-WF-001.3 | 识别 parallel: true 任务 | 验证并行任务被正确标记 |
| FR-PLAN-001.1 | 生成包含技术栈的 PLANNING.md | 验证文档包含技术栈、文件结构 |
| FR-PLAN-001.3 | 规划后暂停等待确认 | 验证确认前不进入执行态 |
| FR-AGENT-001.1 | 实例化所有 agent.md 角色 | 验证各角色可独立调用 |
| FR-AGENT-001.3 | 并发调度无依赖任务 | 验证并行任务同时执行 |
| FR-AGENT-001.4 | Sub-Agent 上下文隔离 | 验证各 Agent 状态不相互干扰 |
| FR-EXEC-001.4 | 断点续跑恢复状态 | 中断后 resume，验证状态完整 |
| FR-PROGRESS-001.1 | 实时进度显示 | 验证终端输出实时百分比 |
| FR-PROGRESS-001.2 | 生成 STATUS.md | 验证执行后状态文件存在 |
| FR-HITL-001.1 | 确认前暂停 | 验证规划阶段执行暂停 |
| FR-HITL-001.4 | 危险操作二次确认 | 验证 rm/push 等操作需确认 |
| FR-QA-001.1 | Lint 检查 | 验证代码通过 Lint |
| FR-QA-001.2 | 单元测试 | 验证测试通过 |
| FR-QA-001.5 | 失败时修订规划 | 验证失败后 PLANNING.md 标记阻塞项 |
| FR-VCS-001.1 | 创建 Feature Branch | 验证分支创建成功 |
| FR-VCS-001.2 | 生成 Commit Message | 验证提交信息规范 |

### 9.2 质量门槛

| 指标 | 目标 |
|------|------|
| 功能覆盖率 | ≥ 90% |
| 自动化测试覆盖率 | ≥ 80% |
| CLI 命令可用率 | 100% |
| 断点续跑成功率 | ≥ 95% |

---

**文档结束**
