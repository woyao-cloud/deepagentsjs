/**
 * Checkpoint Manager - manages workflow state persistence
 * @module storage/checkpoint-manager
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { generateCheckpointId } from '../utils/id-generator.js';

const logger = createLogger({ component: 'checkpoint-manager' });

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
  id: string;
  timestamp: Date;
  version: string;
  workflow: WorkflowCheckpointData;
  agent: AgentCheckpointData;
  memory: MemoryCheckpointData;
  tokenUsage: TokenUsageData;
  metadata: Record<string, unknown>;
}

export interface WorkflowCheckpointData {
  currentPhase: string | null;
  completedPhases: string[];
  taskStatus: Record<string, string>;
  blockedTasks: string[];
}

export interface AgentCheckpointData {
  messages: Array<{ type: string; content: string }>;
  files: Record<string, string>;
  todos: Array<{ content: string; status: string }>;
}

export interface MemoryCheckpointData {
  workingMemory: {
    messages: Array<{ type: string; content: string }>;
    files: Record<string, string>;
  } | null;
  shortTermMemory: {
    sessionId: string;
    conversationHistory: Array<{ type: string; content: string; summary: string }>;
  } | null;
}

export interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Checkpoint Manager configuration
 */
export interface CheckpointManagerConfig {
  checkpointDir: string;
  maxCheckpoints?: number;
  compressionEnabled?: boolean;
}

/**
 * Checkpoint Manager handles workflow state persistence
 */
export class CheckpointManager {
  private config: Required<CheckpointManagerConfig>;
  private currentCheckpoint: CheckpointData | null = null;
  private checkpointHistory: CheckpointData[] = [];

  constructor(config: CheckpointManagerConfig) {
    this.config = {
      checkpointDir: config.checkpointDir,
      maxCheckpoints: config.maxCheckpoints ?? 50,
      compressionEnabled: config.compressionEnabled ?? true,
    };
    logger.info({ config: this.config }, 'CheckpointManager initialized');
  }

  /**
   * Create a new checkpoint
   */
  async createCheckpoint(data: Omit<CheckpointData, 'id' | 'timestamp'>): Promise<CheckpointData> {
    const checkpoint: CheckpointData = {
      ...data,
      id: generateCheckpointId(),
      timestamp: new Date(),
    };

    this.currentCheckpoint = checkpoint;
    this.checkpointHistory.push(checkpoint);

    // Trim history if needed
    if (this.checkpointHistory.length > this.config.maxCheckpoints) {
      this.checkpointHistory = this.checkpointHistory.slice(-this.config.maxCheckpoints);
    }

    // Save to disk
    await this.saveCheckpoint(checkpoint);

    logger.info({ checkpointId: checkpoint.id }, 'Checkpoint created');
    return checkpoint;
  }

  /**
   * Load the latest checkpoint
   */
  async loadLatest(): Promise<CheckpointData | null> {
    try {
      const files = await fs.readdir(this.config.checkpointDir);
      const checkpointFiles = files.filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));

      if (checkpointFiles.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first)
      checkpointFiles.sort().reverse();

      const latestFile = checkpointFiles[0];
      const content = await fs.readFile(path.join(this.config.checkpointDir, latestFile), 'utf-8');
      const checkpoint = JSON.parse(content) as CheckpointData;

      this.currentCheckpoint = checkpoint;
      logger.info({ checkpointId: checkpoint.id }, 'Latest checkpoint loaded');

      return checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Load a specific checkpoint by ID
   */
  async loadCheckpoint(id: string): Promise<CheckpointData | null> {
    try {
      const filePath = path.join(this.config.checkpointDir, `checkpoint-${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(content) as CheckpointData;

      this.currentCheckpoint = checkpoint;
      logger.info({ checkpointId: id }, 'Checkpoint loaded');

      return checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get current checkpoint
   */
  getCurrentCheckpoint(): CheckpointData | null {
    return this.currentCheckpoint;
  }

  /**
   * Get checkpoint history
   */
  getHistory(): CheckpointData[] {
    return [...this.checkpointHistory];
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(): Promise<Array<{ id: string; timestamp: Date; phase: string }>> {
    try {
      const files = await fs.readdir(this.config.checkpointDir);
      const checkpointFiles = files.filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));

      const checkpoints: Array<{ id: string; timestamp: Date; phase: string }> = [];

      for (const file of checkpointFiles) {
        try {
          const content = await fs.readFile(path.join(this.config.checkpointDir, file), 'utf-8');
          const checkpoint = JSON.parse(content) as CheckpointData;
          checkpoints.push({
            id: checkpoint.id,
            timestamp: new Date(checkpoint.timestamp),
            phase: checkpoint.workflow.currentPhase ?? 'unknown',
          });
        } catch {
          // Skip invalid checkpoint files
        }
      }

      return checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete old checkpoints
   */
  async deleteOldCheckpoints(keepCount: number): Promise<number> {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length <= keepCount) {
      return 0;
    }

    const toDelete = checkpoints.slice(keepCount);
    let deleted = 0;

    for (const checkpoint of toDelete) {
      try {
        const filePath = path.join(this.config.checkpointDir, `checkpoint-${checkpoint.id}.json`);
        await fs.unlink(filePath);
        deleted++;
      } catch {
        // Skip files that can't be deleted
      }
    }

    // Update history
    this.checkpointHistory = this.checkpointHistory.slice(-keepCount);

    logger.info({ deleted, remaining: keepCount }, 'Old checkpoints deleted');
    return deleted;
  }

  /**
   * Save checkpoint to disk
   */
  private async saveCheckpoint(checkpoint: CheckpointData): Promise<void> {
    await fs.mkdir(this.config.checkpointDir, { recursive: true });

    const filePath = path.join(this.config.checkpointDir, `checkpoint-${checkpoint.id}.json`);
    const content = JSON.stringify(checkpoint, null, 2);

    // Write atomically using temp file
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  /**
   * Export checkpoint to file
   */
  async exportCheckpoint(id: string, targetPath: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(id);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${id}`);
    }

    await fs.writeFile(targetPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    logger.info({ checkpointId: id, targetPath }, 'Checkpoint exported');
  }

  /**
   * Import checkpoint from file
   */
  async importCheckpoint(sourcePath: string): Promise<CheckpointData> {
    const content = await fs.readFile(sourcePath, 'utf-8');
    const checkpoint = JSON.parse(content) as CheckpointData;

    await this.saveCheckpoint(checkpoint);
    this.currentCheckpoint = checkpoint;
    this.checkpointHistory.push(checkpoint);

    logger.info({ checkpointId: checkpoint.id, sourcePath }, 'Checkpoint imported');
    return checkpoint;
  }
}

/**
 * Create default checkpoint manager
 */
export function createCheckpointManager(projectRoot: string): CheckpointManager {
  return new CheckpointManager({
    checkpointDir: path.join(projectRoot, '.deepagents', 'checkpoints'),
  });
}
