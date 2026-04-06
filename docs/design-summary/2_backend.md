# Backend 模块设计文档

**文档版本:** 2026-04-06
**分析日期:** 2026-04-06

---

## 1. 模块概述

### 1.1 功能定位

Backend 模块是 deepagents 的核心存储抽象层，为 AI Agent 提供统一的文件操作接口。它将底层的存储实现（内存状态、持久化存储、本地文件系统、远程沙箱）与上层的工具调用解耦，使 Agent 能够以一致的方式读取、写入、搜索和管理文件。

### 1.2 Backend 系统设计理念

**核心原则：接口与实现分离**

Backend 模块采用**插件化架构**（Pluggable Architecture）：

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent / Tools                          │
│  (ls, read, write, edit, grep, glob, execute)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BackendProtocolV2                        │
│         (统一接口契约，定义方法签名和返回类型)                │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌────────────┐      ┌────────────┐      ┌────────────┐
   │StateBackend│      │StoreBackend│      │Filesystem  │
   │  (内存)    │      │ (持久化)   │      │Backend     │
   └────────────┘      └────────────┘      └────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌────────────┐      ┌────────────┐      ┌────────────┐
   │Composite   │      │  Sandbox   │      │LocalShell  │
   │Backend     │      │Backends    │      │Backend     │
   └────────────┘      └────────────┘      └────────────┘
```

**关键设计决策：**

1. **协议版本化** (`BackendProtocolV1` → `BackendProtocolV2`)：接口演进不破坏现有实现
2. **结果结构化**：所有操作返回 `Result` 类型，统一错误处理
3. **存储后端多样化**：支持内存、持久化、文件系统、沙箱等多种实现
4. **路径虚拟化**：支持虚拟路径隔离，不暴露真实文件系统结构
5. **零运行时依赖**：沙箱 backend 通过纯 POSIX shell 命令实现，依赖最小化

---

## 2. 协议分层

### 2.1 协议版本差异

| 特性 | V1 (`BackendProtocolV1`) | V2 (`BackendProtocolV2`) |
|------|-------------------------|-------------------------|
| **read 返回值** | `string` (纯文本) | `ReadResult` (含 error/content) |
| **readRaw 返回值** | `FileData` | `ReadRawResult` (含 error/data) |
| **grep 返回值** | `GrepMatch[] \| string` | `GrepResult` (含 error/matches) |
| **ls 方法名** | `lsInfo` | `ls` |
| **glob 方法名** | `globInfo` | `glob` |
| **错误处理** | 类型混合（数组或字符串） | 统一 Result 对象 |

### 2.2 V1 协议定义

位置：`libs/deepagents/src/backends/v1/protocol.ts`

```typescript
export interface BackendProtocolV1 {
  lsInfo(path: string): MaybePromise<FileInfo[]>;
  read(filePath: string, offset?: number, limit?: number): MaybePromise<string>;
  readRaw(filePath: string): MaybePromise<FileData>;
  grepRaw(pattern: string, path?: string | null, glob?: string | null): MaybePromise<GrepMatch[] | string>;
  globInfo(pattern: string, path?: string): MaybePromise<FileInfo[]>;
  write(filePath: string, content: string): MaybePromise<WriteResult>;
  edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): MaybePromise<EditResult>;
  uploadFiles?(files: Array<[string, Uint8Array]>): MaybePromise<FileUploadResponse[]>;
  downloadFiles?(paths: string[]): MaybePromise<FileDownloadResponse[]>;
}
```

### 2.3 V2 协议定义

位置：`libs/deepagents/src/backends/v2/protocol.ts`

```typescript
export interface BackendProtocolV2 extends Omit<BackendProtocolV1, "read" | "readRaw" | "grepRaw" | "lsInfo" | "globInfo"> {
  ls(path: string): MaybePromise<LsResult>;
  read(filePath: string, offset?: number, limit?: number): MaybePromise<ReadResult>;
  readRaw(filePath: string): MaybePromise<ReadRawResult>;
  grep(pattern: string, path?: string | null, glob?: string | null): MaybePromise<GrepResult>;
  glob(pattern: string, path?: string): MaybePromise<GlobResult>;
}
```

### 2.4 协议版本管理策略

**适配器模式** (`adaptBackendProtocol` / `adaptSandboxProtocol`)：

- 位置：`libs/deepagents/src/backends/utils.ts`
- V1 Backend 自动适配为 V2：无需修改现有实现即可接入新系统
- 适配器负责：
  - 方法名映射 (`lsInfo` → `ls`)
  - 返回值包装（数组/string → Result 对象）
  - 类型守卫函数 (`isSandboxProtocol`, `isSandboxBackend`)

**Sandbox 协议** 继承自 `BackendProtocolV2`，额外添加：

```typescript
export interface SandboxBackendProtocolV2 extends BackendProtocolV2 {
  execute(command: string): MaybePromise<ExecuteResponse>;
  readonly id: string;
}
```

---

## 3. Backend 类型体系

### 3.1 StateBackend

**文件位置：** `libs/deepagents/src/backends/state.ts`

**存储介质：** LangGraph Agent State（内存，绑定对话线程）

**特点：**

-  Ephemeral（临时性）：文件随对话存在，线程结束后消失
-  利用 LangGraph 的 checkpoint 机制持久化状态
-  通过 `__pregel_send` 机制更新状态（零抽象模式）
-  支持 `filesUpdate` 字段用于 LangGraph 的 Command 对象

**核心方法实现：**

```typescript
// 状态读取：从 LangGraph 执行上下文获取
private getFiles(): Record<string, FileData> {
  if (this.runtime) {
    const state = this.runtime.state as { files?: Record<string, FileData> };
    return state.files || {};
  }
  const state = getCurrentTaskInput<{ files?: Record<string, FileData> }>();
  return state?.files || {};
}

// 状态更新：通过 __pregel_send 推送
private sendFilesUpdate(update: Record<string, FileData>): void {
  if (this.isLegacy) return;
  const config = getConfig();
  const send = config.configurable?.[PREGEL_SEND_KEY];
  if (typeof send === "function") {
    send([["files", update]]);
  }
}
```

---

### 3.2 StoreBackend

**文件位置：** `libs/deepagents/src/backends/store.ts`

**存储介质：** LangGraph BaseStore（持久化，跨线程共享）

**特点：**

-  Persistent（持久化）：跨对话线程共享
-  命名空间隔离：支持自定义 namespace（用户级别/组织级别隔离）
-  自动分页搜索：避免大规模存储的性能问题
-  `filesUpdate: null`：外部存储无需状态更新

**命名空间设计：**

```typescript
protected getNamespace(): string[] {
  if (this._namespace) return this._namespace;  // 优先使用自定义 namespace
  if (this.stateAndStore?.assistantId) {
    return [this.stateAndStore.assistantId, "filesystem"];
  }
  return ["filesystem"];  // 默认命名空间
}
```

---

### 3.3 FilesystemBackend

**文件位置：** `libs/deepagents/src/backends/filesystem.ts`

**存储介质：** 本地文件系统

**特点：**

-  直接读写真实文件系统路径
-  **虚拟模式** (`virtualMode: true`)：将文件路径限制在 `rootDir` 内，防止路径遍历
-  **安全加固**：
  - `O_NOFOLLOW` 标志防止符号链接攻击
  - 禁止 symlink 操作
  - 路径遍历检测
-  **搜索能力**：
  - ripgrep 优先（`grep -rHnF` 固定字符串搜索）
  - 无 ripgrep 时降级为 substring search

**虚拟模式路径解析：**

```typescript
private resolvePath(key: string): string {
  if (this.virtualMode) {
    const vpath = key.startsWith("/") ? key : "/" + key;
    if (vpath.includes("..") || vpath.startsWith("~")) {
      throw new Error("Path traversal not allowed");
    }
    const full = path.resolve(this.cwd, vpath.substring(1));
    const relative = path.relative(this.cwd, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path: ${full} outside root directory: ${this.cwd}`);
    }
    return full;
  }
  // ...
}
```

---

### 3.4 CompositeBackend

**文件位置：** `libs/deepagents/src/backends/composite.ts`

**存储介质：** 多 Backend 组合

**特点：**

-  **前缀路由**：按路径前缀分发到不同 Backend
-  **聚合查询**：根路径 `/` 聚合所有子 Backend 的结果
-  自动适配：同时支持 V1 和 V2 协议 Backend

**路由机制：**

```typescript
private getBackendAndKey(key: string): [BackendProtocolV2, string] {
  // 按前缀长度降序排序，确保最长前缀优先匹配
  for (const [prefix, backend] of this.sortedRoutes) {
    if (key.startsWith(prefix)) {
      const suffix = key.substring(prefix.length);
      const strippedKey = suffix ? "/" + suffix : "/";
      return [backend, strippedKey];
    }
  }
  return [this.default, key];
}
```

**典型用法：**

```typescript
// /memories/* → StoreBackend (持久化)
// 其他路径 → StateBackend (临时)
const backend = new CompositeBackend(
  new StateBackend(),
  { "/memories/": new StoreBackend() }
);
```

---

### 3.5 SandboxBackend 体系

不直接实现 Backend，而是实现 `SandboxBackendProtocolV2`（继承自 `BackendProtocolV2`）。

**相关类：**

| 类 | 文件 | 说明 |
|---|------|------|
| `BaseSandbox` | `sandbox.ts` | 抽象基类，实现文件操作，抽象 `execute` |
| `LocalShellBackend` | `local-shell.ts` | 继承 `FilesystemBackend`，实现本地 shell 执行 |
| `LangSmithSandbox` | `langsmith.ts` | 封装 LangSmith 沙箱云服务 |

---

## 4. Sandbox 抽象

### 4.1 BaseSandbox 基类

**文件位置：** `libs/deepagents/src/backends/sandbox.ts`

**设计目标：** 为所有沙箱实现提供统一的文件操作能力，只需实现三个方法即可：

```typescript
export abstract class BaseSandbox implements SandboxBackendProtocolV2 {
  abstract readonly id: string;
  abstract execute(command: string): MaybePromise<ExecuteResponse>;
  abstract uploadFiles(files: Array<[string, Uint8Array]>): MaybePromise<FileUploadResponse[]>;
  abstract downloadFiles(paths: string[]): MaybePromise<FileDownloadResponse[]>;
}
```

**已实现的方法：** `ls`, `read`, `readRaw`, `grep`, `glob`, `write`, `edit`

### 4.2 零运行时依赖设计

BaseSandbox 的文件操作完全依赖 shell 命令实现，**不依赖 Python、Node.js 或其他运行时**：

| 操作 | 实现方式 |
|------|----------|
| `ls` | `find ... -printf '%s\t%T@\t%y\t%p\n'` |
| `read` | `awk 'NR >= start && NR <= end'` |
| `grep` | `grep -rHnF -e pattern` |
| `glob` | `find ...` + TypeScript regex 过滤 |
| `write` | 调用 `uploadFiles()` |
| `edit` | `downloadFiles()` → 修改 → `uploadFiles()` |

**三平台检测机制：**

```typescript
// 检测 GNU find (Linux) / BusyBox / BSD find (macOS)
if find /dev/null -maxdepth 0 -printf '' 2>/dev/null; then
  // GNU find: 使用 -printf
elif stat -c %s /dev/null >/dev/null 2>&1; then
  // BusyBox: 使用 stat -c
else
  // BSD: 使用 stat -f
fi
```

### 4.3 LocalShellBackend

**文件位置：** `libs/deepagents/src/backends/local-shell.ts`

**继承关系：** `FilesystemBackend` → `LocalShellBackend`（添加 shell 执行）

**特点：**

-  **无沙箱隔离**：直接在宿主机执行 shell 命令
-  **安全风险**：同时拥有文件系统访问和 shell 执行权限
-  **适用场景**：本地开发 CLI、受信任的运行环境

**execute 实现：**

```typescript
async execute(command: string): Promise<ExecuteResponse> {
  return new Promise<ExecuteResponse>((resolve) => {
    const child = cp.spawn(command, {
      shell: true,
      env: this.#env,
      cwd: this.cwd,
    });
    // 处理 stdout/stderr，设置超时
    // ...
  });
}
```

---

### 4.4 LangSmithSandbox

**文件位置：** `libs/deepagents/src/backends/langsmith.ts`

**封装层：** `langsmith/experimental/sandbox` → `BaseSandbox`

**特点：**

-  云端托管沙箱，隔离执行环境
-  支持模板化创建（`templateName`）
-  自动超时控制（默认 30 分钟）
-  API Key 从 `LANGSMITH_API_KEY` 环境变量读取

**工厂方法：**

```typescript
static async create(options: LangSmithSandboxCreateOptions = {}): Promise<LangSmithSandbox> {
  const client = new SandboxClient({ apiKey });
  const sandbox = await client.createSandbox(
    templateName = "deepagents",
    createSandboxOptions
  );
  return new LangSmithSandbox({ sandbox, defaultTimeout });
}
```

---

## 5. Composite 路由

### 5.1 路由机制

`CompositeBackend` 通过**最长前缀匹配**实现路径分发：

```typescript
// 初始化时按前缀长度降序排序
this.sortedRoutes = Object.entries(this.routes).sort(
  (a, b) => b[0].length - a[0].length
);

// 查询时依次匹配
private getBackendAndKey(key: string): [BackendProtocolV2, string] {
  for (const [prefix, backend] of this.sortedRoutes) {
    if (key.startsWith(prefix)) {
      const suffix = key.substring(prefix.length);
      const strippedKey = suffix ? "/" + suffix : "/";
      return [backend, strippedKey];
    }
  }
  return [this.default, key];
}
```

### 5.2 ls 特殊处理

根路径 `/` 的 `ls` 需要聚合所有 Backend 的结果：

```typescript
if (path === "/") {
  const results: FileInfo[] = [];
  const defaultResult = await this.default.ls(path);
  results.push(...(defaultResult.files || []));

  // 将每个路由的前缀本身作为目录添加
  for (const [routePrefix] of this.sortedRoutes) {
    results.push({
      path: routePrefix,  // 例如 "/memories/"
      is_dir: true,
      size: 0,
      modified_at: "",
    });
  }
  return { files: results };
}
```

### 5.3 grep/glob 跨 Backend 搜索

非根路径搜索单个 Backend，根路径搜索所有 Backend 并合并结果：

```typescript
// 搜索所有 Backend
const allMatches: GrepMatch[] = [];
const rawDefault = await this.default.grep(pattern, path, glob);
allMatches.push(...(rawDefault.matches || []));

for (const [routePrefix, backend] of Object.entries(this.routes)) {
  const raw = await backend.grep(pattern, "/", glob);
  const matches = raw.matches?.map(m => ({
    ...m,
    path: routePrefix.slice(0, -1) + m.path  // 恢复前缀
  }));
  allMatches.push(...matches);
}
```

---

## 6. 核心接口契约

### 6.1 ls - 目录列表

```typescript
ls(path: string): MaybePromise<LsResult>

// 返回结构
interface LsResult {
  error?: string;     // 失败时填充
  files?: FileInfo[]; // 成功时返回
}

// FileInfo 结构
interface FileInfo {
  path: string;       // 文件路径
  is_dir?: boolean;   // 是否为目录
  size?: number;      // 文件大小（字节）
  modified_at?: string; // ISO 8601 时间戳
}
```

**约定：**

- 非递归：只返回直接子项
- 目录路径以 `/` 结尾（如 `/src/`）
- 目录的 `size` 为 0

### 6.2 read - 读取文件

```typescript
read(filePath: string, offset?: number, limit?: number): MaybePromise<ReadResult>

// 返回结构
interface ReadResult {
  error?: string;
  content?: string | Uint8Array;  // 文本或二进制
  mimeType?: string;
}
```

**约定：**

- 文本文件：按行分页（`offset` 起始行，`limit` 最大行数）
- 二进制文件：返回完整 `Uint8Array`，忽略 offset/limit
- 行号从 0 开始计数

### 6.3 write - 创建文件

```typescript
write(filePath: string, content: string): MaybePromise<WriteResult>

// 返回结构
interface WriteResult {
  error?: string;
  path?: string;
  filesUpdate?: Record<string, FileData> | null;  // 仅内部存储需要
  metadata?: Record<string, unknown>;
}
```

**约定：**

- 仅创建新文件，不覆盖已有文件
- 外部存储（Filesystem/Store）：`filesUpdate: null`
- 内部存储（State）：返回 `filesUpdate` 供 LangGraph Command 使用

### 6.4 edit - 编辑文件

```typescript
edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): MaybePromise<EditResult>

// 返回结构
interface EditResult {
  error?: string;
  path?: string;
  filesUpdate?: Record<string, FileData> | null;
  occurrences?: number;  // 替换次数
  metadata?: Record<string, unknown>;
}
```

**约定：**

- `oldString` 必须精确匹配
- 非 `replaceAll` 模式且存在多个匹配时返回错误
- 空文件编辑：允许 `oldString=""` 设置初始内容

### 6.5 grep - 搜索内容

```typescript
grep(pattern: string, path?: string | null, glob?: string | null): MaybePromise<GrepResult>

// 返回结构
interface GrepResult {
  error?: string;
  matches?: GrepMatch[];
}

interface GrepMatch {
  path: string;   // 文件路径
  line: number;   // 行号（1-indexed）
  text: string;   // 匹配行文本
}
```

**约定：**

- 固定字符串搜索（非正则表达式）
- 二进制文件自动跳过
- `glob` 参数按文件名过滤（如 `*.py`）

### 6.6 glob - 文件名匹配

```typescript
glob(pattern: string, path?: string): MaybePromise<GlobResult>

// 返回结构
interface GlobResult {
  error?: string;
  files?: FileInfo[];
}
```

**约定：**

- `*` 匹配除 `/` 外的任意字符
- `**` 匹配任意字符包括 `/`（递归）
- `?` 匹配单个非 `/` 字符
- `[...]` 字符类

### 6.7 execute - 执行命令（仅 Sandbox）

```typescript
execute(command: string): MaybePromise<ExecuteResponse>

// 返回结构
interface ExecuteResponse {
  output: string;      // stdout + stderr 合并
  exitCode: number | null;
  truncated: boolean;   // 输出是否被截断
}
```

**约定：**

- 仅 Sandbox Backend 实现
- LocalShell：直接本地 shell 执行
- LangSmithSandbox：远程沙箱执行

### 6.8 uploadFiles / downloadFiles - 批量传输

```typescript
uploadFiles(files: Array<[string, Uint8Array]>): MaybePromise<FileUploadResponse[]>;
downloadFiles(paths: string[]): MaybePromise<FileDownloadResponse[]>;
```

**返回结构：**

```typescript
interface FileUploadResponse {
  path: string;
  error: FileOperationError | null;
}

interface FileDownloadResponse {
  path: string;
  content: Uint8Array | null;
  error: FileOperationError | null;
}

// 错误码
type FileOperationError = "file_not_found" | "permission_denied" | "is_directory" | "invalid_path";
```

---

## 7. 设计决策

### 7.1 为什么这样分层

**问题：** AI Agent 需要对不同存储介质（内存、持久化、文件系统、远程服务）进行一致的文件操作。

**方案：** 插件化 Backend 接口

**收益：**

- **接口统一**：Agent 代码与存储实现解耦
- **组合灵活**：`CompositeBackend` 支持混合存储策略
- **渐进迁移**：V1 → V2 通过适配器兼容，不破坏现有代码
- **测试友好**：接口 mock 方便单元测试

### 7.2 协议版本管理策略

**问题：** 接口需要演进，但已有实现不能全部重写。

**方案：**

1. 保留 V1 接口和类型别名（`BackendProtocol` → `BackendProtocolV1`）
2. V2 使用 `Omit` 从 V1 排除旧方法，重新定义
3. 提供 `adaptBackendProtocol` 适配器自动转换
4. 类型守卫 `isSandboxProtocol` 支持运行时检查

**版本判断逻辑：**

```typescript
// 核心判断：检查方法名和 id 属性
function isSandboxProtocol(backend: unknown): backend is AnySandboxProtocol {
  return (
    backend != null &&
    typeof (backend as any).execute === "function" &&
    typeof (backend as any).id === "string" &&
    (backend as any).id !== ""
  );
}
```

### 7.3 文件数据格式演进

**问题：** V1 的 `FileDataV1` 使用字符串数组存储行，不支持二进制；需要支持 MIME 类型。

**方案：** V2 `FileDataV2`

```typescript
// V1：行数组
interface FileDataV1 {
  content: string[];  // 按行存储
  created_at: string;
  modified_at: string;
}

// V2：单字符串或二进制
interface FileDataV2 {
  content: string | Uint8Array;  // 支持二进制
  mimeType: string;               // MIME 类型
  created_at: string;
  modified_at: string;
}
```

**迁移策略：** `migrateToFileDataV2` 函数自动将 V1 转换为 V2

### 7.4 Sandbox 为什么选择零运行时依赖

**问题：** 沙箱环境可能是最小化 Linux 容器（如 Alpine），不一定有 Python 或 Node.js。

**方案：** 所有文件操作通过 POSIX shell 命令实现

**命令构建原则：**

- `find` / `stat` / `awk` / `grep` 是所有 Linux 发行版的基本工具
- 优先使用 GNU find 的 `-printf`（最可靠）
- 降级检测：`find /dev/null -maxdepth 0 -printf ''` 测试是否支持

### 7.5 State Backend 的 Zero-Arg 设计

**问题：** 旧版 `StateBackend(runtime: BackendRuntime)` 强耦合 LangGraph 运行时。

**方案：** 零参数构造函数 + 从 LangGraph 上下文获取状态

```typescript
// 新设计
constructor(options?: BackendOptions) {
  this.runtime = undefined;  // 不依赖注入
}

// 状态从执行上下文获取
private getFiles(): Record<string, FileData> {
  const state = getCurrentTaskInput<{ files?: Record<string, FileData> }>();
  return state?.files || {};
}
```

**收益：** Backend 实例可以更方便地复用和组合

---

## 附录：文件索引

| 文件 | 用途 |
|------|------|
| `libs/deepagents/src/backends/protocol.ts` | 协议定义（V1/V2 类型、Result 类型、Sandbox 类型） |
| `libs/deepagents/src/backends/v1/protocol.ts` | V1 协议接口（已废弃） |
| `libs/deepagents/src/backends/v2/protocol.ts` | V2 协议接口（当前版本） |
| `libs/deepagents/src/backends/state.ts` | StateBackend 实现 |
| `libs/deepagents/src/backends/store.ts` | StoreBackend 实现 |
| `libs/deepagents/src/backends/filesystem.ts` | FilesystemBackend 实现 |
| `libs/deepagents/src/backends/composite.ts` | CompositeBackend 实现 |
| `libs/deepagents/src/backends/sandbox.ts` | BaseSandbox 抽象基类 |
| `libs/deepagents/src/backends/local-shell.ts` | LocalShellBackend 实现 |
| `libs/deepagents/src/backends/langsmith.ts` | LangSmithSandbox 实现 |
| `libs/deepagents/src/backends/utils.ts` | 工具函数（适配器、格式化、迁移） |
| `libs/deepagents/src/backends/index.ts` | 统一导出 |
