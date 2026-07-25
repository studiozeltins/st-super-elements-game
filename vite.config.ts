import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind LAN so the game is reachable from other devices on this computer's network
    allowedHosts: ['elements.kingdom.lv'],
  },
});
