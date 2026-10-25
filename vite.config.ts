import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The DAPS backend runs separately (uvicorn on :8001). The frontend talks to it
// directly with Axios, so no dev proxy is needed — CORS on the API already allows
// any localhost port. Keeping the origin as a loopback host means the app never
// leaves the machine.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
