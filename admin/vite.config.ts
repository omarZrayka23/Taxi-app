import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // Mantine + icons make a single ~600 kB admin bundle; that's fine for an internal panel.
    chunkSizeWarningLimit: 1000,
  },
})
