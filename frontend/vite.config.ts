/// <reference types="vitest/config" />
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
          target: backendOrigin,
          ws: true,
          changeOrigin: true,
        },
      },
      watch: {
        usePolling: false,
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Exclude Playwright E2E specs — they are run by Playwright, not Vitest
      exclude: ['tests/e2e/**', 'node_modules/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/test/**', 'src/main.tsx'],
      },
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
    },
  }
})
