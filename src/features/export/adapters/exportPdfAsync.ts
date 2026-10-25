import { Document, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { createElement } from 'react';

import type { BookProject } from '../../../types/book.js';

/*** Generate an A5 PDF using a maintained layout engine rather than handwritten PDF syntax. */
export async function exportPdfAsync(input: {
  readonly project: BookProject;
  readonly chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[];
  readonly target: string;
}): Promise<string> {
  const buffer = await renderToBuffer(createPdfDocument(input));
  await Bun.write(input.target, buffer);
  return input.target;
}

/*** Compose the document tree consumed by the PDF layout adapter. */
function createPdfDocument(input: {
  readonly project: BookProject;
  readonly chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[];
}) {
  const styles = StyleSheet.create({
    page: { padding: 42, fontSize: 10, fontFamily: 'Helvetica' },
    title: { fontSize: 28, marginBottom: 18 },
    heading: { fontSize: 18, marginBottom: 10 },
    paragraph: { marginBottom: 8, lineHeight: 1.45 },
  });
  const children = [coverPage(input.project, styles), ...chapterPages(input.chapters, styles)];
  return createElement(
    Document,
    {
      title: input.project.metadata.title,
      author: input.project.metadata.author,
      language: input.project.metadata.language,
    },
    ...children,
  );
}

/*** Render the first PDF page from the book's publication metadata. */
function coverPage(project: BookProject, styles: ReturnType<typeof StyleSheet.create>) {
  return createElement(
    Page,
    { key: 'cover', size: 'A5', style: styles.page },
    createElement(
      View,
      null,
      createElement(Text, { style: styles.title }, project.metadata.title),
      project.metadata.subtitle === undefined
        ? null
        : createElement(Text, { style: styles.heading }, project.metadata.subtitle),
      createElement(Text, null, project.metadata.author),
    ),
  );
}

/*** Render one readable PDF page for each canonical chapter. */
function chapterPages(
  chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[],
  styles: ReturnType<typeof StyleSheet.create>,
) {
  return chapters.map((chapter) =>
    createElement(
      Page,
      { key: chapter.id, size: 'A5', style: styles.page },
      createElement(Text, { style: styles.heading }, chapter.title),
      ...chapter.source
        .split(/\n{2,}/u)
        .filter(Boolean)
        .map((paragraph, index) =>
          createElement(
            Text,
            { key: `${chapter.id}-${index}`, style: styles.paragraph },
            paragraph.replace(/^#{1,6} /u, ''),
          ),
        ),
    ),
  );
}
