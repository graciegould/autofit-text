import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Resolve `autofit-text` to the library source so the example always reflects local changes.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'autofit-text': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
});
