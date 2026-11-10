import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('./shared/src', import.meta.url));

// Unit / integration tests run in Node (no DOM): shared simulation, server, and pure client logic.
export default defineConfig({
  resolve: { alias: { '@shared': shared } },
  cacheDir: fileURLToPath(new URL('./.vite-cache/vitest', import.meta.url)),
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/src/**/*.test.ts'],
    testTimeout: 20000,
  },
});
