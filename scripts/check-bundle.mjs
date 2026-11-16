import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = path.join(projectDir, 'dist', 'assets')
const files = fs
  .readdirSync(assetsDir)
  .filter((name) => /\.(?:js|css)$/i.test(name) && !name.endsWith('.gz') && !name.endsWith('.br'))
  .map((name) => ({
    name,
    size: fs.statSync(path.join(assetsDir, name)).size,
  }))

const totalJs = files.filter((file) => file.name.endsWith('.js')).reduce((sum, file) => sum + file.size, 0)
const totalCss = files.filter((file) => file.name.endsWith('.css')).reduce((sum, file) => sum + file.size, 0)
const vendorElement =
  files.find((file) => file.name.startsWith('vendor-element') && file.name.endsWith('.js'))?.size || 0
const entry = files.find((file) => /^index-.*\.js$/.test(file.name))?.size || 0

const budgets = [
  ['total JavaScript', totalJs, 1_800_000],
  ['total CSS', totalCss, 700_000],
  ['Element Plus vendor JS', vendorElement, 1_000_000],
  ['entry JS', entry, 180_000],
]

let failed = false
for (const [label, size, limit] of budgets) {
  const status = size <= limit ? 'PASS' : 'FAIL'
  console.log(`[bundle] ${status} ${label}: ${(size / 1024).toFixed(1)} KB / ${(limit / 1024).toFixed(1)} KB`)
  if (size > limit) failed = true
}
if (failed) process.exit(1)
