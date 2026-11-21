import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://canicula318.github.io/busroster/
export default defineConfig({
  base: '/busroster/',
  plugins: [react()],
})
