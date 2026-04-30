import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: process.env.LOCAL_API ? {
    proxy: { '/api': 'http://localhost:3001' },
  } : {},
})
