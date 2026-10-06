import { defineConfig } from 'vitest/config';

// Unit tests: pure logic, node environment, no DOM at import time (tests/<dir>/*.spec.ts).
export default defineConfig({
  root: import.meta.dirname,
  test: { environment: 'node', include: ['tests/**/*.spec.ts'], testTimeout: 60000 },
});
