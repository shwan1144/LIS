import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Electron loads the renderer from file://, so assets must be relative.
  base: './',
  plugins: [react()],
})
