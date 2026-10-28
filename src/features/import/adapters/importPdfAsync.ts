import { readFile } from 'node:fs/promises';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { BookProject, ImportReport } from '../../../types/book.js';
import { importMarkdown } from './importMarkdownAsync.js';
import { reconstructPdfImport } from './reconstructPdfImport.js';

interface PdfLine {
  readonly page: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/*** Reconstruct editable PDF chapters from selectable text, retaining uncertainty where geometry is ambiguous. */
export async function importPdfAsync(source: string): Promise<{
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report: ImportReport;
}> {
  const bytes = await readFile(source);
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false })
    .promise;
  const lines = removeRunningMatter(
    (
      await Promise.all(
        Array.from(
          { length: document.numPages },
          async (_, index) => await pageLinesAsync(document, index + 1),
        ),
      )
    ).flat(),
  );
  if (lines.length === 0)
    throw new Error(
      'The PDF has no selectable text and appears scanned or image-only. OCR is required before importing it.',
    );
  const reconstruction = reconstructPdfImport({ lines });
  const markdown = reconstruction.sections
    .map((section) => `# ${section.title}\n\n${section.source}`)
    .join('\n\n');
  const imported = importMarkdown(source, markdown);
  return pdfImportResult(imported, await pdfMetadataAsync(document), reconstruction.author);
}

/*** Attach explicit PDF reconstruction and metadata provenance to a normalized Markdown import. */
function pdfImportResult(
  imported: ReturnType<typeof importMarkdown>,
  metadata: { readonly author?: string; readonly language?: string; readonly title?: string },
  recoveredAuthor: string | undefined,
): {
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report: ImportReport;
} {
  const author = metadata.author ?? recoveredAuthor;
  return {
    ...imported,
    project: {
      ...imported.project,
      metadata: {
        ...imported.project.metadata,
        ...metadata,
        ...(author === undefined ? {} : { author }),
      },
    },
    report: {
      ...imported.report,
      format: 'pdf' as const,
      warnings: [
        'Chapter boundaries were reconstructed from visible chapter labels. Review complex tables, images, and links.',
        'Repeated running headers, footers, and page numbers were removed.',
      ],
      metadata: metadataReport(metadata, recoveredAuthor),
      chapters: imported.report.chapters.map((chapter) => ({
        ...chapter,
        confidence: 'medium' as const,
      })),
    },
  };
}

/*** Report whether metadata came from trusted PDF fields or a lower-confidence visible-cover heuristic. */
function metadataReport(
  metadata: { readonly author?: string; readonly language?: string; readonly title?: string },
  recoveredAuthor: string | undefined,
): NonNullable<ImportReport['metadata']> {
  return {
    ...(metadata.title === undefined
      ? {}
      : { title: { source: 'PDF metadata', confidence: 'high' as const } }),
    ...(metadata.language === undefined
      ? {}
      : { language: { source: 'PDF metadata', confidence: 'high' as const } }),
    ...(metadata.author === undefined && recoveredAuthor !== undefined
      ? { author: { source: 'visible PDF cover', confidence: 'low' as const } }
      : metadata.author === undefined
        ? {}
        : { author: { source: 'PDF metadata', confidence: 'high' as const } }),
  };
}

/*** Preserve PDF title and language metadata when the source provides trustworthy strings. */
async function pdfMetadataAsync(document: pdfjs.PDFDocumentProxy) {
  const { info } = await document.getMetadata();
  const author = metadataString(info, 'Author');
  const title = metadataString(info, 'Title');
  const language = metadataString(info, 'Language');
  return {
    ...(author === undefined ? {} : { author }),
    ...(title === undefined ? {} : { title }),
    ...(language === undefined ? {} : { language }),
  };
}

/*** Read one non-empty PDF metadata value without trusting an untyped metadata dictionary. */
function metadataString(info: object, key: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(info, key);
  const value: unknown = descriptor === undefined ? undefined : descriptor.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/*** Extract baseline-sorted page lines rather than joining every PDF fragment into one paragraph. */
async function pageLinesAsync(
  document: pdfjs.PDFDocumentProxy,
  pageNumber: number,
): Promise<readonly PdfLine[]> {
  const content = await (await document.getPage(pageNumber)).getTextContent();
  const fragments = content.items
    .flatMap((item) => {
      if (!('str' in item) || item.str.trim() === '') return [];
      const transform: unknown = item.transform;
      if (!Array.isArray(transform)) return [];
      const values: readonly unknown[] = transform;
      const x = values.at(4);
      const y = values.at(5);
      const size = values.at(0);
      return typeof x === 'number' && typeof y === 'number' && typeof size === 'number'
        ? [{ text: item.str, x, y, size }]
        : [];
    })
    .sort((left, right) => right.y - left.y || left.x - right.x);
  return groupFragments(fragments).map((fragment) => ({ ...fragment, page: pageNumber }));
}

/*** Join text fragments on the same visual baseline in left-to-right reading order. */
function groupFragments(
  fragments: readonly {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly size: number;
  }[],
): readonly Omit<PdfLine, 'page'>[] {
  const lines = fragments.reduce<
    readonly (readonly {
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
    }[])[]
  >((groups, fragment) => {
    const current = groups.at(-1);
    return current !== undefined && Math.abs((current[0]?.y ?? fragment.y) - fragment.y) < 1
      ? [...groups.slice(0, -1), [...current, fragment]]
      : [...groups, [fragment]];
  }, []);
  return lines.map((line) => ({
    text: line
      .map((fragment) => fragment.text)
      .join(' ')
      .replace(/\s+([,.;:!?])/gu, '$1'),
    x: line[0]?.x ?? 0,
    y: line[0]?.y ?? 0,
    size: line[0]?.size ?? 0,
  }));
}

/*** Remove repeated text found at page edges on at least three different pages. */
function removeRunningMatter(lines: readonly PdfLine[]): readonly PdfLine[] {
  const occurrences = new Map<string, Set<number>>();
  for (const line of lines.filter((line) => line.y < 60 || line.y > 550)) {
    const key = normalize(line.text);
    occurrences.set(key, new Set([...(occurrences.get(key) ?? []), line.page]));
  }
  const repeated = new Set(
    [...occurrences].filter(([, pages]) => pages.size >= 3).map(([text]) => text),
  );
  return lines.filter((line) => {
    const atPageEdge = line.y < 60 || line.y > 550;
    return !/^\d{1,4}$/u.test(line.text) && !(atPageEdge && repeated.has(normalize(line.text)));
  });
}

/*** Normalize only for repeated-furniture comparison. */
function normalize(value: string): string {
  return value
    .replace(/\s*\d{1,4}$/u, '')
    .replace(/[\s‐‑–—-]/gu, '')
    .toLocaleLowerCase();
}
