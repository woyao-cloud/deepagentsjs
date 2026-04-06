/**
 * Agent Parser - parses agent.md into AgentRegistry
 * @module config/agent-parser
 */

import YAML from 'yaml';
import type {
  AgentConfig,
  AgentRegistry,
  RoutingRule,
  AgentType,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'agent-parser' });

/**
 * Default agent template
 */
export const DEFAULT_AGENT_TEMPLATE = `# Agent Registry

## Roles

- architect:
    description: 负责架构设计、技术选型、PLANNING.md 生成与接口契约定义
    tools: [read_file, write_file, edit_file, glob, grep, web_search]
    model: claude-sonnet-4-6
    token_budget: 80000
    instructions: |
      You are an architect agent responsible for system design and planning.
      Generate comprehensive PLANNING.md documents with clear task decomposition.

- backend-dev:
    description: 精通 TypeScript/Node.js，负责业务逻辑、API 与数据库设计
    tools: [read_file, write_file, edit_file, glob, grep, command]
    model: claude-haiku-4-5
    token_budget: 60000
    instructions: |
      You are a backend developer agent specializing in API development.
      Write clean, maintainable code following best practices.

- frontend-dev:
    description: 精通 React/Vue，负责 UI 组件、状态管理与路由
    tools: [read_file, write_file, edit_file, glob, grep]
    model: claude-haiku-4-5
    token_budget: 60000
    instructions: |
      You are a frontend developer agent specializing in UI development.
      Create responsive, accessible components.

- qa-engineer:
    description: 负责单元测试、集成测试用例生成与覆盖率校验
    tools: [read_file, write_file, glob, grep, command]
    model: claude-haiku-4-5
    token_budget: 40000
    instructions: |
      You are a QA engineer agent responsible for testing.
      Write comprehensive test cases and ensure high coverage.

## Routing Rules

- 架构设计:
    agents: [architect]
    mode: sequential

- 核心模块开发:
    agents: [backend-dev, frontend-dev]
    mode: parallel

- 测试开发:
    agents: [qa-engineer]
    mode: sequential

- 联调与测试:
    agents: [architect, qa-engineer]
    mode: sequential
`;

/**
 * Parse agent.md content into AgentRegistry
 */
export function parseAgentConfig(content: string): AgentRegistry {
  logger.debug('Parsing agent configuration');

  // Try YAML first, then fall back to markdown parsing
  try {
    const parsed = YAML.parse(content);
    return parseYAMLAgentConfig(parsed);
  } catch {
    return parseMarkdownAgentConfig(content);
  }
}

/**
 * Parse YAML format agent config
 */
function parseYAMLAgentConfig(parsed: Record<string, unknown>): AgentRegistry {
  const roles: AgentConfig[] = [];
  const routingRules: RoutingRule[] = [];

  // Parse roles
  const rolesData = parsed.roles as Record<string, Record<string, unknown>> | undefined;
  if (rolesData) {
    for (const [name, config] of Object.entries(rolesData)) {
      roles.push(parseRole(name, config));
    }
  }

  // Parse routing rules
  const rulesData = parsed.routingRules as Record<string, Record<string, unknown>> | undefined;
  if (rulesData) {
    for (const [module, config] of Object.entries(rulesData)) {
      routingRules.push(parseRoutingRule(module, config));
    }
  }

  return { roles, routingRules };
}

/**
 * Parse a role from YAML data
 */
function parseRole(name: string, data: Record<string, unknown>): AgentConfig {
  return {
    type: name as AgentType,
    name: name,
    description: (data.description as string) ?? '',
    tools: (data.tools as string[]) ?? [],
    model: data.model as string | undefined,
    middleware: data.middleware as string[] | undefined,
    tokenBudget: (data.token_budget as number) ?? 50000,
    instructions: data.instructions as string | undefined,
  };
}

/**
 * Parse a routing rule from YAML data
 */
function parseRoutingRule(module: string, data: Record<string, unknown>): RoutingRule {
  const agents = (data.agents as string[]) ?? [];
  const mode = (data.mode as string) ?? 'sequential';

  return {
    module,
    agents: agents as AgentType[],
    mode: mode as 'parallel' | 'sequential',
    condition: data.condition as string | undefined,
  };
}

/**
 * Parse markdown format agent config
 */
function parseMarkdownAgentConfig(content: string): AgentRegistry {
  const roles: AgentConfig[] = [];
  const routingRules: RoutingRule[] = [];

  const lines = content.split('\n');
  let section: 'roles' | 'rules' | null = null;
  let currentRole: AgentConfig | null = null;
  let currentRule: RoutingRule | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed === '## Roles') {
      section = 'roles';
      continue;
    }
    if (trimmed === '## Routing Rules') {
      section = 'rules';
      continue;
    }

    if (!section) continue;

    // Role definition
    const roleMatch = trimmed.match(/^-\s*(\w+):/);
    if (roleMatch && section === 'roles') {
      if (currentRole) {
        roles.push(currentRole);
      }

      const roleName = roleMatch[1];
      currentRole = {
        type: roleName as AgentType,
        name: roleName,
        description: '',
        tools: [],
        tokenBudget: 50000,
      };
      continue;
    }

    // Role property
    if (currentRole && line.match(/^\s{4,}/)) {
      const propMatch = line.match(/^\s{4,}(\w+):\s*(.+)/);
      if (propMatch) {
        const [, key, value] = propMatch;
        switch (key) {
          case 'description':
            currentRole.description = value.trim();
            break;
          case 'tools':
            currentRole.tools = value.replace(/[\[\]]/g, '').split(',').map(t => t.trim());
            break;
          case 'model':
            currentRole.model = value.trim();
            break;
          case 'token_budget':
            currentRole.tokenBudget = parseInt(value.trim(), 10);
            break;
          case 'instructions':
            currentRole.instructions = value.trim();
            break;
        }
      }
      continue;
    }

    // Routing rule definition
    const ruleMatch = trimmed.match(/^-\s*(.+):/);
    if (ruleMatch && section === 'rules') {
      if (currentRule) {
        routingRules.push(currentRule);
      }

      const moduleName = ruleMatch[1];
      currentRule = {
        module: moduleName,
        agents: [],
        mode: 'sequential',
      };
      continue;
    }

    // Routing rule property
    if (currentRule && line.match(/^\s{4,}/)) {
      const propMatch = line.match(/^\s{4,}(\w+):\s*(.+)/);
      if (propMatch) {
        const [, key, value] = propMatch;
        switch (key) {
          case 'agents':
            currentRule.agents = value.replace(/[\[\]]/g, '').split(',').map(a => a.trim() as AgentType);
            break;
          case 'mode':
            currentRule.mode = value.trim() as 'parallel' | 'sequential';
            break;
        }
      }
    }
  }

  // Add last items
  if (currentRole) {
    roles.push(currentRole);
  }
  if (currentRule) {
    routingRules.push(currentRule);
  }

  return { roles, routingRules };
}

/**
 * Get default agent configuration
 */
export function getDefaultAgentConfig(): AgentRegistry {
  return parseAgentConfig(DEFAULT_AGENT_TEMPLATE);
}

/**
 * Find role by type
 */
export function findRole(registry: AgentRegistry, type: AgentType): AgentConfig | undefined {
  return registry.roles.find(role => role.type === type);
}

/**
 * Find routing rule by module
 */
export function findRoutingRule(registry: AgentRegistry, module: string): RoutingRule | undefined {
  return registry.routingRules.find(rule => rule.module === module);
}

/**
 * Get agents for a module
 */
export function getAgentsForModule(registry: AgentRegistry, module: string): AgentConfig[] {
  const rule = findRoutingRule(registry, module);
  if (!rule) {
    return [];
  }

  return rule.agents
    .map(agentType => findRole(registry, agentType))
    .filter((agent): agent is AgentConfig => agent !== undefined);
}
