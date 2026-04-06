/**
 * Token Tracker - tracks token usage across agents and tasks
 * @module token/token-tracker
 */

import type {
  TokenUsage,
  TokenBudget,
  BudgetStatus,
  AgentType,
  GlobalTokenUsage,
  TokenUsageRecord,
  BudgetStatusLevel,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'token-tracker' });

/**
 * Default token budgets by agent type
 */
const DEFAULT_AGENT_BUDGETS: Record<AgentType, number> = {
  main: 100000,
  architect: 80000,
  'backend-dev': 60000,
  'frontend-dev': 60000,
  'qa-engineer': 40000,
};

/**
 * Token Tracker monitors and reports token usage
 */
export class TokenTracker {
  private globalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  private agentUsage: Map<AgentType, TokenUsage> = new Map();
  private taskUsage: Map<string, TokenUsage> = new Map();
  private usageHistory: TokenUsageRecord[] = [];

  private agentBudgets: Map<AgentType, TokenBudget> = new Map();
  private taskBudgets: Map<string, TokenBudget> = new Map();

  private globalBudget: TokenBudget;

  constructor(globalBudget: TokenBudget) {
    this.globalBudget = globalBudget;

    // Initialize agent budgets with defaults
    for (const [type, limit] of Object.entries(DEFAULT_AGENT_BUDGETS)) {
      this.agentBudgets.set(type as AgentType, {
        limit,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      });
    }

    logger.info({ globalBudget }, 'TokenTracker initialized');
  }

  /**
   * Record token usage for an agent and task
   */
  recordUsage(agentId: string, taskId: string, usage: TokenUsage): void {
    logger.debug({ agentId, taskId, usage }, 'Recording token usage');

    // Update global usage
    this.globalUsage.inputTokens += usage.inputTokens;
    this.globalUsage.outputTokens += usage.outputTokens;
    this.globalUsage.cacheCreationTokens += usage.cacheCreationTokens ?? 0;
    this.globalUsage.cacheReadTokens += usage.cacheReadTokens ?? 0;

    // Update agent usage
    const agentType = this.getAgentType(agentId);
    const currentAgentUsage = this.agentUsage.get(agentType) ?? {
      inputTokens: 0,
      outputTokens: 0,
    };
    this.agentUsage.set(agentType, {
      inputTokens: currentAgentUsage.inputTokens + usage.inputTokens,
      outputTokens: currentAgentUsage.outputTokens + usage.outputTokens,
      cacheCreationTokens:
        (currentAgentUsage.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0),
      cacheReadTokens:
        (currentAgentUsage.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    });

    // Update task usage
    const currentTaskUsage = this.taskUsage.get(taskId) ?? {
      inputTokens: 0,
      outputTokens: 0,
    };
    this.taskUsage.set(taskId, {
      inputTokens: currentTaskUsage.inputTokens + usage.inputTokens,
      outputTokens: currentTaskUsage.outputTokens + usage.outputTokens,
      cacheCreationTokens:
        (currentTaskUsage.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0),
      cacheReadTokens:
        (currentTaskUsage.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    });

    // Record in history
    this.usageHistory.push({
      agentId,
      taskId,
      usage,
      timestamp: new Date(),
    });

    // Check budget status
    const status = this.getBudgetStatus(agentType, taskId);
    if (status.status === 'warning') {
      logger.warn({ agentId, taskId, status }, 'Token budget warning');
    } else if (status.status === 'critical') {
      logger.error({ agentId, taskId, status }, 'Token budget critical');
    }
  }

  /**
   * Get global token usage
   */
  getGlobalUsage(): TokenUsage {
    return { ...this.globalUsage };
  }

  /**
   * Get global budget
   */
  getGlobalBudget(): TokenBudget {
    return { ...this.globalBudget };
  }

  /**
   * Get usage for a specific agent
   */
  getAgentUsage(agentType: AgentType): TokenUsage {
    return (
      this.agentUsage.get(agentType) ?? {
        inputTokens: 0,
        outputTokens: 0,
      }
    );
  }

  /**
   * Get budget for a specific agent
   */
  getAgentBudget(agentType: AgentType): TokenBudget {
    return (
      this.agentBudgets.get(agentType) ?? {
        limit: 50000,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      }
    );
  }

  /**
   * Get usage for a specific task
   */
  getTaskUsage(taskId: string): TokenUsage {
    return (
      this.taskUsage.get(taskId) ?? {
        inputTokens: 0,
        outputTokens: 0,
      }
    );
  }

  /**
   * Get budget for a specific task
   */
  getTaskBudget(taskId: string): TokenBudget {
    return (
      this.taskBudgets.get(taskId) ?? {
        limit: 30000,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      }
    );
  }

  /**
   * Set budget for a task
   */
  setTaskBudget(taskId: string, budget: TokenBudget): void {
    this.taskBudgets.set(taskId, budget);
  }

  /**
   * Check budget status for an agent and optional task
   */
  getBudgetStatus(agentType: AgentType, taskId?: string): BudgetStatus {
    const agentBudget = this.getAgentBudget(agentType);
    const agentUsage = this.getAgentUsage(agentType);
    const agentTotal = this.sumUsage(agentUsage);

    let limit = agentBudget.limit;
    let usage = agentTotal;

    // Include task usage if specified
    if (taskId) {
      const taskBudget = this.getTaskBudget(taskId);
      const taskUsage = this.getTaskUsage(taskId);
      const taskTotal = this.sumUsage(taskUsage);

      limit = Math.min(agentBudget.limit, taskBudget.limit);
      usage += taskTotal;
    }

    const remainingTokens = Math.max(0, limit - usage);
    const usagePercent = limit > 0 ? usage / limit : 0;

    let status: BudgetStatusLevel;
    if (usagePercent >= 1.0) {
      status = 'exceeded';
    } else if (usagePercent >= agentBudget.criticalThreshold) {
      status = 'critical';
    } else if (usagePercent >= agentBudget.warningThreshold) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      withinBudget: usagePercent < 1.0,
      usagePercent,
      status,
      remainingTokens,
      estimatedCompletion: this.estimateCompletion(usagePercent),
    };
  }

  /**
   * Check if global budget is exceeded
   */
  isGlobalBudgetExceeded(): boolean {
    const total = this.sumUsage(this.globalUsage);
    return total >= this.globalBudget.limit;
  }

  /**
   * Get global usage summary
   */
  getGlobalUsageSummary(): GlobalTokenUsage {
    const byAgent: Record<AgentType, TokenUsage> = {} as Record<AgentType, TokenUsage>;
    for (const [type, usage] of this.agentUsage) {
      byAgent[type] = usage;
    }

    const byTask: Record<string, TokenUsage> = {};
    for (const [taskId, usage] of this.taskUsage) {
      byTask[taskId] = usage;
    }

    return {
      totalInputTokens: this.globalUsage.inputTokens,
      totalOutputTokens: this.globalUsage.outputTokens,
      totalCacheCreationTokens: this.globalUsage.cacheCreationTokens ?? 0,
      totalCacheReadTokens: this.globalUsage.cacheReadTokens ?? 0,
      byAgent,
      byTask,
    };
  }

  /**
   * Get usage history
   */
  getUsageHistory(): TokenUsageRecord[] {
    return [...this.usageHistory];
  }

  /**
   * Reset all tracking
   */
  reset(): void {
    this.globalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    this.agentUsage.clear();
    this.taskUsage.clear();
    this.usageHistory = [];
    logger.info('TokenTracker reset');
  }

  /**
   * Sum all token counts in a usage record
   */
  private sumUsage(usage: TokenUsage): number {
    return (
      usage.inputTokens +
      usage.outputTokens +
      (usage.cacheCreationTokens ?? 0) +
      (usage.cacheReadTokens ?? 0)
    );
  }

  /**
   * Estimate completion likelihood based on usage percent
   */
  private estimateCompletion(usagePercent: number): 'likely' | 'uncertain' | 'unlikely' {
    if (usagePercent < 0.5) {
      return 'likely';
    }
    if (usagePercent < 0.8) {
      return 'uncertain';
    }
    return 'unlikely';
  }

  /**
   * Get agent type from agent ID (simplified - in real impl would look up registry)
   */
  private getAgentType(agentId: string): AgentType {
    // Simplified - in real implementation would use registry
    if (agentId.startsWith('architect')) {
      return 'architect';
    }
    if (agentId.startsWith('backend')) {
      return 'backend-dev';
    }
    if (agentId.startsWith('frontend')) {
      return 'frontend-dev';
    }
    if (agentId.startsWith('qa')) {
      return 'qa-engineer';
    }
    return 'main';
  }
}
