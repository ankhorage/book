import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: ['src/index.ts', 'src/cli/bin.ts', 'src/cli/provider.ts'],
  project: ['src/**/*.ts'],
  ignoreDependencies: ['@ankhorage/contracts'],
});
