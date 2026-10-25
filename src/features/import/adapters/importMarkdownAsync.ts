import { basename } from 'node:path';

import type { BookProject, ImportReport } from '../../../types/book.js';

/*** Convert a plain Markdown manuscript into canonical chapters and metadata. */
export function importMarkdown(
  source: string,
  markdown: string,
): {
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report: ImportReport;
} {
  const sections = splitChapters(markdown);
  const chapters = sections.map((section, index) => ({
    id: `${String(index + 1).padStart(2, '0')}-${slug(section.title)}`,
    title: section.title,
    file: `chapters/${String(index + 1).padStart(2, '0')}-${slug(section.title)}.md`,
    source: section.source,
  }));
  const title = chapters[0]?.title ?? basename(source).replace(/\.[^.]+$/u, '');
  return {
    project: {
      metadata: { title, author: 'Unknown author', language: 'en' },
      chapters: chapters.map(({ id, title: chapterTitle, file }) => ({
        id,
        title: chapterTitle,
        file,
      })),
      export: { epub: { version: '3.0' }, pdf: { pageSize: 'A5' } },
    },
    chapters: new Map(chapters.map(({ id, source: chapterSource }) => [id, chapterSource])),
    report: {
      source,
      format: 'markdown',
      generatedAt: new Date().toISOString(),
      warnings: [],
      chapters: chapters.map((chapter) => ({ id: chapter.id, source, confidence: 'high' })),
    },
  };
}

/*** Split semantic level-one headings into deterministic source files. */
function splitChapters(
  source: string,
): readonly { readonly title: string; readonly source: string }[] {
  const matches = [...source.matchAll(/^# (.+)$/gmu)];
  if (matches.length === 0) return [{ title: 'Manuscript', source }];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    source: source
      .slice(match.index, matches[index + 1]?.index)
      .trimEnd()
      .concat('\n'),
  }));
}

/*** Turn an editable chapter title into a stable path component. */
function slug(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/giu, '-')
      .replace(/^-|-$/gu, '') || 'chapter'
  );
}
