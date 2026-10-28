import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

import type { BookProject } from '../../../types/book.js';
import { type BookBlock, type BookInline, parseMarkdownDocument } from './parseMarkdownDocument.js';
import { renderMarkdownAsXhtml } from './renderMarkdownAsXhtml.js';

/*** Generate a reflowable EPUB 3 archive with navigation, spine, and semantic chapter XHTML. */
export async function exportEpubAsync(input: {
  readonly project: BookProject;
  readonly chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[];
  readonly projectDirectory: string;
  readonly target: string;
}): Promise<string> {
  const assets = await publicationAssetsAsync(input);
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
  await writeChaptersAsync(writer, input.chapters, assets);
  await Promise.all(
    [...new Set([...assets.values()].flatMap((chapterAssets) => [...chapterAssets.values()]))].map(
      async (asset) =>
        await writer.add(
          `EPUB/${asset.href}`,
          new BlobReader(new Blob([await readFile(asset.path)])),
          {
            level: 6,
          },
        ),
    ),
  );
  await writer.add(
    'EPUB/package.opf',
    new TextReader(
      packageDocument(input.project, input.chapters, [
        ...new Set([...assets.values()].flatMap((value) => [...value.values()])),
      ]),
    ),
  );
  const archive = await writer.close();
  await writeFile(input.target, new Uint8Array(await archive.arrayBuffer()));
  return input.target;
}

/*** Write each semantic chapter in its canonical reading order. */
async function writeChaptersAsync(
  writer: ZipWriter<Blob>,
  chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[],
  assets: ReadonlyMap<string, ReadonlyMap<string, PublicationAsset>>,
): Promise<void> {
  await Promise.all(
    chapters.map(
      async (chapter) =>
        await writer.add(
          `EPUB/${chapter.id}.xhtml`,
          new TextReader(
            xhtml(chapter.title, chapter.source, assets.get(chapter.file) ?? new Map()),
          ),
          { level: 6 },
        ),
    ),
  );
}

/*** Render EPUB navigation from the canonical chapter order. */
function navigation(project: BookProject): string {
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escape(project.metadata.language)}"><head><title>Contents</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>${project.chapters.map((chapter) => `<li><a href="${chapter.id}.xhtml">${escape(chapter.title)}</a></li>`).join('')}</ol></nav></body></html>`;
}

/*** Render semantic Markdown through an AST instead of flattening every block into paragraphs. */
function xhtml(
  title: string,
  markdown: string,
  assets: ReadonlyMap<string, PublicationAsset>,
): string {
  const body = renderMarkdownAsXhtml(markdown, (url) => assets.get(url)?.href ?? url);
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${escape(title)}</title></head><body>${body}</body></html>`;
}

/*** Render the EPUB package manifest and ordered reading spine. */
function packageDocument(
  project: BookProject,
  chapters: readonly BookProject['chapters'][number][],
  assets: readonly PublicationAsset[],
): string {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  return `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book">urn:ankhorage:book:${escape(project.metadata.title)}</dc:identifier><dc:title>${escape(project.metadata.title)}</dc:title><dc:creator>${escape(project.metadata.author)}</dc:creator><dc:language>${escape(project.metadata.language)}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((chapter) => `<item id="chapter-${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${assets.map((asset) => `<item id="${asset.id}" href="${asset.href}" media-type="${asset.mediaType}"/>`).join('')}</manifest><spine>${chapters.map((chapter) => `<itemref idref="chapter-${chapter.id}"/>`).join('')}</spine></package>`;
}

interface PublicationAsset {
  readonly href: string;
  readonly id: string;
  readonly mediaType: string;
  readonly path: string;
}

/*** Copy local Markdown image references into the EPUB and reject paths outside the project. */
async function publicationAssetsAsync(input: {
  readonly chapters: readonly (BookProject['chapters'][number] & { readonly source: string })[];
  readonly projectDirectory: string;
}): Promise<ReadonlyMap<string, ReadonlyMap<string, PublicationAsset>>> {
  const assets = await Promise.all(
    input.chapters.map(async (chapter) => {
      const urls = imageUrls(parseMarkdownDocument(chapter.source));
      const entries = await Promise.all(
        urls.map(async (url, index) => {
          if (/^[a-z][a-z0-9+.-]*:/iu.test(url) || url.startsWith('#')) return undefined;
          const path = resolve(input.projectDirectory, dirname(chapter.file), url);
          const projectPath = relative(input.projectDirectory, path);
          if (isAbsolute(url) || projectPath === '..' || projectPath.startsWith('../'))
            throw new Error(`Image reference escapes the book project: ${url}`);
          await readFile(path);
          const extension = extname(path).toLocaleLowerCase();
          const mediaType = mediaTypeFor(extension);
          const href = `assets/${encodeURIComponent(`${chapter.id}-${index}-${basename(path)}`)}`;
          return [url, { href, id: `asset-${chapter.id}-${index}`, mediaType, path }] as const;
        }),
      );
      return [
        chapter.file,
        new Map(entries.flatMap((entry) => (entry === undefined ? [] : [entry]))),
      ] as const;
    }),
  );
  return new Map(assets);
}

/*** Read local image URLs from the shared semantic document. */
function imageUrls(blocks: readonly BookBlock[]): readonly string[] {
  return blocks.flatMap(imageUrlsFromBlock);
}

/*** Traverse one semantic block for image inline nodes. */
function imageUrlsFromBlock(block: BookBlock): readonly string[] {
  if (block.kind === 'blockquote') return imageUrls(block.children);
  if (block.kind === 'list') return block.items.flatMap(imageUrlsFromInlines);
  if (block.kind === 'table') return block.rows.flatMap((row) => row.flatMap(imageUrlsFromInlines));
  return 'children' in block ? imageUrlsFromInlines(block.children) : [];
}

/*** Traverse one inline sequence for images. */
function imageUrlsFromInlines(inlines: readonly BookInline[]): readonly string[] {
  return inlines.flatMap((inline) =>
    inline.kind === 'image'
      ? [inline.url]
      : 'children' in inline
        ? imageUrlsFromInlines(inline.children)
        : [],
  );
}

/*** Map supported embedded image extensions to EPUB manifest media types. */
function mediaTypeFor(extension: string): string {
  const mediaType = new Map([
    ['.gif', 'image/gif'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
  ]).get(extension);
  if (mediaType === undefined)
    throw new Error(`Unsupported EPUB image type: ${extension || '(none)'}`);
  return mediaType;
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
