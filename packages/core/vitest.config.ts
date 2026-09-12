import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // tests/fixtures holds sample repositories, test files included. They are
    // input data for SpecGuard, never tests of SpecGuard.
    exclude: ['**/node_modules/**', 'dist/**', 'tests/fixtures/**'],
  },
});
