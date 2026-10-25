import { readFile } from 'node:fs/promises';
import { basename, dirname, normalize, posix } from 'node:path';

import { type Document as XmlDocument, DOMParser } from '@xmldom/xmldom';
import { BlobReader, type Entry, type FileEntry, TextWriter, ZipReader } from '@zip.js/zip.js';

import { importMarkdown } from './importMarkdownAsync.js';
import { importXhtmlAsMarkdown } from './importXhtmlAsMarkdown.js';

/*** Import EPUB content in OPF spine order while retaining semantic XHTML as Markdown. */
export async function importEpubAsync(source: string): Promise<ReturnType<typeof importMarkdown>> {
  const bytes = await readFile(source);
  if (bytes.byteLength > 100 * 1024 * 1024)
    throw new Error('EPUB exceeds the 100 MiB import limit.');
  const reader = new ZipReader(new BlobReader(new Blob([bytes])));
  try {
    const entries = await reader.getEntries();
    validateEntries(entries);
    const files = new Map(entries.filter(isFileEntry).map((entry) => [entry.filename, entry]));
    const opfPath = await readPackagePathAsync(files);
    const packageData = parsePackage(await readTextAsync(files, opfPath), opfPath);
    const documents = await Promise.all(
      packageData.spine.map(async (path) => ({
        path,
        markdown: importXhtmlAsMarkdown(await readTextAsync(files, path)).trim(),
      })),
    );
    const readable = documents.filter((document) => document.markdown !== '');
    if (readable.length === 0)
      throw new Error('The EPUB spine contains no readable XHTML documents.');
    const imported = importMarkdown(
      source,
      readable
        .map((document) => ensureChapterHeading(document.path, document.markdown))
        .join('\n\n'),
    );
    return {
      ...imported,
      project: {
        ...imported.project,
        metadata: { ...imported.project.metadata, ...packageData.metadata },
      },
      report: {
        ...imported.report,
        format: 'epub' as const,
        warnings: [
          'EPUB XHTML was converted through a semantic AST in OPF spine order; review CSS-dependent layout and unsupported media.',
          'Internal references are retained as Markdown links; verify links that targeted EPUB-only resources.',
        ],
      },
    };
  } finally {
    await reader.close();
  }
}

/*** Reject archives that can exhaust resources or escape the logical EPUB namespace. */
function validateEntries(entries: readonly Entry[]): void {
  if (
    entries.length > 10_000 ||
    entries.some(
      (entry) => entry.filename.startsWith('/') || entry.filename.split('/').includes('..'),
    )
  )
    throw new Error('Unsafe EPUB archive entries were rejected.');
}

/*** Resolve the package document declared by the EPUB container. */
async function readPackagePathAsync(files: ReadonlyMap<string, FileEntry>): Promise<string> {
  const container = await readTextAsync(files, 'META-INF/container.xml');
  const path =
    xmlDocument(container, 'EPUB container')
      .getElementsByTagName('rootfile')
      .item(0)
      ?.getAttribute('full-path') ?? undefined;
  if (path === undefined || !files.has(path))
    throw new Error('The EPUB container has no readable package document.');
  return path;
}

/*** Read one declared EPUB file while preserving archive boundary checks. */
async function readTextAsync(files: ReadonlyMap<string, FileEntry>, path: string): Promise<string> {
  const entry = files.get(path);
  if (entry === undefined) throw new Error(`EPUB references missing content: ${path}`);
  return await entry.getData(new TextWriter());
}

/*** Parse OPF metadata, manifest, and the declared logical reading spine. */
function parsePackage(
  opf: string,
  opfPath: string,
): {
  readonly metadata: {
    readonly title?: string;
    readonly author?: string;
    readonly language?: string;
  };
  readonly spine: readonly string[];
} {
  const document = xmlDocument(opf, 'EPUB package');
  const manifest = new Map(
    Array.from(document.getElementsByTagName('item')).flatMap((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      return id === null || href === null ? [] : [[id, resolveEpubPath(opfPath, href)] as const];
    }),
  );
  const spine = Array.from(document.getElementsByTagName('itemref')).map((item) => {
    const id = item.getAttribute('idref');
    const path = id === null ? undefined : manifest.get(id);
    if (path === undefined)
      throw new Error(`EPUB spine references missing manifest item: ${id ?? '(none)'}`);
    return path;
  });
  if (spine.length === 0) throw new Error('The EPUB package has no readable spine.');
  return {
    metadata: {
      ...textElement(document, 'title', 'title'),
      ...textElement(document, 'creator', 'author'),
      ...textElement(document, 'language', 'language'),
    },
    spine,
  };
}

/*** Resolve one declared spine reference while ignoring manifest entries without a usable target. */
/*** Extract decoded XML metadata from the package document. */
function textElement(document: XmlDocument, element: string, key: 'author' | 'language' | 'title') {
  const value = document
    .getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', element)
    .item(0)
    ?.textContent?.trim();
  return value === undefined || value === '' ? {} : { [key]: value };
}

/*** Parse XML while rejecting malformed package metadata before it reaches import policy. */
function xmlDocument(source: string, label: string): XmlDocument {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0)
    throw new Error(`${label} is invalid XML.`);
  return document;
}

/*** Resolve an OPF-relative archive path without allowing traversal outside the EPUB. */
function resolveEpubPath(opfPath: string, href: string): string {
  const path = normalize(posix.join(dirname(opfPath), href.split('#')[0] ?? ''));
  if (path === '..' || path.startsWith('../'))
    throw new Error('EPUB spine path escapes the package.');
  return path;
}

/*** Give spine documents without an H1 a stable editable chapter boundary. */
function ensureChapterHeading(path: string, markdown: string): string {
  return /^# /mu.test(markdown)
    ? markdown
    : `# ${basename(path).replace(/\.[^.]+$/u, '')}\n\n${markdown}`;
}

/*** Narrow ZIP metadata to entries that can yield archive content. */
function isFileEntry(entry: Entry): entry is FileEntry {
  return entry.directory !== true;
}
