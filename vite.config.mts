import { defineConfig } from 'vite';

// One input (index.html); sandbox pages are served by the dev server only. The dependency optimiser is off: two copies of
// three break `instanceof` and shader-chunk patches (docs/research/tech-web.md 10).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  build: {
    target: 'es2022', outDir: 'dist', assetsDir: 'js', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500,
    // one script file: src/main.ts imports the six pieces dynamically (so `?stubs=` can leave one out), and the bundle
    // must not turn that into six round trips
    rollupOptions: { input: 'index.html', output: { codeSplitting: false } },
  },
});
