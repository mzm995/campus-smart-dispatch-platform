import { createHash, randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from './passwords.js'
import { permissionsForRole } from './permissions.js'

const ROLE_DEFINITIONS = [
  ['student', '学生', 10, 1],
  ['monitor', '班委', 20, 1],
  ['forum_moderator', '论坛坛主', 30, 1],
  ['admin', '管理员', 80, 1],
  ['super_admin', '高级管理员', 100, 0],
]
export const START_STUDENT_NO = 21_040_001

export const BUILTIN_ACCOUNTS = [
  {
    id: 'u_student_lin',
    studentNo: '2024010123',
    name: '林小满',
    roleKey: 'student',
    college: 'AI+人工智能',
    bio: '爱拍照，也爱在论坛帮助同学',
  },
  {
    id: 'u_monitor_chen',
    studentNo: '2023020456',
    name: '陈子昂',
    roleKey: 'monitor',
    college: '电子竞技',
    bio: '负责班级事务，常年借教室、组织活动',
  },
  {
    id: 'u_moderator_su',
    studentNo: '2022050789',
    name: '苏念',
    roleKey: 'forum_moderator',
    college: 'AI+影视',
    bio: '校园论坛内容运营，喜欢张罗线上线下讨论',
  },
  {
    id: 'u_admin_zhou',
    studentNo: '2021000001',
    name: '周老师',
    roleKey: 'admin',
    college: '学生工作处',
    bio: '校园资源调度与论坛内容管理员',
  },
  {
    id: 'u_super_admin_fang',
    studentNo: '2021000000',
    name: '方主管',
    roleKey: 'super_admin',
    college: '信息中心',
    bio: '高级管理员，负责演示账号权限与系统配置',
  },
]

export const DEFAULT_SETTINGS = {
  sceneSwitches: {
    classroom: true,
    lostfound: true,
    groupbuy: true,
    forum: true,
  },
  aiParams: {
    threshold: 0.72,
    timeout: 8,
    fallback: true,
    humanReview: true,
  },
}

const SESSION_DAYS = 7
const DEMO_GROUPBUY_ERRANDS = {
  gb_001: {
    enabled: true,
    tip: 6,
    description: '成团后帮忙从校门口奶茶店取货并送到 A栋一楼大厅',
    status: 'open',
    runnerId: '',
    runnerName: '',
  },
  gb_002: {
    enabled: true,
    tip: 8,
    description: '从东门快递驿站取纸箱并送到宿舍楼下',
    status: 'open',
    runnerId: '',
    runnerName: '',
  },
}

const DEMO_LOSTFOUND_FIELDS = {
  lf_001: {
    claims: [{
      id: 'claim_seed_found_001',
      kind: 'found_claim',
      helperId: 'u_moderator_su',
      claimantId: 'u_moderator_su',
      claimantName: '苏念',
      helperName: '苏念',
      lostPostId: 'lf_002',
      lostPostTitle: '【寻物】在A栋丢了蓝色保温杯',
      mode: 'found_claim',
      description: '保温杯底部有我贴的社团编号贴纸，杯盖边缘有一处磕碰。',
      contact: '站内联系 · 苏念',
      rewardEnabled: true,
      rewardAmount: 10,
      status: 'approved',
    }],
  },
  lf_002: {
    rewardEnabled: true,
    rewardAmount: 10,
    rewardNote: '确认认领后打赏，感谢帮忙保管',
  },
  lf_004: {
    rewardEnabled: true,
    rewardAmount: 8,
    rewardNote: '提供有效线索或归还后确认打赏',
  },
}

function nowIso() {
  return new Date().toISOString()
}

function agoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function userSelect() {
  return `
    SELECT
      u.id,
      u.student_no,
      u.student_no_original,
      u.name,
      u.role_key,
      r.label AS role_label,
      r.level AS role_level,
      r.assignable AS role_assignable,
      u.college,
      u.bio,
      u.avatar_url,
      u.status,
      u.source,
      u.deleted_at,
      u.deleted_by,
      c.must_change_password,
      u.last_login_at,
      u.created_at,
      u.updated_at
    FROM users u
    JOIN roles r ON r.role_key = u.role_key
    LEFT JOIN user_credentials c ON c.user_id = u.id
  `
}

export function serializeUser(row) {
  if (!row) return null
  const permissions = permissionsForRole(row.role_key)
  return {
    id: row.id,
    studentNo: row.student_no_original || row.student_no,
    name: row.name,
    roleKey: row.role_key,
    role: row.role_label,
    roleLevel: Number(row.role_level),
    college: row.college,
    bio: row.bio,
    avatarUrl: row.avatar_url || '',
    status: row.status,
    source: row.source,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    isDeleted: Boolean(row.deleted_at),
    mustChangePassword: Boolean(row.must_change_password),
    loginAt: row.last_login_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    permissions,
  }
}

function migrateDatabase(db) {
  db.exec('BEGIN IMMEDIATE')
  try {
  const userColumns = new Set(
    db.prepare('PRAGMA table_info(users)').all().map((column) => column.name),
  )
  const columnMigrations = [
    ['student_no_original', 'TEXT'],
    ['deleted_at', 'TEXT'],
    ['deleted_by', 'TEXT'],
    ['avatar_url', "TEXT NOT NULL DEFAULT ''"],
  ]
  for (const [name, type] of columnMigrations) {
    if (!userColumns.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`)
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);')
  db.exec(`
    UPDATE users
    SET student_no_original = student_no
    WHERE student_no_original IS NULL OR student_no_original = ''
  `)
  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
    VALUES (2, ?)
  `).run(nowIso())

  const numberColumns = new Set(
    db.prepare('PRAGMA table_info(student_numbers)').all().map((column) => column.name),
  )
  if (!numberColumns.has('generated_by_system')) {
    db.exec(`
      ALTER TABLE student_numbers
      ADD COLUMN generated_by_system INTEGER NOT NULL DEFAULT 1
      CHECK (generated_by_system IN (0, 1))
    `)
  }
  const migration3 = db
    .prepare('SELECT 1 FROM schema_migrations WHERE version = 3 LIMIT 1')
    .get()
  if (!migration3) {
    db.exec(`
      UPDATE student_number_sequence
      SET next_value = CAST(start_number AS INTEGER), updated_at = datetime('now')
      WHERE singleton = 1
    `)
    db.prepare(`
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (3, ?)
    `).run(nowIso())
  }

  const migration4 = db
    .prepare('SELECT 1 FROM schema_migrations WHERE version = 4 LIMIT 1')
    .get()
  if (!migration4) {
    db.prepare(`
      UPDATE roles SET label = '论坛坛主' WHERE role_key = 'forum_moderator'
    `).run()
    db.prepare(`
      UPDATE notifications SET link = '/system' WHERE link = '/admin'
    `).run()
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (4, ?)
    `).run(nowIso())
  }

  db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function initializeStudentNumbers(db) {
  const createdAt = nowIso()
  db.prepare(`
    INSERT OR IGNORE INTO student_number_sequence(
      singleton, start_number, next_value, updated_at
    ) VALUES (1, ?, ?, ?)
  `).run(String(START_STUDENT_NO), START_STUDENT_NO, createdAt)

  const existingCustom = db.prepare(`
    SELECT id, student_no, student_no_original, deleted_at
    FROM users
    WHERE source = 'custom'
  `).all()
  const insertLedger = db.prepare(`
    INSERT OR IGNORE INTO student_numbers(
      student_no, status, current_user_id, assigned_at, released_at,
      reuse_count, generated_by_system, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 1, ?)
  `)
  for (const user of existingCustom) {
    const original = user.student_no_original || user.student_no
    const numeric = Number(original)
    if (!Number.isSafeInteger(numeric) || numeric <= 0) continue
    const deleted = Boolean(user.deleted_at)
    insertLedger.run(
      original,
      deleted ? 'available' : 'assigned',
      deleted ? null : user.id,
      deleted ? null : createdAt,
      deleted ? createdAt : null,
      createdAt,
    )
  }
}

function normalizeSharedDocumentOwnership(db) {
  const users = db.prepare(`
    SELECT id, name FROM users WHERE deleted_at IS NULL
  `).all()
  const userIdByName = new Map(users.map((user) => [user.name, user.id]))
  const documents = db.prepare(`
    SELECT resource_key, data_json FROM shared_documents
  `).all()
  const update = db.prepare(`
    UPDATE shared_documents
    SET data_json = ?, version = version + 1, updated_at = ?
    WHERE resource_key = ?
  `)

  for (const document of documents) {
    const data = parseJson(document.data_json, null)
    if (!Array.isArray(data)) continue
    let changed = false
    const inferName = (item) => {
      if (item.owner) return item.owner
      if (item.author) return item.author
      if (item.applicant) return item.applicant
      if (item.userName) return item.userName
      const contact = String(item.contact || '')
      return contact.includes('·') ? contact.split('·').pop().trim() : ''
    }
    const next = data.map((item) => {
      if (!item || typeof item !== 'object') return item
      const ownerName = inferName(item)
      const ownerId = ownerName ? userIdByName.get(ownerName) : ''
      let record = item
      if (ownerId && !item.ownerId) {
        record = { ...record, ownerId }
        changed = true
      }
      if (ownerId && !item.authorId) {
        record = { ...record, authorId: ownerId }
        changed = true
      }
      if (
        document.resource_key === 'classroom' &&
        ownerId &&
        !record.applicantId
      ) {
        record = { ...record, applicantId: ownerId }
        changed = true
      }
      if (document.resource_key === 'groupbuy' && Array.isArray(record.participants)) {
        const participants = record.participants.map((participant) => {
          const participantId =
            participant.userId || userIdByName.get(participant.name)
          if (!participantId || participant.userId === participantId) return participant
          changed = true
          return { ...participant, userId: participantId }
        })
        record = { ...record, participants }
      }
      if (Array.isArray(record.claims)) {
        const claims = record.claims.map((claim) => {
          const helperId =
            claim.helperId ||
            userIdByName.get(claim.helperName || claim.claimantName)
          const claimantId =
            claim.claimantId ||
            userIdByName.get(claim.claimantName || claim.helperName)
          if (
            (!helperId || claim.helperId === helperId) &&
            (!claimantId || claim.claimantId === claimantId)
          ) return claim
          changed = true
          return {
            ...claim,
            ...(helperId ? { helperId } : {}),
            ...(claimantId ? { claimantId } : {}),
          }
        })
        record = { ...record, claims }
      }
      if (Array.isArray(record.replies)) {
        const replies = record.replies.map((reply) => {
          const authorId = reply.authorId || userIdByName.get(reply.author)
          if (!authorId || reply.authorId === authorId) return reply
          changed = true
          return { ...reply, authorId }
        })
        record = { ...record, replies }
      }
      if (document.resource_key === 'groupbuy') {
        const errand = DEMO_GROUPBUY_ERRANDS[record.id]
        if (errand && !record.errand?.enabled) {
          record = { ...record, errand: { ...errand } }
          changed = true
        } else if (
          record.id === 'gb_002' &&
          record.errand?.status === 'accepted' &&
          !record.errand?.acceptedAt &&
          record.errand?.runnerId === 'u_student_lin'
        ) {
          // 旧版本演示快照把 gb_002 预置成已接单，导致同一线路无法继续接单。
          record = { ...record, errand: { ...errand } }
          changed = true
        }
      }
      if (document.resource_key === 'lostfound') {
        const defaults = DEMO_LOSTFOUND_FIELDS[record.id]
        if (defaults) {
          for (const [key, value] of Object.entries(defaults)) {
            if (
              record[key] === undefined ||
              (Array.isArray(record[key]) && record[key].length === 0)
            ) {
              record = { ...record, [key]: structuredClone(value) }
              changed = true
            }
          }
        }
      }
      return record
    })
    if (changed) update.run(JSON.stringify(next), nowIso(), document.resource_key)
  }
}

function serializeRole(row) {
  return {
    key: row.role_key,
    label: row.label,
    level: Number(row.level),
    assignable: Boolean(row.assignable),
  }
}

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA busy_timeout = 5000;')
  const schemaPath = path.join(import.meta.dirname, 'schema.sql')
  db.exec(fs.readFileSync(schemaPath, 'utf8'))
  migrateDatabase(db)
  seedDatabase(db)
  initializeStudentNumbers(db)
  normalizeSharedDocumentOwnership(db)
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso())
  return db
}

export function seedDatabase(db, { forceDemo = false } = {}) {
  const createdAt = nowIso()
  const isFreshDatabase =
    Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count) === 0
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles(role_key, label, level, assignable, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const [key, label, level, assignable] of ROLE_DEFINITIONS) {
    insertRole.run(key, label, level, assignable, createdAt)
  }
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users(
      id, student_no, name, role_key, college, bio, status, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'builtin', ?, ?)
  `)
  if (isFreshDatabase || forceDemo) {
    for (const account of BUILTIN_ACCOUNTS) {
      insertUser.run(
        account.id,
        account.studentNo,
        account.name,
        account.roleKey,
        account.college,
        account.bio,
        createdAt,
        createdAt,
      )
    }
  }

  const credentialExists = db.prepare(
    'SELECT 1 FROM user_credentials WHERE user_id = ? LIMIT 1',
  )
  const insertCredential = db.prepare(`
    INSERT INTO user_credentials(
      user_id, password_hash, password_updated_at, must_change_password
    ) VALUES (?, ?, ?, ?)
  `)
  const usersWithoutCredentials = db.prepare(`
    SELECT id, source FROM users WHERE deleted_at IS NULL
  `).all()
  for (const user of usersWithoutCredentials) {
    if (credentialExists.get(user.id)) continue
    insertCredential.run(
      user.id,
      hashPassword('123456'),
      createdAt,
      user.source === 'custom' ? 1 : 0,
    )
  }

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings(setting_key, value_json, updated_at, updated_by)
    VALUES (?, ?, ?, NULL)
  `)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, JSON.stringify(value), createdAt)
  }

  db.prepare(`
    INSERT OR IGNORE INTO ai_provider_settings(
      provider, base_url, model, enabled, updated_at
    ) VALUES ('deepseek', 'https://api.deepseek.com', 'deepseek-flash', 1, ?)
  `).run(createdAt)

  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO notifications(
      id, owner_user_id, actor_user_id, type, title, content, link,
      is_read, important, source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const demoNotifications = [
    [
      'nt_student_reply', 'u_student_lin', null, 'reply',
      '你的论坛帖子收到新回复',
      '「整理了A栋 5 间人少又安静的晚自习教室」收到 2 条新回复。',
      '/forum/fp_002', 0, 1, 'forum', 'fp_002', agoIso(5),
    ],
    [
      'nt_student_match', 'u_student_lin', null, 'match',
      'AI 找到 1 条高相似招领线索',
      '蓝色水杯的招领信息与你的寻物描述相似度达到 91%，可以去广场核对。',
      '/lostfound', 0, 1, 'lostfound', 'lf_002', agoIso(2),
    ],
    [
      'nt_student_groupbuy', 'u_student_lin', null, 'deadline',
      '拼单还差 4 杯成团',
      '「校门口奶茶拼单」距离截止还有 1 天 3 小时。',
      '/groupbuy/gb_001', 1, 0, 'groupbuy', 'gb_001', agoIso(9),
    ],
    [
      'nt_student_claim', 'u_student_lin', null, 'status',
      '失物认领申请已通过',
      '苏念已通过归属核验，正在等待失主确认领取。',
      '/lostfound', 0, 1, 'lostfound', 'lf_001', agoIso(1),
    ],
    [
      'nt_monitor_apply', 'u_monitor_chen', null, 'status',
      '教室申请仍在审核中',
      '你提交的班会教室申请正在等待管理员审批，结果会在这里通知你。',
      '/classroom/status', 0, 0, 'classroom', 'ap_seed_002', agoIso(1),
    ],
    [
      'nt_moderator_forum', 'u_moderator_su', null, 'reply',
      '校园论坛有 3 个帖子待回复',
      '你负责的求助问答板块新增了待处理讨论。',
      '/forum', 0, 0, 'forum', '', agoIso(4),
    ],
    [
      'nt_moderator_reward', 'u_moderator_su', null, 'status',
      '寻物认领已通过，可确认领取并打赏',
      '蓝色保温杯的招领发布者已核对你的归属说明，确认领取后将记录 ¥10.00 打赏。',
      '/lostfound', 0, 1, 'lostfound', 'lf_002', agoIso(0.8),
    ],
    [
      'nt_admin_system', 'u_admin_zhou', null, 'system',
      '系统配置已同步',
      '场景开关与 AI 参数已从服务端载入。',
      '/system', 1, 0, 'system', '', agoIso(8),
    ],
    [
      'nt_super_security', 'u_super_admin_fang', null, 'system',
      '账号与权限审计已就绪',
      '通知与 AI 使用记录默认仅本人可见；如需排查，可在对应页面切换管理视角。',
      '/system', 0, 1, 'audit', '', agoIso(6),
    ],
  ]
  if (
    forceDemo ||
    Number(db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count) === 0
  ) {
    for (const item of demoNotifications) insertNotification.run(...item)
  }

  const insertAiUsage = db.prepare(`
    INSERT OR IGNORE INTO ai_usage_logs(
      id, user_id, task, scene, model, status, latency_ms, request_id,
      error_code, prompt_chars, usage_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const demoAiUsage = [
    ['ai_student_1', 'u_student_lin', 'parse', 'lostfound', 'deepseek-flash', 'success', 1420, 'demo-lin-1', '', 38, '{"total_tokens":612}', agoIso(3)],
    ['ai_student_2', 'u_student_lin', 'generate', 'lostfound', 'deepseek-flash', 'success', 1680, 'demo-lin-2', '', 96, '{"total_tokens":884}', agoIso(26)],
    ['ai_monitor_1', 'u_monitor_chen', 'parse', 'classroom', 'deepseek-flash', 'success', 1510, 'demo-chen-1', '', 44, '{"total_tokens":638}', agoIso(2)],
    ['ai_moderator_1', 'u_moderator_su', 'generate', 'forum', 'deepseek-flash', 'success', 1760, 'demo-su-1', '', 120, '{"total_tokens":932}', agoIso(5)],
    ['ai_admin_1', 'u_admin_zhou', 'parse', 'forum', 'deepseek-flash', 'success', 1330, 'demo-zhou-1', '', 31, '{"total_tokens":571}', agoIso(7)],
    ['ai_super_1', 'u_super_admin_fang', 'parse', 'classroom', 'deepseek-flash', 'success', 1280, 'demo-fang-1', '', 35, '{"total_tokens":559}', agoIso(9)],
  ]
  if (
    forceDemo ||
    Number(db.prepare('SELECT COUNT(*) AS count FROM ai_usage_logs').get().count) === 0
  ) {
    for (const item of demoAiUsage) insertAiUsage.run(...item)
  }
}

export function createDatabaseRepository(db) {
  const selectUserById = db.prepare(`${userSelect()} WHERE u.id = ?`)
  const selectUserByStudentNo = db.prepare(`
    ${userSelect()}
    WHERE u.student_no = ? AND u.deleted_at IS NULL
  `)
  const selectAllUsers = db.prepare(`
    ${userSelect()}
    ORDER BY
      CASE WHEN u.deleted_at IS NULL THEN 0 ELSE 1 END,
      u.deleted_at DESC,
      u.created_at DESC
  `)
  const selectDemoAccounts = db.prepare(`
    ${userSelect()}
    WHERE u.deleted_at IS NULL AND u.status = 'active'
    ORDER BY
      CASE WHEN u.source = 'custom' THEN 0 ELSE 1 END,
      CASE WHEN u.source = 'custom' THEN u.created_at END DESC,
      r.level ASC
  `)

  function getUserById(id) {
    return serializeUser(selectUserById.get(id))
  }

  function getUserByStudentNo(studentNo) {
    return serializeUser(selectUserByStudentNo.get(studentNo))
  }

  function listUsers() {
    return selectAllUsers.all().map(serializeUser)
  }

  function listLoginAccounts() {
    return selectDemoAccounts.all().map((row) => {
      const user = serializeUser(row)
      return {
        id: user.id,
        studentNo: user.studentNo,
        name: user.name,
        role: user.role,
        roleKey: user.roleKey,
        college: user.college,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        source: user.source,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      }
    })
  }

  function listRoles() {
    return db
      .prepare('SELECT role_key, label, level, assignable FROM roles ORDER BY level ASC')
      .all()
      .map(serializeRole)
  }

  function peekStudentNumberAllocation() {
    const released = db.prepare(`
      SELECT student_no
      FROM student_numbers
      WHERE status = 'available'
      ORDER BY
        CASE WHEN released_at IS NULL THEN 1 ELSE 0 END,
        released_at ASC,
        CAST(student_no AS INTEGER) ASC
      LIMIT 1
    `).get()
    if (released) return { studentNo: released.student_no, reused: true }

    const sequence = db.prepare(`
      SELECT next_value FROM student_number_sequence WHERE singleton = 1
    `).get()
    let candidate = Number(sequence.next_value)
    const exists = db.prepare('SELECT 1 FROM users WHERE student_no = ? LIMIT 1')
    while (exists.get(String(candidate))) candidate += 1
    return { studentNo: String(candidate), reused: false }
  }

  function peekNextStudentNo() {
    return peekStudentNumberAllocation().studentNo
  }

  function createCustomUser({ name, password }) {
    const id = `u_${randomUUID()}`
    const createdAt = nowIso()
    const passwordHash = hashPassword(password)
    let studentNo = ''
    let reused = false

    db.exec('BEGIN IMMEDIATE')
    try {
      const duplicateName = db.prepare(`
        SELECT 1 FROM users
        WHERE name = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(name)
      if (duplicateName) {
        const error = new Error('NAME_TAKEN')
        error.code = 'NAME_TAKEN'
        throw error
      }
      const allocation = peekStudentNumberAllocation()
      studentNo = allocation.studentNo
      reused = allocation.reused
      db.prepare(`
        INSERT INTO users(
          id, student_no, student_no_original, name, role_key, college, bio,
          status, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'student', 'AI+人工智能', ?, 'active', 'custom', ?, ?)
      `).run(
        id,
        studentNo,
        studentNo,
        name,
        '通过系统自动分配学号创建的演示账号',
        createdAt,
        createdAt,
      )
      db.prepare(`
        INSERT INTO user_credentials(
          user_id, password_hash, password_updated_at, must_change_password
        ) VALUES (?, ?, ?, 0)
      `).run(id, passwordHash, createdAt)

      const ledgerUpdate = db.prepare(`
        UPDATE student_numbers
        SET
          status = 'assigned',
          current_user_id = ?,
          assigned_at = ?,
          released_at = NULL,
          reuse_count = reuse_count + 1,
          updated_at = ?
        WHERE student_no = ?
      `).run(id, createdAt, createdAt, studentNo)
      if (ledgerUpdate.changes === 0) {
        db.prepare(`
          INSERT INTO student_numbers(
            student_no, status, current_user_id, assigned_at, released_at,
            reuse_count, generated_by_system, updated_at
          ) VALUES (?, 'assigned', ?, ?, NULL, 0, 1, ?)
        `).run(studentNo, id, createdAt, createdAt)
      }

      const numeric = Number(studentNo)
      if (!reused && Number.isSafeInteger(numeric) && numeric >= START_STUDENT_NO) {
        db.prepare(`
          UPDATE student_number_sequence
          SET next_value = MAX(next_value, ?), updated_at = ?
          WHERE singleton = 1
        `).run(numeric + 1, createdAt)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    return {
      user: getUserById(id),
      nextStudentNo: peekNextStudentNo(),
    }
  }

  function getPasswordCredential(userId) {
    return db.prepare(`
      SELECT password_hash, password_updated_at, must_change_password
      FROM user_credentials
      WHERE user_id = ?
    `).get(userId)
  }

  function updatePassword(userId, password) {
    const updatedAt = nowIso()
    const passwordHash = hashPassword(password)
    const result = db.prepare(`
      UPDATE user_credentials
      SET password_hash = ?, password_updated_at = ?, must_change_password = 0
      WHERE user_id = ?
    `).run(passwordHash, updatedAt, userId)
    if (result.changes === 0) {
      db.prepare(`
        INSERT INTO user_credentials(
          user_id, password_hash, password_updated_at, must_change_password
        ) VALUES (?, ?, ?, 0)
      `).run(userId, passwordHash, updatedAt)
    }
    return updatedAt
  }

  function getStudentNumberState() {
    const sequence = db.prepare(`
      SELECT start_number, next_value FROM student_number_sequence WHERE singleton = 1
    `).get()
    const availableCount = db.prepare(`
      SELECT COUNT(*) AS count FROM student_numbers WHERE status = 'available'
    `).get().count
    return {
      startNumber: sequence.start_number,
      nextStudentNo: peekNextStudentNo(),
      availableCount: Number(availableCount),
      allocatedCount: Number(
        db.prepare('SELECT COUNT(*) AS count FROM student_numbers').get().count,
      ),
    }
  }

  function softDeleteCustomUser(userId, actorUserId) {
    const current = getUserById(userId)
    if (!current || current.isDeleted) return current
    const deletedAt = nowIso()
    const internalStudentNo = `__deleted__${current.id}`

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE users
        SET
          student_no = ?,
          student_no_original = COALESCE(student_no_original, ?),
          status = 'disabled',
          deleted_at = ?,
          deleted_by = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        internalStudentNo,
        current.studentNo,
        deletedAt,
        actorUserId,
        deletedAt,
        current.id,
      )
      db.prepare(`
        UPDATE student_numbers
        SET
          status = 'available',
          current_user_id = NULL,
          released_at = ?,
          updated_at = ?
        WHERE current_user_id = ?
      `).run(deletedAt, deletedAt, current.id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(current.id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return getUserById(current.id)
  }

  function updateLastLogin(userId) {
    const at = nowIso()
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(at, at, userId)
  }

  function createSession(userId, userAgent = '') {
    const token = randomBytes(32).toString('base64url')
    const createdAt = nowIso()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(hashToken(token), userId, createdAt, expiresAt, createdAt, String(userAgent).slice(0, 300))
    return { token, expiresAt }
  }

  function getSessionUser(token) {
    if (!token) return null
    const tokenHash = hashToken(token)
    const session = db
      .prepare('SELECT token_hash, user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?')
      .get(tokenHash)
    if (!session) return null
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
      return null
    }
    const user = getUserById(session.user_id)
    if (!user) return null
    if (Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60 * 1000) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
        .run(nowIso(), tokenHash)
    }
    return user
  }

  function deleteSession(token) {
    if (!token) return
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }

  function deleteUserSessions(userId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }

  function updateProfile(userId, patch) {
    const current = getUserById(userId)
    if (!current) return null
    const next = {
      name: patch.name ?? current.name,
      college: patch.college ?? current.college,
      bio: patch.bio ?? current.bio,
      avatarUrl: patch.avatarUrl ?? current.avatarUrl,
    }
    db.prepare(`
      UPDATE users
      SET name = ?, college = ?, bio = ?, avatar_url = ?, updated_at = ?
      WHERE id = ?
    `).run(next.name, next.college, next.bio, next.avatarUrl, nowIso(), userId)
    return getUserById(userId)
  }

  function updateManagedUser(userId, patch) {
    const current = getUserById(userId)
    if (!current) return null
    const roleKey = patch.roleKey ?? current.roleKey
    const status = patch.status ?? current.status
    db.prepare(`
      UPDATE users
      SET role_key = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(roleKey, status, nowIso(), userId)
    if (status !== 'active') deleteUserSessions(userId)
    return getUserById(userId)
  }

  function getSettings() {
    const rows = db
      .prepare('SELECT setting_key, value_json, updated_at FROM system_settings ORDER BY setting_key')
      .all()
    const result = {}
    for (const row of rows) result[row.setting_key] = parseJson(row.value_json, {})
    return { ...DEFAULT_SETTINGS, ...result }
  }

  function setSetting(key, value, actorUserId) {
    db.prepare(`
      INSERT INTO system_settings(setting_key, value_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(key, JSON.stringify(value), nowIso(), actorUserId)
  }

  function addAuditLog({
    actorUserId,
    action,
    targetType,
    targetId = null,
    detail = {},
    ipAddress = '',
  }) {
    db.prepare(`
      INSERT INTO audit_logs(
        id, actor_user_id, action, target_type, target_id, detail_json, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `audit_${randomUUID()}`,
      actorUserId,
      action,
      targetType,
      targetId,
      JSON.stringify(detail),
      ipAddress,
      nowIso(),
    )
  }

  function listAuditLogs(limit = 40) {
    return db
      .prepare(`
        SELECT
          a.id,
          a.action,
          a.target_type,
          a.target_id,
          a.detail_json,
          a.ip_address,
          a.created_at,
          actor.name AS actor_name,
          COALESCE(actor.student_no_original, actor.student_no) AS actor_student_no
        FROM audit_logs a
        LEFT JOIN users actor ON actor.id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT ?
      `)
      .all(limit)
      .map((row) => ({
        id: row.id,
        actor: row.actor_name || '系统',
        actorStudentNo: row.actor_student_no || '',
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        detail: parseJson(row.detail_json, {}),
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      }))
  }

  function getSharedDocument(resourceKey) {
    const row = db.prepare(`
      SELECT d.resource_key, d.data_json, d.version, d.updated_at, d.updated_by,
        u.name AS updated_by_name
      FROM shared_documents d
      LEFT JOIN users u ON u.id = d.updated_by
      WHERE d.resource_key = ?
    `).get(resourceKey)
    if (!row) return null
    return {
      resource: row.resource_key,
      data: parseJson(row.data_json, null),
      version: Number(row.version),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by_name || '系统',
    }
  }

  function listSharedDocumentMetadata() {
    return db.prepare(`
      SELECT resource_key, version, updated_at
      FROM shared_documents
      ORDER BY resource_key
    `).all().map((row) => ({
      resource: row.resource_key,
      version: Number(row.version),
      updatedAt: row.updated_at,
    }))
  }

  function saveSharedDocument(resourceKey, data, baseVersion, userId) {
    const current = db.prepare(`
      SELECT version FROM shared_documents WHERE resource_key = ?
    `).get(resourceKey)
    const currentVersion = current ? Number(current.version) : 0
    if (Number(baseVersion) !== currentVersion) {
      return { conflict: true, currentVersion }
    }
    const nextVersion = currentVersion + 1
    const updatedAt = nowIso()
    if (!current) {
      db.prepare(`
        INSERT INTO shared_documents(resource_key, data_json, version, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(resourceKey, JSON.stringify(data), nextVersion, updatedAt, userId)
    } else {
      db.prepare(`
        UPDATE shared_documents
        SET data_json = ?, version = ?, updated_at = ?, updated_by = ?
        WHERE resource_key = ?
      `).run(JSON.stringify(data), nextVersion, updatedAt, userId, resourceKey)
    }
    return {
      conflict: false,
      resource: resourceKey,
      version: nextVersion,
      updatedAt,
    }
  }

  function getAiProviderSetting(provider = 'deepseek') {
    return db.prepare(`
      SELECT
        provider, base_url, model, enabled, api_key_ciphertext, api_key_last4,
        api_key_updated_at, updated_at, updated_by, last_test_ok, last_test_at, last_error
      FROM ai_provider_settings
      WHERE provider = ?
    `).get(provider) || null
  }

  function saveAiProviderSetting({
    provider = 'deepseek',
    baseUrl,
    model,
    enabled,
    apiKeyCiphertext,
    apiKeyLast4,
    userId,
  }) {
    const current = getAiProviderSetting(provider)
    const updatedAt = nowIso()
    if (!current) {
      db.prepare(`
        INSERT INTO ai_provider_settings(
          provider, base_url, model, enabled, api_key_ciphertext, api_key_last4,
          api_key_updated_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        provider,
        baseUrl,
        model,
        enabled ? 1 : 0,
        apiKeyCiphertext,
        apiKeyLast4,
        apiKeyCiphertext ? updatedAt : null,
        updatedAt,
        userId,
      )
      return getAiProviderSetting(provider)
    }
    db.prepare(`
      UPDATE ai_provider_settings
      SET
        base_url = ?,
        model = ?,
        enabled = ?,
        api_key_ciphertext = COALESCE(?, api_key_ciphertext),
        api_key_last4 = COALESCE(?, api_key_last4),
        api_key_updated_at = CASE
          WHEN ? IS NULL THEN api_key_updated_at
          ELSE ?
        END,
        updated_at = ?,
        updated_by = ?,
        last_test_ok = NULL,
        last_error = NULL
      WHERE provider = ?
    `).run(
      baseUrl,
      model,
      enabled ? 1 : 0,
      apiKeyCiphertext || null,
      apiKeyLast4 || null,
      apiKeyCiphertext || null,
      apiKeyCiphertext ? updatedAt : null,
      updatedAt,
      userId,
      provider,
    )
    return getAiProviderSetting(provider)
  }

  function updateAiProviderTest({ provider = 'deepseek', ok, error = null }) {
    db.prepare(`
      UPDATE ai_provider_settings
      SET last_test_ok = ?, last_test_at = ?, last_error = ?
      WHERE provider = ?
    `).run(ok ? 1 : 0, nowIso(), error, provider)
    return getAiProviderSetting(provider)
  }

  const notificationSelect = `
    SELECT
      n.id,
      n.owner_user_id,
      owner.name AS owner_name,
      n.actor_user_id,
      actor.name AS actor_name,
      n.type,
      n.title,
      n.content,
      n.link,
      n.is_read,
      n.important,
      n.source_type,
      n.source_id,
      n.created_at
    FROM notifications n
    JOIN users owner ON owner.id = n.owner_user_id
    LEFT JOIN users actor ON actor.id = n.actor_user_id
  `

  function serializeNotification(row) {
    if (!row) return null
    return {
      id: row.id,
      ownerId: row.owner_user_id,
      ownerName: row.owner_name,
      actorId: row.actor_user_id || null,
      actorName: row.actor_name || '',
      type: row.type,
      title: row.title,
      content: row.content,
      link: row.link,
      read: Boolean(row.is_read),
      important: Boolean(row.important),
      sourceType: row.source_type || '',
      sourceId: row.source_id || '',
      time: row.created_at,
    }
  }

  function findActiveUserByName(name) {
    const normalized = String(name || '').trim()
    if (!normalized) return null
    return serializeUser(db.prepare(`
      ${userSelect()}
      WHERE u.name = ? AND u.deleted_at IS NULL AND u.status = 'active'
      ORDER BY u.created_at ASC
      LIMIT 1
    `).get(normalized))
  }

  function resolveNotificationOwner({ ownerUserId, ownerName }) {
    if (ownerUserId) {
      const user = getUserById(ownerUserId)
      return user && !user.isDeleted && user.status === 'active' ? user : null
    }
    return findActiveUserByName(ownerName)
  }

  function listNotifications({ ownerUserId, all = false, limit = 200 }) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200))
    const rows = all
      ? db.prepare(`
          ${notificationSelect}
          ORDER BY n.created_at DESC
          LIMIT ?
        `).all(safeLimit)
      : db.prepare(`
          ${notificationSelect}
          WHERE n.owner_user_id = ?
          ORDER BY n.created_at DESC
          LIMIT ?
        `).all(ownerUserId, safeLimit)
    return rows.map(serializeNotification)
  }

  function createNotification({
    ownerUserId,
    ownerName,
    actorUserId,
    type = 'system',
    title,
    content = '',
    link = '',
    read = false,
    important = false,
    sourceType = '',
    sourceId = '',
  }) {
    const owner = resolveNotificationOwner({ ownerUserId, ownerName })
    if (!owner) return null
    const id = `nt_${randomUUID()}`
    const createdAt = nowIso()
    db.prepare(`
      INSERT INTO notifications(
        id, owner_user_id, actor_user_id, type, title, content, link,
        is_read, important, source_type, source_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      owner.id,
      actorUserId || null,
      String(type || 'system').slice(0, 40),
      String(title || '').slice(0, 160),
      String(content || '').slice(0, 2000),
      String(link || '').slice(0, 300),
      read ? 1 : 0,
      important ? 1 : 0,
      String(sourceType || '').slice(0, 40),
      String(sourceId || '').slice(0, 80),
      createdAt,
    )
    return serializeNotification(
      db.prepare(`${notificationSelect} WHERE n.id = ?`).get(id),
    )
  }

  function updateNotification(id, ownerUserId, patch) {
    const current = db.prepare(`
      ${notificationSelect}
      WHERE n.id = ? AND n.owner_user_id = ?
    `).get(id, ownerUserId)
    if (!current) return null
    const read = 'read' in patch ? Boolean(patch.read) : Boolean(current.is_read)
    const important = 'important' in patch
      ? Boolean(patch.important)
      : Boolean(current.important)
    db.prepare(`
      UPDATE notifications
      SET is_read = ?, important = ?
      WHERE id = ? AND owner_user_id = ?
    `).run(read ? 1 : 0, important ? 1 : 0, id, ownerUserId)
    return serializeNotification(
      db.prepare(`${notificationSelect} WHERE n.id = ?`).get(id),
    )
  }

  function deleteNotification(id, ownerUserId) {
    return db.prepare(`
      DELETE FROM notifications
      WHERE id = ? AND owner_user_id = ?
    `).run(id, ownerUserId).changes > 0
  }

  function markAllNotificationsRead(ownerUserId) {
    return db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE owner_user_id = ? AND is_read = 0
    `).run(ownerUserId).changes
  }

  function clearReadNotifications(ownerUserId) {
    return db.prepare(`
      DELETE FROM notifications
      WHERE owner_user_id = ? AND is_read = 1
    `).run(ownerUserId).changes
  }

  function addAiUsage({
    userId,
    task,
    scene = '',
    model = '',
    status,
    latencyMs = 0,
    requestId = '',
    errorCode = '',
    promptChars = 0,
    usage = null,
  }) {
    const id = `aiu_${randomUUID()}`
    const createdAt = nowIso()
    db.prepare(`
      INSERT INTO ai_usage_logs(
        id, user_id, task, scene, model, status, latency_ms, request_id,
        error_code, prompt_chars, usage_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      String(task || 'unknown').slice(0, 80),
      String(scene || '').slice(0, 40),
      String(model || '').slice(0, 100),
      status === 'success' ? 'success' : 'error',
      Math.max(0, Math.round(Number(latencyMs) || 0)),
      String(requestId || '').slice(0, 200),
      String(errorCode || '').slice(0, 80),
      Math.max(0, Math.round(Number(promptChars) || 0)),
      JSON.stringify(usage && typeof usage === 'object' ? usage : {}),
      createdAt,
    )
    return id
  }

  function listAiUsage({ userId, all = false, limit = 200 }) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200))
    const rows = all
      ? db.prepare(`
          SELECT
            l.*,
            u.name AS user_name,
            COALESCE(u.student_no_original, u.student_no) AS user_student_no
          FROM ai_usage_logs l
          JOIN users u ON u.id = l.user_id
          ORDER BY l.created_at DESC
          LIMIT ?
        `).all(safeLimit)
      : db.prepare(`
          SELECT
            l.*,
            u.name AS user_name,
            COALESCE(u.student_no_original, u.student_no) AS user_student_no
          FROM ai_usage_logs l
          JOIN users u ON u.id = l.user_id
          WHERE l.user_id = ?
          ORDER BY l.created_at DESC
          LIMIT ?
        `).all(userId, safeLimit)
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userStudentNo: row.user_student_no,
      task: row.task,
      scene: row.scene,
      model: row.model,
      status: row.status,
      latencyMs: Number(row.latency_ms),
      requestId: row.request_id,
      errorCode: row.error_code,
      promptChars: Number(row.prompt_chars),
      usage: parseJson(row.usage_json, {}),
      createdAt: row.created_at,
    }))
  }

  function cleanupExpiredData({
    notificationDays = 180,
    auditDays = 365,
  } = {}) {
    const now = Date.now()
    const sessionCutoff = nowIso()
    const notificationCutoff = new Date(
      now - Math.max(1, notificationDays) * 86_400_000,
    ).toISOString()
    const auditCutoff = new Date(
      now - Math.max(1, auditDays) * 86_400_000,
    ).toISOString()
    const sessions = db.prepare(`
      DELETE FROM sessions WHERE expires_at <= ?
    `).run(sessionCutoff).changes
    const notifications = db.prepare(`
      DELETE FROM notifications WHERE created_at < ?
    `).run(notificationCutoff).changes
    const auditLogs = db.prepare(`
      DELETE FROM audit_logs WHERE created_at < ?
    `).run(auditCutoff).changes
    return {
      sessions: Number(sessions),
      notifications: Number(notifications),
      auditLogs: Number(auditLogs),
    }
  }

  function resetDemoData() {
    db.exec('BEGIN IMMEDIATE')
    try {
      const sharedDocuments = db.prepare('DELETE FROM shared_documents').run().changes
      const notifications = db.prepare('DELETE FROM notifications').run().changes
      const aiUsage = db.prepare('DELETE FROM ai_usage_logs').run().changes
      const auditLogs = db.prepare('DELETE FROM audit_logs').run().changes
      db.exec('COMMIT')
      seedDatabase(db, { forceDemo: true })
      return {
        sharedDocuments: Number(sharedDocuments),
        notifications: Number(notifications),
        aiUsage: Number(aiUsage),
        auditLogs: Number(auditLogs),
      }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function health() {
    return {
      connected: true,
      userCount: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      activeUserCount: db.prepare(`
        SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL
      `).get().count,
      sessionCount: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      studentNumbers: getStudentNumberState(),
    }
  }

  return {
    getUserById,
    getUserByStudentNo,
    listUsers,
    listLoginAccounts,
    listRoles,
    createCustomUser,
    getPasswordCredential,
    updatePassword,
    getStudentNumberState,
    softDeleteCustomUser,
    updateLastLogin,
    createSession,
    getSessionUser,
    deleteSession,
    updateProfile,
    updateManagedUser,
    getSettings,
    setSetting,
    addAuditLog,
    listAuditLogs,
    getSharedDocument,
    listSharedDocumentMetadata,
    saveSharedDocument,
    getAiProviderSetting,
    saveAiProviderSetting,
    updateAiProviderTest,
    findActiveUserByName,
    listNotifications,
    createNotification,
    updateNotification,
    deleteNotification,
    markAllNotificationsRead,
    clearReadNotifications,
    addAiUsage,
    listAiUsage,
    cleanupExpiredData,
    resetDemoData,
    health,
  }
}
