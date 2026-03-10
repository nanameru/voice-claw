import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

// Plugin to copy ONNX Runtime WASM files to Vite's deps cache
function copyOnnxWasm() {
  return {
    name: 'copy-onnx-wasm',
    configResolved(config: any) {
      const depsDir = path.join(config.cacheDir, 'deps')
      const onnxDist = path.resolve('node_modules/onnxruntime-web/dist')
      const filesToCopy = [
        'ort-wasm-simd-threaded.mjs',
        'ort-wasm-simd-threaded.wasm',
      ]

      // Ensure deps directory exists
      fs.mkdirSync(depsDir, { recursive: true })

      for (const file of filesToCopy) {
        const src = path.join(onnxDist, file)
        const dest = path.join(depsDir, file)
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
        }
      }
    },
  }
}

export default defineConfig({
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
  plugins: [
    copyOnnxWasm(),
    react(),
    electron([
      {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'electron-store', 'ws'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
