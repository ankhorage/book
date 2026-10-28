import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { importEpubAsync } from './importEpubAsync.js';
import { importMarkdown } from './importMarkdownAsync.js';
import { importPdfAsync } from './importPdfAsync.js';

/*** Import one supported source through its concrete format adapter. */
export async function importBookSourceAsync(source: string) {
  const format = extname(source).toLowerCase();
  if (format === '.pdf') return await importPdfAsync(source);
  if (format === '.epub') return await importEpubAsync(source);
  if (format === '.md' || format === '.markdown')
    return importMarkdown(source, await readFile(source, 'utf8'));
  throw new Error('Supported import formats are PDF, EPUB, and Markdown.');
}
