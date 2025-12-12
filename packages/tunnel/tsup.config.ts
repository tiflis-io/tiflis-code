/**
 * @file tsup.config.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
