import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Reine Logikmodule laufen in node, Komponententests brauchen ein DOM.
    // Pro Datei umgeschaltet, damit die schnellen Tests schnell bleiben.
    environment: 'node',
    environmentMatchGlobs: [['src/components/**', 'jsdom']],
    setupFiles: ['./src/testSetup.ts'],
  },
});
