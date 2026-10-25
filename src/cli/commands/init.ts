import { resolve } from 'node:path';

import type { AnkhCommandContext } from '@ankhorage/ankh';

import { createProjectAsync } from '../../features/project/application/createProjectAsync.js';

/*** Create a canonical editable book project from the `ankh book init` command. */
export async function runInitCommandAsync(
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout'>,
): Promise<{ readonly exitCode: number }> {
  const directory = argv.at(0);
  if (directory === undefined || directory.startsWith('-'))
    throw new Error('init requires a directory.');
  await createProjectAsync({
    directory: resolve(context.cwd, directory),
    force: argv.includes('--force'),
  });
  context.writeStdout(`Created ${directory}\n`);
  return { exitCode: 0 };
}
