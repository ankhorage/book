import { writeFile } from 'node:fs/promises';

import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

import type { BookProject } from '../../../types/book.js';
import { renderMarkdownAsXhtml } from './renderMarkdownAsXhtml.js';

/*** Generate a reflowable EPUB 3 archive with navigation, spine, and semantic chapter XHTML. */
export async function exportEpubAsync(input: {
  readonly project: BookProject;
  readonly chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[];
  readonly target: string;
}): Promise<string> {
  const writer = new ZipWriter(new BlobWriter('application/epub+zip'), {
    extendedTimestamp: false,
  });
  await writer.add('mimetype', new TextReader('application/epub+zip'), { level: 0 });
  await writer.add(
    'META-INF/container.xml',
    new TextReader(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  await writer.add('EPUB/nav.xhtml', new TextReader(navigation(input.project)));
  await Promise.all(
    input.chapters.map(
      async (chapter) =>
        await writer.add(
          `EPUB/${chapter.id}.xhtml`,
          new TextReader(xhtml(chapter.title, chapter.source)),
          { level: 6 },
        ),
    ),
  );
  await writer.add(
    'EPUB/package.opf',
    new TextReader(packageDocument(input.project, input.chapters)),
  );
  const archive = await writer.close();
  await writeFile(input.target, new Uint8Array(await archive.arrayBuffer()));
  return input.target;
}

/*** Render EPUB navigation from the canonical chapter order. */
function navigation(project: BookProject): string {
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escape(project.metadata.language)}"><head><title>Contents</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>${project.chapters.map((chapter) => `<li><a href="${chapter.id}.xhtml">${escape(chapter.title)}</a></li>`).join('')}</ol></nav></body></html>`;
}

/*** Render semantic Markdown through an AST instead of flattening every block into paragraphs. */
function xhtml(title: string, markdown: string): string {
  const body = renderMarkdownAsXhtml(markdown);
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${escape(title)}</title></head><body>${body}</body></html>`;
}

/*** Render the EPUB package manifest and ordered reading spine. */
function packageDocument(
  project: BookProject,
  chapters: readonly BookProject['chapters'][number][],
): string {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  return `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book">urn:ankhorage:book:${escape(project.metadata.title)}</dc:identifier><dc:title>${escape(project.metadata.title)}</dc:title><dc:creator>${escape(project.metadata.author)}</dc:creator><dc:language>${escape(project.metadata.language)}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((chapter) => `<item id="chapter-${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((chapter) => `<itemref idref="chapter-${chapter.id}"/>`).join('')}</spine></package>`;
}

/*** Escape text placed in XML documents. */
function escape(value: string): string {
  return value.replace(/[&<>"']/gu, escapeCharacter);
}

/*** Convert one XML-reserved character into its named entity. */
function escapeCharacter(character: string): string {
  switch (character) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&apos;';
    default:
      return character;
  }
}
