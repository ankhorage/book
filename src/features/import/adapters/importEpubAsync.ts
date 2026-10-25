import { readFile } from 'node:fs/promises';

import { BlobReader, type Entry, type FileEntry, TextWriter, ZipReader } from '@zip.js/zip.js';

import { importMarkdown } from './importMarkdownAsync.js';

/*** Import textual EPUB content after rejecting archive traversal and oversized archives. */
export async function importEpubAsync(source: string) {
  const bytes = await readFile(source);
  if (bytes.byteLength > 100 * 1024 * 1024)
    throw new Error('EPUB exceeds the 100 MiB import limit.');
  const reader = new ZipReader(new BlobReader(new Blob([bytes])));
  const entries = await reader.getEntries();
  try {
    if (
      entries.length > 10_000 ||
      entries.some(
        (entry) => entry.filename.startsWith('/') || entry.filename.split('/').includes('..'),
      )
    )
      throw new Error('Unsafe EPUB archive entries were rejected.');
    const textEntries = entries
      .filter(isFileEntry)
      .filter((entry) => /\.(x?html|htm)$/iu.test(entry.filename));
    const texts = await Promise.all(
      textEntries.map(async (entry) =>
        (await entry.getData(new TextWriter()))
          .replace(/<script[\s\S]*?<\/script>/giu, '')
          .replace(/<[^>]+>/gu, ' ')
          .replace(/\s+/gu, ' ')
          .trim(),
      ),
    );
    const text = texts.filter(Boolean).join('\n\n');
    if (text === '') throw new Error('The EPUB contains no readable XHTML documents.');
    const imported = importMarkdown(source, `# Imported EPUB\n\n${text}\n`);
    return {
      ...imported,
      report: {
        ...imported.report,
        format: 'epub' as const,
        warnings: [
          'EPUB text was normalized; review styling, tables, internal links, and media before publishing.',
        ],
      },
    };
  } finally {
    await reader.close();
  }
}

/*** Narrow ZIP metadata to entries that can yield archive content. */
function isFileEntry(entry: Entry): entry is FileEntry {
  return entry.directory !== true;
}
