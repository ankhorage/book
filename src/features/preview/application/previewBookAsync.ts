import { watch } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportBookAsync } from '../../export/application/exportBookAsync.js';

/*** Serve temporary actual EPUB and PDF output on loopback and rebuild after project changes. */
export async function previewBookAsync(input: {
  readonly directory: string;
  readonly port: number;
  readonly write: (value: string) => void;
}): Promise<void> {
  const directory = resolve(input.directory);
  const temporary = await mkdtemp(join(tmpdir(), 'ankhorage-book-preview-'));
  try {
    await rebuildPreviewAsync(directory, temporary);
    const scheduleRebuild = createRebuildScheduler(directory, temporary, input.write);
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: input.port,
      fetch: async (request) => await previewResponseAsync(request, temporary),
    });
    const watcher = watch(directory, { recursive: true }, () => scheduleRebuild());
    input.write(`Preview available at http://127.0.0.1:${server.port}\n`);
    await waitForPreviewExitAsync();
    watcher.close();
    await server.stop();
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

/*** Serialize debounced rebuilds so one source change cannot overlap or recursively trigger another. */
function createRebuildScheduler(
  directory: string,
  temporary: string,
  write: (value: string) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current = Promise.resolve();
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      current = current
        .catch(() => undefined)
        .then(async () => await rebuildPreviewAsync(directory, temporary))
        .catch((error: unknown) => write(`Preview rebuild failed: ${String(error)}\n`));
    }, 120);
  };
}

/*** Serve the preview page, EPUB reader runtime, and real publication artifacts. */
async function previewResponseAsync(request: Request, temporary: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/') return previewPageResponse();
  if (path === '/epubjs.js')
    return new Response(Bun.file(fileURLToPath(import.meta.resolve('epubjs/dist/epub.min.js'))), {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
  const extension = path === '/book.epub' ? '.epub' : path === '/book.pdf' ? '.pdf' : null;
  if (extension === null) return new Response('Not found', { status: 404 });
  const target = join(temporary, await findOutputAsync(temporary, extension));
  return new Response(await Bun.file(target).arrayBuffer(), {
    headers: { 'content-type': extension === '.pdf' ? 'application/pdf' : 'application/epub+zip' },
  });
}

/*** Render a loopback-only reader that loads the generated EPUB, alongside the native PDF preview. */
function previewPageResponse(): Response {
  return new Response(
    '<!doctype html><title>Book preview</title><h1>Book preview</h1><main id="epub-reader" style="height:900px"></main><h2>PDF</h2><embed src="/book.pdf" type="application/pdf" width="100%" height="900"/><script src="/epubjs.js"></script><script>ePub("/book.epub").renderTo("epub-reader", { width: "100%", height: 900 }).display()</script>',
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/*** Find an output selected by the deterministic exporter. */
async function findOutputAsync(directory: string, extension: string): Promise<string> {
  const files = await Array.fromAsync(new Bun.Glob(`*${extension}`).scan({ cwd: directory }));
  if (files.length !== 1) throw new Error(`Expected one ${extension} preview artifact.`);
  return files[0];
}

/*** Rebuild both real publication artifacts for a browser preview session. */
async function rebuildPreviewAsync(directory: string, temporary: string): Promise<void> {
  await exportBookAsync({
    directory,
    formats: ['epub', 'pdf'],
    outputDirectory: temporary,
    force: true,
  });
}

/*** Hold the process open until the interactive preview receives an interrupt or termination signal. */
async function waitForPreviewExitAsync(): Promise<void> {
  await Promise.race([
    new Promise<void>((resolvePreview) => process.once('SIGINT', resolvePreview)),
    new Promise<void>((resolvePreview) => process.once('SIGTERM', resolvePreview)),
  ]);
}
