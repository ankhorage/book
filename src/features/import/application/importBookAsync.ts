import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import { writeProjectAsync } from '../../project/application/writeProjectAsync.js';
import { importEpubAsync } from '../adapters/importEpubAsync.js';
import { importMarkdown } from '../adapters/importMarkdownAsync.js';
import { importPdfAsync } from '../adapters/importPdfAsync.js';

/*** Import a supported source into an editable, source-independent book project. */
export async function importBookAsync(input: {
  readonly source: string;
  readonly outputDirectory?: string;
  readonly force: boolean;
}): Promise<string> {
  const source = resolve(input.source);
  const format = extname(source).toLowerCase();
  const imported =
    format === '.pdf'
      ? await importPdfAsync(source)
      : format === '.epub'
        ? await importEpubAsync(source)
        : format === '.md' || format === '.markdown'
          ? importMarkdown(source, await readFile(source, 'utf8'))
          : (() => {
              throw new Error('Supported import formats are PDF, EPUB, and Markdown.');
            })();
  const outputDirectory =
    input.outputDirectory === undefined
      ? resolve(basename(source, extname(source)))
      : resolve(input.outputDirectory);
  await writeProjectAsync({
    directory: outputDirectory,
    project: imported.project,
    chapters: imported.chapters,
    report: imported.report,
    force: input.force,
  });
  return outputDirectory;
}
