import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { BookProject, ImportReport } from '../../../types/book.js';
import { importMarkdown } from './importMarkdownAsync.js';

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
  const markdown = outlineMarkdown(lines, source);
  const imported = importMarkdown(source, markdown);
  const metadata = await pdfMetadataAsync(document);
  return {
    ...imported,
    project: { ...imported.project, metadata: { ...imported.project.metadata, ...metadata } },
    report: {
      ...imported.report,
      format: 'pdf' as const,
      warnings: [
        'Chapter boundaries were reconstructed from visible chapter labels. Review complex tables, images, and links.',
        'Repeated running headers, footers, and page numbers were removed.',
      ],
      chapters: imported.report.chapters.map((chapter) => ({
        ...chapter,
        confidence: 'medium' as const,
      })),
    },
  };
}

/*** Preserve PDF title and language metadata when the source provides trustworthy strings. */
async function pdfMetadataAsync(document: pdfjs.PDFDocumentProxy) {
  const { info } = await document.getMetadata();
  const title = metadataString(info, 'Title');
  const language = metadataString(info, 'Language');
  return {
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

/*** Turn visible `KAPITEL NN` labels into chapter boundaries and keep page reading order within each chapter. */
function outlineMarkdown(lines: readonly PdfLine[], source: string): string {
  const chapters = lines.flatMap((line, index) =>
    /^K\s*A\s*P\s*I\s*T\s*E\s*L\s*(?:\d\s*){1,2}$/iu.test(line.text)
      ? [{ index, title: chapterTitle(lines, index) }]
      : [],
  );
  if (chapters.length === 0) return `# ${basename(source, '.pdf')}\n\n${paragraphs(lines)}`;
  return chapters
    .map((chapter, index) => {
      const start = chapter.index + 1 + chapter.title.lines;
      const end = chapters[index + 1]?.index ?? lines.length;
      return `# ${chapter.title.text}\n\n${paragraphs(lines.slice(start, end))}`;
    })
    .join('\n\n');
}

/*** Collect wrapped title lines until the first numbered section or ordinary body paragraph. */
function chapterTitle(
  lines: readonly PdfLine[],
  index: number,
): { readonly text: string; readonly lines: number } {
  const following = lines.slice(index + 1);
  const titleLines = following.slice(0, 3).filter((line, lineIndex) => {
    const previous = lineIndex === 0 ? lines.at(index) : following.at(lineIndex - 1);
    return line.page === previous?.page && line.size >= 16 && !/^\d+\.\d+/u.test(line.text);
  });
  const title = titleLines
    .map((line) => line.text)
    .join(' ')
    .trim();
  return { lines: titleLines.length, text: title || 'Untitled chapter' };
}

/*** Rebuild paragraphs from vertical spacing instead of collapsing every page into one block. */
function paragraphs(lines: readonly PdfLine[]): string {
  return repairHyphenation(
    lines
      .map((line, index) => {
        const previous = index === 0 ? undefined : lines[index - 1];
        const separator = previous?.page !== line.page || previous.y - line.y > 20 ? '\n\n' : '\n';
        return `${separator}${line.text}`;
      })
      .join(''),
  )
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/*** Normalize only for repeated-furniture comparison. */
function normalize(value: string): string {
  return value
    .replace(/\s*\d{1,4}$/u, '')
    .replace(/[\s‐‑–—-]/gu, '')
    .toLocaleLowerCase();
}

/*** Repair only clear end-of-line hyphenation. */
function repairHyphenation(value: string): string {
  return value.replace(/(\p{L})[‐-]\n(\p{Ll})/gu, '$1$2');
}
