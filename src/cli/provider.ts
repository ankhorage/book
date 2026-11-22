import { readFileSync } from 'node:fs';

import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { CAPABILITIES } from '../capabilities/index.js';
import { runBookCliAsync } from './index.js';

const commands = [
  ['init', CAPABILITIES[0]],
  ['import', CAPABILITIES[1]],
  ['preview', CAPABILITIES[2]],
  ['export', CAPABILITIES[3]],
  ['validate', CAPABILITIES[4]],
] as const;

/*** Register the supported published Ankh provider instead of shadowing `ankh book`. */
const provider = {
  id: '@ankhorage/book',
  category: 'book',
  version: packageVersion(),
  capabilities: CAPABILITIES,
  commands: commands.map(([path, capability]) => ({
    path: [path],
    capability: capability.id,
    summary: capability.description,
  })),
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
