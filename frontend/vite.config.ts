import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend origin for the Vite proxy — always localhost:8000 in local dev.
  // Override with VITE_BACKEND_URL if you run the backend on a different port.
  const backendOrigin = env.VITE_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/pages': path.resolve(__dirname, './src/pages'),
        '@/services': path.resolve(__dirname, './src/services'),
        '@/hooks': path.resolve(__dirname, './src/hooks'),
        '@/store': path.resolve(__dirname, './src/store'),
        '@/theme': path.resolve(__dirname, './src/theme'),
        '@/types': path.resolve(__dirname, './src/types'),
        '@/utils': path.resolve(__dirname, './src/utils'),
      },
    },
    server: {
      port: 5173,
      host: true,
      strictPort: true,
      hmr: {
        overlay: true,
      },
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
        '/ws': {
          target: backendOrigin.replace(/^http/, 'ws'),
          ws: true,
          changeOrigin: true,
        },
      },
      watch: {
        usePolling: false,
      },
    },
  }
})
