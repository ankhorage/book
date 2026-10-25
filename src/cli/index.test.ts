import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { type AnkhCommandContext, type AnkhDiscoveredPackage, runCli } from '@ankhorage/ankh';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { afterEach, expect, test } from 'bun:test';

const directories: string[] = [];
const packageRoot = resolve(import.meta.dir, '../..');

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { force: true, recursive: true })),
  );
});

test('dispatches documented book commands through injected Ankh discovery', async () => {
  const root = await temporaryDirectoryAsync();
  const help = await runAnkh(['book', '--help'], root);
  expect(help.result.exitCode).toBe(0);
  expect(help.stdout).toContain('export');
  expect((await runAnkh(['book', 'init', 'initialized'], root)).result.exitCode).toBe(0);
  expect(await Bun.file(join(root, 'initialized', 'book.yaml')).exists()).toBe(true);
  await writeFile(join(root, 'manuscript.md'), '# First chapter\n\nReadable text.\n', 'utf8');
  expect(
    (await runAnkh(['book', 'import', 'manuscript.md', '--out', 'book'], root)).result.exitCode,
  ).toBe(0);
  expect((await runAnkh(['book', 'validate'], join(root, 'book'))).result.exitCode).toBe(0);
  expect((await runAnkh(['book', 'export', '--force'], join(root, 'book'))).result.exitCode).toBe(
    0,
  );
  expect(await Bun.file(join(root, 'book', 'dist', 'first-chapter.epub')).exists()).toBe(true);
  expect(
    (await readFile(join(root, 'book', 'dist', 'first-chapter.pdf'))).subarray(0, 4).toString(),
  ).toBe('%PDF');
  expect(
    (await runAnkh(['book', 'preview', '--port', '0'], join(root, 'book'))).result.exitCode,
  ).toBe(1);
});

test('imports generated PDF and EPUB text with explicit reconstruction warnings', async () => {
  const root = await temporaryDirectoryAsync();
  await writeFile(
    join(root, 'source.md'),
    '# Export source\n\nA chapter for conversion.\n',
    'utf8',
  );
  expect(
    (await runAnkh(['book', 'import', 'source.md', '--out', 'source'], root)).result.exitCode,
  ).toBe(0);
  expect((await runAnkh(['book', 'export', '--force'], join(root, 'source'))).result.exitCode).toBe(
    0,
  );
  for (const extension of ['pdf', 'epub'] as const) {
    const target = `from-${extension}`;
    expect(
      (
        await runAnkh(
          ['book', 'import', `source/dist/export-source.${extension}`, '--out', target],
          root,
        )
      ).result.exitCode,
    ).toBe(0);
    const report = JSON.parse(await readFile(join(root, target, 'import-report.json'), 'utf8')) as {
      readonly format: string;
      readonly warnings: readonly string[];
    };
    expect(report.format).toBe(extension);
    expect(report.warnings.length).toBeGreaterThan(0);
  }
});

test('rejects an import destination without force and leaves existing files unchanged', async () => {
  const root = await temporaryDirectoryAsync();
  await writeFile(join(root, 'source.md'), '# Replacement\n\nNew manuscript.\n', 'utf8');
  const destination = join(root, 'existing-book');
  await mkdir(destination);
  await Bun.write(join(destination, 'sentinel.txt'), 'preserve this');
  const result = await runAnkh(['book', 'import', 'source.md', '--out', 'existing-book'], root);

  expect(result.result.exitCode).toBe(1);
  expect(await Bun.file(join(destination, 'sentinel.txt')).text()).toBe('preserve this');
  expect(await Bun.file(join(destination, 'book.yaml')).exists()).toBe(false);
});

test('exports semantic Markdown blocks as EPUB XHTML elements', async () => {
  const root = await temporaryDirectoryAsync();
  await writeFile(
    join(root, 'semantic.md'),
    '# Semantics\n\nA **strong** [reference](https://example.com).\n\n- first\n- second\n\n| Left | Right |\n| --- | --- |\n| one | two |\n',
    'utf8',
  );
  expect(
    (await runAnkh(['book', 'import', 'semantic.md', '--out', 'book'], root)).result.exitCode,
  ).toBe(0);
  expect(
    (await runAnkh(['book', 'export', '--epub', '--force'], join(root, 'book'))).result.exitCode,
  ).toBe(0);
  const xhtml = await epubEntryTextAsync(
    join(root, 'book', 'dist', 'semantics.epub'),
    '01-semantics.xhtml',
  );

  expect(xhtml).toContain('<strong>strong</strong>');
  expect(xhtml).toContain('<a href="https://example.com">reference</a>');
  expect(xhtml).toContain('<ul>');
  expect(xhtml).toContain('<table>');
});

test('selects formats and rejects corrupt or escaping input', async () => {
  const root = await temporaryDirectoryAsync();
  await writeFile(join(root, 'source.md'), '# Selective export\n\nText.\n', 'utf8');
  expect(
    (await runAnkh(['book', 'import', 'source.md', '--out', 'book'], root)).result.exitCode,
  ).toBe(0);
  const book = join(root, 'book');
  expect(
    (await runAnkh(['book', 'export', '--epub', '--out', 'epub', '--force'], book)).result.exitCode,
  ).toBe(0);
  expect(await Bun.file(join(book, 'epub', 'selective-export.epub')).exists()).toBe(true);
  expect(await Bun.file(join(book, 'epub', 'selective-export.pdf')).exists()).toBe(false);
  expect(
    (await runAnkh(['book', 'export', '--pdf', '--out', 'pdf', '--force'], book)).result.exitCode,
  ).toBe(0);
  expect(await Bun.file(join(book, 'pdf', 'selective-export.pdf')).exists()).toBe(true);
  await writeFile(join(root, 'corrupt.pdf'), 'not a PDF', 'utf8');
  await writeFile(join(root, 'corrupt.epub'), 'not an EPUB', 'utf8');
  expect((await runAnkh(['book', 'import', 'corrupt.pdf'], root)).result.exitCode).toBe(1);
  expect((await runAnkh(['book', 'import', 'corrupt.epub'], root)).result.exitCode).toBe(1);
  await writeFile(
    join(book, 'book.yaml'),
    'metadata: { title: x, author: y, language: en }\nchapters: [{ id: x, title: x, file: ../escape.md }]\nexport: {}\n',
    'utf8',
  );
  expect((await runAnkh(['book', 'validate'], book)).result.exitCode).toBe(1);
});

/*** Run the production root CLI with its documented injected discovery seam. */
async function runAnkh(argv: readonly string[], cwd: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context: AnkhCommandContext = {
    cwd,
    env: {},
    version: 'test',
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
  };
  const result = await runCli(argv, {
    context,
    discoverPackages: () => Promise.resolve({ diagnostics: [], packages: [bookPackage()] }),
  });
  return { result, stdout: stdout.join(''), stderr: stderr.join('') };
}

/*** Describe this source checkout as a discovered provider package for contract integration. */
function bookPackage(): AnkhDiscoveredPackage {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as unknown as {
    readonly ankh: AnkhDiscoveredPackage['metadata'];
  };
  return {
    metadata: { ...manifest.ankh, provider: './src/cli/provider.ts' },
    packageJsonPath: join(packageRoot, 'package.json'),
    packageName: '@ankhorage/book',
    packageRoot,
    source: 'current-package',
  };
}

/*** Allocate a cleanup-managed external consumer directory. */
async function temporaryDirectoryAsync(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ankhorage-book-'));
  directories.push(directory);
  return directory;
}

/*** Read one generated EPUB member for publication-semantics assertions. */
async function epubEntryTextAsync(epub: string, filename: string): Promise<string> {
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(epub)])));
  try {
    const entry = (await reader.getEntries()).find(
      (candidate) => candidate.filename === `EPUB/${filename}`,
    );
    if (entry === undefined || entry.directory) throw new Error(`Missing EPUB entry: ${filename}`);
    return await entry.getData(new TextWriter());
  } finally {
    await reader.close();
  }
}
