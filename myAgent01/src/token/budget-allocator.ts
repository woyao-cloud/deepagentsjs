/**
 * Budget Allocator - allocates token budgets across agents and tasks
 * @module token/budget-allocator
 */

import type {
  AgentType,
  BudgetAllocation,
  BudgetConfig,
  TokenBudget,
  ReservedBudget,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'budget-allocator' });

/**
 * Default agent weights for budget allocation
 */
const DEFAULT_AGENT_WEIGHTS: Record<AgentType, number> = {
  main: 1.0,
  architect: 0.8,
  'backend-dev': 0.6,
  'frontend-dev': 0.6,
  'qa-engineer': 0.4,
};

/**
 * Budget Allocator manages hierarchical token budget allocation
 */
export class BudgetAllocator {
  private config: BudgetConfig;
  private allocation: BudgetAllocation | null = null;

  constructor(config: BudgetConfig) {
    this.config = config;
    logger.info(config, 'BudgetAllocator initialized');
  }

  /**
   * Perform initial budget allocation (plan-compatible signature)
   */
  allocateInitial(config: BudgetConfig): BudgetAllocation {
    // Update internal config if provided
    if (config) {
      this.config = config;
    }
    return this.allocateInitialBudget();
  }
  allocateInitialBudget(): BudgetAllocation {
    logger.info('Allocating initial budget');

    const { globalLimit, modelContextWindow, agentWeights, agentPriorities } = this.config;

    // Calculate available budget (excluding reserved)
    const reserved: ReservedBudget = {
      system: Math.floor(globalLimit * 0.05), // 5% for system operations
      compression: Math.floor(globalLimit * 0.03), // 3% for compression
      emergency: Math.floor(globalLimit * 0.02), // 2% for emergencies
    };

    const availableBudget = globalLimit - reserved.system - reserved.compression - reserved.emergency;

    // Calculate total weight
    const totalWeight = Object.entries(agentWeights).reduce(
      (sum, [, weight]) => sum + weight,
      0
    );

    // Allocate to each agent
    const agents: Record<AgentType, TokenBudget> = {} as Record<AgentType, TokenBudget>;

    for (const [agentType, baseWeight] of Object.entries(agentWeights)) {
      const priority = agentPriorities[agentType as AgentType] ?? 1;
      const effectiveWeight = baseWeight * priority;
      const allocation = Math.floor((effectiveWeight / totalWeight) * availableBudget);

      agents[agentType as AgentType] = {
        limit: allocation,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      };
    }

    this.allocation = {
      global: {
        limit: globalLimit,
        warningThreshold: 0.8,
        criticalThreshold: 0.95,
      },
      agents,
      tasks: {},
      reserved,
    };

    logger.info(this.allocation, 'Initial budget allocation complete');
    return this.allocation;
  }

  /**
   * Reallocate budget with priority adjustment (plan-compatible signature)
   */
  reallocate(allocation: BudgetAllocation, agentId: string, priority: number): BudgetAllocation {
    if (!this.allocation) {
      throw new Error('No allocation exists - call allocateInitialBudget first');
    }

    // Find agent budget
    const agentType = agentId as AgentType;
    const agentBudget = this.allocation.agents[agentType];

    if (!agentBudget) {
      throw new Error(`Invalid agent type: ${agentType}`);
    }

    // Adjust budget based on priority
    const priorityMultiplier = priority / 1.0; // Normalize around 1.0
    const newLimit = Math.floor(agentBudget.limit * priorityMultiplier);

    agentBudget.limit = newLimit;

    logger.info({ agentId, priority, newLimit }, 'Budget reallocated by priority');
    return this.allocation;
  }

  /**
   * Reserve emergency budget (plan-compatible signature)
   */
  reserveEmergency(allocation: BudgetAllocation, tokens: number): BudgetAllocation {
    if (!this.allocation) {
      throw new Error('No allocation exists - call allocateInitialBudget first');
    }

    if (tokens > this.allocation.reserved.emergency) {
      throw new Error(`Requested ${tokens} exceeds emergency reserve: ${this.allocation.reserved.emergency}`);
    }

    // Move tokens from emergency reserve to global available
    this.allocation.reserved.emergency -= tokens;
    this.allocation.global.limit += tokens;

    logger.info({ tokens, remaining: this.allocation.reserved.emergency }, 'Emergency budget reserved');
    return this.allocation;
  }

  /**
   * Legacy reallocate for backward compatibility
   * @deprecated Use reallocate(allocation, agentId, priority) instead
   */
  reallocateLegacy(fromAgent: AgentType, toAgent: AgentType, tokens: number): BudgetAllocation {
    if (!this.allocation) {
      throw new Error('No allocation exists - call allocateInitialBudget first');
    }

    const fromBudget = this.allocation.agents[fromAgent];
    const toBudget = this.allocation.agents[toAgent];

    if (!fromBudget || !toBudget) {
      throw new Error(`Invalid agent type: ${fromAgent} or ${toAgent}`);
    }

    if (fromBudget.limit < tokens) {
      throw new Error(`Insufficient budget in ${fromAgent}: ${fromBudget.limit} < ${tokens}`);
    }

    // Perform reallocation
    fromBudget.limit -= tokens;
    toBudget.limit += tokens;

    logger.info({ fromAgent, toAgent, tokens }, 'Budget reallocated');
    return this.allocation;
  }

  /**
   * Allocate budget for a specific task
   */
  allocateTaskBudget(
    taskId: string,
    agentType: AgentType,
    estimatedTokens: number
  ): TokenBudget {
    if (!this.allocation) {
      throw new Error('No allocation exists - call allocateInitialBudget first');
    }

    const agentBudget = this.allocation.agents[agentType];
    if (!agentBudget) {
      throw new Error(`Invalid agent type: ${agentType}`);
    }

    // Allocate based on agent budget proportionally
    const taskBudget: TokenBudget = {
      limit: Math.min(estimatedTokens, agentBudget.limit),
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
    };

    this.allocation.tasks[taskId] = taskBudget;
    return taskBudget;
  }

  /**
   * Release task budget back to agent
   */
  releaseTaskBudget(taskId: string): boolean {
    if (!this.allocation) {
      return false;
    }

    const released = this.allocation.tasks[taskId];
    if (released) {
      delete this.allocation.tasks[taskId];
      logger.info({ taskId, released }, 'Task budget released');
      return true;
    }
    return false;
  }

  /**
   * Get current allocation
   */
  getAllocation(): BudgetAllocation | null {
    return this.allocation;
  }

  /**
   * Get global budget
   */
  getGlobalBudget(): TokenBudget | null {
    return this.allocation?.global ?? null;
  }

  /**
   * Get agent budget
   */
  getAgentBudget(agentType: AgentType): TokenBudget | null {
    return this.allocation?.agents[agentType] ?? null;
  }

  /**
   * Get task budget
   */
  getTaskBudget(taskId: string): TokenBudget | null {
    return this.allocation?.tasks[taskId] ?? null;
  }

  /**
   * Check if budget can be allocated for a task
   */
  canAllocateTask(taskId: string, agentType: AgentType, tokens: number): boolean {
    if (!this.allocation) {
      return false;
    }

    const agentBudget = this.allocation.agents[agentType];
    if (!agentBudget) {
      return false;
    }

    const currentTaskUsage = this.allocation.tasks[taskId];
    const availableInAgent = agentBudget.limit - (currentTaskUsage?.limit ?? 0);

    return availableInAgent >= tokens;
  }

  /**
   * Get remaining unallocated budget
   */
  getUnallocatedBudget(): number {
    if (!this.allocation) {
      return 0;
    }

    const allocatedToAgents = Object.values(this.allocation.agents).reduce(
      (sum, budget) => sum + budget.limit,
      0
    );

    const allocatedToTasks = Object.values(this.allocation.tasks).reduce(
      (sum, budget) => sum + budget.limit,
      0
    );

    return this.allocation.global.limit - allocatedToAgents - allocatedToTasks;
  }

  /**
   * Calculate optimal budget distribution
   */
  calculateOptimalDistribution(
    tasks: Array<{ id: string; estimatedTokens: number; priority: number }>
  ): Record<string, number> {
    if (!this.allocation) {
      throw new Error('No allocation exists');
    }

    const distribution: Record<string, number> = {};
    const totalPriority = tasks.reduce((sum, t) => sum + t.priority, 0);

    for (const task of tasks) {
      const proportion = task.priority / totalPriority;
      const baseAllocation = Math.floor(this.allocation!.global.limit * proportion);
      distribution[task.id] = Math.min(task.estimatedTokens, baseAllocation);
    }

    return distribution;
  }
}

/**
 * Create a default budget allocator
 */
export function createDefaultAllocator(modelContextWindow = 200000): BudgetAllocator {
  const weights: Record<AgentType, number> = { ...DEFAULT_AGENT_WEIGHTS };
  const priorities: Record<AgentType, number> = {
    main: 1.0,
    architect: 1.0,
    'backend-dev': 1.0,
    'frontend-dev': 1.0,
    'qa-engineer': 0.8,
  };

  return new BudgetAllocator({
    globalLimit: Math.floor(modelContextWindow * 0.8), // Use 80% of context window
    modelContextWindow,
    agentWeights: weights,
    agentPriorities: priorities,
  });
}
