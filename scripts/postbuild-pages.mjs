/**
 * GitHub Pages（纯静态）后处理：
 * 1. 用 index.html 覆盖 404.html —— Pages 不支持 SPA history 回退，
 *    访问 /forum 这类深链接时返回 404.html，让它把同一份应用壳子拉起来，
 *    再由 vue-router 按 BASE_URL 解析出正确路由。
 * 2. 写入 .nojekyll，避免 Jekyll 忽略下划线开头的资源目录。
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const indexPath = resolve(distDir, 'index.html')

if (!existsSync(indexPath)) {
  console.error('[pages] 未找到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

copyFileSync(indexPath, resolve(distDir, '404.html'))
writeFileSync(resolve(distDir, '.nojekyll'), '')
console.log('[pages] 已生成 dist/404.html（SPA 回退）与 dist/.nojekyll')
