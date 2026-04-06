/**
 * ID generation utilities
 * @module utils/id-generator
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate a session ID with prefix
 */
export function generateSessionId(): string {
  return `session-${uuidv4()}`;
}

/**
 * Generate a checkpoint ID with prefix
 */
export function generateCheckpointId(): string {
  return `ckpt-${uuidv4()}`;
}

/**
 * Generate a task ID from phase and index
 */
export function generateTaskId(phaseId: string, taskIndex: number): string {
  return `${phaseId}.task-${taskIndex}`;
}

/**
 * Generate a phase ID from name and index
 */
export function generatePhaseId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `phase-${index}-${slug}`;
}

/**
 * Generate a branch name for VCS
 */
export function generateBranchName(moduleName: string, agentType: string): string {
  const slug = moduleName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `feat/${agentType}-${slug}`;
}

/**
 * Generate a commit message ID
 */
export function generateCommitId(): string {
  return `commit-${uuidv4().slice(0, 8)}`;
}

/**
 * Generate a log file name with timestamp
 */
export function generateLogFileName(agentType: string, taskId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${agentType}-${taskId}-${timestamp}.log`;
}

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate a short hash for display purposes
 */
export function shortHash(id: string): string {
  return id.slice(0, 8);
}
