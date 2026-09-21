import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Express API owns /accounts (and everything nested under it), so the dev
// server proxies that prefix instead of the app needing CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      '/accounts': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
