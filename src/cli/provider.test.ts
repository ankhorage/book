import { expect, test } from 'bun:test';

import { CAPABILITIES } from '../capabilities/index.js';
import provider from './provider.js';

test('uses the published capability catalog for every Book provider command', () => {
  expect(provider.capabilities).toEqual(CAPABILITIES);
  expect(provider.commands.map((command) => command.capability)).toEqual(
    CAPABILITIES.map((capability) => capability.id),
  );
});
