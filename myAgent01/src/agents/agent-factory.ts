/**
 * Agent Factory - creates and manages agent instances
 * @module agents/agent-factory
 */

import type { AgentType, AgentConfig, AgentRegistry, BaseAgent } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { ArchitectAgent } from './architect-agent.js';
import { BackendDevAgent } from './backend-dev-agent.js';
import { FrontendDevAgent } from './frontend-dev-agent.js';
import { QAEngineerAgent } from './qa-engineer-agent.js';
import { MainAgent } from './main-agent.js';

const logger = createLogger({ component: 'agent-factory' });

/**
 * Agent class map for dynamic instantiation
 */
const AGENT_CLASSES: Record<AgentType, new () => BaseAgent> = {
  architect: ArchitectAgent,
  'backend-dev': BackendDevAgent,
  'frontend-dev': FrontendDevAgent,
  'qa-engineer': QAEngineerAgent,
  main: MainAgent,
};

/**
 * Default token budgets by agent type
 */
const DEFAULT_TOKEN_BUDGETS: Record<AgentType, number> = {
  main: 100000,
  architect: 80000,
  'backend-dev': 60000,
  'frontend-dev': 60000,
  'qa-engineer': 40000,
};

/**
 * Agent Factory creates and manages agent instances
 */
export class AgentFactory {
  private agents: Map<string, BaseAgent> = new Map();
  private registry: AgentRegistry | null = null;

  /**
   * Set the agent registry
   */
  setRegistry(registry: AgentRegistry): void {
    this.registry = registry;
    logger.info({ roles: registry.roles.map(r => r.type) }, 'Registry set');
  }

  /**
   * Get the agent registry
   */
  getRegistry(): AgentRegistry | null {
    return this.registry;
  }

  /**
   * Create an agent instance by type
   */
  createAgent(type: AgentType): BaseAgent {
    logger.info({ agentType: type }, 'Creating agent');

    const AgentClass = AGENT_CLASSES[type];
    if (!AgentClass) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    const agent = new AgentClass();

    // If registry is set, apply custom config
    if (this.registry) {
      const config = this.registry.roles.find(r => r.type === type);
      if (config) {
        logger.info({ agentType: type, config }, 'Applying custom config from registry');
      }
    }

    this.agents.set(agent.getId(), agent);
    return agent;
  }

  /**
   * Create an agent with custom config
   */
  createAgentWithConfig(type: AgentType, config: Partial<AgentConfig>): BaseAgent {
    const agent = this.createAgent(type);

    // Apply custom config (in a real implementation, agents would accept config in constructor)
    logger.info({ agentType: type, customConfig: config }, 'Created agent with custom config');

    return agent;
  }

  /**
   * Create all agents from registry
   */
  createAllAgents(): Map<AgentType, BaseAgent> {
    if (!this.registry) {
      throw new Error('Registry not set');
    }

    const agents = new Map<AgentType, BaseAgent>();

    for (const role of this.registry.roles) {
      const agent = this.createAgent(role.type);
      agents.set(role.type, agent);
    }

    logger.info({ agentCount: agents.size }, 'Created all agents from registry');
    return agents;
  }

  /**
   * Create sub-agents for a specific task based on owners
   */
  createSubAgentsForTask(owners: AgentType[]): BaseAgent[] {
    const agents: BaseAgent[] = [];

    for (const owner of owners) {
      try {
        const agent = this.createAgent(owner);
        agents.push(agent);
      } catch (error) {
        logger.warn({ agentType: owner, error }, 'Failed to create agent');
      }
    }

    return agents;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): BaseAgent[] {
    return this.getAllAgents().filter(agent => agent.getType() === type);
  }

  /**
   * Remove agent by ID
   */
  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      logger.info({ agentId, agentType: agent.getType() }, 'Agent removed');
      return true;
    }
    return false;
  }

  /**
   * Initialize all agents
   */
  async initializeAll(): Promise<void> {
    const promises = this.getAllAgents().map(agent =>
      agent.initialize().catch(error => {
        logger.error({ agentId: agent.getId(), error }, 'Failed to initialize agent');
      })
    );

    await Promise.all(promises);
    logger.info({ agentCount: this.agents.size }, 'All agents initialized');
  }

  /**
   * Cleanup all agents
   */
  async cleanupAll(): Promise<void> {
    const promises = this.getAllAgents().map(agent => {
      if (agent.cleanup) {
        return agent.cleanup().catch(error => {
          logger.error({ agentId: agent.getId(), error }, 'Failed to cleanup agent');
        });
      }
      return Promise.resolve();
    });

    await Promise.all(promises);
    this.agents.clear();
    logger.info('All agents cleaned up');
  }

  /**
   * Get default token budget for agent type
   */
  getDefaultTokenBudget(type: AgentType): number {
    return DEFAULT_TOKEN_BUDGETS[type] ?? 50000;
  }

  /**
   * Check if agent type is valid
   */
  isValidAgentType(type: string): type is AgentType {
    return type in AGENT_CLASSES;
  }

  /**
   * Get all supported agent types
   */
  getSupportedAgentTypes(): AgentType[] {
    return Object.keys(AGENT_CLASSES) as AgentType[];
  }
}

/**
 * Singleton instance for global access
 */
let factoryInstance: AgentFactory | null = null;

/**
 * Get the global agent factory instance
 */
export function getAgentFactory(): AgentFactory {
  if (!factoryInstance) {
    factoryInstance = new AgentFactory();
  }
  return factoryInstance;
}

/**
 * Reset the global agent factory instance
 */
export function resetAgentFactory(): void {
  if (factoryInstance) {
    factoryInstance.cleanupAll();
    factoryInstance = null;
  }
}
