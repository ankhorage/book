import { join, resolve } from 'node:path';

import type { BookProject } from '../../../types/book.js';
type Chapter = BookProject['chapters'][number] & { readonly source: string };
export interface ExportBookPort {
  readonly readProjectAsync: (directory: string) => Promise<BookProject>;
  readonly readChapterAsync: (directory: string, file: string) => Promise<string>;
  readonly ensureDirectoryAsync: (directory: string) => Promise<void>;
  readonly existsAsync: (path: string) => Promise<boolean>;
  readonly exportEpubAsync: (input: {
    readonly project: BookProject;
    readonly chapters: readonly Chapter[];
    readonly target: string;
  }) => Promise<string>;
  readonly exportPdfAsync: (input: {
    readonly project: BookProject;
    readonly chapters: readonly Chapter[];
    readonly target: string;
  }) => Promise<string>;
}

/*** Render the same canonical project to one or both publishable output formats. */
export async function exportBookAsync(
  input: {
    readonly directory: string;
    readonly formats: readonly ('epub' | 'pdf')[];
    readonly outputDirectory?: string;
    readonly force: boolean;
  },
  port: ExportBookPort,
): Promise<readonly string[]> {
  const directory = resolve(input.directory);
  const project = await port.readProjectAsync(directory);
  const chapters = await Promise.all(
    project.chapters.map(async (chapter) => ({
      ...chapter,
      source: await port.readChapterAsync(directory, chapter.file),
    })),
  );
  const outputDirectory = resolve(input.outputDirectory ?? join(directory, 'dist'));
  await port.ensureDirectoryAsync(outputDirectory);
  const stem = slug(project.metadata.title);
  const targets = input.formats.map((format) => join(outputDirectory, `${stem}.${format}`));
  if (!input.force)
    await Promise.all(
      targets.map(async (target) => {
        if (await port.existsAsync(target))
          throw new Error(`${target} exists; pass --force to overwrite it.`);
      }),
    );
  return await Promise.all(
    input.formats.map(async (format) =>
      format === 'epub'
        ? await port.exportEpubAsync({
            project,
            chapters,
            target: join(outputDirectory, `${stem}.epub`),
          })
        : await port.exportPdfAsync({
            project,
            chapters,
            target: join(outputDirectory, `${stem}.pdf`),
          }),
    ),
  );
}

/*** Produce deterministic, filename-safe output names. */
function slug(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/giu, '-')
      .replace(/^-|-$/gu, '') || 'book'
  );
}
