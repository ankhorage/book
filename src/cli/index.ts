import type { AnkhCommandContext } from '@ankhorage/ankh';

import { runExportCommandAsync } from './commands/export.js';
import { runImportCommandAsync } from './commands/import.js';
import { runInitCommandAsync } from './commands/init.js';
import { runPreviewCommandAsync } from './commands/preview.js';
import { runValidateCommandAsync } from './commands/validate.js';

/*** Execute the package CLI or the supported `ankh book` provider command. */
export async function runBookCliAsync(
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout' | 'writeStderr'>,
): Promise<{ readonly exitCode: number }> {
  try {
    const command = argv.at(0);
    const arguments_ = argv.slice(1);
    if (command === undefined || command === '--help' || command === '-h') {
      context.writeStdout(help());
      return { exitCode: 0 };
    }
    return await dispatchCommandAsync(command, arguments_, context);
  } catch (error) {
    context.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

/*** Dispatch one Ankh provider command at the CLI delivery boundary. */
async function dispatchCommandAsync(
  command: string,
  argv: readonly string[],
  context: Pick<AnkhCommandContext, 'cwd' | 'writeStdout' | 'writeStderr'>,
): Promise<{ readonly exitCode: number }> {
  if (command === 'init') return await runInitCommandAsync(argv, context);
  if (command === 'import') return await runImportCommandAsync(argv, context);
  if (command === 'export') return await runExportCommandAsync(argv, context);
  if (command === 'validate') return await runValidateCommandAsync(context);
  if (command === 'preview') return await runPreviewCommandAsync(argv, context);
  throw new Error(`Unknown command: ${command}`);
}

/*** Render concise built-in CLI usage. */
function help(): string {
  return 'Usage: ankh book <init|import|preview|export|validate> [options]\n\ninit <directory> [--force]\nimport <pdf|epub|md> [--out <directory>] [--force]\npreview [--port <number>]\nexport [--epub|--pdf] [--out <directory>] [--force]\nvalidate\n';
}

/*** Require a positional CLI value. */
