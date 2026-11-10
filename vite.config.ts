import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('./shared/src', import.meta.url));
const serverPort = Number(process.env.LIMINAL_SERVER_PORT ?? 8787);

// The client lives in client/, the shared simulation in shared/ (alias @shared).
// In dev, /ws is proxied to the Node game server so the client always talks to its own origin.
export default defineConfig({
  root: 'client',
  // Relative asset paths: the build works under any sub-path (GitHub Pages serves /Backroom/).
  base: './',
  cacheDir: fileURLToPath(new URL('./.vite-cache', import.meta.url)),
  resolve: { alias: { '@shared': shared } },
  server: {
    port: 5173,
    fs: { strict: false },
    proxy: { '/ws': { target: `ws://localhost:${serverPort}`, ws: true } },
  },
  build: { outDir: '../dist/client', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1500 },
});
