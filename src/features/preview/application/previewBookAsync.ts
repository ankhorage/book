import { watch } from 'node:fs';
import { join, resolve } from 'node:path';

import { exportBookAsync } from '../../export/application/exportBookAsync.js';

/*** Serve temporary actual EPUB and PDF output on loopback and rebuild after project changes. */
export async function previewBookAsync(input: {
  readonly directory: string;
  readonly port: number;
  readonly write: (value: string) => void;
}): Promise<void> {
  const directory = resolve(input.directory);
  const temporary = join(directory, '.book-preview');
  const rebuild = () => rebuildPreviewAsync(directory, temporary);
  await rebuild();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: input.port,
    fetch: async (request) => await previewResponseAsync(request, temporary),
  });
  const watcher = watch(directory, { recursive: true }, (_, file) => {
    if (file !== '.book-preview')
      void rebuild().catch((error: unknown) =>
        input.write(`Preview rebuild failed: ${String(error)}\n`),
      );
  });
  input.write(`Preview available at http://127.0.0.1:${server.port}\n`);
  await waitForPreviewExitAsync();
  watcher.close();
  await server.stop();
}

/*** Serve the preview page and its real EPUB and PDF publication artifacts. */
async function previewResponseAsync(request: Request, temporary: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/') return previewPageResponse();
  const extension = path === '/book.epub' ? '.epub' : path === '/book.pdf' ? '.pdf' : null;
  if (extension === null) return new Response('Not found', { status: 404 });
  const target = join(temporary, await findOutputAsync(temporary, extension));
  return new Response(await Bun.file(target).arrayBuffer(), {
    headers: { 'content-type': extension === '.pdf' ? 'application/pdf' : 'application/epub+zip' },
  });
}

/*** Render the loopback-only preview shell. */
function previewPageResponse(): Response {
  return new Response(
    '<!doctype html><title>Book preview</title><h1>Book preview</h1><p><a href="/book.epub">EPUB output</a></p><embed src="/book.pdf" type="application/pdf" width="100%" height="900"/>',
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

/*** Hold the process open until the interactive preview receives an interrupt. */
async function waitForPreviewExitAsync(): Promise<void> {
  await new Promise<void>((resolvePreview) => process.once('SIGINT', resolvePreview));
}
