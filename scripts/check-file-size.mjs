import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const budgets = {
  'src/views/lostfound/LostFoundView.vue': 2620,
  'src/views/AiRecordView.vue': 2580,
  'src/views/SystemView.vue': 2200,
  'src/views/ProfileView.vue': 2060,
  'src/views/forum/ForumView.vue': 1960,
  'src/views/groupbuy/GroupBuyDetailView.vue': 1660,
  'src/views/classroom/ClassroomView.vue': 1660,
  'src/views/groupbuy/GroupBuyView.vue': 1630,
  'src/views/HomeView.vue': 1510,
}

let failed = false
for (const [file, limit] of Object.entries(budgets)) {
  const absolute = path.join(projectDir, file)
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/).length
  const status = lines <= limit ? 'PASS' : 'FAIL'
  console.log(`[structure] ${status} ${file}: ${lines}/${limit} lines`)
  if (lines > limit) failed = true
}

if (failed) {
  console.error('[structure] Split the oversized view into a page shell, composable and presentational components.')
  process.exit(1)
}
