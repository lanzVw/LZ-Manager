import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, 'dist/main'),
    emptyOutDir: true,
    target: 'node22',
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs'
    },
    rollupOptions: {
      external: [
        'electron',
        'path',
        'fs',
        'fs/promises',
        'child_process',
        'os',
        'crypto',
        'events',
        'url',
        'http',
        'https',
        'stream',
        'util',
        // iconv-lite 的依赖 safer-buffer 会 require('buffer')：
        // 不 external 时 rolldown 会生成坏 shim（Buffer undefined → 启动崩溃）
        'buffer'
      ]
    },
    minify: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
