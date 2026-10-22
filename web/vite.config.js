import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Express API owns /auth and /accounts (and everything nested under it), so
// the dev server proxies those prefixes instead of the app needing CORS.
export default defineConfig(({ mode }) => {
  // Read web/.env too, so a local API_URL can be set without exporting it.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const target = env.API_URL || 'http://localhost:3001';
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT) || 5174,
      proxy: {
        '/accounts': { target, changeOrigin: true },
        '/auth': { target, changeOrigin: true },
      },
    },
  };
});
