/**
 * File utility functions
 * @module utils/file-utils
 */

import { promises as fs } from 'fs';
import path from 'path';
import { mkdirp } from './mkdirp.js';

/**
 * Read file content safely, returns null if file doesn't exist
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read file content, throws if file doesn't exist
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Write file content atomically using temp file + rename
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdirp(dir);

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, content, 'utf-8');

  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}

/**
 * Write file content (simple version)
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdirp(dir);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Ensure directory exists, create if not
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdirp(dirPath);
}

/**
 * Check if path exists (file or directory)
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * List files in directory matching pattern
 */
export async function listFiles(dirPath: string, pattern?: RegExp): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  let files = entries
    .filter(entry => entry.isFile())
    .map(entry => path.join(dirPath, entry.name));

  if (pattern) {
    files = files.filter(file => pattern.test(file));
  }

  return files;
}

/**
 * List directories in path
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dirPath, entry.name));
}

/**
 * Copy file from source to destination
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const destDir = path.dirname(dest);
  await mkdirp(destDir);
  await fs.copyFile(src, dest);
}

/**
 * Delete file, ignore if doesn't exist
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Delete directory recursively
 */
export async function deleteDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Read directory contents recursively
 */
export async function readDirRecursive(
  dirPath: string,
  options: { ignore?: RegExp[]; includeDirs?: boolean } = {}
): Promise<string[]> {
  const results: string[] = [];
  const { ignore = [], includeDirs = false } = options;

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Check if should be ignored
      if (ignore.some(pattern => pattern.test(fullPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (includeDirs) {
          results.push(fullPath);
        }
        await walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results;
}
