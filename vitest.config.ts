import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Tests run against the no-op add-on module; a test swaps in its own with vi.mock.
  resolve: {
    alias: { 'vscc-addons': fileURLToPath(new URL('./src/addons/none.ts', import.meta.url)) },
  },
  test: {
    // Most tests are pure utility tests. One that needs a DOM opts in per
    // file with `// @vitest-environment jsdom` (src/addons/*.test.tsx do).
    environment: 'node'
  },
});
