/**
 * Minimal mkdirp implementation
 */

import { promises as fs from 'fs';
import path from 'path';

export async function mkdirp(dirPath: string): Promise<void> {
  const normalizedPath = path.normalize(dirPath);
  const parts = normalizedPath.split(path.sep);
  let current = parts[0] === '/' ? '/' : '';

  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.stat(current);
      if (!stat.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await fs.mkdir(current, { recursive: false });
      } else {
        throw error;
      }
    }
  }
}
