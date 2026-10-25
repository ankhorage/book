import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { importMarkdown } from './importMarkdownAsync.js';

/*** Extract selectable PDF text into editable Markdown, reporting unavoidable reconstruction loss. */
export async function importPdfAsync(source: string) {
  const bytes = await readFile(source);
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false })
    .promise;
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
    }),
  );
  const text = pages.filter(Boolean).join('\n\n');
  if (text.length === 0)
    throw new Error(
      'The PDF has no selectable text and appears scanned or image-only. OCR is required before importing it.',
    );
  const imported = importMarkdown(
    source,
    `# ${basename(source, '.pdf')}\n\n${repairHyphenation(text)}\n`,
  );
  return {
    ...imported,
    report: {
      ...imported.report,
      format: 'pdf' as const,
      warnings: [
        'PDF reconstruction is lossy: headings, tables, images, links, and page layout require review.',
        'Repeated headers and footers are not retained in this text-first import.',
      ],
      chapters: imported.report.chapters.map((chapter) => ({
        ...chapter,
        confidence: 'medium' as const,
      })),
    },
  };
}

/*** Repair only clear line-break hyphenation while preserving intentional hyphens. */
function repairHyphenation(value: string): string {
  return value.replace(/(\p{L})-\s+(\p{Ll})/gu, '$1$2');
}
