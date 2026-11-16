import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, seedDatabase } from '../server/db.js'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.resolve(
  process.env.DATABASE_PATH || path.join(projectDir, 'server', 'data', 'campus-smart-dispatch-platform.sqlite'),
)
const db = openDatabase(databasePath)
try {
  seedDatabase(db, { forceDemo: true })
  console.log(`[seed] demo data ensured in ${databasePath}`)
} finally {
  db.close()
}
