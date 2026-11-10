import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  publicDir: false,
  build: { outDir: 'dist-benchmark', rolldownOptions: { input: root + 'performance/index.html' } },
})
