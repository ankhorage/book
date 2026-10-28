import { resolve } from 'node:path';

import type { AnkhCommandContext } from '@ankhorage/ankh';

import { importBook } from '../../features/import/composition/importBook.js';

/*** Import an external manuscript through the `ankh book import` command. */
export async function runImportCommandAsync(
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout'>,
): Promise<{ readonly exitCode: number }> {
  const source = argv.at(0);
  if (source === undefined || source.startsWith('-'))
    throw new Error('import requires a source file.');
  const output = readOutputDirectory(argv);
  const directory = await importBook({
    source: resolve(context.cwd, source),
    ...(output === undefined ? {} : { outputDirectory: resolve(context.cwd, output) }),
    force: argv.includes('--force'),
  });
  context.writeStdout(`Imported to ${directory}\n`);
  return { exitCode: 0 };
}

/*** Read the optional import destination without accepting another flag as a path. */
function readOutputDirectory(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--out');
  if (index === -1) return undefined;
  const value = argv.at(index + 1);
  if (value === undefined || value.startsWith('-')) throw new Error('--out requires a value.');
  return value;
}
