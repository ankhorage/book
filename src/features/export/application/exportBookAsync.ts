import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { readProjectAsync } from '../../project/application/readProjectAsync.js';
import { exportEpubAsync } from '../adapters/exportEpubAsync.js';
import { exportPdfAsync } from '../adapters/exportPdfAsync.js';

/*** Render the same canonical project to one or both publishable output formats. */
export async function exportBookAsync(input: {
  readonly directory: string;
  readonly formats: readonly ('epub' | 'pdf')[];
  readonly outputDirectory?: string;
  readonly force: boolean;
}): Promise<readonly string[]> {
  const directory = resolve(input.directory);
  const project = await readProjectAsync(directory);
  const chapters = await Promise.all(
    project.chapters.map(async (chapter) => ({
      ...chapter,
      source: await readFile(join(directory, chapter.file), 'utf8'),
    })),
  );
  const outputDirectory = resolve(input.outputDirectory ?? join(directory, 'dist'));
  await mkdir(outputDirectory, { recursive: true });
  const stem = slug(project.metadata.title);
  const targets = input.formats.map((format) => join(outputDirectory, `${stem}.${format}`));
  if (!input.force)
    await Promise.all(
      targets.map(async (target) => {
        if (await Bun.file(target).exists())
          throw new Error(`${target} exists; pass --force to overwrite it.`);
      }),
    );
  return await Promise.all(
    input.formats.map(async (format) =>
      format === 'epub'
        ? await exportEpubAsync({
            project,
            chapters,
            target: join(outputDirectory, `${stem}.epub`),
          })
        : await exportPdfAsync({ project, chapters, target: join(outputDirectory, `${stem}.pdf`) }),
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
