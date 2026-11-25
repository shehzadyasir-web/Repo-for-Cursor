import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/Repo-for-Cursor/' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4731,
    strictPort: true,
  },
})
