/**
 * Memory - Working Memory implementation
 * @module memory/working-memory
 */

import type {
  BaseMessage,
  FileData,
  Todo,
  SkillMeta,
  SerializedMessage,
  SerializedFile,
  SerializedTodo,
  CurrentTask,
} from '../types/index.js';
import { generateId } from '../utils/id-generator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'working-memory' });

/**
 * Working Memory - current conversation context
 */
export class WorkingMemory {
  private messages: BaseMessage[] = [];
  private files: Map<string, FileData> = new Map();
  private todos: Todo[] = [];
  private skillsMetadata: Map<string, SkillMeta> = new Map();
  private currentTask: CurrentTask | null = null;

  constructor() {
    logger.debug('WorkingMemory initialized');
  }

  /**
   * Add a message to working memory
   */
  addMessage(type: BaseMessage['type'], content: string): BaseMessage {
    const message: BaseMessage = {
      id: generateId(),
      type,
      content,
      timestamp: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  /**
   * Get all messages
   */
  getMessages(): BaseMessage[] {
    return [...this.messages];
  }

  /**
   * Update a file in memory
   */
  updateFile(path: string, content: string, language?: string): void {
    this.files.set(path, {
      path,
      content,
      language,
      lastModified: new Date(),
    });
    logger.debug({ path }, 'File updated in working memory');
  }

  /**
   * Get a file from memory
   */
  getFile(path: string): FileData | undefined {
    return this.files.get(path);
  }

  /**
   * Get all files
   */
  getAllFiles(): Map<string, FileData> {
    return new Map(this.files);
  }

  /**
   * Delete a file from memory
   */
  deleteFile(path: string): void {
    this.files.delete(path);
  }

  /**
   * Add a todo
   */
  addTodo(content: string, priority?: Todo['priority']): Todo {
    const todo: Todo = {
      id: generateId(),
      content,
      status: 'pending',
      priority,
      createdAt: new Date(),
    };
    this.todos.push(todo);
    return todo;
  }

  /**
   * Update todo status
   */
  updateTodo(todoId: string, status: Todo['status']): void {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      todo.status = status;
      if (status === 'completed') {
        todo.completedAt = new Date();
      }
    }
  }

  /**
   * Get all todos
   */
  getTodos(): Todo[] {
    return [...this.todos];
  }

  /**
   * Set current task
   */
  setCurrentTask(taskId: string, description: string): void {
    this.currentTask = { id: taskId, description, progress: 0 };
  }

  /**
   * Update task progress
   */
  updateProgress(progress: number): void {
    if (this.currentTask) {
      this.currentTask.progress = Math.min(100, Math.max(0, progress));
    }
  }

  /**
   * Get current task
   */
  getCurrentTask(): CurrentTask | null {
    return this.currentTask;
  }

  /**
   * Clear current task
   */
  clearCurrentTask(): void {
    this.currentTask = null;
  }

  /**
   * Update skill metadata
   */
  updateSkillMetadata(skillId: string, metadata: Partial<SkillMeta>): void {
    const existing = this.skillsMetadata.get(skillId);
    if (existing) {
      this.skillsMetadata.set(skillId, { ...existing, ...metadata });
    } else {
      this.skillsMetadata.set(skillId, {
        skillId,
        name: metadata.name ?? skillId,
        lastUsed: new Date(),
        successRate: metadata.successRate ?? 0,
      });
    }
  }

  /**
   * Get skill metadata
   */
  getSkillMetadata(skillId: string): SkillMeta | undefined {
    return this.skillsMetadata.get(skillId);
  }

  /**
   * Get all skill metadata
   */
  getAllSkillMetadata(): Map<string, SkillMeta> {
    return new Map(this.skillsMetadata);
  }

  /**
   * Count tokens (rough estimate)
   */
  countTokens(): number {
    let total = 0;

    // Messages
    for (const msg of this.messages) {
      total += msg.content.split(/\s+/).length * 1.3; // Rough token estimate
    }

    // Files
    for (const file of this.files.values()) {
      total += file.content.split(/\s+/).length * 1.3;
    }

    // Todos
    for (const todo of this.todos) {
      total += todo.content.split(/\s+/).length * 1.3;
    }

    return Math.ceil(total);
  }

  /**
   * Compress memory to target token count
   */
  compress(targetTokens: number): SerializedMessage[] {
    const compressed: SerializedMessage[] = [];

    // Keep system messages
    const systemMessages = this.messages.filter(m => m.type === 'system');
    compressed.push(...systemMessages.map(m => ({
      type: m.type,
      content: m.content,
    })));

    // Calculate current tokens
    let currentTokens = this.countTokens();

    // If under target, keep recent messages
    if (currentTokens <= targetTokens) {
      return compressed;
    }

    // Keep last few messages with summarization
    const recentMessages = this.messages
      .filter(m => m.type !== 'system')
      .slice(-10);

    for (const msg of recentMessages) {
      const msgTokens = msg.content.split(/\s+/).length * 1.3;
      if (currentTokens + msgTokens <= targetTokens) {
        compressed.push({
          type: msg.type,
          content: msg.content,
        });
        currentTokens += msgTokens;
      }
    }

    // Add summary if needed
    if (compressed.length > systemMessages.length) {
      compressed.push({
        type: 'system',
        content: `[Previous ${this.messages.length - recentMessages.length} messages summarized]`,
      });
    }

    return compressed;
  }

  /**
   * Serialize for checkpoint
   */
  toCheckpoint(): {
    messages: SerializedMessage[];
    currentTask: CurrentTask | null;
    files: Record<string, SerializedFile>;
    todos: SerializedTodo[];
  } {
    return {
      messages: this.messages.map(m => ({
        type: m.type,
        content: m.content,
      })),
      currentTask: this.currentTask,
      files: Object.fromEntries(
        Array.from(this.files.entries()).map(([path, data]) => [
          path,
          {
            path: data.path,
            content: data.content,
            language: data.language,
          },
        ])
      ),
      todos: this.todos.map(t => ({
        content: t.content,
        status: t.status,
        priority: t.priority,
      })),
    };
  }

  /**
   * Restore from checkpoint
   */
  fromCheckpoint(checkpoint: {
    messages: SerializedMessage[];
    currentTask: CurrentTask | null;
    files: Record<string, SerializedFile>;
    todos: SerializedTodo[];
  }): void {
    this.messages = checkpoint.messages.map((m, i) => ({
      id: `restored-${i}`,
      type: m.type,
      content: m.content,
      timestamp: new Date(),
    }));

    this.currentTask = checkpoint.currentTask;

    this.files = new Map(
      Object.entries(checkpoint.files).map(([path, data]) => [
        path,
        {
          path: data.path,
          content: data.content,
          language: data.language,
          lastModified: new Date(),
        },
      ])
    );

    this.todos = checkpoint.todos.map((t, i) => ({
      id: `restored-${i}`,
      content: t.content,
      status: t.status as Todo['status'],
      priority: t.priority as Todo['priority'] | undefined,
      createdAt: new Date(),
    }));
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.messages = [];
    this.files.clear();
    this.todos = [];
    this.skillsMetadata.clear();
    this.currentTask = null;
    logger.debug('WorkingMemory cleared');
  }
}
