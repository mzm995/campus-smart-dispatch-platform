import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.resolve(
  process.env.DATABASE_PATH || path.join(projectDir, 'server', 'data', 'campus-smart-dispatch-platform.sqlite'),
)
if (!fs.existsSync(databasePath)) {
  console.error(`[backup] database not found: ${databasePath}`)
  process.exit(1)
}

const backupDir = path.resolve(
  process.env.BACKUP_DIR || path.join(projectDir, 'server', 'data', 'backups'),
)
fs.mkdirSync(backupDir, { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = path.join(backupDir, `campus-smart-dispatch-platform-${timestamp}.sqlite`)
const db = new DatabaseSync(databasePath)
try {
  db.exec('PRAGMA wal_checkpoint(FULL);')
  db.prepare('VACUUM INTO ?').run(target)
  console.log(`[backup] created ${target}`)
} finally {
  db.close()
}
