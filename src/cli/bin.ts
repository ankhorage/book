#!/usr/bin/env bun
import { runBookCliAsync } from './index.js';

const result = await runBookCliAsync(process.argv.slice(2), {
  cwd: process.cwd(),
  writeStdout: (value) => process.stdout.write(value),
  writeStderr: (value) => process.stderr.write(value),
});
process.exit(result.exitCode);
