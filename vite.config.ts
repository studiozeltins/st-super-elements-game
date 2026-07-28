import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
