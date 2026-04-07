/**
 * Architect Agent - responsible for architecture design and planning
 * @module agents/architect-agent
 */

import type { Task, ExecutionContext, TaskResult } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'architect-agent' });

/**
 * Architect Agent specializes in system design and architecture
 */
export class ArchitectAgent extends BaseAgent {
  constructor() {
    super('architect', {
      type: 'architect',
      name: 'Architect Agent',
      description: 'Responsible for architecture design, technology selection, and PLANNING.md generation',
      tools: ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'web_search'],
      model: 'claude-sonnet-4-6',
      tokenBudget: 80000,
    });
  }

  /**
   * Initialize architect agent
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Architect Agent');
    this.addSystemMessage('Architect Agent initialized - ready for architecture design tasks');
  }
}

  /**
   * Execute architecture design task
   */
  async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const startTime = Date.now();
    logger.info({ taskId: task.id, taskName: task.name }, 'Executing architecture task');

    this.addHumanMessage(`Starting architecture task: ${task.name}`);

    try {
      // Architecture tasks involve:
      // 1. Analyzing requirements
      // 2. Designing system structure
      // 3. Creating PLANNING.md
      // 4. Defining API contracts

      const files: Record<string, string> = {};

      // Generate PLANNING.md content
      const planningContent = this.generatePlanningContent(task);
      files['PLANNING.md'] = planningContent;

      // Generate architecture document
      const archDoc = this.generateArchitectureDocument(task);
      files['docs/architecture.md'] = archDoc;

      // Generate API contracts if needed
      const apiContracts = this.generateAPIContracts(task);
      for (const [path, content] of Object.entries(apiContracts)) {
        files[path] = content;
      }

      this.addAIMessage(`Architecture design completed for: ${task.name}`);

      return {
        taskId: task.id,
        status: 'success',
        output: {
          files,
          messages: [
            `Architecture design completed for ${task.name}`,
            'PLANNING.md generated with task decomposition',
            'API contracts defined',
          ],
        },
        tokenUsage: {
          inputTokens: 5000,
          outputTokens: 8000,
        },
        duration: Date.now() - startTime,
        logs: [],
      };
    } catch (error) {
      logger.error({ taskId: task.id, error }, 'Architecture task failed');
      return {
        taskId: task.id,
        status: 'failed',
        output: { files: {}, messages: [] },
        tokenUsage: { inputTokens: 5000, outputTokens: 2000 },
        duration: Date.now() - startTime,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate PLANNING.md content
   */
  private generatePlanningContent(task: Task): string {
    return `# Planning Document

## Task: ${task.name}

${task.description ? `### Description\n${task.description}\n` : ''}

### Task Decomposition

${task.owners.map(owner => `- [ ] **${owner}**: ${this.getOwnerDescription(owner)}`).join('\n')}

### Tech Stack Recommendations

| Category | Technology | Rationale |
|----------|------------|-----------|
| Language | TypeScript | Type safety for large-scale applications |
| Framework | Node.js | Unified language for frontend/backend |
| Database | PostgreSQL | Robust relational with JSON support |
| Testing | Vitest | Fast, TypeScript-native testing |

### File Structure

\`\`\`
src/
├── api/           # API routes and controllers
├── services/      # Business logic
├── models/        # Data models
├── utils/         # Utilities
└── types/         # Type definitions
\`\`\`

### API Contracts

See \`docs/architecture.md\` for detailed API contracts.

### Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Parallel task conflicts | Medium | Use module-based file isolation |
| Dependency chain delays | Low | Execute independent tasks first |

### Acceptance Criteria

- [ ] Architecture review completed
- [ ] Tech stack confirmed
- [ ] API contracts defined
- [ ] File structure created
`;
  }

  /**
   * Generate architecture document
   */
  private generateArchitectureDocument(task: Task): string {
    return `# Architecture Document

## System Architecture

### High-Level Design

\`\`\`
┌─────────────────────────────────────────┐
│           User Interaction              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         API Gateway / Router            │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌───▼───┐   ┌───▼───┐
│ API 1 │   │ API 2 │   │ API 3 │
└───┬───┘   └───┬───┘   └───┬───┘
    │           │           │
└───┴───────────┴───────────┘
                │
┌───────────────▼───────────────┐
│         Data Layer            │
└───────────────────────────────┘
\`\`\`

### Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.x |
| API | REST |
| Database | PostgreSQL |

### Module Design

#### ${task.name}

${task.description || 'Task-specific module implementation'}

### Security Considerations

- Input validation at API boundaries
- SQL injection prevention via parameterized queries
- XSS prevention via output encoding
`;
  }

  /**
   * Generate API contracts
   */
  private generateAPIContracts(task: Task): Record<string, string> {
    const contracts: Record<string, string> = {};

    // Generate basic CRUD API contract
    const moduleName = task.name.toLowerCase().replace(/\s+/g, '-');
    contracts[`docs/api/${moduleName}.md`] = `# API Contract: ${task.name}

## Endpoints

### GET /api/${moduleName}
List all ${moduleName} items.

**Response:**
\`\`\`json
{
  "data": [],
  "total": 0
}
\`\`\`

### POST /api/${moduleName}
Create a new ${moduleName} item.

**Request:**
\`\`\`json
{
  "name": "string",
  "description": "string"
}
\`\`\`

### GET /api/${moduleName}/:id
Get a specific ${moduleName} item.

### PUT /api/${moduleName}/:id
Update a ${moduleName} item.

### DELETE /api/${moduleName}/:id
Delete a ${moduleName} item.
`;

    return contracts;
  }

  /**
   * Get owner description for task
   */
  private getOwnerDescription(owner: string): string {
    switch (owner) {
      case 'architect':
        return 'System architecture and tech stack design';
      case 'backend-dev':
        return 'API and business logic implementation';
      case 'frontend-dev':
        return 'User interface implementation';
      case 'qa-engineer':
        return 'Test coverage and quality assurance';
      default:
        return 'Task execution';
    }
  }

  /**
   * Add system message to state
   */
  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date(),
    });
  }
}
