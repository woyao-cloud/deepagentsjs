/**
 * Unit tests for file utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFileSafe,
  writeFile,
  exists,
  isFile,
  isDirectory,
  deleteFile,
} from '../../src/utils/file-utils.js';
import path from 'path';
import { promises as fs } from 'fs';

const TEST_DIR = path.join(process.cwd(), '.test-temp-file-utils');

describe('File Utilities', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('readFileSafe', () => {
    it('should return null for non-existent file', async () => {
      const result = await readFileSafe(path.join(TEST_DIR, 'nonexistent.txt'));
      expect(result).toBeNull();
    });

    it('should read existing file content', async () => {
      const filePath = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(filePath, 'test content', 'utf-8');

      const result = await readFileSafe(filePath);
      expect(result).toBe('test content');
    });
  });

  describe('writeFile', () => {
    it('should create file with content', async () => {
      const filePath = path.join(TEST_DIR, 'new-file.txt');
      await writeFile(filePath, 'hello world');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('hello world');
    });

    it('should create nested directories automatically', async () => {
      const filePath = path.join(TEST_DIR, 'nested', 'deep', 'file.txt');
      await writeFile(filePath, 'nested content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('nested content');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(TEST_DIR, 'exists.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      expect(await exists(filePath)).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      expect(await exists(path.join(TEST_DIR, 'nonexistent.txt'))).toBe(false);
    });
  });

  describe('isFile', () => {
    it('should return true for file', async () => {
      const filePath = path.join(TEST_DIR, 'isfile.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      expect(await isFile(filePath)).toBe(true);
    });

    it('should return false for directory', async () => {
      expect(await isFile(TEST_DIR)).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directory', async () => {
      expect(await isDirectory(TEST_DIR)).toBe(true);
    });

    it('should return false for file', async () => {
      const filePath = path.join(TEST_DIR, 'file.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      expect(await isDirectory(filePath)).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      const filePath = path.join(TEST_DIR, 'delete-me.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      await deleteFile(filePath);

      expect(await exists(filePath)).toBe(false);
    });

    it('should not throw for non-existent file', async () => {
      await expect(
        deleteFile(path.join(TEST_DIR, 'nonexistent.txt'))
      ).resolves.not.toThrow();
    });
  });
});
