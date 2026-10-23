import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Express API owns /auth and /accounts (and everything nested under it), so
// the dev server proxies those prefixes instead of the app needing CORS.
export default defineConfig(({ mode }) => {
  // Read the repo-root .env (shared with the API) and web/.env, so WEB_PORT and
  // API_URL can be set without exporting them.
  const env = {
    ...loadEnv(mode, path.resolve(__dirname, '..'), ''),
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };
  const target = env.API_URL || `http://localhost:${env.PORT || 3001}`;
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT) || 5173,
      proxy: {
        '/accounts': { target, changeOrigin: true },
        '/auth': { target, changeOrigin: true },
      },
    },
  };
});
