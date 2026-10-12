import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The end-to-end cases run a real semantic-release dry run against a throwaway repository, and the setup builds the package those runs load by path.
    testTimeout: 30_000,
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
