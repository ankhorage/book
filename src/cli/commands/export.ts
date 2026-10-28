import { resolve } from 'node:path';

import type { AnkhCommandContext } from '@ankhorage/ankh';

import { exportBook } from '../../features/export/composition/exportBook.js';

/*** Export canonical EPUB and PDF artifacts through the `ankh book export` command. */
export async function runExportCommandAsync(
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout'>,
): Promise<{ readonly exitCode: number }> {
  const formats = exportFormats(argv);
  const output = readOutputDirectory(argv);
  const targets = await exportBook({
    directory: context.cwd,
    formats,
    ...(output === undefined ? {} : { outputDirectory: resolve(context.cwd, output) }),
    force: argv.includes('--force'),
  });
  context.writeStdout(`${targets.join('\n')}\n`);
  return { exitCode: 0 };
}

/*** Resolve mutually exclusive publication format flags. */
function exportFormats(argv: readonly string[]): readonly ('epub' | 'pdf')[] {
  if (argv.includes('--epub') && argv.includes('--pdf'))
    throw new Error('Choose at most one export format flag.');
  if (argv.includes('--epub')) return ['epub'];
  if (argv.includes('--pdf')) return ['pdf'];
  return ['epub', 'pdf'];
}

/*** Read the optional publication destination without accepting another flag as a path. */
function readOutputDirectory(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--out');
  if (index === -1) return undefined;
  const value = argv.at(index + 1);
  if (value === undefined || value.startsWith('-')) throw new Error('--out requires a value.');
  return value;
}
