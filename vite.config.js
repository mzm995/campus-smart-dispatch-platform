import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const projectRoot = fs.realpathSync(fileURLToPath(new URL('.', import.meta.url)))
// GitHub Pages 项目页部署在 /<仓库名>/ 子路径下，用仓库名（不带斜杠）拼出 base。
const pagesRepo = String(process.env.VITE_PAGES_REPO || '').trim().replace(/^\/+|\/+$/g, '')

export default defineConfig({
  root: projectRoot,
  // 默认部署在根路径；构建 GitHub Pages 项目页时传 VITE_PAGES_REPO=<仓库名>。
  base: pagesRepo ? `/${pagesRepo}/` : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 拆分第三方依赖，提升首屏并行加载与长效缓存表现
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-element': ['element-plus', '@element-plus/icons-vue'],
        },
      },
    },
  },
})
