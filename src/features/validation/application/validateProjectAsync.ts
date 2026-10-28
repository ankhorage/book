import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { readProjectAsync } from '../../project/application/readProjectAsync.js';

/*** Validate editable project inputs and report each missing canonical chapter. */
export async function validateProjectAsync(directory: string): Promise<readonly string[]> {
  const root = resolve(directory);
  const project = await readProjectAsync(root);
  const errors = (
    await Promise.all(
      project.chapters.map(async (chapter) =>
        (await Bun.file(join(root, chapter.file)).exists())
          ? null
          : `Missing chapter: ${chapter.file}`,
      ),
    )
  ).filter((error): error is string => error !== null);
  const reportPath = join(root, 'import-report.json');
  if (await Bun.file(reportPath).exists()) JSON.parse(await readFile(reportPath, 'utf8'));
  return errors;
}
