/**
 * Unit tests for ID generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateSessionId,
  generateCheckpointId,
  generateTaskId,
  generatePhaseId,
  generateBranchName,
  shortHash,
  sanitizeFileName,
} from '../../src/utils/id-generator.js';

describe('ID Generator', () => {
  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate a valid UUID format', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('generateSessionId', () => {
    it('should generate ID with session prefix', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^session-[0-9a-f-]+$/i);
    });
  });

  describe('generateCheckpointId', () => {
    it('should generate ID with checkpoint prefix', () => {
      const id = generateCheckpointId();
      expect(id).toMatch(/^ckpt-[0-9a-f-]+$/i);
    });
  });

  describe('generateTaskId', () => {
    it('should generate task ID from phase and index', () => {
      const taskId = generateTaskId('phase-1-design', 1);
      expect(taskId).toBe('phase-1-design.task-1');
    });

    it('should handle different indices', () => {
      expect(generateTaskId('phase-2', 0)).toBe('phase-2.task-0');
      expect(generateTaskId('phase-2', 5)).toBe('phase-2.task-5');
    });
  });

  describe('generatePhaseId', () => {
    it('should generate phase ID from name and index', () => {
      const phaseId = generatePhaseId('Architecture Design', 1);
      expect(phaseId).toBe('phase-1-architecture-design');
    });

    it('should handle special characters', () => {
      const phaseId = generatePhaseId('Phase #1: Core & API', 2);
      expect(phaseId).toBe('phase-2-core-api');
    });

    it('should remove leading/trailing hyphens', () => {
      const phaseId = generatePhaseId('Test', 1);
      expect(phaseId).not.toMatch(/^-|-$/);
    });
  });

  describe('generateBranchName', () => {
    it('should generate branch name with feat prefix', () => {
      const branch = generateBranchName('User Module', 'backend-dev');
      expect(branch).toMatch(/^feat\/backend-dev-/);
    });

    it('should lowercase and hyphenate module name', () => {
      const branch = generateBranchName('User Management', 'frontend-dev');
      expect(branch).toBe('feat/frontend-dev-user-management');
    });
  });

  describe('shortHash', () => {
    it('should return first 8 characters', () => {
      const hash = shortHash('abcdefghijklmnop');
      expect(hash).toBe('abcdefgh');
    });

    it('should handle short strings', () => {
      const hash = shortHash('abc');
      expect(hash).toBe('abc');
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace spaces with underscores', () => {
      const name = sanitizeFileName('my file name');
      expect(name).toBe('my_file_name');
    });

    it('should replace special characters', () => {
      const name = sanitizeFileName('file@#$.txt');
      expect(name).toBe('file___.txt');
    });

    it('should collapse multiple underscores', () => {
      const name = sanitizeFileName('file   name');
      expect(name).toBe('file_name');
    });

    it('should remove leading/trailing underscores', () => {
      const name = sanitizeFileName('_file_');
      expect(name).toBe('file');
    });
  });
});
