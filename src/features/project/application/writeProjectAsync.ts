import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { stringify } from 'yaml';

import type { BookProject, ImportReport } from '../../../types/book.js';

/*** Persist the canonical project representation without retaining the original source. */
export async function writeProjectAsync(input: {
  readonly directory: string;
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report?: ImportReport;
  readonly force: boolean;
}): Promise<void> {
  const directory = resolve(input.directory);
  if ((await existsAsync(directory)) && !input.force)
    throw new Error(`${directory} already exists; pass --force to overwrite it.`);
  const staging = await mkdtemp(join(dirname(directory), '.book-staging-'));
  try {
    await writeProjectFilesAsync(staging, input);
    await replaceProjectAsync(directory, staging, input.force);
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
}

/*** Write every project file into an isolated staging directory before replacement. */
async function writeProjectFilesAsync(
  directory: string,
  input: {
    readonly project: BookProject;
    readonly chapters: ReadonlyMap<string, string>;
    readonly report?: ImportReport;
  },
): Promise<void> {
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

/*** Replace a complete destination only after all staged project files are valid and present. */
async function replaceProjectAsync(
  directory: string,
  staging: string,
  force: boolean,
): Promise<void> {
  if (!(await existsAsync(directory))) {
    await rename(staging, directory);
    return;
  }
  if (!force) throw new Error(`${directory} already exists; pass --force to overwrite it.`);
  const backup = `${directory}.book-backup-${crypto.randomUUID()}`;
  await rename(directory, backup);
  try {
    await rename(staging, directory);
  } catch (error) {
    await rename(backup, directory);
    throw error;
  }
  await rm(backup, { force: true, recursive: true });
}

/*** Check whether a destination exists without conflating absence with write errors. */
async function existsAsync(path: string): Promise<boolean> {
  return await access(path)
    .then(() => true)
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    });
}
