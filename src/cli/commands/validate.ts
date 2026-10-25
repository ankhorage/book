import type { AnkhCommandContext } from '@ankhorage/ankh';

import { validateProjectAsync } from '../../features/validation/application/validateProjectAsync.js';

/*** Validate a book project through the `ankh book validate` command. */
export async function runValidateCommandAsync(
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout' | 'writeStderr'>,
): Promise<{ readonly exitCode: number }> {
  const errors = await validateProjectAsync(context.cwd);
  if (errors.length > 0) {
    context.writeStderr(`${errors.join('\n')}\n`);
    return { exitCode: 1 };
  }
  context.writeStdout('Project is valid.\n');
  return { exitCode: 0 };
}
