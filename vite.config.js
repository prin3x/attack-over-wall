import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // Online rooms: forward /api (HTTP + WebSocket) to `npm run dev:server` (wrangler dev).
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
