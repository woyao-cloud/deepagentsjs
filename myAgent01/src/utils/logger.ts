/**
 * Logging utility using pino
 * @module utils/logger
 */

import pino from 'pino';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint: boolean;
  outputFile?: string;
}

/**
 * Create a configured logger instance
 */
export function createLogger(config: Partial<LoggerConfig> = {}): pino.Logger {
  const level = config.level ?? 'info';
  const prettyPrint = config.prettyPrint ?? process.env.NODE_ENV !== 'production';

  const options: pino.LoggerOptions = {
    level,
    base: {
      service: 'deepagents',
      version: '1.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (prettyPrint) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export function withContext(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Create an agent-specific logger
 */
export function createAgentLogger(agentId: string, agentType: string): pino.Logger {
  return logger.child({ agentId, agentType, component: 'agent' });
}

/**
 * Create a workflow-specific logger
 */
export function createWorkflowLogger(workflowId: string): pino.Logger {
  return logger.child({ workflowId, component: 'workflow' });
}

/**
 * Create a task-specific logger
 */
export function createTaskLogger(taskId: string): pino.Logger {
  return logger.child({ taskId, component: 'task' });
}

export { pino };
