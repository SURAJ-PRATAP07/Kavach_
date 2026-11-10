import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// The dev server proxies API and WebSocket calls to the FastAPI backend,
// so the backend does not need CORS settings during development.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.KAVACH_BACKEND_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/ws': {
          target: backend.replace(/^http/, 'ws'),
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
