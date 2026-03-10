import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'
import fs from 'fs'

// Copy ONNX Runtime WASM + MJS files to Vite's deps cache so that
// the pre-bundled onnxruntime-web can find them at runtime.
function copyOnnxWasmToDeps() {
  return {
    name: 'copy-onnx-wasm-to-deps',
    configResolved(config: any) {
      const depsDir = path.join(config.cacheDir, 'deps')
      const onnxDist = path.resolve('node_modules/onnxruntime-web/dist')
      const filesToCopy = [
        'ort-wasm-simd-threaded.mjs',
        'ort-wasm-simd-threaded.wasm',
        'ort-wasm-simd.mjs',
        'ort-wasm-simd.wasm',
      ]

      fs.mkdirSync(depsDir, { recursive: true })

      for (const file of filesToCopy) {
        const src = path.join(onnxDist, file)
        const dest = path.join(depsDir, file)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    copyOnnxWasmToDeps(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
          dest: './',
        },
        {
          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
          dest: './',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: './',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: './',
        },
      ],
    }),
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
