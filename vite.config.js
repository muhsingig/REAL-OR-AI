import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.GAME_PORT) || 3000;

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN so phones on the same Wi-Fi can join during development.
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
      '/api': { target: `http://localhost:${serverPort}` },
    },
  },
});
