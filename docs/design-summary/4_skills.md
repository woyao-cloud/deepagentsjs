# Skills 模块系统设计

**文档日期:** 2026-04-06

---

## 1. 模块概述

### 功能定位

Skills 模块是 deepagents 的核心能力扩展机制，遵循 Anthropic Agent Skills 规范实现。它允许 AI Agent 在运行时发现和使用预先定义的专业技能（Skills），每个技能包含结构化的工作流程、最佳实践和领域知识。

**核心职责:**
- 从文件系统或后端存储加载技能定义（SKILL.md）
- 解析 YAML frontmatter 元数据
- 将技能清单注入 Agent 的系统提示词
- 实现渐进式披露（Progressive Disclosure）模式

**设计目标:**
1. **模块化** - 技能以目录为单位，自包含指令和辅助文件
2. **可发现性** - Agent 可在运行时感知可用技能及其用途
3. **分层覆盖** - 支持基础技能 → 用户技能 → 项目技能的层层叠加
4. **后端无关** - 通过 Backend Protocol 抽象存储访问，支持文件系统、远程存储等多种后端
5. **规范兼容** - 严格遵循 Agent Skills 规范（agentskills.io/specification）

### 关键文件

| 文件路径 | 用途 |
|---------|------|
| `libs/deepagents/src/skills/loader.ts` | 技能加载与元数据解析核心逻辑 |
| `libs/deepagents/src/skills/index.ts` | 公共 API 导出 |
| `libs/deepagents/src/middleware/skills.ts` | SkillsMiddleware 实现 |
| `libs/deepagents/src/middleware/skills.test.ts` | 单元测试 |
| `libs/deepagents/src/skills/loader.test.ts` | 加载器测试 |
| `libs/deepagents/src/skills/index.int.test.ts` | 集成测试 |

---

## 2. 技能定义格式

### SKILL.md 结构

每个技能是一个目录，必须包含 `SKILL.md` 文件，采用 YAML frontmatter + Markdown 正文的格式：

```markdown
---
name: web-research
description: 使用此技能处理网络研究请求；它提供结构化的综合网络研究方法
license: MIT
compatibility: Node.js 18+
allowed-tools: read_file write_file web_search
---

# Web Research Skill

## When to Use
- 用户要求研究某个主题时使用
...
```

### 字段规范

**必填字段:**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `name` | string | 1-64字符，小写字母、数字、连字符 | 必须与父目录名一致 |
| `description` | string | 1-1024字符 | 描述技能用途和适用场景 |

**可选字段:**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `license` | string | 许可证名称 | 如 "MIT"、"Apache-2.0" |
| `compatibility` | string | 最多500字符 | 环境要求，如 "Python 3.10+" |
| `allowed-tools` | string \| string[] | 空格分隔或 YAML 列表 | 推荐使用的工具列表 |
| `metadata` | object | key-value 都是字符串 | 扩展元数据 |

### 目录结构示例

```
skills/
├── web-research/
│   ├── SKILL.md           # 必需：技能定义
│   ├── research_utils.py  # 可选：辅助脚本
│   └── prompts.md         # 可选：参考文档
├── code-review/
│   ├── SKILL.md
│   └── review_checklist.md
```

---

## 3. 技能加载流程

### 核心函数

#### `listSkills(options: ListSkillsOptions): SkillMetadata[]`

入口函数，按优先级合并加载用户技能和项目技能：

```typescript
// libs/deepagents/src/skills/loader.ts
export function listSkills(options: ListSkillsOptions): SkillMetadata[] {
  const allSkills: Map<string, SkillMetadata> = new Map();

  // 1. 先加载用户技能（基础层）
  if (options.userSkillsDir) {
    const userSkills = listSkillsFromDir(options.userSkillsDir, "user");
    for (const skill of userSkills) {
      allSkills.set(skill.name, skill);
    }
  }

  // 2. 再加载项目技能（覆盖层）
  if (options.projectSkillsDir) {
    const projectSkills = listSkillsFromDir(options.projectSkillsDir, "project");
    for (const skill of projectSkills) {
      allSkills.set(skill.name, skill); // 同名覆盖
    }
  }

  return Array.from(allSkills.values());
}
```

**处理逻辑:**
1. 展开 `~` 为用户主目录
2. 使用 `fs.realpathSync` 解析规范路径（跟随符号链接）
3. 遍历子目录，查找包含 SKILL.md 的目录
4. 调用 `parseSkillMetadata` 解析每个技能
5. 使用 Map 按名称去重，项目技能覆盖用户技能

#### `parseSkillMetadata(skillMdPath: string, source: "user" | "project"): SkillMetadata | null`

解析单个 SKILL.md 文件：

```typescript
// libs/deepagents/src/skills/loader.ts
export function parseSkillMetadata(
  skillMdPath: string,
  source: "user" | "project",
): SkillMetadata | null {
  // 1. 安全检查：文件大小限制（10MB）
  const stats = fs.statSync(skillMdPath);
  if (stats.size > MAX_SKILL_FILE_SIZE) {
    console.warn(`Skipping ${skillMdPath}: file too large`);
    return null;
  }

  // 2. 读取内容并提取 frontmatter
  const content = fs.readFileSync(skillMdPath, "utf-8");
  const frontmatter = parseFrontmatter(content); // 使用 yaml 库解析

  // 3. 验证必填字段
  if (!frontmatter.name || !frontmatter.description) {
    return null;
  }

  // 4. 验证 name 格式（必须与目录名一致）
  const directoryName = path.basename(path.dirname(skillMdPath));
  const validation = validateSkillName(String(name), directoryName);
  if (!validation.valid) {
    console.warn(`Skill '${name}' does not follow spec...`);
    // 警告但仍加载（向后兼容）
  }

  // 5. 截断超长字段
  if (descriptionStr.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    descriptionStr = descriptionStr.slice(0, MAX_SKILL_DESCRIPTION_LENGTH);
  }

  return { name, description, path, source, license, compatibility, metadata, allowedTools };
}
```

#### `parseSkillMetadataFromContent(content: string, skillPath: string, directoryName: string)`

Middleware 版本，解析字符串内容而非文件路径（用于后端无关的场景）：

- 使用正则 `/^---\s*\n([\s\S]*?)\n---\s*\n/` 提取 frontmatter
- 通过 `yaml.parse()` 解析 YAML
- 支持 `allowed-tools` 字段的两种格式：YAML 列表或空格分隔字符串

### 路径安全验证

```typescript
// libs/deepagents/src/skills/loader.ts
function isSafePath(targetPath: string, baseDir: string): boolean {
  try {
    const resolvedPath = fs.realpathSync(targetPath);  // 解析符号链接
    const resolvedBase = fs.realpathSync(baseDir);
    return (
      resolvedPath.startsWith(resolvedBase + path.sep) ||
      resolvedPath === resolvedBase
    );
  } catch {
    return false; // 符号链接循环等错误
  }
}
```

**防护目标:** 阻止通过符号链接或路径遍历访问技能目录外的文件。

---

## 4. 技能与中间件的集成

### SkillsMiddleware 架构

```typescript
// libs/deepagents/src/middleware/skills.ts
export function createSkillsMiddleware(options: SkillsMiddlewareOptions) {
  const { backend, sources } = options;
  let loadedSkills: SkillMetadata[] = []; // 闭包存储

  return createMiddleware({
    name: "SkillsMiddleware",
    stateSchema: SkillsStateSchema,

    // 阶段1: Agent 执行前加载技能
    async beforeAgent(state) {
      // 检查是否已加载或已从 checkpoint 恢复
      if (loadedSkills.length > 0) {
        return undefined;
      }
      if (state.skillsMetadata?.length > 0) {
        loadedSkills = state.skillsMetadata;
        return undefined;
      }

      // 从后端加载所有源
      const resolvedBackend = await resolveBackend(backend, { state });
      const allSkills = new Map<string, SkillMetadata>();

      for (const sourcePath of sources) {
        const skills = await listSkillsFromBackend(resolvedBackend, sourcePath);
        for (const skill of skills) {
          allSkills.set(skill.name, skill); // 后加载的覆盖先加载的
        }
      }

      loadedSkills = Array.from(allSkills.values());
      return { skillsMetadata: loadedSkills };
    },

    // 阶段2: 模型调用时注入技能清单到系统提示词
    wrapModelCall(request, handler) {
      const skillsMetadata = loadedSkills.length > 0
        ? loadedSkills
        : (request.state?.skillsMetadata || []);

      const skillsLocations = formatSkillsLocations(sources);
      const skillsList = formatSkillsList(skillsMetadata, sources);

      const skillsSection = SKILLS_SYSTEM_PROMPT
        .replace("{skills_locations}", skillsLocations)
        .replace("{skills_list}", skillsList);

      const newSystemMessage = request.systemMessage.concat(skillsSection);
      return handler({ ...request, systemMessage: newSystemMessage });
    },
  });
}
```

### 注入的系统提示词格式

```markdown
## Skills System

You have access to a skills library that provides specialized capabilities and domain knowledge.

**User Skills**: `/path/to/user/skills/` (lower priority)
**Project Skills**: `/path/to/project/skills/` (higher priority)

**Available Skills:**

- **web-research**: Structured approach to conducting thorough web research (License: MIT)
  → Allowed tools: read_file, write_file, web_search
  → Read `/path/to/skills/web-research/SKILL.md` for full instructions
- **code-review**: Systematic code review process with best practices
  → Read `/path/to/skills/code-review/SKILL.md` for full instructions

**How to Use Skills (Progressive Disclosure):**

Skills follow a **progressive disclosure** pattern - you know they exist (name + description above), but you only read the full instructions when needed:

1. **Recognize when a skill applies**: Check if the user's task matches any skill's description
2. **Read the skill's full instructions**: The skill list above shows the exact path to use with read_file
3. **Follow the skill's instructions**: SKILL.md contains step-by-step workflows, best practices, and examples
...
```

### 状态管理

```typescript
// libs/deepagents/src/middleware/skills.ts
const SkillsStateSchema = new StateSchema({
  skillsMetadata: new ReducedValue(
    z.array(SkillMetadataEntrySchema).default(() => []),
    {
      inputSchema: z.array(SkillMetadataEntrySchema).optional(),
      reducer: skillsMetadataReducer, // 合并并行子 agent 的技能
    },
  ),
  files: filesValue,
});

// 合并策略：按名称去重，后者覆盖前者
export function skillsMetadataReducer(
  current: SkillMetadataEntry[] | undefined,
  update: SkillMetadataEntry[] | undefined,
): SkillMetadataEntry[] {
  const merged = new Map<string, SkillMetadataEntry>();
  for (const skill of current || []) {
    merged.set(skill.name, skill);
  }
  for (const skill of update || []) {
    merged.set(skill.name, skill);
  }
  return Array.from(merged.values());
}
```

---

## 5. 技能元数据 Schema

### SkillMetadataEntrySchema

```typescript
// libs/deepagents/src/middleware/skills.ts
export const SkillMetadataEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
  license: z.string().nullable().optional(),
  compatibility: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
});

export type SkillMetadataEntry = z.infer<typeof SkillMetadataEntrySchema>;
```

### 字段用途

| 字段 | 用途 |
|------|------|
| `name` | 技能唯一标识，用于去重和引用 |
| `description` | Agent 识别何时使用此技能的依据 |
| `path` | Agent 使用 `read_file` 工具读取完整指令的路径 |
| `license` | 显示在技能清单中，便于 Agent 了解使用限制 |
| `compatibility` | 显示环境要求，帮助 Agent 判断适用性 |
| `metadata` | 自定义扩展数据，可存储技能版本、标签等 |
| `allowedTools` | 实验性字段，指示推荐的工具集 |

### 验证规则

```typescript
// libs/deepagents/src/middleware/skills.ts
export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const MAX_SKILL_COMPATIBILITY_LENGTH = 500;
export const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 名称验证（遵循 Unicode lowercase alphanumeric + 单连字符规范）
export function validateSkillName(
  name: string,
  directoryName: string,
): { valid: boolean; error: string } {
  if (!name || name.length > MAX_SKILL_NAME_LENGTH) {
    return { valid: false, error: "name exceeds 64 characters" };
  }
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
    return { valid: false, error: "invalid hyphen pattern" };
  }
  for (const c of name) {
    if (c === "-") continue;
    if (/\p{Ll}/u.test(c) || /\p{Nd}/u.test(c)) continue; // Unicode lowercase + digit
    return { valid: false, error: "must be lowercase alphanumeric" };
  }
  if (name !== directoryName) {
    return { valid: false, error: "must match directory name" };
  }
  return { valid: true, error: "" };
}
```

---

## 6. 技能分类与发现

### 分层架构

```
技能源（Sources）
├── 用户技能层（User Skills）
│   └── ~/.deepagents/<agent-name>/skills/
│       - 个人专用技能
│       - 优先级：低
│
├── 项目技能层（Project Skills）
│   └── <project>/.deepagents/skills/
│       - 团队共享技能
│       - 优先级：高（覆盖同名用户技能）
│
└── 外部技能源（可扩展）
    └── 通过 Backend Protocol 支持任意存储
```

### 发现机制

**在 Agent 启动时：**
1. `beforeAgent` 钩子调用 `listSkillsFromBackend`
2. 遍历配置的源路径，查找子目录
3. 对每个子目录检查是否存在 `SKILL.md`
4. 解析并验证 frontmatter 元数据
5. 返回 `SkillMetadata[]` 注入状态

**Agent 运行时感知技能：**
1. `wrapModelCall` 钩子将技能清单追加到系统提示词
2. 技能清单包含名称、描述、路径
3. Agent 根据描述自主判断何时使用技能
4. 需要时使用 `read_file` 工具读取完整 SKILL.md

### 渐进式披露模式

```
阶段1: 感知
├── 系统提示词包含技能清单（名称 + 描述）
└── Agent 知道存在哪些技能，但不加载具体内容

阶段2: 触发
├── Agent 判断任务匹配某技能
└── 使用 read_file 工具读取 SKILL.md 路径

阶段3: 执行
├── 解析 Markdown 正文中的工作流程
└── 按技能指令执行任务
```

### 示例工作流

```
用户: "帮我研究量子计算最新进展"

Agent 推理:
1. 查看技能清单 → 发现 "web-research" 技能
2. 读取 /skills/project/web-research/SKILL.md
3. 按照技能指令:
   - 创建 research_quantum_computing/ 目录
   - 编写 research_plan.md
   - 使用 task 工具委托子代理
   - 综合子代理发现
4. 输出研究报告
```

---

## 7. 设计决策

### 决策1: SKILL.md 文件格式而非代码注册

**替代方案:** 在代码中定义技能对象或使用数据库存储

**选择理由:**
1. **可读性** - Markdown 格式人类可读，便于编辑和维护
2. **版本控制** - SKILL.md 可纳入 git 管理，追踪变更历史
3. **分离关注点** - 技能内容与实现逻辑解耦
4. **规范性** - 遵循 Agent Skills 规范，与外部生态兼容
5. **渐进式披露** - 文件系统结构天然支持感知 → 加载 → 执行的分层加载

**代价:**
- 需要解析 YAML frontmatter
- 文件 I/O 操作
- 路径安全验证

### 决策2: 多源分层覆盖

**设计:**
```typescript
sources: ["/skills/user/", "/skills/project/"]
// 后加载的源覆盖先加载的同名技能
```

**理由:**
- **灵活性** - 允许项目层覆盖默认行为
- **团队协作** - 项目可定义团队统一的工作流程
- **个人定制** - 用户可在项目覆盖基础上进一步个性化
- **显式优于隐式** - 覆盖规则清晰，易于理解和调试

### 决策3: 后端抽象（Backend Protocol）

**设计:** 使用 `AnyBackendProtocol` 抽象文件系统访问

**理由:**
1. **测试友好** - 可注入 MockBackend 而非依赖真实文件系统
2. **扩展性** - 可从远程存储、数据库或 API 加载技能
3. **沙箱化** - 可在受限环境中运行 Agent
4. **一致性** - 与 Agent Memory 等其他模块共享抽象

**代码示例:**
```typescript
// libs/deepagents/src/middleware/skills.ts
const middleware = createSkillsMiddleware({
  backend: new FilesystemBackend({ rootDir: "/" }),  // 文件系统后端
  sources: ["/skills/user/", "/skills/project/"],
});
```

### 决策4: 元数据校验策略

**设计:** 验证失败时仅警告，不阻断加载

```typescript
// libs/deepagents/src/skills/loader.ts
const validation = validateSkillName(name, directoryName);
if (!validation.valid) {
  console.warn(`Skill '${name}' does not follow spec...`);
  // 仍继续加载，不抛出错误
}
```

**理由:**
- **向后兼容** - 旧技能即使不完全符合规范也能加载
- **渐进迁移** - 团队可逐步规范化现有技能
- **降低门槛** - 新用户创建技能时不会被严格校验阻挡

**风险可控:**
- 警告信息引导正确做法
- Agent 仍可使用技能，只是可能不稳定

### 决策5: 闭包缓存而非状态依赖

**设计:**
```typescript
let loadedSkills: SkillMetadata[] = []; // 闭包变量

async beforeAgent(state) {
  if (loadedSkills.length > 0) return undefined; // 直接使用缓存
  // ...
}
```

**理由:**
1. **性能** - 避免每次 Agent 调用都重新加载
2. **一致性** - 单次加载确保响应内技能列表稳定
3. **简化状态管理** - 减少状态同步复杂性

**限制:**
- 闭包缓存在 Agent 实例生命周期内有效
- Checkpoint 恢复时需从状态恢复：`state.skillsMetadata`

---

## 附录: 测试覆盖

| 测试文件 | 覆盖范围 |
|---------|---------|
| `middleware/skills.test.ts` | 单元测试：Middleware 逻辑、名称验证、格式函数 |
| `skills/loader.test.ts` | 单元测试：加载器、前matter 解析、路径安全 |
| `skills/index.int.test.ts` | 集成测试：完整工作流、中间件组合 |

*设计文档: 2026-04-06*
