import type { AnkhCommandContext } from '@ankhorage/ankh';

import { previewBookAsync } from '../../features/preview/application/previewBookAsync.js';

/*** Start a live local preview through the `ankh book preview` command. */
export async function runPreviewCommandAsync(
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout'>,
): Promise<{ readonly exitCode: number }> {
  const port = Number(readPort(argv) ?? '4173');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('--port must be a valid TCP port.');
  await previewBookAsync({ directory: context.cwd, port, write: context.writeStdout });
  return { exitCode: 0 };
}

/*** Read the optional TCP port without accepting another flag as its value. */
function readPort(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--port');
  if (index === -1) return undefined;
  const value = argv.at(index + 1);
  if (value === undefined || value.startsWith('-')) throw new Error('--port requires a value.');
  return value;
}
