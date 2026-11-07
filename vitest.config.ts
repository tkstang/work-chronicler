import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Mirror the tsconfig `paths` aliases so tests resolve imports the same way
// the type-checker does.
const src = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  test: {
    // globals OFF: tests import { describe, it, expect, vi } explicitly.
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@core': src('core'),
      '@mcp': src('mcp'),
      '@cli': src('cli'),
      '@commands': src('cli/commands'),
      '@linker': src('cli/linker'),
      '@prompts': src('cli/prompts/index.ts'),
      '@analyzer': src('cli/analyzer'),
      '@config': src('core/config'),
      '@storage': src('core/storage'),
      '@wc-types': src('core/types'),
      '@workspace': src('core/workspace'),
    },
  },
});
