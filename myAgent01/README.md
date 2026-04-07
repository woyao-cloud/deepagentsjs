# myAgent01 - DeepAgents Code Agent

A TypeScript-based multi-agent code generation system based on the DeepAgents architecture.

## Features

- **Workflow-Driven Development**: Parse `workflow.md` and execute phases with DAG-based task scheduling
- **Multi-Agent Orchestration**: Specialized Sub-Agents (architect, backend-dev, frontend-dev, qa-engineer)
- **Planning Generation**: Auto-generate `PLANNING.md` with task trees, tech stack recommendations, and API contracts
- **Human-in-the-Loop**: Key checkpoints for human confirmation and intervention
- **Memory Management**: Working, Short-term, and Long-term memory layers
- **Token Budget Management**: Hierarchical budgets (Global → Agent → Task)
- **Quality Gates**: Lint, Test, and Schema validation

## Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Project Structure

```
myAgent01/
├── src/
│   ├── types/           # Type definitions (workflow, agent, task, memory, token, checkpoint, planning)
│   ├── utils/           # Utilities (logger, file-utils, id-generator, validation)
│   ├── config/          # Configuration parsers (workflow-parser, agent-parser)
│   ├── core/            # Core modules (dag, workflow-manager, planning-generator)
│   ├── agents/          # Agent implementations (base-agent, main-agent)
│   ├── memory/          # Memory management (working-memory)
│   ├── token/           # Token budget tracking (token-tracker)
│   └── cli/             # CLI commands (init, run, confirm, status, logs, skip, rollback)
├── test/
│   └── unit/            # Unit tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── IMPLEMENTATION_PLAN.md
```

## CLI Commands

```bash
# Initialize a new project
deepagents init --name my-project

# Run workflow phase
deepagents run --phase plan      # Generate planning
deepagents run --phase execute  # Execute planned tasks

# Confirm planning
deepagents confirm --file PLANNING.md

# View status and logs
deepagents status [--live]
deepagents logs --agent backend-dev [--follow]

# Human intervention
deepagents skip --task <task-name>
deepagents rollback --task <task-name>
```

## Configuration Files

### workflow.md

```markdown
# Workflow Configuration

## Phases

- [Phase 1] 需求分析与架构设计 (depends: none)
  - Task: 架构设计 (parallel: false, owner: architect)

- [Phase 2] 核心模块开发 (depends: Phase 1)
  - Task: 商品模块 (parallel: true, owner: backend-dev, frontend-dev)

## Rules

- 每阶段输出必须通过自动化校验（Lint/Test）
```

### agent.md

```markdown
# Agent Registry

## Roles

- architect: 负责架构设计、技术选型
- backend-dev: 精通 Python/Go/Java，负责业务逻辑
- frontend-dev: 精通 Vue/React，负责 UI 组件
- qa-engineer: 负责测试用例生成与覆盖率校验

## Routing Rules

- 商品模块 -> backend-dev + frontend-dev (parallel)
```

## Architecture

The system follows the DeepAgents architecture:

```
CLI / API
    ↓
Orchestration (Workflow Manager / Planning Generator / Agent Scheduler)
    ↓
Agent Runtime (LangGraph State Machine / Sub-Agent Lifecycle)
    ↓
Tool Layer | State Layer | Memory Layer
```

## Development

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## License

MIT
