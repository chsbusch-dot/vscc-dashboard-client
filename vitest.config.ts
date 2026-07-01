import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // All current tests are pure utility tests. jsdom is broken upstream
    // (html-encoding-sniffer requires the ESM-only @exodus/bytes); a test
    // that needs a DOM can opt in per-file with `// @vitest-environment jsdom`.
    environment: 'node'
  },
});
