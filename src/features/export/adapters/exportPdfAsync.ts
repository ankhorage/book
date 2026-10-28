import {
  Document,
  Image,
  Link,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';

import type { BookProject } from '../../../types/book.js';
import { type BookBlock, type BookInline, parseMarkdownDocument } from './parseMarkdownDocument.js';

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
    title: { fontSize: 28, marginBottom: 18, fontFamily: 'Helvetica-Bold' },
    heading: { fontSize: 18, marginBottom: 10 },
    paragraph: { marginBottom: 8, lineHeight: 1.45 },
    contents: { fontSize: 18, marginBottom: 14, fontFamily: 'Helvetica-Bold' },
    toc: { color: '#111111', marginBottom: 7 },
    list: { marginBottom: 8, paddingLeft: 9 },
    table: { marginBottom: 9, borderTopWidth: 0.5, borderLeftWidth: 0.5 },
    tableRow: { flexDirection: 'row' },
    tableCell: {
      flexGrow: 1,
      flexBasis: 0,
      padding: 3,
      borderRightWidth: 0.5,
      borderBottomWidth: 0.5,
      fontSize: 8,
    },
    code: { fontFamily: 'Courier', fontSize: 8, marginBottom: 8 },
    emphasis: { fontFamily: 'Helvetica-Oblique' },
    strong: { fontFamily: 'Helvetica-Bold' },
    image: { maxWidth: '100%', maxHeight: 320, marginBottom: 8 },
    pageNumber: {
      position: 'absolute',
      bottom: 18,
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 8,
    },
  });
  const children = [
    coverPage(input.project, styles),
    contentsPage(input.chapters, styles),
    ...chapterPages(input.chapters, styles),
  ];
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

/*** Render an internal-link table of contents from canonical chapter order. */
function contentsPage(
  chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[],
  styles: ReturnType<typeof StyleSheet.create>,
) {
  return createElement(
    Page,
    { key: 'contents', size: 'A5', style: styles.page },
    pageNumber(styles),
    createElement(Text, { style: styles.contents }, 'Contents'),
    ...chapters.map((chapter) =>
      createElement(
        Link,
        { key: chapter.id, src: `#${chapter.id}`, style: styles.toc },
        chapter.title,
      ),
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
      { key: chapter.id, size: 'A5', style: styles.page, wrap: true },
      pageNumber(styles),
      createElement(
        View,
        { id: chapter.id, break: true },
        createElement(Text, { style: styles.heading }, chapter.title),
        ...parseMarkdownDocument(chapter.source).map((block, index) =>
          renderBlock(block, `${chapter.id}-${index}`, styles),
        ),
      ),
    ),
  );
}

/*** Map a shared semantic block into pagination-aware PDF primitives. */
function renderBlock(
  block: BookBlock,
  key: string,
  styles: ReturnType<typeof StyleSheet.create>,
): ReactElement {
  if (block.kind === 'heading')
    return createElement(
      Text,
      { key, style: styles.heading, wrap: false },
      ...inlineNodes(block.children, styles),
    );
  if (block.kind === 'paragraph')
    return createElement(
      View,
      { key },
      createElement(Text, { style: styles.paragraph }, ...inlineNodes(block.children, styles)),
      ...images(block.children, key, styles),
    );
  if (block.kind === 'list') return renderList(block, key, styles);
  if (block.kind === 'table') return renderTable(block, key, styles);
  if (block.kind === 'blockquote')
    return createElement(
      View,
      { key, style: styles.list },
      ...block.children.map((child, index) => renderBlock(child, `${key}-${index}`, styles)),
    );
  return createElement(Text, { key, style: styles.code }, block.value);
}

/*** Keep every list item together while preserving its inline semantics. */
function renderList(
  block: Extract<BookBlock, { readonly kind: 'list' }>,
  key: string,
  styles: ReturnType<typeof StyleSheet.create>,
): ReactElement {
  return createElement(
    View,
    { key, style: styles.list },
    ...block.items.map((item, index) =>
      createElement(
        Text,
        { key: index },
        `${block.ordered ? `${index + 1}.` : '•'} `,
        ...inlineNodes(item, styles),
      ),
    ),
  );
}

/*** Keep individual table rows together while allowing a table to flow across pages. */
function renderTable(
  block: Extract<BookBlock, { readonly kind: 'table' }>,
  key: string,
  styles: ReturnType<typeof StyleSheet.create>,
): ReactElement {
  return createElement(
    View,
    { key, style: styles.table },
    ...block.rows.map((row, rowIndex) =>
      createElement(
        View,
        { key: rowIndex, style: styles.tableRow, wrap: false },
        ...row.map((cell, cellIndex) =>
          createElement(
            Text,
            { key: cellIndex, style: styles.tableCell },
            ...inlineNodes(cell, styles),
          ),
        ),
      ),
    ),
  );
}

/*** Render formatted inline text and real PDF links from shared semantic nodes. */
function inlineNodes(
  inlines: readonly BookInline[],
  styles: ReturnType<typeof StyleSheet.create>,
): readonly (ReactElement | string)[] {
  return inlines.reduce<readonly (ReactElement | string)[]>((nodes, inline, index) => {
    const key = `${inline.kind}-${index}`;
    if (inline.kind === 'text' || inline.kind === 'code') return [...nodes, inline.value];
    if (inline.kind === 'image') return nodes;
    const children = inlineNodes(inline.children, styles);
    if (inline.kind === 'link')
      return [...nodes, createElement(Link, { key, src: inline.url }, ...children)];
    return [
      ...nodes,
      createElement(
        Text,
        { key, style: inline.kind === 'strong' ? styles.strong : styles.emphasis },
        ...children,
      ),
    ];
  }, []);
}

/*** Render image nodes as visible publication media rather than alt-text substitutes. */
function images(
  inlines: readonly BookInline[],
  key: string,
  styles: ReturnType<typeof StyleSheet.create>,
): readonly ReactElement[] {
  return inlines.flatMap((inline, index) =>
    inline.kind === 'image'
      ? [createElement(Image, { key: `${key}-${index}`, src: inline.url, style: styles.image })]
      : 'children' in inline
        ? images(inline.children, `${key}-${index}`, styles)
        : [],
  );
}

/*** Render physical page numbers on every flowing book page. */
function pageNumber(styles: ReturnType<typeof StyleSheet.create>) {
  return createElement(Text, {
    fixed: true,
    style: styles.pageNumber,
    render: ({ pageNumber: number }) => String(number),
  });
}
