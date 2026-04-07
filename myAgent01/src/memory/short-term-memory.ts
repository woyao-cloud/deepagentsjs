/**
 * Short-Term Memory - session-scoped memory management
 * @module memory/short-term-memory
 */

import type {
  ShortTermMemory as ShortTermMemoryType,
  CompressedMessage,
  TaskMemory,
  Entity,
  CompressionStats,
} from '../types/index.js';
import { generateId } from '../utils/id-generator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'short-term-memory' });

/**
 * Default compression settings
 */
const DEFAULT_COMPRESSION_CONFIG = {
  targetTokens: 512000, // 512K tokens
  preserveSystemMessages: true,
  preserveRecentMessages: 10,
  preserveDecisions: true,
  preserveArtifacts: true,
};

/**
 * Short-Term Memory manages session-scoped memory with compression
 */
export class ShortTermMemory {
  private sessionId: string;
  private sessionStart: Date;
  private conversationHistory: CompressedMessage[] = [];
  private taskMemories: TaskMemory[] = [];
  private entityKnowledge: Entity[] = [];
  private compressionStats: CompressionStats;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? generateId();
    this.sessionStart = new Date();
    this.compressionStats = {
      originalTokens: 0,
      compressedTokens: 0,
      compressionRatio: 0,
      lastCompressedAt: new Date(),
    };
    logger.info({ sessionId: this.sessionId }, 'ShortTermMemory initialized');
  }

  /**
   * Add a compressed message to history
   */
  addCompressedMessage(
    type: 'human' | 'ai' | 'system' | 'tool',
    content: string,
    summary: string,
    tokenCount: number
  ): void {
    this.conversationHistory.push({
      type,
      content,
      summary,
      tokenCount,
    });
  }

  /**
   * Add a task memory (after task completion)
   */
  addTaskMemory(
    taskId: string,
    summary: string,
    keyDecisions: string[],
    learnings: string[],
    artifacts: Array<{ type: string; name: string; path: string; content?: string }>
  ): void {
    this.taskMemories.push({
      taskId,
      summary,
      keyDecisions,
      learnings,
      artifacts,
      completedAt: new Date(),
    });
    logger.info({ taskId }, 'Task memory added');
  }

  /**
   * Add or update an entity
   */
  addEntity(
    name: string,
    type: Entity['type'],
    description: string,
    aliases: string[] = []
  ): void {
    const existing = this.entityKnowledge.find(e => e.name === name);
    if (existing) {
      existing.description = description;
      existing.aliases = aliases;
      existing.lastReferencedAt = new Date();
    } else {
      this.entityKnowledge.push({
        name,
        type,
        description,
        aliases,
        lastReferencedAt: new Date(),
      });
    }
  }

  /**
   * Get entity by name
   */
  getEntity(name: string): Entity | undefined {
    const entity = this.entityKnowledge.find(
      e => e.name === name || e.aliases.includes(name)
    );
    if (entity) {
      entity.lastReferencedAt = new Date();
    }
    return entity;
  }

  /**
   * Search entities by type
   */
  getEntitiesByType(type: Entity['type']): Entity[] {
    return this.entityKnowledge.filter(e => e.type === type);
  }

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return [...this.entityKnowledge];
  }

  /**
   * Get task memory by task ID
   */
  getTaskMemory(taskId: string): TaskMemory | undefined {
    return this.taskMemories.find(t => t.taskId === taskId);
  }

  /**
   * Get all task memories
   */
  getAllTaskMemories(): TaskMemory[] {
    return [...this.taskMemories];
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): CompressedMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(): CompressionStats {
    return { ...this.compressionStats };
  }

  /**
   * Get session metadata
   */
  getSessionInfo(): { sessionId: string; sessionStart: Date; duration: number } {
    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      duration: Date.now() - this.sessionStart.getTime(),
    };
  }

  /**
   * Compress conversation history to target token count
   */
  compress(targetTokens?: number): CompressedMessage[] {
    const target = targetTokens ?? DEFAULT_COMPRESSION_CONFIG.targetTokens;
    const originalTokens = this.calculateTotalTokens();

    if (originalTokens <= target) {
      return this.conversationHistory;
    }

    const compressed: CompressedMessage[] = [];

    // Step 1: Preserve system messages if configured
    if (DEFAULT_COMPRESSION_CONFIG.preserveSystemMessages) {
      const systemMessages = this.conversationHistory.filter(m => m.type === 'system');
      compressed.push(...systemMessages);
    }

    // Step 2: Preserve recent messages
    const recentMessages = this.conversationHistory
      .filter(m => m.type !== 'system')
      .slice(-DEFAULT_COMPRESSION_CONFIG.preserveRecentMessages);
    compressed.push(...recentMessages);

    // Step 3: Summarize middle messages
    const middleMessages = this.conversationHistory
      .filter(m => m.type !== 'system')
      .slice(0, -DEFAULT_COMPRESSION_CONFIG.preserveRecentMessages);

    if (middleMessages.length > 0) {
      const summary = this.generateSummary(middleMessages);
      compressed.push({
        type: 'system',
        content: `[Previous ${middleMessages.length} messages summarized]`,
        summary,
        tokenCount: this.estimateTokens(summary),
      });
    }

    // Step 4: Update compression stats
    const compressedTokens = this.calculateTokens(compressed);
    this.compressionStats = {
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      lastCompressedAt: new Date(),
    };

    this.conversationHistory = compressed;
    logger.info(this.compressionStats, 'Conversation history compressed');

    return compressed;
  }

  /**
   * Calculate total tokens in conversation history
   */
  private calculateTotalTokens(): number {
    return this.conversationHistory.reduce((sum, msg) => sum + msg.tokenCount, 0);
  }

  /**
   * Calculate tokens in a message array
   */
  private calculateTokens(messages: CompressedMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
  }

  /**
   * Estimate tokens in a string
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.split(/\s+/).length * 1.3);
  }

  /**
   * Generate a summary of messages
   */
  private generateSummary(messages: CompressedMessage[]): string {
    // In a real implementation, this would use an LLM to generate a summary
    // For now, we'll create a simple placeholder
    const humanMessages = messages.filter(m => m.type === 'human');
    const aiMessages = messages.filter(m => m.type === 'ai');

    return `Session contained ${humanMessages.length} human messages and ${aiMessages.length} AI responses. ` +
      `Key topics discussed: [Summary not available - LLM integration required]`;
  }

  /**
   * Search conversation history
   */
  searchHistory(query: string): CompressedMessage[] {
    const lowerQuery = query.toLowerCase();
    return this.conversationHistory.filter(
      msg =>
        msg.content.toLowerCase().includes(lowerQuery) ||
        msg.summary.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Export memory for long-term storage
   */
  exportForLongTerm(): {
    sessionId: string;
    sessionStart: Date;
    conversationHistory: CompressedMessage[];
    taskMemories: TaskMemory[];
    entityKnowledge: Entity[];
    compressionStats: CompressionStats;
  } {
    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      conversationHistory: [...this.conversationHistory],
      taskMemories: [...this.taskMemories],
      entityKnowledge: [...this.entityKnowledge],
      compressionStats: { ...this.compressionStats },
    };
  }

  /**
   * Import from long-term storage
   */
  importFromLongTerm(data: {
    sessionId: string;
    conversationHistory: CompressedMessage[];
    taskMemories: TaskMemory[];
    entityKnowledge: Entity[];
  }): void {
    this.sessionId = data.sessionId;
    this.conversationHistory = data.conversationHistory;
    this.taskMemories = data.taskMemories;
    this.entityKnowledge = data.entityKnowledge;
    logger.info({ sessionId: this.sessionId }, 'Imported from long-term storage');
  }

  /**
   * Archive session to long-term memory format
   * Returns data suitable for LongTermMemory.addSessionArchive()
   */
  archive(): LongTermMemoryArchive {
    const sessionData = this.exportForLongTerm();

    // Convert task memories to agent notes for long-term storage
    const agentNotes = sessionData.taskMemories.map(task => ({
      noteId: `session-${sessionData.sessionId}-${task.taskId}`,
      agentType: 'sub-agent', // Default type, can be customized
      content: `Session ${sessionData.sessionId} - Task ${task.taskId}: ${task.summary}`,
      context: {
        project: '', // To be filled by caller
        taskType: task.taskId,
      },
      createdAt: task.completedAt,
      updatedAt: new Date(),
    }));

    logger.info({
      sessionId: this.sessionId,
      taskCount: sessionData.taskMemories.length,
      noteCount: agentNotes.length,
    }, 'Session archived for long-term storage');

    return {
      sessionId: sessionData.sessionId,
      sessionStart: sessionData.sessionStart,
      archivedAt: new Date(),
      conversationHistory: sessionData.conversationHistory,
      taskMemories: sessionData.taskMemories,
      entityKnowledge: sessionData.entityKnowledge,
      compressionStats: sessionData.compressionStats,
      agentNotes,
    };
  }

  /**
   * Archive entry for long-term memory
   */
  interface LongTermMemoryArchive {
    sessionId: string;
    sessionStart: Date;
    archivedAt: Date;
    conversationHistory: CompressedMessage[];
    taskMemories: TaskMemory[];
    entityKnowledge: Entity[];
    compressionStats: CompressionStats;
    agentNotes: Array<{
      noteId: string;
      agentType: string;
      content: string;
      context: { project: string; taskType: string };
      createdAt: Date;
      updatedAt: Date;
    }>;
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.conversationHistory = [];
    this.taskMemories = [];
    this.entityKnowledge = [];
    this.compressionStats = {
      originalTokens: 0,
      compressedTokens: 0,
      compressionRatio: 0,
      lastCompressedAt: new Date(),
    };
    logger.debug({ sessionId: this.sessionId }, 'ShortTermMemory cleared');
  }
}
