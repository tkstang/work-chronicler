import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', 'tests/**', '**/*.test.ts', 'bin/**'],
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, './src/core'),
      '@mcp': resolve(__dirname, './src/mcp'),
      '@cli': resolve(__dirname, './src/cli'),
      '@commands': resolve(__dirname, './src/cli/commands'),
      '@linker': resolve(__dirname, './src/cli/linker'),
      '@prompts': resolve(__dirname, './src/cli/prompts/index.ts'),
      '@analyzer': resolve(__dirname, './src/cli/analyzer'),
      '@config': resolve(__dirname, './src/core/config'),
      '@storage': resolve(__dirname, './src/core/storage'),
      '@wc-types': resolve(__dirname, './src/core/types'),
      '@workspace': resolve(__dirname, './src/core/workspace'),
    },
  },
});
