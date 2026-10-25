import { basename, extname, resolve } from 'node:path';

import type { BookProject, ImportReport } from '../../../types/book.js';

interface ImportedBook {
  readonly project: BookProject;
  readonly chapters: ReadonlyMap<string, string>;
  readonly report: ImportReport;
}
export interface ImportBookPort {
  readonly importSourceAsync: (source: string) => Promise<ImportedBook>;
  readonly writeProjectAsync: (input: {
    readonly directory: string;
    readonly project: BookProject;
    readonly chapters: ReadonlyMap<string, string>;
    readonly report: ImportReport;
    readonly force: boolean;
  }) => Promise<void>;
}

/*** Import a supported source into an editable, source-independent book project. */
export async function importBookAsync(
  input: {
    readonly source: string;
    readonly outputDirectory?: string;
    readonly force: boolean;
  },
  port: ImportBookPort,
): Promise<string> {
  const source = resolve(input.source);
  const format = extname(source).toLowerCase();
  if (!['.pdf', '.epub', '.md', '.markdown'].includes(format))
    throw new Error('Supported import formats are PDF, EPUB, and Markdown.');
  const imported = await port.importSourceAsync(source);
  const outputDirectory =
    input.outputDirectory === undefined
      ? resolve(basename(source, extname(source)))
      : resolve(input.outputDirectory);
  await port.writeProjectAsync({
    directory: outputDirectory,
    project: imported.project,
    chapters: imported.chapters,
    report: imported.report,
    force: input.force,
  });
  return outputDirectory;
}
