import { watch } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PreviewBookPort {
  readonly exportBook: (input: {
    readonly directory: string;
    readonly formats: readonly ('epub' | 'pdf')[];
    readonly outputDirectory: string;
    readonly force: boolean;
  }) => Promise<readonly string[]>;
}

interface PreviewState {
  revision: number;
}

/*** Serve temporary actual EPUB and PDF output on loopback and rebuild after project changes. */
export async function previewBookAsync(
  input: {
    readonly directory: string;
    readonly port: number;
    readonly write: (value: string) => void;
  },
  port: PreviewBookPort,
): Promise<void> {
  const directory = resolve(input.directory);
  const temporary = await mkdtemp(join(tmpdir(), 'ankhorage-book-preview-'));
  try {
    await rebuildPreviewAsync(directory, temporary, port);
    const state = { revision: 1 } satisfies PreviewState;
    const scheduleRebuild = createRebuildScheduler(directory, temporary, input.write, port, state);
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: input.port,
      fetch: async (request) => await previewResponseAsync(request, temporary, state),
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
  port: PreviewBookPort,
  state: PreviewState,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current = Promise.resolve();
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      current = current
        .catch(() => undefined)
        .then(async () => {
          await rebuildPreviewAsync(directory, temporary, port);
          state.revision += 1;
        })
        .catch((error: unknown) => write(`Preview rebuild failed: ${String(error)}\n`));
    }, 120);
  };
}

/*** Serve the preview page, EPUB reader runtime, and real publication artifacts. */
async function previewResponseAsync(
  request: Request,
  temporary: string,
  state: PreviewState,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/') return previewPageResponse();
  if (path === '/preview-revision')
    return new Response(String(state.revision), { headers: { 'cache-control': 'no-store' } });
  if (path === '/jszip.js')
    return new Response(Bun.file(fileURLToPath(import.meta.resolve('jszip/dist/jszip.min.js'))), {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
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
    `<!doctype html><title>Book preview</title><h1>Book preview</h1><p id="epub-status" role="status">Loading EPUB preview…</p><nav aria-label="Table of contents" id="epub-contents"></nav><p><button id="epub-previous" type="button">Previous chapter</button><button id="epub-next" type="button">Next chapter</button></p><main id="epub-reader" style="height:900px"></main><h2>PDF</h2><embed src="/book.pdf" type="application/pdf" width="100%" height="900"/><script src="/jszip.js"></script><script src="/epubjs.js"></script><script>
const reader = document.querySelector('#epub-reader');
const status = document.querySelector('#epub-status');
const contents = document.querySelector('#epub-contents');
const previous = document.querySelector('#epub-previous');
const next = document.querySelector('#epub-next');
let book;
let rendition;
let revision = '';
const failure = (error) => { status.textContent = 'EPUB preview failed: ' + (error instanceof Error ? error.message : String(error)); };
const display = async (target) => { try { await rendition.display(target); } catch (error) { failure(error); } };
const renderContents = (toc) => { contents.replaceChildren(...toc.map((item) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = item.label; button.addEventListener('click', () => void display(item.href)); return button; })); };
const render = async (nextRevision) => {
  try {
    if (typeof window.JSZip !== 'function') throw new Error('JSZip did not initialize.');
    if (typeof window.ePub !== 'function') throw new Error('EPUB.js did not initialize.');
    const nextBook = window.ePub('/book.epub?revision=' + encodeURIComponent(nextRevision));
    await nextBook.ready;
    const navigation = await nextBook.loaded.navigation;
    rendition?.destroy();
    book?.destroy();
    reader.replaceChildren();
    book = nextBook;
    rendition = book.renderTo(reader, { width: '100%', height: 900 });
    renderContents(navigation.toc);
    await rendition.display();
    revision = nextRevision;
    status.textContent = 'EPUB rendered.';
    window.__ankhorageBookPreview = { book, rendition };
  } catch (error) { failure(error); }
};
previous.addEventListener('click', () => void rendition?.prev().catch(failure));
next.addEventListener('click', () => void rendition?.next().catch(failure));
const refresh = async () => { try { const nextRevision = await fetch('/preview-revision', { cache: 'no-store' }).then((response) => response.text()); if (nextRevision !== revision) await render(nextRevision); } catch (error) { failure(error); } };
void refresh();
setInterval(() => void refresh(), 500);
</script>`,
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
async function rebuildPreviewAsync(
  directory: string,
  temporary: string,
  port: PreviewBookPort,
): Promise<void> {
  await port.exportBook({
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
