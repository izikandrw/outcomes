import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Express API owns /accounts (and everything nested under it), so the dev
// server proxies that prefix instead of the app needing CORS.
export default defineConfig(({ mode }) => {
  // Read web/.env too, so a local API_URL can be set without exporting it.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT) || 5174,
      proxy: {
        '/accounts': {
          target: env.API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
