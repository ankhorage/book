import { readFile } from 'node:fs/promises';
import { basename, dirname, normalize, posix } from 'node:path';

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
  const path = /<rootfile\b[^>]*\bfull-path=["']([^"']+)["']/iu.exec(container)?.[1];
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
  const manifest = new Map(
    [...opf.matchAll(/<item\b([^>]*)\/?>(?:<\/item>)?/giu)].flatMap((match) => {
      const id = attribute(match[1], 'id');
      const href = attribute(match[1], 'href');
      return id === undefined || href === undefined
        ? []
        : [[id, resolveEpubPath(opfPath, href)] as const];
    }),
  );
  const spine = [...opf.matchAll(/<itemref\b([^>]*)\/?>(?:<\/itemref>)?/giu)]
    .map((match) => attribute(match[1], 'idref'))
    .flatMap((id) => (id === undefined ? [] : resolvedSpineItem(manifest, id)));
  if (spine.length === 0) throw new Error('The EPUB package has no readable spine.');
  return {
    metadata: {
      ...textElement(opf, 'dc:title', 'title'),
      ...textElement(opf, 'dc:creator', 'author'),
      ...textElement(opf, 'dc:language', 'language'),
    },
    spine,
  };
}

/*** Resolve one declared spine reference while ignoring manifest entries without a usable target. */
function resolvedSpineItem(manifest: ReadonlyMap<string, string>, id: string): readonly string[] {
  const path = manifest.get(id);
  return path === undefined ? [] : [path];
}

/*** Extract a plain metadata element without interpreting embedded markup. */
function textElement(source: string, element: string, key: 'author' | 'language' | 'title') {
  const value = new RegExp(`<${element}[^>]*>([\\s\\S]*?)<\\/${element}>`, 'iu')
    .exec(source)?.[1]
    ?.trim();
  return value === undefined || value === '' ? {} : { [key]: value };
}

/*** Read a quoted XML attribute from a known OPF element. */
function attribute(source: string, name: string): string | undefined {
  return new RegExp(`\\b${name}=["']([^"']+)["']`, 'iu').exec(source)?.[1];
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
