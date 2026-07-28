import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// STCK-02: Sky Pro loads its cloud-noise volumes with a dynamically-constructed
// `new URL("./data/" + name + ".bin", import.meta.url)`, which Vite's static
// asset analyzer cannot see — so a plain `vite build` emits NO `data/` dir and
// the built page 404s baseShape{16,32,64}.bin (dev works; prod clouds break).
// This plugin copies them verbatim into `dist/assets/data/`, the path the hashed
// spike chunk resolves against. Kept minimal + build-only.
function copySkyProData(): Plugin {
  const src = resolve(__dirname, 'src/vendor/threejs-sky-pro/data');
  return {
    name: 'copy-sky-pro-data',
    apply: 'build',
    closeBundle() {
      if (!existsSync(src)) {
        this.warn(`Sky Pro data dir not found at ${src} — skipping copy`);
        return;
      }
      const outDir = resolve(__dirname, 'dist/assets/data');
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(src)) {
        if (f.endsWith('.bin')) copyFileSync(resolve(src, f), resolve(outDir, f));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copySkyProData()],
  server: {
    host: true, // bind LAN so the game is reachable from other devices on this computer's network
    allowedHosts: ['elements.kingdom.lv'],
  },
  build: {
    rollupOptions: {
      // Register the isolated WebGPU feasibility spike as a 2nd entry so `vite build`
      // emits it alongside the game. Spike is standalone (no React #root); never shipped.
      input: { main: 'index.html', spike: 'waterpro-spike.html' },
    },
  },
});
