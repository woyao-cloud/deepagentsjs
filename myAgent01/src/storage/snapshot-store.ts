/**
 * Snapshot Store - manages file snapshots for rollback
 * @module storage/snapshot-store
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { generateId } from '../utils/id-generator.js';

const logger = createLogger({ component: 'snapshot-store' });

/**
 * Snapshot metadata
 */
export interface Snapshot {
  id: string;
  timestamp: Date;
  description: string;
  files: SnapshotFile[];
  size: number;
}

export interface SnapshotFile {
  path: string;
  hash: string;
  size: number;
}

/**
 * Snapshot Store configuration
 */
export interface SnapshotStoreConfig {
  snapshotDir: string;
  maxSnapshots?: number;
  compressSnapshots?: boolean;
}

/**
 * Snapshot Store manages file snapshots
 */
export class SnapshotStore {
  private config: Required<SnapshotStoreConfig>;

  constructor(config: SnapshotStoreConfig) {
    this.config = {
      snapshotDir: config.snapshotDir,
      maxSnapshots: config.maxSnapshots ?? 10,
      compressSnapshots: config.compressSnapshots ?? true,
    };
    logger.info({ config: this.config }, 'SnapshotStore initialized');
  }

  /**
   * Create a snapshot of files
   */
  async createSnapshot(files: string[], description: string): Promise<Snapshot> {
    const id = generateId();
    const timestamp = new Date();
    const snapshotFiles: SnapshotFile[] = [];
    let totalSize = 0;

    logger.info({ snapshotId: id, fileCount: files.length }, 'Creating snapshot');

    // Create snapshot directory
    const snapshotPath = this.getSnapshotPath(id);
    await fs.mkdir(snapshotPath, { recursive: true });

    // Copy each file
    for (const file of files) {
      try {
        const content = await fs.readFile(file);
        const hash = await this.hashContent(content);
        const fileSnapshotDir = path.join(snapshotPath, path.dirname(file));
        await fs.mkdir(fileSnapshotDir, { recursive: true });
        const destPath = path.join(snapshotPath, file);
        await fs.writeFile(destPath, content);

        snapshotFiles.push({
          path: file,
          hash,
          size: content.length,
        });
        totalSize += content.length;
      } catch (error) {
        logger.warn({ file, error }, 'Failed to snapshot file');
      }
    }

    // Save snapshot metadata
    const snapshot: Snapshot = {
      id,
      timestamp,
      description,
      files: snapshotFiles,
      size: totalSize,
    };

    const metadataPath = path.join(snapshotPath, 'snapshot.json');
    await fs.writeFile(metadataPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Create latest symlink
    await this.updateLatestSymlink(id);

    logger.info({ snapshotId: id, files: snapshotFiles.length, size: totalSize }, 'Snapshot created');
    return snapshot;
  }

  /**
   * Restore files from a snapshot
   */
  async restoreSnapshot(snapshotId: string, targetDir: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(snapshotId);
    const metadataPath = path.join(snapshotPath, 'snapshot.json');

    logger.info({ snapshotId, targetDir }, 'Restoring snapshot');

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const snapshot: Snapshot = JSON.parse(content);
      snapshot.timestamp = new Date(snapshot.timestamp);

      // Copy each file
      for (const file of snapshot.files) {
        const srcPath = path.join(snapshotPath, file.path);
        const destPath = path.join(targetDir, file.path);

        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        // Copy file
        await fs.copyFile(srcPath, destPath);
      }

      logger.info({ snapshotId, files: snapshot.files.length }, 'Snapshot restored');
    } catch (error) {
      logger.error({ snapshotId, error }, 'Failed to restore snapshot');
      throw error;
    }
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<Snapshot[]> {
    try {
      const dirs = await fs.readdir(this.config.snapshotDir);
      const snapshots: Snapshot[] = [];

      for (const dir of dirs) {
        if (dir === 'latest') continue;

        const metadataPath = path.join(this.config.snapshotDir, dir, 'snapshot.json');
        try {
          const content = await fs.readFile(metadataPath, 'utf-8');
          const snapshot = JSON.parse(content) as Snapshot;
          snapshot.timestamp = new Date(snapshot.timestamp);
          snapshots.push(snapshot);
        } catch {
          // Skip invalid snapshots
        }
      }

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return snapshots;
    } catch {
      return [];
    }
  }

  /**
   * Get snapshot metadata
   */
  async getSnapshot(snapshotId: string): Promise<Snapshot | null> {
    const metadataPath = path.join(this.getSnapshotPath(snapshotId), 'snapshot.json');

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const snapshot = JSON.parse(content) as Snapshot;
      snapshot.timestamp = new Date(snapshot.timestamp);
      return snapshot;
    } catch {
      return null;
    }
  }

  /**
   * Delete old snapshots
   */
  async deleteOldSnapshots(keepCount: number): Promise<number> {
    const snapshots = await this.listSnapshots();

    if (snapshots.length <= keepCount) {
      return 0;
    }

    const toDelete = snapshots.slice(keepCount);
    let deleted = 0;

    for (const snapshot of toDelete) {
      try {
        await fs.rm(this.getSnapshotPath(snapshot.id), { recursive: true, force: true });
        deleted++;
      } catch {
        // Skip files that can't be deleted
      }
    }

    logger.info({ deleted, remaining: keepCount }, 'Old snapshots deleted');
    return deleted;
  }

  /**
   * Get snapshot path
   */
  private getSnapshotPath(id: string): string {
    return path.join(this.config.snapshotDir, id);
  }

  /**
   * Update latest symlink
   */
  private async updateLatestSymlink(id: string): Promise<void> {
    const latestPath = path.join(this.config.snapshotDir, 'latest');

    try {
      await fs.unlink(latestPath);
    } catch {
      // Symlink might not exist
    }

    try {
      const snapshotPath = path.relative(this.config.snapshotDir, this.getSnapshotPath(id));
      await fs.symlink(snapshotPath, latestPath);
    } catch {
      // Symlinks might not be supported
    }
  }

  /**
   * Hash file content (simple hash for now)
   */
  private async hashContent(content: Buffer): Promise<string> {
    // Simple hash using crypto
    const crypto = await import('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }
}

/**
 * Create default snapshot store
 */
export function createSnapshotStore(projectRoot: string): SnapshotStore {
  return new SnapshotStore({
    snapshotDir: path.join(projectRoot, '.deepagents', 'snapshots'),
  });
}
