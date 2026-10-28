import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readProjectAsync } from '../../project/application/readProjectAsync.js';
import { exportEpubAsync } from '../adapters/exportEpubAsync.js';
import { exportPdfAsync } from '../adapters/exportPdfAsync.js';
import { exportBookAsync } from '../application/exportBookAsync.js';
/*** Compose publication adapters around the export use case. */
export async function exportBook(
  input: Parameters<typeof exportBookAsync>[0],
): Promise<readonly string[]> {
  return await exportBookAsync(input, {
    readProjectAsync,
    readChapterAsync: async (directory, file) => await readFile(join(directory, file), 'utf8'),
    ensureDirectoryAsync: async (directory) => {
      await mkdir(directory, { recursive: true });
    },
    existsAsync: async (path) => await Bun.file(path).exists(),
    exportEpubAsync,
    exportPdfAsync,
  });
}
