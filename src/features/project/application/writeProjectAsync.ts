import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { stringify } from 'yaml';

import type { BookProject, ImportReport } from '../../../types/book.js';

/*** Persist the canonical project representation without retaining the original source. */
export async function writeProjectAsync(input: {
  readonly directory: string;
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report?: ImportReport;
}): Promise<void> {
  const directory = resolve(input.directory);
  await mkdir(directory, { recursive: true });
  await Promise.all(
    input.project.chapters.map(async (chapter) => {
      const source = input.chapters.get(chapter.id);
      if (source === undefined)
        throw new Error(`Missing canonical source for chapter ${chapter.id}.`);
      const target = join(directory, chapter.file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source, 'utf8');
    }),
  );
  await writeFile(join(directory, 'book.yaml'), stringify(input.project), 'utf8');
  if (input.report !== undefined)
    await writeFile(
      join(directory, 'import-report.json'),
      `${JSON.stringify(input.report, null, 2)}\n`,
      'utf8',
    );
}
