import { readFileSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Ugyanaz a verziószám, mint a buildben (`vite.config.ts`): a gyökér `package.json`-ból.
const { version: appVersion } = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@reform/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
