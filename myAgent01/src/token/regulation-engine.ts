/**
 * Regulation Engine - automatic budget monitoring and regulation
 * @module token/regulation-engine
 */

import type {
  TokenUsage,
  TokenBudget,
  BudgetStatus,
  RegulationAction,
  AgentType,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'regulation-engine' });

export class RegulationEngine {
  private currentUsage: Map<string, TokenUsage> = new Map();
  private budgets: Map<string, TokenBudget> = new Map();
  private lastAction: RegulationAction = { type: 'continue' };
  private history: Array<{ timestamp: Date; action: RegulationAction; context: string }> = [];

  constructor() {
    logger.debug('RegulationEngine initialized');
  }

  /**
   * Set budget for an agent or task
   */
  setBudget(id: string, budget: TokenBudget): void {
    this.budgets.set(id, budget);
    logger.debug({ id, budget }, 'Budget set');
  }

  /**
   * Record usage for monitoring
   */
  recordUsage(id: string, usage: TokenUsage): void {
    this.currentUsage.set(id, usage);
  }

  /**
   * Decide what action to take based on current usage
   */
  decide(agentId: string, agentType: AgentType, taskId?: string): RegulationAction {
    // Get the appropriate budget and usage
    const budgetKey = taskId ?? agentType;
    const budget = this.budgets.get(budgetKey);
    const usage = this.currentUsage.get(agentId);

    if (!budget || !usage) {
      return { type: 'continue' };
    }

    // Calculate usage percentage
    const totalUsage = this.sumUsage(usage);
    const usagePercent = totalUsage / budget.limit;

    // Decision logic based on usage percentage
    if (usagePercent >= 1.0) {
      // Budget exceeded
      if (this.canCompress(agentType)) {
        const action: RegulationAction = { type: 'compress', target: 'working', priority: 1 };
        this.recordAction(action, `Budget exceeded for ${agentId}`);
        return action;
      } else {
        const action: RegulationAction = { type: 'abort', reason: 'Token budget exceeded and cannot compress' };
        this.recordAction(action, `Budget exceeded for ${agentId}`);
        return action;
      }
    }

    if (usagePercent >= budget.criticalThreshold) {
      // Critical threshold reached
      if (this.canCompress(agentType)) {
        const action: RegulationAction = { type: 'compress', target: 'working', priority: 1 };
        this.recordAction(action, `Critical threshold for ${agentId}`);
        return action;
      }
    }

    if (usagePercent >= budget.warningThreshold) {
      // Warning threshold reached
      if (this.shouldCompress(agentType)) {
        const action: RegulationAction = { type: 'summarize', target: 'messages', depth: 'medium' };
        this.recordAction(action, `Warning threshold for ${agentId}`);
        return action;
      }
    }

    return { type: 'continue' };
  }

  /**
   * Get budget status for monitoring
   */
  getStatus(agentId: string, agentType: AgentType, taskId?: string): BudgetStatus {
    const budgetKey = taskId ?? agentType;
    const budget = this.budgets.get(budgetKey);
    const usage = this.currentUsage.get(agentId);

    if (!budget) {
      return {
        withinBudget: true,
        usagePercent: 0,
        status: 'ok',
        remainingTokens: 0,
        estimatedCompletion: 'likely',
      };
    }

    const totalUsage = usage ? this.sumUsage(usage) : 0;
    const remainingTokens = Math.max(0, budget.limit - totalUsage);
    const usagePercent = budget.limit > 0 ? totalUsage / budget.limit : 0;

    let status: BudgetStatus['status'];
    if (usagePercent >= 1.0) {
      status = 'exceeded';
    } else if (usagePercent >= budget.criticalThreshold) {
      status = 'critical';
    } else if (usagePercent >= budget.warningThreshold) {
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
   * Get last action taken
   */
  getLastAction(): RegulationAction {
    return this.lastAction;
  }

  /**
   * Get action history
   */
  getHistory(): Array<{ timestamp: Date; action: RegulationAction; context: string }> {
    return [...this.history];
  }

  /**
   * Clear all tracking
   */
  reset(): void {
    this.currentUsage.clear();
    this.history = [];
    this.lastAction = { type: 'continue' };
    logger.debug('RegulationEngine reset');
  }

  /**
   * Check if compression is possible for agent type
   */
  private canCompress(agentType: AgentType): boolean {
    // Main agent and architect can always compress working memory
    if (agentType === 'main' || agentType === 'architect') {
      return true;
    }
    // Sub-agents can compress if they have enough history
    return true;
  }

  /**
   * Determine if compression should be triggered (plan-compatible)
   */
  shouldCompress(agentId: string): boolean {
    // Compress if agent is not the main agent and usage is high
    return !agentId.includes('main');
  }

  /**
   * Determine if task should be aborted (plan-compatible)
   */
  shouldAbort(agentId: string): boolean {
    const usage = this.currentUsage.get(agentId);
    const budget = this.budgets.get(agentId);

    if (!usage || !budget) {
      return false;
    }

    const usagePercent = this.sumUsage(usage) / budget.limit;
    // Abort if severely over budget
    return usagePercent >= 1.5; // 150% of budget
  }

  /**
   * Decide action with direct usage/budget (plan-compatible signature)
   */
  decideWithBudget(agentId: string, usage: TokenUsage, budget: TokenBudget): RegulationAction {
    const totalUsage = this.sumUsage(usage);
    const usagePercent = totalUsage / budget.limit;

    if (usagePercent >= 1.0) {
      // Budget exceeded - escalate first
      this.recordAction({ type: 'escalate', reason: 'Budget exceeded' }, agentId);
      return { type: 'escalate', reason: 'Token budget exceeded' };
    }

    if (usagePercent >= budget.criticalThreshold) {
      // Critical - compress
      return { type: 'compress', target: 'working', priority: 1 };
    }

    if (usagePercent >= budget.warningThreshold) {
      // Warning - summarize
      return { type: 'summarize', target: 'messages', depth: 'medium' };
    }

    return { type: 'continue' };
  }

  /**
   * Sum token usage
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
   * Estimate if task completion is likely
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
   * Record an action in history
   */
  private recordAction(action: RegulationAction, context: string): void {
    this.lastAction = action;
    this.history.push({
      timestamp: new Date(),
      action,
      context,
    });

    // Keep history limited to last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }
}

/**
 * Regulation policy configuration
 */
export interface RegulationPolicy {
  name: string;
  warningThreshold: number;
  criticalThreshold: number;
  compressOnWarning: boolean;
  abortOnExceeded: boolean;
  maxCompressionPerTask: number;
}

/**
 * Default regulation policies
 */
export const DEFAULT_POLICIES: Record<AgentType, RegulationPolicy> = {
  main: {
    name: 'main',
    warningThreshold: 0.7,
    criticalThreshold: 0.9,
    compressOnWarning: false,
    abortOnExceeded: true,
    maxCompressionPerTask: 3,
  },
  architect: {
    name: 'architect',
    warningThreshold: 0.75,
    criticalThreshold: 0.92,
    compressOnWarning: true,
    abortOnExceeded: true,
    maxCompressionPerTask: 2,
  },
  'backend-dev': {
    name: 'backend-dev',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    compressOnWarning: true,
    abortOnExceeded: false,
    maxCompressionPerTask: 2,
  },
  'frontend-dev': {
    name: 'frontend-dev',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    compressOnWarning: true,
    abortOnExceeded: false,
    maxCompressionPerTask: 2,
  },
  'qa-engineer': {
    name: 'qa-engineer',
    warningThreshold: 0.85,
    criticalThreshold: 0.98,
    compressOnWarning: true,
    abortOnExceeded: false,
    maxCompressionPerTask: 3,
  },
};

/**
 * Create a regulation engine with default policies
 */
export function createRegulationEngine(): RegulationEngine {
  const engine = new RegulationEngine();

  // Set default budgets for each agent type
  for (const [agentType, policy] of Object.entries(DEFAULT_POLICIES)) {
    engine.setBudget(agentType, {
      limit: 0, // Will be overridden by allocator
      warningThreshold: policy.warningThreshold,
      criticalThreshold: policy.criticalThreshold,
    });
  }

  return engine;
}
