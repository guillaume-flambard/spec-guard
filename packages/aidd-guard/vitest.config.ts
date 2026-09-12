import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // tests/fixtures holds sample repositories, test files included. They are
    // input data for aidd-guard, never tests of aidd-guard.
    exclude: ['**/node_modules/**', 'dist/**', 'tests/fixtures/**'],
  },
});
