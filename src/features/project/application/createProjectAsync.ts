import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { writeProjectAsync } from './writeProjectAsync.js';

/*** Create a new semantic book project, refusing accidental replacement. */
export async function createProjectAsync(input: {
  readonly directory: string;
  readonly force: boolean;
}): Promise<void> {
  const directory = resolve(input.directory);
  const exists = await access(directory)
    .then(() => true)
    .catch(() => false);
  if (exists && !input.force)
    throw new Error(`${directory} already exists; pass --force to reuse it.`);
  const title = directory.split('/').at(-1)?.replaceAll('-', ' ') ?? 'Untitled book';
  await writeProjectAsync({
    directory,
    project: {
      metadata: { title, author: 'Unknown author', language: 'en' },
      chapters: [
        { id: '01-introduction', title: 'Introduction', file: 'chapters/01-introduction.md' },
      ],
      export: { epub: { version: '3.0' }, pdf: { pageSize: 'A5' } },
    },
    chapters: new Map([['01-introduction', '# Introduction\n\nStart writing your book.\n']]),
  });
}
