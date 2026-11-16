import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, gzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = path.join(projectDir, 'dist', 'assets')
const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

if (!fs.existsSync(assetsDir)) {
  console.error('[compress] dist/assets not found; run vite build first')
  process.exit(1)
}

let count = 0
for (const name of fs.readdirSync(assetsDir)) {
  if (!/\.(?:js|css|json|svg)$/i.test(name)) continue
  const filePath = path.join(assetsDir, name)
  const input = fs.readFileSync(filePath)
  await Promise.all([
    gzipAsync(input, { level: 9 }).then((output) =>
      fs.writeFileSync(`${filePath}.gz`, output),
    ),
    brotliAsync(input, {
      params: { [requireBrotliQuality()]: 11, [requireBrotliMode()]: 0 },
    }).then((output) => fs.writeFileSync(`${filePath}.br`, output)),
  ])
  count += 1
}

function requireBrotliQuality() {
  return 1 // BROTLI_PARAM_QUALITY
}

function requireBrotliMode() {
  return 0 // BROTLI_PARAM_MODE
}

console.log(`[compress] generated gzip and brotli for ${count} assets`)
