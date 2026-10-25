import { writeProjectAsync } from '../../project/application/writeProjectAsync.js';
import { importBookSourceAsync } from '../adapters/importBookSourceAsync.js';
import { importBookAsync } from '../application/importBookAsync.js';
/*** Compose the import use case with filesystem and format adapters. */
export async function importBook(input: Parameters<typeof importBookAsync>[0]): Promise<string> {
  return await importBookAsync(input, {
    importSourceAsync: importBookSourceAsync,
    writeProjectAsync,
  });
}
