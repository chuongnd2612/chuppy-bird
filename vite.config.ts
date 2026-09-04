import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_PORT = process.env.PORT ?? '8787';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    // The API and the attachment proxy always live on the Fastify server, both
    // in dev (proxied) and in production (same origin, static SPA).
    proxy: {
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: true },
    },
  },
});
