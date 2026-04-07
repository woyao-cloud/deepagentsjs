/**
 * Session Store - manages session persistence
 * @module storage/session-store
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { generateId } from '../utils/id-generator.js';

const logger = createLogger({ component: 'session-store' });

/**
 * Session data
 */
export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: Date;
  lastAccessedAt: Date;
  status: SessionStatus;
  currentPhase: string | null;
  progress: number;
  metadata: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed';

/**
 * Session filter
 */
export interface SessionFilter {
  status?: SessionStatus;
  projectPath?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Session Store configuration
 */
export interface SessionStoreConfig {
  sessionsDir: string;
  maxSessions?: number;
}

/**
 * Session Store manages session persistence
 */
export class SessionStore {
  private config: Required<SessionStoreConfig>;
  private sessions: Map<string, Session> = new Map();

  constructor(config: SessionStoreConfig) {
    this.config = {
      sessionsDir: config.sessionsDir,
      maxSessions: config.maxSessions ?? 100,
    };
    logger.info({ config: this.config }, 'SessionStore initialized');
  }

  /**
   * Create a new session
   */
  async createSession(projectPath: string, projectName: string): Promise<Session> {
    const session: Session = {
      id: generateId(),
      projectPath,
      projectName,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      status: 'active',
      currentPhase: null,
      progress: 0,
      metadata: {},
    };

    this.sessions.set(session.id, session);
    await this.saveSession(session);

    logger.info({ sessionId: session.id, projectName }, 'Session created');
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = new Date();
      return session;
    }

    // Try to load from disk
    try {
      const loaded = await this.loadSession(sessionId);
      if (loaded) {
        this.sessions.set(sessionId, loaded);
        return loaded;
      }
    } catch {
      // Session not found
    }

    return null;
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updated: Session = {
      ...session,
      ...updates,
      lastAccessedAt: new Date(),
    };

    this.sessions.set(sessionId, updated);
    await this.saveSession(updated);

    logger.info({ sessionId }, 'Session updated');
    return updated;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const existed = this.sessions.has(sessionId);
    this.sessions.delete(sessionId);

    // Delete from disk
    const filePath = this.getSessionFilePath(sessionId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist
    }

    logger.info({ sessionId, existed }, 'Session deleted');
    return existed;
  }

  /**
   * List sessions with optional filter
   */
  async listSessions(filter?: SessionFilter): Promise<Session[]> {
    // Ensure all sessions are loaded
    await this.loadAllSessions();

    let sessions = Array.from(this.sessions.values());

    if (filter) {
      if (filter.status) {
        sessions = sessions.filter(s => s.status === filter.status);
      }
      if (filter.projectPath) {
        sessions = sessions.filter(s => s.projectPath === filter.projectPath);
      }
      if (filter.dateRange) {
        sessions = sessions.filter(
          s =>
            s.createdAt >= filter.dateRange!.start &&
            s.createdAt <= filter.dateRange!.end
        );
      }
    }

    // Sort by last accessed (most recent first)
    sessions.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

    return sessions;
  }

  /**
   * Search sessions by query
   */
  async searchSessions(query: string): Promise<Session[]> {
    await this.loadAllSessions();

    const lowerQuery = query.toLowerCase();
    return Array.from(this.sessions.values())
      .filter(
        s =>
          s.projectName.toLowerCase().includes(lowerQuery) ||
          s.projectPath.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());
  }

  /**
   * Load session from disk
   */
  private async loadSession(sessionId: string): Promise<Session | null> {
    const filePath = this.getSessionFilePath(sessionId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as Session;
      session.createdAt = new Date(session.createdAt);
      session.lastAccessedAt = new Date(session.lastAccessedAt);
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Save session to disk
   */
  private async saveSession(session: Session): Promise<void> {
    await fs.mkdir(this.config.sessionsDir, { recursive: true });

    const filePath = this.getSessionFilePath(session.id);
    const content = JSON.stringify(session, null, 2);

    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  /**
   * Load all sessions from disk
   */
  private async loadAllSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.sessionsDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));

      for (const file of sessionFiles) {
        const sessionId = file.replace('.json', '');
        if (!this.sessions.has(sessionId)) {
          const session = await this.loadSession(sessionId);
          if (session) {
            this.sessions.set(sessionId, session);
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  /**
   * Get session file path
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.config.sessionsDir, `${sessionId}.json`);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active').length;
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(keepCount: number): Promise<number> {
    await this.loadAllSessions();

    const sessions = Array.from(this.sessions.values())
      .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

    if (sessions.length <= keepCount) {
      return 0;
    }

    const toDelete = sessions.slice(keepCount);
    let deleted = 0;

    for (const session of toDelete) {
      if (await this.deleteSession(session.id)) {
        deleted++;
      }
    }

    logger.info({ deleted, remaining: keepCount }, 'Old sessions cleaned up');
    return deleted;
  }
}

/**
 * Create default session store
 */
export function createSessionStore(projectRoot: string): SessionStore {
  return new SessionStore({
    sessionsDir: path.join(projectRoot, '.deepagents', 'sessions'),
  });
}
