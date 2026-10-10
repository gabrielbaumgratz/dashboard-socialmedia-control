import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// build vai para ../dist, que o server.js serve sozinho quando existe
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/images': 'http://localhost:3000', '/apps-script.gs': 'http://localhost:3000' } }
});
