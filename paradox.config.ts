import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    title: 'Book',
    description: 'Standalone book authoring, import, preview, and export toolkit.',
  },
  package: { root: '.', entrypoints: ['src/index.ts'] },
  output: { dir: './paradox' },
});
