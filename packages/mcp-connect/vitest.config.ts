import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node by default, matching design-system. Suites that need a DOM opt
    // into jsdom with a `@vitest-environment` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
