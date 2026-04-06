# DeepAgents Architecture

**Analysis Date:** 2026-04-06

## Overview

DeepAgents is a TypeScript library for building controllable AI agents with LangGraph. It provides a layered architecture with pluggable backends, middleware-based extensibility, and a skill system for extending agent capabilities.

The codebase is organized into these main areas:
- **Agent Creation** (`agent.ts`) - Main entry point via `createDeepAgent`
- **Backends** (`backends/`) - Pluggable storage systems for files and state
- **Middleware** (`middleware/`) - Transform hooks for agent execution
- **Skills** (`skills/`) - Loading and parsing of agent skill definitions

---

## 1. Module Structure

```
libs/deepagents/src/
├── agent.ts                    # Main entry point: createDeepAgent()
├── index.ts                    # Public exports
├── types.ts                    # Type definitions and type helpers
├── errors.ts                   # ConfigurationError class
├── values.ts                   # Shared state values (filesValue)
├── config.ts                   # Settings detection and path management
│
├── backends/
│   ├── index.ts                # Re-exports all backends
│   ├── protocol.ts             # Core protocol interfaces (BackendProtocolV2, etc.)
│   ├── state.ts                # StateBackend - ephemeral state storage
│   ├── store.ts                # StoreBackend - persistent cross-thread storage
│   ├── filesystem.ts            # FilesystemBackend - direct filesystem access
│   ├── composite.ts            # CompositeBackend - routes by path prefix
│   ├── sandbox.ts              # BaseSandbox - abstract sandbox base class
│   ├── local-shell.ts          # LocalShellBackend - local command execution
│   ├── langsmith.ts            # LangSmithSandbox - remote sandbox via LangSmith
│   ├── utils.ts                # Backend utilities and adapters
│   ├── v1/protocol.ts          # Deprecated v1 protocol interfaces
│   └── v2/protocol.ts          # Current v2 protocol interfaces
│
├── middleware/
│   ├── index.ts                # Re-exports all middleware
│   ├── fs.ts                   # FilesystemMiddleware - file tools
│   ├── subagents.ts            # SubAgentMiddleware - task delegation
│   ├── skills.ts               # SkillsMiddleware - skill loading
│   ├── memory.ts               # MemoryMiddleware - AGENTS.md loading
│   ├── summarization.ts        # SummarizationMiddleware - context truncation
│   ├── patch_tool_calls.ts      # PatchToolCallsMiddleware - tool call parity
│   ├── async_subagents.ts       # AsyncSubAgentMiddleware - async task handling
│   ├── completion_callback.ts   # CompletionCallbackMiddleware
│   ├── agent-memory.ts         # AgentMemoryMiddleware
│   ├── cache.ts                # CacheBreakpointMiddleware
│   ├── utils.ts                # Middleware utilities
│   └── types.ts                # Middleware type definitions
│
└── skills/
    ├── index.ts                # Re-exports skill utilities
    └── loader.ts               # listSkills, parseSkillMetadata

tests/                          # Co-located test files
```

---

## 2. Core Abstractions

### 2.1 Backend Protocol

The backend system is built around the `BackendProtocolV2` interface:

```typescript
// libs/deepagents/src/backends/v2/protocol.ts
export interface BackendProtocolV2 extends Omit<BackendProtocolV1, "read" | "readRaw" | "grepRaw" | "lsInfo" | "globInfo"> {
  ls(path: string): MaybePromise<LsResult>;
  read(filePath: string, offset?: number, limit?: number): MaybePromise<ReadResult>;
  readRaw(filePath: string): MaybePromise<ReadRawResult>;
  grep(pattern: string, path?: string | null, glob?: string | null): MaybePromise<GrepResult>;
  glob(pattern: string, path?: string): MaybePromise<GlobResult>;
  write(filePath: string, content: string): MaybePromise<WriteResult>;
  edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): MaybePromise<EditResult>;
  uploadFiles?(files: Array<[string, Uint8Array]>): MaybePromise<FileUploadResponse[]>;
  downloadFiles?(paths: string[]): MaybePromise<FileDownloadResponse[]>;
}
```

**Sandbox Protocol** extends the base protocol with execution:

```typescript
export interface SandboxBackendProtocolV2 extends BackendProtocolV2 {
  execute(command: string): MaybePromise<ExecuteResponse>;
  readonly id: string;
}
```

### 2.2 Agent Types

**DeepAgentTypeConfig** bundles all generic type parameters:

```typescript
// libs/deepagents/src/types.ts
export interface DeepAgentTypeConfig<
  TResponse extends Record<string, any> | ResponseFormatUndefined,
  TState extends AnyAnnotationRoot | InteropZodObject | undefined,
  TContext extends AnyAnnotationRoot | InteropZodObject,
  TMiddleware extends readonly AgentMiddleware[],
  TTools extends readonly (ClientTool | ServerTool)[],
  TSubagents extends readonly AnySubAgent[],
> extends AgentTypeConfig<TResponse, TState, TContext, TMiddleware, TTools> {
  Subagents: TSubagents;
}
```

**DeepAgent** wraps ReactAgent with type branding:

```typescript
export type DeepAgent<TTypes extends DeepAgentTypeConfig = DeepAgentTypeConfig> = 
  ReactAgent<TTypes> & {
    readonly "~deepAgentTypes": TTypes;
  };
```

### 2.3 SubAgent Specification

```typescript
// libs/deepagents/src/middleware/subagents.ts
export interface SubAgent {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: StructuredTool[];
  model?: LanguageModelLike | string;
  middleware?: readonly AgentMiddleware[];
  interruptOn?: Record<string, boolean | InterruptOnConfig>;
  skills?: string[];
  responseFormat?: CreateAgentParams["responseFormat"];
}

export interface CompiledSubAgent<TRunnable extends ReactAgent<any> | Runnable> {
  name: string;
  description: string;
  runnable: TRunnable;
}
```

---

## 3. Agent Execution Flow

### 3.1 createDeepAgent Entry Point

```ascii
┌──────────────────────────────────────────────────────────────────────┐
│                        createDeepAgent(params)                        │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │   Validate Configuration  │   │   Detect Model Type       │
    │   - Check tool collisions  │   │   - isAnthropicModel()    │
    │   - Builtin tool names    │   │   - Anthropic → caching   │
    └───────────────────────────┘   └───────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                  Build Middleware Stack (ordered)              │
    │                                                                │
    │  1. todoListMiddleware()        - Todo list management         │
    │  2. createFilesystemMiddleware  - File tools (read/write/grep) │
    │  3. createSubAgentMiddleware    - Task delegation              │
    │  4. createSummarizationMiddleware - Context truncation         │
    │  5. createPatchToolCallsMiddleware - Tool call parity fix      │
    │  6. [SkillsMiddleware]         - Optional, if skills provided │
    │  7. [AsyncSubAgentMiddleware]  - Optional, if async subagents  │
    │  8. [customMiddleware]         - User-provided middleware      │
    │  9. [cacheMiddleware]          - Anthropic prompt caching      │
    │  10. [MemoryMiddleware]        - Optional, if memory provided  │
    │  11. [humanInTheLoopMiddleware] - Optional, if interruptOn    │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │              Process Subagents (normalize specs)               │
    │                                                                │
    │  • AsyncSubAgents → filtered separately                        │
    │  • CompiledSubAgents → used as-is                             │
    │  • SubAgents → wrapped with default middleware stack           │
    │  • General-purpose subagent → auto-added if not present        │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                   Create System Prompt                         │
    │                                                                │
    │  BASE_AGENT_PROMPT = context`                                   │
    │    You are a Deep Agent, an AI assistant...                    │
    │  `                                                               │
    │                                                                │
    │  Final = customSystemPrompt + BASE_AGENT_PROMPT                 │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                    Call createAgent()                          │
    │                                                                │
    │  agent = createAgent({                                        │
    │    model,                                                      │
    │    systemPrompt: finalSystemPrompt,                            │
    │    tools,                                                      │
    │    middleware,                                                 │
    │    responseFormat,                                             │
    │    contextSchema,                                              │
    │    checkpointer,                                               │
    │    store,                                                      │
    │    name,                                                       │
    │  }).withConfig({                                               │
    │    recursionLimit: 10_000,                                     │
    │    metadata: { ls_integration: "deepagents" },                  │
    │  })                                                            │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                              DeepAgent
```

### 3.2 Agent Invocation Flow

```ascii
┌──────────────────────────────────────────────────────────────────────┐
│                         agent.invoke(input)                          │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │      Middleware.beforeAgent │   │      LangGraph Router     │
    │                             │   │                           │
    │  fs.ts:                     │   │  messages → model → tools  │
    │    - Load filesystem tools  │   │                           │
    │  skills.ts:                │   │                           │
    │    - Load skills metadata  │   │                           │
    │  memory.ts:                │   │                           │
    │    - Load AGENTS.md        │   │                           │
    │  patch_tool_calls.ts:      │   │                           │
    │    - Fix dangling tool     │   │                           │
    │      calls                 │   │                           │
    │  summarization.ts:         │   │                           │
    │    - Check context limits  │   │                           │
    └───────────────────────────┘   └───────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                    Middleware.wrapModelCall                    │
    │                                                                │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
    │  │ SkillsM    │→ │ MemoryM     │→ │ SummarizM   │→ ...       │
    │  │ (injects    │  │ (injects    │  │ (truncates  │            │
    │  │  skills     │  │  memory     │  │  if needed) │            │
    │  │  section)   │  │  section)   │  │             │            │
    │  └─────────────┘  └─────────────┘  └─────────────┘            │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                      Model Invocation                          │
    │                                                                │
    │  1. LLM generates text + tool_calls                            │
    │  2. If tool_calls → return ToolMessage chain                  │
    │  3. If text only → return AIMessage                           │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                    Tool Execution                              │
    │                                                                │
    │  Filesystem tools:     │  Task tool (subagents):             │
    │  ┌─────────────────┐   │  ┌─────────────────────────────┐     │
    │  │ read_file      │   │  │ Creates subagent instance   │     │
    │  │ write_file     │   │  │ Filters state (excludes     │     │
    │  │ edit_file      │   │  │  messages, todos, etc.)    │     │
    │  │ list_dir       │   │  │ Invokes subagent           │     │
    │  │ glob_file      │   │  │ Returns Command with       │     │
    │  │ grep_file      │   │  │  ToolMessage result        │     │
    │  └─────────────────┘   │  └─────────────────────────────┘     │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                              Response
```

---

## 4. Middleware Pipeline

### 4.1 Middleware Types

LangChain middleware provides hooks at two levels:

```typescript
interface AgentMiddleware {
  name?: string;
  tools?: StructuredTool[];
  stateSchema?: StateSchema;
  
  // Called before agent processes input - can modify state
  beforeAgent?: (state: any) => Promise<StateUpdate | void>;
  
  // Called around model invocation - can modify request/response
  wrapModelCall?: (request: ModelRequest, handler: Handler) => Promise<Response>;
}
```

### 4.2 Built-in Middleware Stack

**File:** `libs/deepagents/src/agent.ts` (lines 279-342)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        MIDDLEWARE STACK (in order)                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  1. [todoListMiddleware()]                                                 │
│     └─ Provides todo list management tools                                 │
│                                                                            │
│  2. [createFilesystemMiddleware({ backend })]                              │
│     └─ Provides: read_file, write_file, edit_file, list_dir, glob_file,   │
│                 grep_file, execute_code, upload_file, download_file        │
│                                                                            │
│  3. [createSubAgentMiddleware({ ... })]                                   │
│     └─ Provides: task tool for spawning subagents                          │
│     └─ Tools: [taskTool]                                                  │
│     └─ wrapModelCall: appends TASK_SYSTEM_PROMPT to system message        │
│                                                                            │
│  4. [createSummarizationMiddleware({ model, backend })]                  │
│     └─ Monitors conversation length / token count                          │
│     └─ Triggers summarization when threshold reached                       │
│     └─ Offloads history to backend storage                                 │
│                                                                            │
│  5. [createPatchToolCallsMiddleware()]                                     │
│     └─ beforeAgent: fixes dangling tool calls                             │
│     └─ wrapModelCall: patches messages before model invocation            │
│                                                                            │
│  6. [...skillsMiddleware]                                                  │
│     └─ beforeAgent: loads skillsMetadata from backend                     │
│     └─ wrapModelCall: injects skills section into system prompt           │
│                                                                            │
│  7. [...asyncSubAgentMiddleware]                                           │
│     └─ Handles async subagents with graphId                               │
│                                                                            │
│  8. [...customMiddleware]                                                  │
│     └─ User-provided middleware                                           │
│                                                                            │
│  9. [...cacheMiddleware]                                                   │
│     └─ Anthropic prompt caching (anthropicPromptCachingMiddleware)        │
│     └─ Cache breakpoint middleware (createCacheBreakpointMiddleware)       │
│                                                                            │
│  10. [...memoryMiddleware]                                                 │
│      └─ beforeAgent: loads memoryContents from AGENTS.md files            │
│      └─ wrapModelCall: injects memory section into system prompt          │
│                                                                            │
│  11. [...humanInTheLoopMiddleware({ interruptOn })]                       │
│      └─ Intercepts tool calls for human approval                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Filesystem Middleware Tools

**File:** `libs/deepagents/src/middleware/fs.ts`

```
FILESYSTEM_TOOL_NAMES = {
  "read_file", "write_file", "edit_file", "list_dir",
  "glob_file", "grep_file", "execute_code", "mig_fragment",
  "upload_file", "download_file"
}

┌─────────────────────────────────────────────────────────────┐
│                   FilesystemMiddleware                       │
├─────────────────────────────────────────────────────────────┤
│  State Schema:                                               │
│    files: ReducedValue<z.record<string, FileData>>          │
│                                                              │
│  Tools Provided:                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ read_file      │  │ write_file     │  │ edit_file      │  │
│  │ list_dir       │  │ glob_file      │  │ grep_file      │  │
│  │ execute_code   │  │ mig_fragment   │  │ upload_file    │  │
│  │ download_file  │  └────────────────┘  └────────────────┘  │
│  └────────────────┘                                          │
│                                                              │
│  Backend Operations:                                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ls() → LsResult    read() → ReadResult              │  │
│  │  glob() → GlobResult grep() → GrepResult             │  │
│  │  write() → WriteResult edit() → EditResult           │  │
│  │  execute() → ExecuteResponse                          │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Backend System

### 5.1 Backend Types Overview

```ascii
┌─────────────────────────────────────────────────────────────────────┐
│                         BackendProtocolV2                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ls() Read() readRaw() grep() glob() write() edit()          │  │
│  │ [uploadFiles()] [downloadFiles()]                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                ▲                           ▲
                │ extends                   │ extends
                │                           │
┌───────────────┴───────┐   ┌───────────────┴───────┐
│  SandboxBackendProtocolV2  │   │   StoreBackend        │
│  ┌─────────────────────┐ │   │   (implements V2)       │
│  │ execute()           │ │   └─────────────────────────┘
│  │ id: string          │ │
│  └─────────────────────┘ │
└───────────────────────────┘
        ▲
        │
┌───────┴────────┐    ┌──────────────┐
│ LocalShellBackend│    │ LangSmithSandbox │
└─────────────────┘    └─────────────────┘
```

### 5.2 Backend Implementations

**StateBackend** (`backends/state.ts`)
- Stores files in LangGraph agent state (ephemeral)
- Uses `__pregel_send` for zero-arg mode state updates
- Returns `filesUpdate` in legacy mode for Command application
- File format: `FileDataV1` (legacy) or `FileDataV2`

**StoreBackend** (`backends/store.ts`)
- Stores files in LangGraph's BaseStore (persistent, cross-thread)
- Uses namespace-based organization
- Supports custom namespace via constructor options
- Falls back to `["filesystem"]` or `[assistantId, "filesystem"]`

**FilesystemBackend** (`backends/filesystem.ts`)
- Direct filesystem access via Node.js `fs` API
- Virtual mode for sandboxed operation (resolves paths under rootDir)
- Security: path traversal prevention, symlink blocking, O_NOFOLLOW
- Uses ripgrep when available, fallback to substring search

**CompositeBackend** (`backends/composite.ts`)
- Routes operations by path prefix to different backends
- Example: `/memories/` → StoreBackend, everything else → StateBackend
- Aggregates results at root path for `ls()`, `grep()`, `glob()`

**BaseSandbox** (`backends/sandbox.ts`)
- Abstract base for sandbox backends with execution
- Provides default implementations of all file operations via shell commands
- Uses pure POSIX utilities (awk, grep, find, stat) - works on Alpine
- Concrete implementations only need: `execute()`, `uploadFiles()`, `downloadFiles()`

### 5.3 Backend Protocol Versions

```ascii
┌─────────────────────────────────────────────────────────────────────┐
│                         BackendProtocol                              │
│                     (deprecated alias for V1)                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BackendProtocolV1                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ lsInfo() read() readRaw() grepRaw() globInfo() write() edit()│  │
│  │ [uploadFiles()] [downloadFiles()]                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼ (adaptBackendProtocol)
┌─────────────────────────────────────────────────────────────────────┐
│                        BackendProtocolV2                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ls() read() readRaw() grep() glob() write() edit()           │  │
│  │ [uploadFiles()] [downloadFiles()]                             │  │
│  │                                                               │  │
│  │ Returns structured Result types:                             │  │
│  │   ReadResult, LsResult, GrepResult, GlobResult, etc.        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Skill System

### 6.1 Skill Loading Flow

```ascii
┌──────────────────────────────────────────────────────────────────────┐
│                    createSkillsMiddleware(options)                    │
│                        middleware/skills.ts                           │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │     beforeAgent hook      │   │     wrapModelCall hook     │
    │                           │   │                           │
    │  1. Check closure cache   │   │  1. Get skillsMetadata    │
    │  2. Check state (restore  │   │  2. Format SKILLS_       │
    │     from checkpoint)       │   │     SYSTEM_PROMPT        │
    │  3. Resolve backend        │   │  3. Inject into system   │
    │  4. Load from each source  │   │     message              │
    │  5. Merge by name (last    │   │                          │
    │     wins)                  │   │                          │
    └───────────────────────────┘   └───────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                 listSkillsFromBackend(backend, source)        │
    │                                                                │
    │  1. ls(source) → list directories                             │
    │  2. For each subdirectory:                                    │
    │     a. read() SKILL.md                                        │
    │     b. parse YAML frontmatter                                 │
    │     c. Validate name/description                              │
    │     d. Return SkillMetadata[]                                 │
    └───────────────────────────────────────────────────────────────┘
```

### 6.2 SKILL.md Format

```markdown
---
name: web-research
description: Structured approach to conducting thorough web research on any topic
compatibility: Python 3.10+
allowed-tools: web_search browser
---

# Web Research Skill

## When to Use
- User asks you to research a topic
- Need to gather information from multiple sources

## Workflow
1. Use web_search to find relevant articles
2. Use browser to read detailed content
3. Synthesize findings and present summary
```

### 6.3 Skills Middleware State Schema

```typescript
// libs/deepagents/src/middleware/skills.ts

const SkillsStateSchema = new StateSchema({
  skillsMetadata: new ReducedValue(
    z.array(SkillMetadataEntrySchema).default(() => []),
    {
      inputSchema: z.array(SkillMetadataEntrySchema).optional(),
      reducer: skillsMetadataReducer,  // Merges by name, last wins
    },
  ),
  files: filesValue,
});

// SkillMetadataEntrySchema:
const SkillMetadataEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
  license: z.string().nullable().optional(),
  compatibility: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
});
```

### 6.4 Skill Loading (Backend-Agnostic)

**File:** `libs/deepagents/src/skills/index.ts`

```ascii
┌──────────────────────────────────────────────────────────────┐
│                    listSkills(options)                        │
│                        skills/loader.ts                       │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌───────────────────┐               ┌───────────────────┐
│ listSkillsFromDir │               │ listSkillsFromDir │
│ (userSkillsDir,   │               │ (projectSkillsDir, │
│  "user")          │               │  "project")       │
└───────────────────┘               └───────────────────┘
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │   Merge by name (project      │
            │   overrides user)             │
            └───────────────────────────────┘
                            │
                            ▼
                   SkillMetadata[]
```

---

## 7. Data Flow Diagrams

### 7.1 Agent Creation Flow

```ascii
User calls createDeepAgent({
  model,
  tools,
  middleware,
  subagents,
  backend,
  skills,
  memory,
  ...
})

        │
        ▼
┌───────────────────┐
│ Validate tools    │ ← Throws if tool names conflict
│ (BUILTIN_TOOL_NAMES)│   with filesystem/task tools
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Detect model type  │ → isAnthropicModel()
│ (Anthropic?)      │   Sets up cache middleware
└───────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Build Middleware Array (deterministic order)                 │
│                                                               │
│  [builtin stack] + [optional] + [custom] + [cache]           │
│                                                               │
│  builtInMiddleware = [                                        │
│    todoMiddleware,                                           │
│    createFilesystemMiddleware({backend}),                     │
│    createSubAgentMiddleware({...}),                          │
│    createSummarizationMiddleware({model, backend}),          │
│    createPatchToolCallsMiddleware(),                         │
│  ]                                                           │
│                                                               │
│  middleware = [                                               │
│    ...builtInMiddleware,                                     │
│    ...(skills?.length ? [createSkillsMiddleware({...})] : []),│
│    ...(asyncSubAgents?.length ? [createAsyncSubAgentM...] : []),
│    ...customMiddleware,                                        │
│    ...cacheMiddleware,                                         │
│    ...(memory?.length ? [createMemoryMiddleware({...})] : []),│
│    ...(interruptOn ? [humanInTheLoopMiddleware({...})] : []) │
│  ]                                                           │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Normalize Subagents                                          │
│                                                               │
│  allSubagents = subagents as readonly AnySubAgent[]           │
│                                                               │
│  asyncSubAgents = allSubagents.filter(isAsyncSubAgent)        │
│  inlineSubagents = allSubagents.filter(!isAsyncSubAgent)      │
│    .map(item => "runnable" in item ? item                     │
│                                 : normalizeSubagentSpec(item))│
│                                                               │
│  if (!hasGeneralPurpose) {                                    │
│    inlineSubagents.unshift(normalizeSubagentSpec({            │
│      ...GENERAL_PURPOSE_SUBAGENT,                            │
│      model, skills, tools                                     │
│    }))                                                        │
│  }                                                            │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Combine System Prompts                                       │
│                                                               │
│  finalSystemPrompt =                                          │
│    customPrompt                                               │
│      ? new SystemMessage([customPrompt, BASE_AGENT_PROMPT])   │
│      : new SystemMessage([BASE_AGENT_PROMPT])                 │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Call createAgent()                                           │
│                                                               │
│  agent = createAgent({                                        │
│    model,                                                     │
│    systemPrompt: finalSystemPrompt,                           │
│    tools,                                                     │
│    middleware,                                                │
│    responseFormat,                                             │
│    contextSchema,                                              │
│    checkpointer,                                               │
│    store,                                                      │
│    name,                                                       │
│  }).withConfig({                                              │
│    recursionLimit: 10_000,                                    │
│    metadata: { ls_integration: "deepagents" },                │
│  })                                                           │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
     DeepAgent
```

### 7.2 Tool Execution Flow

```ascii
┌──────────────────────────────────────────────────────────────────────┐
│                         Tool Call Invocation                          │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │ Filesystem Tools  │           │   Task Tool       │
        │                   │           │   (Subagent)      │
        └───────────────────┘           └───────────────────┘
                    │                               │
        ┌───────────┴───────────┐           ┌───────┴───────┐
        ▼                       ▼           ▼               ▼
┌───────────────┐     ┌───────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ read_file    │     │ write_file    │ │ Invoke subagent  │ │ Return via      │
│ ls()          │     │ edit()        │ │ Filter state     │ │ Command with    │
│ glob()        │     │ uploadFiles() │ │ (exclude msgs,   │ │ ToolMessage     │
│ grep()        │     │ downloadFiles │ │  todos, etc.)   │ │ result          │
└───────────────┘     └───────────────┘ └─────────────────┘ └─────────────────┘
        │                       │           │               │
        └───────────┬───────────┘           └───────┬───────┘
                    ▼                               │
        ┌───────────────────┐                     │
        │   Backend Call    │                     │
        │                   │                     │
        │ StateBackend:     │                     │
        │   getFiles()      │                     │
        │   sendFilesUpdate │                     │
        │                   │                     │
        │ StoreBackend:     │                     │
        │   getStore()      │                     │
        │   store.get/put   │                     │
        │                   │                     │
        │ FilesystemBackend: │                     │
        │   fs.readFile()   │                     │
        │   fs.writeFile()  │                     │
        │                   │                     │
        │ CompositeBackend: │                     │
        │   route by prefix │                     │
        └───────────────────┘                     │
                    │                             │
                    └─────────────┬───────────────┘
                                  ▼
                      ┌───────────────────┐
                      │   ToolResponse    │
                      │   (as ToolMessage)│
                      └───────────────────┘
```

### 7.3 Summarization Flow

```ascii
┌──────────────────────────────────────────────────────────────────────┐
│                    SummarizationMiddleware.wrapModelCall              │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │  1. Get effective messages (reconstruct from previous event)   │
    │                                                               │
    │     effectiveMessages =                                        │
    │       getEffectiveMessages(request.messages, request.state)    │
    │       ├── No event → return all messages                      │
    │       └── Has event → [summaryMessage, ...messages[cutoff:]]  │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │  2. Resolve model and apply defaults                            │
    │                                                               │
    │     resolvedModel = await getChatModel()                       │
    │     maxInputTokens = getMaxInputTokens(resolvedModel)          │
    │     applyModelDefaults(resolvedModel) if trigger not set       │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │  3. Truncate args (if configured)                              │
    │                                                               │
    │     truncateArgs(effectiveMessages, maxInputTokens)            │
    │     ├── Check shouldTruncateArgs()                            │
    │     ├── Determine cutoff via findSafeCutoffPoint()            │
    │     └── Truncate tool_call args in old AIMessages             │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │  4. Count total tokens                                        │
    │                                                               │
    │     totalTokens = countTotalTokens(                           │
    │       truncatedMessages,                                       │
    │       request.systemMessage,                                  │
    │       request.tools                                           │
    │     )                                                         │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │  5. Check if summarization should trigger                      │
    │                                                               │
    │     shouldDo = shouldSummarize(truncatedMessages, totalTokens, │
    │                               maxInputTokens)                 │
    │     ├── Fraction-based: totalTokens >= maxInputTokens * 0.85  │
    │     ├── Token-based: totalTokens >= 170_000                   │
    │     └── Message-based: messages.length >= threshold           │
    └───────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │ NO → pass through │           │ YES → perform     │
        │                   │           │ summarization     │
        └───────────────────┘           └───────────────────┘
                    │                               │
                    ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────────────────────┐
    │ Try handler(request) │       │ determineCutoffIndex()                 │
    │                       │       │ findSafeCutoffPoint() to avoid         │
    │ If ContextOverflow:   │       │ splitting AI/Tool message pairs         │
    │   fall through to     │       └───────────────────────────────────────┘
    │   summarization       │                       │
    └───────────────────────┘                       ▼
                                    ┌───────────────────────────────────────┐
                                    │ offloadToBackend()                     │
                                    │   • Filter summary messages            │
                                    │   • Append to /conversation_history/   │
                                    │     {session_id}.md                    │
                                    │   • Uses uploadFiles() for efficiency  │
                                    └───────────────────────────────────────┘
                                    │
                                    ▼
                                    ┌───────────────────────────────────────┐
                                    │ createSummary()                        │
                                    │   • Call LLM with conversation         │
                                    │   • Return summary string              │
                                    └───────────────────────────────────────┘
                                    │
                                    ▼
                                    ┌───────────────────────────────────────┐
                                    │ buildSummaryMessage()                  │
                                    │   • HumanMessage with lc_source       │
                                    │     = "summarization"                  │
                                    │   • Includes path to history file      │
                                    └───────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────┐
                    │ Return Command with:                  │
                    │   _summarizationEvent: {               │
                    │     cutoffIndex,                       │
                    │     summaryMessage,                    │
                    │     filePath                           │
                    │   }                                    │
                    │   _summarizationSessionId              │
                    └───────────────────────────────────────┘
```

---

## 8. Key Type Relationships

### 8.1 Type Hierarchy

```ascii
┌─────────────────────────────────────────────────────────────────────────┐
│                     DeepAgentTypeConfig                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  TResponse     - Structured response type (from responseFormat)    ││
│  │  TState        - Custom state schema (undefined for deep agents)    ││
│  │  TContext      - Context schema type                               ││
│  │  TMiddleware   - Middleware array type                             ││
│  │  TTools        - Tools array type                                  ││
│  │  TSubagents    - Subagents array type ← DeepAgent-specific         ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                │
                │ extends
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     AgentTypeConfig (from langchain)                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           DeepAgent                                      │
│  ReactAgent<TTypes> & { "~deepAgentTypes": TTypes }                     │
│                                                                          │
│  Type brand enables:                                                     │
│    InferDeepAgentSubagents<typeof agent>  → TSubagents                  │
│    InferSubagentByName<typeof agent, "researcher"> → SubAgent type      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     AnySubAgent Union                                    │
│                                                                          │
│  SubAgent | CompiledSubAgent | AsyncSubAgent                            │
│                                                                          │
│  • SubAgent: Dynamic spec with middleware array                         │
│  • CompiledSubAgent: Pre-built agent with runnable                     │
│  • AsyncSubAgent: Has graphId for async execution                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 State Type Flow

```ascii
┌─────────────────────────────────────────────────────────────────────────┐
│                        Request State Flow                                │
└─────────────────────────────────────────────────────────────────────────┘

Middleware.beforeAgent returns state updates:

    ┌────────────────────────────────────────┐
    │  FilesystemMiddleware                  │
    │    return { files: filesUpdate }       │
    └────────────────────────────────────────┘
                    │
                    ▼
    ┌────────────────────────────────────────┐
    │  SkillsMiddleware                      │
    │    return { skillsMetadata: [...] }   │
    └────────────────────────────────────────┘
                    │
                    ▼
    ┌────────────────────────────────────────┐
    │  MemoryMiddleware                      │
    │    return { memoryContents: {...} }    │
    └────────────────────────────────────────┘
                    │
                    ▼
    ┌────────────────────────────────────────┐
    │  SummarizationMiddleware               │
    │    return Command({                    │
    │      _summarizationEvent: {...},       │
    │      _summarizationSessionId: ...      │
    │    })                                   │
    └────────────────────────────────────────┘
                    │
                    ▼
              LangGraph State
              ┌────────────────────────────────────────┐
              │  messages: BaseMessage[]               │
              │  todos: Todo[]                         │
              │  files: Record<string, FileData>       │
              │  skillsMetadata: SkillMetadataEntry[]  │
              │  memoryContents: Record<string, string> │
              │  _summarizationEvent: SummarizationEvent│
              │  _summarizationSessionId: string       │
              │  ... (custom middleware state)         │
              └────────────────────────────────────────┘
```

### 8.3 Backend Protocol Type Flow

```ascii
┌─────────────────────────────────────────────────────────────────────────┐
│                      Backend Type Resolution                             │
└─────────────────────────────────────────────────────────────────────────┘

User provides:        Or:
backend: StateBackend     backend: new FilesystemBackend({...})
        │                         │
        └─────────┬───────────────┘
                  ▼
        ┌─────────────────────────┐
        │ resolveBackend()        │
        │                         │
        │ if (typeof backend      │
        │     === "function") {   │
        │   backend(runtime)       │
        │ }                       │
        └─────────┬───────────────┘
                  ▼
        ┌─────────────────────────────────────────┐
         isSandboxProtocol(backend)              │
                 │                               │
        ┌────────┴────────┐                      │
        ▼                 ▼                      ▼
      true              false                   │
        │                 │                      │
        ▼                 ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ adaptSandbox    │  │ adaptBackend    │  │ Return as-is    │
│ Protocol()      │  │ Protocol()      │  │                 │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ SandboxBackend  │  │ BackendProtocol │
│ ProtocolV2     │  │ V2             │
│                 │  │                 │
│ execute()       │  │ ls()            │
│ id: string      │  │ read()          │
└─────────────────┘  │ grep()          │
                      │ glob()          │
                      │ write()         │
                      │ edit()          │
                      └─────────────────┘
```

---

## 9. Key File Locations

| Component | File | Key Exports |
|-----------|------|------------|
| **Entry Point** | `src/agent.ts` | `createDeepAgent()` |
| **Types** | `src/types.ts` | `DeepAgent`, `DeepAgentTypeConfig`, `AnySubAgent` |
| **Errors** | `src/errors.ts` | `ConfigurationError` |
| **Values** | `src/values.ts` | `filesValue` |
| **Backends** | `src/backends/index.ts` | All backend exports |
| **Protocol** | `src/backends/protocol.ts` | `BackendProtocolV2`, `SandboxBackendProtocolV2` |
| **State Backend** | `src/backends/state.ts` | `StateBackend` |
| **Store Backend** | `src/backends/store.ts` | `StoreBackend` |
| **Filesystem Backend** | `src/backends/filesystem.ts` | `FilesystemBackend` |
| **Composite Backend** | `src/backends/composite.ts` | `CompositeBackend` |
| **Base Sandbox** | `src/backends/sandbox.ts` | `BaseSandbox` |
| **Middleware** | `src/middleware/index.ts` | All middleware exports |
| **Filesystem Middleware** | `src/middleware/fs.ts` | `createFilesystemMiddleware`, `FILESYSTEM_TOOL_NAMES` |
| **Subagent Middleware** | `src/middleware/subagents.ts` | `createSubAgentMiddleware`, `SubAgent`, `GENERAL_PURPOSE_SUBAGENT` |
| **Skills Middleware** | `src/middleware/skills.ts` | `createSkillsMiddleware`, `SkillMetadata` |
| **Memory Middleware** | `src/middleware/memory.ts` | `createMemoryMiddleware` |
| **Summarization Middleware** | `src/middleware/summarization.ts` | `createSummarizationMiddleware`, `computeSummarizationDefaults` |
| **Patch Tool Calls** | `src/middleware/patch_tool_calls.ts` | `createPatchToolCallsMiddleware` |
| **Skills Loader** | `src/skills/loader.ts` | `listSkills`, `parseSkillMetadata` |
| **Config** | `src/config.ts` | `createSettings`, `findProjectRoot` |

---

*Architecture analysis: 2026-04-06*
