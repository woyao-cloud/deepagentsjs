/**
 * Base Agent class for all agent implementations
 * @module agents/base-agent
 */

import type {
  AgentType,
  AgentConfig,
  AgentState,
  BaseMessage,
  FileData,
  Todo,
  Task,
  ExecutionContext,
  TaskResult,
  BudgetStatus,
  SerializedMessage,
  SerializedFile,
  SerializedTodo,
} from '../types/index.js';
import { generateId } from '../utils/id-generator.js';
import { createAgentLogger, type pino } from '../utils/logger.js';

const EXCLUDED_STATE_KEYS = [
  'messages',
  'todos',
  'structuredResponse',
  'skillsMetadata',
  'memoryContents',
] as const;

/**
 * Base class for all agents
 */
export abstract class BaseAgent {
  readonly id: string;
  readonly type: AgentType;
  protected config: AgentConfig;
  protected state: AgentState;
  protected logger: pino.Logger;

  constructor(type: AgentType, config: AgentConfig) {
    this.id = generateId();
    this.type = type;
    this.config = config;
    this.state = this.createInitialState();
    this.logger = createAgentLogger(this.id, this.type);
  }

  /**
   * Create initial agent state
   */
  protected createInitialState(): AgentState {
    return {
      messages: [],
      files: {},
      todos: [],
      skillsMetadata: {},
    };
  }

  /**
   * Initialize the agent
   */
  abstract initialize(): Promise<void>;

  /**
   * Execute a task
   */
  abstract executeTask(task: Task, context: ExecutionContext): Promise<TaskResult>;

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get serialized state for checkpointing
   */
  getSerializedState(): {
    messages: SerializedMessage[];
    files: Record<string, SerializedFile>;
    todos: SerializedTodo[];
  } {
    return {
      messages: this.state.messages.map(msg => ({
        type: msg.type,
        content: msg.content,
      })),
      files: Object.fromEntries(
        Object.entries(this.state.files).map(([path, data]) => [
          path,
          { path: data.path, content: data.content, language: data.language },
        ])
      ),
      todos: this.state.todos.map(todo => ({
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
      })),
    };
  }

  /**
   * Restore state from checkpoint
   */
  restoreState(serialized: {
    messages: SerializedMessage[];
    files: Record<string, SerializedFile>;
    todos: SerializedTodo[];
  }): void {
    this.state.messages = serialized.messages.map((msg, i) => ({
      id: `restored-${i}`,
      type: msg.type,
      content: msg.content,
      timestamp: new Date(),
    }));

    this.state.files = Object.fromEntries(
      Object.entries(serialized.files).map(([path, data]) => [
        path,
        {
          path: data.path,
          content: data.content,
          language: data.language,
          lastModified: new Date(),
        },
      ])
    );

    this.state.todos = serialized.todos.map((todo, i) => ({
      id: `restored-${i}`,
      content: todo.content,
      status: todo.status as Todo['status'],
      priority: todo.priority as Todo['priority'] | undefined,
      createdAt: new Date(),
    }));
  }

  /**
   * Add a message to the conversation
   */
  protected addMessage(
    type: BaseMessage['type'],
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    this.state.messages.push({
      id: generateId(),
      type,
      content,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Add human message
   */
  protected addHumanMessage(content: string): void {
    this.addMessage('human', content);
  }

  /**
   * Add AI message
   */
  protected addAIMessage(content: string): void {
    this.addMessage('ai', content);
  }

  /**
   * Add tool message
   */
  protected addToolMessage(content: string, metadata?: Record<string, unknown>): void {
    this.addMessage('tool', content, metadata);
  }

  /**
   * Update or add a file in state
   */
  protected updateFile(path: string, content: string, language?: string): void {
    this.state.files[path] = {
      path,
      content,
      language,
      lastModified: new Date(),
    };
  }

  /**
   * Get a file from state
   */
  protected getFile(path: string): FileData | undefined {
    return this.state.files[path];
  }

  /**
   * Add or update a todo
   */
  protected upsertTodo(todo: Omit<Todo, 'id' | 'createdAt'>): void {
    const existing = this.state.todos.find(t => t.content === todo.content);
    if (existing) {
      existing.status = todo.status;
      existing.priority = todo.priority;
      if (todo.status === 'completed') {
        existing.completedAt = new Date();
      }
    } else {
      this.state.todos.push({
        id: generateId(),
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
        createdAt: new Date(),
      });
    }
  }

  /**
   * Get current todo list
   */
  protected getTodos(): Todo[] {
    return [...this.state.todos];
  }

  /**
   * Filter state for sub-agent execution (context isolation)
   */
  filterStateForSubagent(taskDescription: string): AgentState {
    return {
      messages: [
        {
          id: generateId(),
          type: 'human',
          content: taskDescription,
          timestamp: new Date(),
        },
      ],
      files: { ...this.state.files },
      todos: [],
      skillsMetadata: {},
    };
  }

  /**
   * Check budget status
   */
  checkBudget?(): BudgetStatus;

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get agent type
   */
  getType(): AgentType {
    return this.type;
  }

  /**
   * Cleanup resources
   */
  async cleanup?(): Promise<void>;
}
