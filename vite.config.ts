import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Do not bundle native modules into the renderer — they belong only in the
    // Electron main process and are accessed via IPC.
    rollupOptions: {
      external: ['@sentrydesk/core', 'dockerode'],
    },
  },
  optimizeDeps: {
    exclude: ['@sentrydesk/core', 'dockerode'],
  },
  server: {
    port: 5173,
  },
})
