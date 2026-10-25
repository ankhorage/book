import { readFileSync } from 'node:fs';

import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { runBookCliAsync } from './index.js';

const commands = [
  ['init', 'book.init', 'Create an editable book project.'],
  ['import', 'book.import', 'Import PDF, EPUB, or Markdown.'],
  ['preview', 'book.preview', 'Preview actual EPUB and PDF output locally.'],
  ['export', 'book.export', 'Export EPUB and PDF.'],
  ['validate', 'book.validate', 'Validate an editable book project.'],
] as const;

/*** Register the supported published Ankh provider instead of shadowing `ankh book`. */
const provider = {
  id: '@ankhorage/book',
  category: 'book',
  version: packageVersion(),
  capabilities: commands.map(([_path, capability, summary]) => ({
    id: capability,
    owner: '@ankhorage/book',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: summary,
    description: summary,
  })),
  commands: commands.map(([path, capability, summary]) => ({ path: [path], capability, summary })),
  handlers: commands.map(([path]) => ({
    path: [path],
    handler: async (request) => await runBookCliAsync([path, ...request.argv], request.context),
  })),
} satisfies AnkhRuntimeCommandProvider;

export default provider;

/*** Read the release version used in the provider manifest. */
function packageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { readonly version?: unknown };
  if (typeof manifest.version !== 'string' || manifest.version === '')
    throw new Error('package.json must define a version.');
  return manifest.version;
}
