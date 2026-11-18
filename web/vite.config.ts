import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
  // `npm run dev:web` proxies the API to `wrangler dev` (port 8787)
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
