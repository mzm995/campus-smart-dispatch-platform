import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const markerPath = path.join(projectDir, '.tmp', 'dev-processes.json')
const shouldOpen = process.argv.includes('--open')
const children = new Set()
let shuttingDown = false

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (!shuttingDown) {
      console.error(`[dev] 子进程退出：code=${code ?? '-'} signal=${signal ?? '-'}`)
      shutdown(code || 1)
    }
  })
  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    fs.rmSync(markerPath, { force: true })
  } catch {
    // 忽略标记文件清理失败。
  }
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(exitCode), 300)
}

const backend = start(process.execPath, [path.join(projectDir, 'server', 'index.js')], {
  env: {
    ...process.env,
    PORT: process.env.API_PORT || '3001',
  },
})

const vite = start(
  process.execPath,
  [
    path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '0.0.0.0',
    '--port',
    '5173',
    '--strictPort',
  ],
  {
    env: {
      ...process.env,
      VITE_API_TARGET: process.env.VITE_API_TARGET || 'http://127.0.0.1:3001',
    },
  },
)

fs.mkdirSync(path.dirname(markerPath), { recursive: true })
fs.writeFileSync(
  markerPath,
  JSON.stringify(
    {
      projectId: 'campus-smart-dispatch-platform',
      startedAt: new Date().toISOString(),
      processes: [
        { name: 'backend', pid: backend.pid, port: Number(process.env.API_PORT || 3001) },
        { name: 'vite', pid: vite.pid, port: 5173 },
      ],
    },
    null,
    2,
  ),
  'utf8',
)

if (shouldOpen) {
  setTimeout(() => {
    const opener = spawn('cmd', ['/c', 'start', '', 'http://localhost:5173/'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    opener.unref()
  }, 1200)
}

vite.on('spawn', () => {
  console.log('[dev] 前端：http://localhost:5173')
  console.log('[dev] 后端：http://localhost:3001')
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
