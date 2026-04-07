/**
 * Memory Merger - context reconstruction and merging utilities
 * @module memory/memory-merger
 */

import type {
  MemoryEntry,
  ContextSnippet,
  RetrievedContext,
  SessionMatch,
} from '../types/index.js';
import type { WorkingMemory } from './working-memory.js';
import type { ShortTermMemory } from './short-term-memory.js';
import type { LongTermMemory } from './long-term-memory.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'memory-merger' });

/**
 * Merge options
 */
export interface MergeOptions {
  maxTokens: number;
  preserveWorkingMessages?: number;
  preserveDecisions?: boolean;
  includePatterns?: boolean;
}

/**
 * Merge result
 */
export interface MergeResult {
  mergedMemory: WorkingMemory;
  totalTokens: number;
  snippetsUsed: number;
  droppedReason?: string;
}

/**
 * Memory Merger handles context reconstruction across memory tiers
 */
export class MemoryMerger {
  private workingMemory: WorkingMemory;
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;

  constructor(
    workingMemory: WorkingMemory,
    shortTermMemory: ShortTermMemory,
    longTermMemory: LongTermMemory
  ) {
    this.workingMemory = workingMemory;
    this.shortTermMemory = shortTermMemory;
    this.longTermMemory = longTermMemory;
    logger.debug('MemoryMerger initialized');
  }

  /**
   * Merge retrieved context with current working memory
   */
  async merge(
    retrieved: RetrievedContext,
    options: MergeOptions
  ): Promise<MergeResult> {
    logger.debug({ options }, 'Merging contexts');

    const result: MergeResult = {
      mergedMemory: this.workingMemory,
      totalTokens: 0,
      snippetsUsed: 0,
    };

    // Calculate current working memory tokens
    const currentTokens = this.countWorkingMemoryTokens();
    result.totalTokens = currentTokens;

    // Get available budget
    const availableBudget = options.maxTokens - currentTokens;

    if (availableBudget <= 0) {
      logger.warn('No token budget available for merge');
      result.droppedReason = 'No token budget available';
      return result;
    }

    // Collect all snippets with scores
    const rankedSnippets = this.rankSnippets(retrieved.snippets);

    // Add snippets within budget
    for (const snippet of rankedSnippets) {
      if (result.totalTokens + snippet.tokenCount > options.maxTokens) {
        logger.debug({ snippetId: snippet.sessionId }, 'Budget exceeded, stopping');
        break;
      }

      // Inject snippet into working memory
      this.injectSnippet(snippet);
      result.totalTokens += snippet.tokenCount;
      result.snippetsUsed++;
    }

    logger.info({
      snippetsUsed: result.snippetsUsed,
      totalTokens: result.totalTokens,
    }, 'Context merge completed');

    return result;
  }

  /**
   * Prioritize memory entries by relevance score
   */
  prioritizeByRelevance(entries: MemoryEntry[]): MemoryEntry[] {
    return [...entries]
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Filter entries by minimum relevance threshold
   */
  filterByThreshold(entries: MemoryEntry[], threshold: number): MemoryEntry[] {
    return entries.filter(entry => entry.relevance >= threshold);
  }

  /**
   * Inject a context snippet into working memory
   */
  injectSnippet(snippet: ContextSnippet): void {
    const message = {
      type: snippet.source === 'working' ? 'ai' : 'system' as const,
      content: snippet.content,
    };

    this.workingMemory.messages.push({
      id: `merged-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: message.type,
      content: message.content,
      timestamp: new Date(),
    });

    logger.debug({ snippetSource: snippet.source }, 'Snippet injected into working memory');
  }

  /**
   * Merge session matches into working memory
   */
  mergeSessionMatches(matches: SessionMatch[], maxTokens: number): ContextSnippet[] {
    const snippets: ContextSnippet[] = [];
    let totalTokens = 0;

    for (const match of matches) {
      for (const artifact of match.artifacts) {
        if (totalTokens + 100 > maxTokens) { // Rough estimate per artifact
          break;
        }

        snippets.push({
          sessionId: match.sessionId,
          content: `Artifact: ${artifact.name} (${artifact.path})`,
          source: 'short',
          relevance: match.relevance,
          tokenCount: 100,
        });

        totalTokens += 100;
      }
    }

    return snippets;
  }

  /**
   * Extract key decisions from session
   */
  extractKeyDecisions(sessionId: string): string[] {
    const taskMemories = this.shortTermMemory.getAllTaskMemories();
    const decisions: string[] = [];

    for (const memory of taskMemories) {
      if (memory.taskId === sessionId || sessionId === '*') {
        decisions.push(...memory.keyDecisions);
      }
    }

    return decisions;
  }

  /**
   * Merge learnings from past sessions
   */
  mergeLearnings(query: string, maxTokens: number): ContextSnippet[] {
    const snippets: ContextSnippet[] = [];
    let totalTokens = 0;

    // Search long-term memory for relevant patterns
    const patterns = this.longTermMemory.searchPatterns(query, 5);

    for (const pattern of patterns) {
      const snippetContent = `Pattern: ${pattern.name} - ${pattern.description}`;
      const estimatedTokens = Math.ceil(snippetContent.split(/\s+/).length * 1.3);

      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }

      snippets.push({
        sessionId: pattern.patternId,
        content: snippetContent,
        source: 'long',
        relevance: pattern.successMetrics.readability,
        tokenCount: estimatedTokens,
      });

      totalTokens += estimatedTokens;
    }

    return snippets;
  }

  /**
   * Build context for a specific task
   */
  async buildTaskContext(
    taskId: string,
    options: MergeOptions
  ): Promise<MergeResult> {
    logger.debug({ taskId }, 'Building task context');

    // Get task memory from short-term
    const taskMemory = this.shortTermMemory.getTaskMemory(taskId);

    if (!taskMemory) {
      logger.debug({ taskId }, 'No task memory found');
      return {
        mergedMemory: this.workingMemory,
        totalTokens: this.countWorkingMemoryTokens(),
        snippetsUsed: 0,
        droppedReason: 'No task memory found',
      };
    }

    // Build retrieved context from task memory
    const retrieved: RetrievedContext = {
      sessions: [{
        sessionId: taskMemory.taskId,
        projectPath: '',
        relevance: 1.0,
        summary: taskMemory.summary,
        keyDecisions: taskMemory.keyDecisions,
        artifacts: taskMemory.artifacts.map(a => ({
          type: a.type,
          name: a.name,
          path: a.path,
        })),
      }],
      totalTokens: 0,
      snippets: [{
        sessionId: taskMemory.taskId,
        content: taskMemory.summary,
        source: 'short',
        relevance: 1.0,
        tokenCount: Math.ceil(taskMemory.summary.split(/\s+/).length * 1.3),
      }],
    };

    // Add decisions as snippets
    for (const decision of taskMemory.keyDecisions) {
      retrieved.snippets.push({
        sessionId: taskMemory.taskId,
        content: `Decision: ${decision}`,
        source: 'short',
        relevance: 0.9,
        tokenCount: Math.ceil(decision.split(/\s+/).length * 1.3),
      });
    }

    return this.merge(retrieved, options);
  }

  /**
   * Rank snippets by relevance and recency
   */
  private rankSnippets(snippets: ContextSnippet[]): ContextSnippet[] {
    const withScores = snippets.map(snippet => ({
      snippet,
      score: snippet.relevance * (1 + this.getRecencyBoost(snippet.sessionId)),
    }));

    return withScores
      .sort((a, b) => b.score - a.score)
      .map(({ snippet }) => snippet);
  }

  /**
   * Get recency boost based on session age
   */
  private getRecencyBoost(sessionId: string): number {
    const taskMemory = this.shortTermMemory.getTaskMemory(sessionId);
    if (!taskMemory) {
      return 0;
    }

    const ageMs = Date.now() - taskMemory.completedAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    // Decay factor: 0.5 boost for very recent, 0 for >24h old
    return Math.max(0, 0.5 - (ageHours / 48));
  }

  /**
   * Count tokens in working memory
   */
  private countWorkingMemoryTokens(): number {
    let total = 0;

    for (const msg of this.workingMemory.messages) {
      total += msg.content.split(/\s+/).length * 1.3;
    }

    for (const [, file] of Object.entries(this.workingMemory.files)) {
      total += file.content.split(/\s+/).length * 1.3;
    }

    return Math.ceil(total);
  }
}

/**
 * Create a memory merger with existing memory instances
 */
export function createMemoryMerger(
  workingMemory: WorkingMemory,
  shortTermMemory: ShortTermMemory,
  longTermMemory: LongTermMemory
): MemoryMerger {
  return new MemoryMerger(workingMemory, shortTermMemory, longTermMemory);
}
