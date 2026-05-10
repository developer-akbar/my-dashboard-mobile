import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/apspdcl': {
        target: 'https://apspdcl.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/apspdcl/, '/ConsumerDashboard/public'),
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
});
