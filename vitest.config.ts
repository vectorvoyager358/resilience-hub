import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [path.join(root, 'tests/frontend/setupTests.ts')],
    globals: true,
    css: true,
    include: ['tests/frontend/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
