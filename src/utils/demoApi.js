/**
 * demoApi.js —— 纯静态托管用的“无后端”演示服务。
 *
 * GitHub Pages / Netlify 这类静态托管无法运行 Node 24 + SQLite 后端，
 * 但本项目前端已经把服务端契约收敛在 fetch('/api/*') 上（见 src/utils/api.js）。
 * 这里在 main.js 最早阶段安装一个 fetch 拦截器，用 localStorage 复刻
 * server/index.js 的接口契约，让静态站点同样可以登录、发帖、借教室、接收通知，
 * 数据在浏览器本地持久化，刷新页面不丢失。
 *
 * 只在 `VITE_DEMO_API=1` 的构建里启用（见 package.json 的 build:pages 脚本），
 * 真实一体化部署（Node 后端）不会加载本文件。
 */
import { permissionsForRole } from '../../server/permissions.js'
import { notifications as seedNotifications } from '@/mock/seed'

const PREFIX = 'campus-demo-api:'
const USERS_KEY = `${PREFIX}users`
const SESSION_KEY = `${PREFIX}session`
const NUMBERS_KEY = `${PREFIX}student-numbers`
const NOTIFY_KEY = `${PREFIX}notifications`
const AI_KEY = `${PREFIX}ai-records`
const AUDIT_KEY = `${PREFIX}audit-logs`
const SETTINGS_KEY = `${PREFIX}settings`
const sharedKey = (resource) => `${PREFIX}shared:${resource}`

const SHARED_RESOURCES = ['classroom', 'lostfound', 'groupbuy', 'forum', 'dispatch']
const MAX_DOCUMENT_BYTES = 1_500_000

const ROLE_LEVEL = {
  student: 10,
  monitor: 20,
  forum_moderator: 30,
  admin: 80,
  super_admin: 100,
}

const ROLES = [
  { roleKey: 'student', label: '学生', level: 10, assignable: true },
  { roleKey: 'monitor', label: '班委', level: 20, assignable: true },
  { roleKey: 'forum_moderator', label: '论坛坛主', level: 30, assignable: true },
  { roleKey: 'admin', label: '管理员', level: 80, assignable: true },
  { roleKey: 'super_admin', label: '高级管理员', level: 100, assignable: false },
]

const BUILTIN_ACCOUNTS = [
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

const SEED_CREATED_AT = '2026-09-01T00:00:00.000Z'
const START_STUDENT_NO = '21040001'
const BUILTIN_PASSWORD = '123456'

/* ------------------------------------------------------------------ 存储 */

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 浏览器禁用存储时退化为内存态，本次会话内仍然可用。
  }
}

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix) {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

/* ------------------------------------------------------------------ 账号 */

function ensureUsers() {
  const stored = readJSON(USERS_KEY, null)
  if (Array.isArray(stored) && stored.length) return stored
  const seeded = BUILTIN_ACCOUNTS.map((account) => ({
    ...account,
    password: BUILTIN_PASSWORD,
    source: 'builtin',
    status: 'active',
    mustChangePassword: false,
    createdAt: SEED_CREATED_AT,
    loginAt: '',
  }))
  writeJSON(USERS_KEY, seeded)
  return seeded
}

function saveUsers(users) {
  writeJSON(USERS_KEY, users)
}

function serializeUser(record) {
  if (!record) return null
  const roleKey = ROLE_LEVEL[record.roleKey] ? record.roleKey : 'student'
  const permissions = permissionsForRole(roleKey)
  return {
    id: record.id,
    studentNo: record.studentNo,
    name: record.name,
    roleKey,
    role: permissions.roleLabel,
    roleLevel: ROLE_LEVEL[roleKey],
    college: record.college || '',
    bio: record.bio || '',
    avatarUrl: record.avatarUrl || '',
    status: record.status || 'active',
    source: record.source || 'custom',
    deletedAt: record.deletedAt || null,
    deletedBy: record.deletedBy || null,
    isDeleted: Boolean(record.isDeleted),
    mustChangePassword: Boolean(record.mustChangePassword),
    loginAt: record.loginAt || record.createdAt || SEED_CREATED_AT,
    createdAt: record.createdAt || SEED_CREATED_AT,
    updatedAt: record.updatedAt || record.createdAt || SEED_CREATED_AT,
    permissions,
  }
}

function loginAccount(record) {
  const user = serializeUser(record)
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
}

/* ------------------------------------------------------------- 学号分配 */

function defaultNumbers() {
  return {
    startNumber: START_STUDENT_NO,
    nextStudentNo: START_STUDENT_NO,
    availableNumbers: [],
    availableCount: 0,
  }
}

function readNumbers() {
  const stored = readJSON(NUMBERS_KEY, null)
  if (stored && typeof stored === 'object' && stored.nextStudentNo) return stored
  const initial = defaultNumbers()
  writeJSON(NUMBERS_KEY, initial)
  return initial
}

function normalizeNumbers(state) {
  const availableNumbers = Array.isArray(state.availableNumbers)
    ? state.availableNumbers.map(String).filter(Boolean)
    : []
  return {
    startNumber: String(state.startNumber || START_STUDENT_NO),
    nextStudentNo: String(availableNumbers[0] || state.nextStudentNo || START_STUDENT_NO),
    availableNumbers,
    availableCount: availableNumbers.length,
  }
}

function studentNumbers() {
  return normalizeNumbers(readNumbers())
}

function allocateStudentNo() {
  const state = readNumbers()
  const normalized = normalizeNumbers(state)
  const reused = normalized.availableNumbers.shift()
  if (reused) {
    writeJSON(NUMBERS_KEY, normalizeNumbers({ ...normalized, availableNumbers: normalized.availableNumbers }))
    return reused
  }
  const next = String(normalized.nextStudentNo)
  writeJSON(NUMBERS_KEY, normalizeNumbers({ ...normalized, nextStudentNo: String(Number(next) + 1) }))
  return next
}

function releaseStudentNo(studentNo) {
  const state = normalizeNumbers(readNumbers())
  const value = String(studentNo || '').trim()
  if (!value) return
  if (!state.availableNumbers.includes(value)) state.availableNumbers.push(value)
  state.availableNumbers.sort((a, b) => Number(a) - Number(b))
  writeJSON(NUMBERS_KEY, normalizeNumbers({ ...state, availableNumbers: state.availableNumbers }))
}

/* ---------------------------------------------------------------- 会话 */

function readSession() {
  const stored = readJSON(SESSION_KEY, null)
  if (!stored || !stored.token || !stored.userId) return null
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) return null
  return stored
}

function createSession(user) {
  const session = {
    token: `demo_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  }
  writeJSON(SESSION_KEY, session)
  return session
}

function bearer(headers) {
  if (!headers) return ''
  const map = typeof headers.get === 'function' ? null : headers
  const raw =
    map && typeof map === 'object'
      ? map.Authorization || map.authorization || ''
      : typeof headers.get === 'function'
        ? headers.get('authorization') || ''
        : ''
  const match = String(raw || '').match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function authenticate(headers) {
  const token = bearer(headers)
  const session = readSession()
  if (!token || !session || session.token !== token) {
    throw httpError(401, 'UNAUTHENTICATED', '登录已过期，请重新登录')
  }
  const users = ensureUsers()
  const record = users.find((item) => item.id === session.userId && !item.isDeleted)
  if (!record) throw httpError(401, 'UNAUTHENTICATED', '登录已过期，请重新登录')
  // 权限对象按角色即时计算（与后端 hasPermission(actor, ...) 的读取方式保持一致）
  return { ...record, permissions: permissionsForRole(record.roleKey) }
}

/* ---------------------------------------------------------------- 错误 */

function httpError(status, code, message, details) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.details = details
  return error
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function ok(data, status = 200) {
  return jsonResponse({ ok: true, data }, status)
}

function fail(error) {
  const status = Number(error?.status) || 500
  return jsonResponse(
    {
      ok: false,
      error: {
        code: error?.code || 'INTERNAL_ERROR',
        message: error?.message || '演示服务处理请求时出现异常',
        ...(error?.details ? { details: error.details } : {}),
      },
    },
    status,
  )
}

/* ------------------------------------------------------------- 通知 */

function notificationOwner(actor) {
  return { ownerId: actor.id, ownerName: actor.name }
}

function ensureNotifications(actor) {
  const stored = readJSON(NOTIFY_KEY, null)
  if (Array.isArray(stored)) return stored
  const seeded = seedNotifications.map((item, index) => ({
    id: item.id || `nt_seed_${index}`,
    ...notificationOwner(actor),
    actorId: null,
    actorName: '系统',
    type: item.type || 'system',
    title: item.title || '',
    content: item.content || '',
    link: item.link || '',
    read: Boolean(item.read),
    important: Boolean(item.important),
    sourceType: '',
    sourceId: '',
    time: item.time || nowIso(),
  }))
  writeJSON(NOTIFY_KEY, seeded)
  return seeded
}

function saveNotifications(items) {
  writeJSON(NOTIFY_KEY, items)
}

function listNotifications(actor, scope, limit) {
  const all = ensureNotifications(actor)
  const filtered =
    scope === 'all'
      ? all
      : all.filter(
          (item) =>
            item.ownerId === actor.id ||
            (!item.ownerId && item.ownerName && item.ownerName === actor.name),
        )
  return filtered
    .slice()
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    .slice(0, limit)
}

/* ------------------------------------------------------------ 共享文档 */

function readShared(resource) {
  const stored = readJSON(sharedKey(resource), null)
  if (!stored || typeof stored !== 'object') return null
  return {
    resource,
    data: Array.isArray(stored.data) ? stored.data : [],
    version: Number(stored.version) || 0,
    updatedAt: stored.updatedAt || nowIso(),
  }
}

function writeShared(resource, data, version) {
  const document = {
    resource,
    data,
    version,
    updatedAt: nowIso(),
  }
  writeJSON(sharedKey(resource), {
    data: document.data,
    version: document.version,
    updatedAt: document.updatedAt,
  })
  return document
}

function applyChanges(resource, { upserts = [], deletes = [], order = [], baseVersion = 0 }) {
  const current = readShared(resource)
  const currentVersion = current ? current.version : 0
  if (Number(baseVersion) !== currentVersion) {
    throw httpError(
      409,
      'SHARED_VERSION_CONFLICT',
      '云端数据已被其他人更新，请先合并最新版本',
      { resource, baseVersion, currentVersion },
    )
  }
  const byId = new Map(
    (current?.data || []).filter((item) => item && item.id).map((item) => [item.id, item]),
  )
  ;(Array.isArray(upserts) ? upserts : []).forEach((item) => {
    if (item && item.id) byId.set(item.id, item)
  })
  ;(Array.isArray(deletes) ? deletes : []).forEach((id) => byId.delete(id))
  const ids = Array.isArray(order) && order.length ? order : [...byId.keys()]
  const data = []
  ids.forEach((id) => {
    if (byId.has(id)) {
      data.push(byId.get(id))
      byId.delete(id)
    }
  })
  byId.forEach((item) => data.push(item))
  const bytes = JSON.stringify(data).length
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw httpError(
      413,
      'SHARED_DOCUMENT_TOO_LARGE',
      '演示环境的数据体积已超过浏览器本地存储上限，请减少图片或历史记录',
    )
  }
  return writeShared(resource, data, currentVersion + 1)
}

/* ------------------------------------------------------------ AI 记录 */

function readAiRecords() {
  const stored = readJSON(AI_KEY, null)
  return Array.isArray(stored) ? stored : []
}

function recordAiFailure(actor, task, scene) {
  const records = readAiRecords()
  records.unshift({
    id: uid('ai'),
    status: 'failed',
    task,
    scene: scene || '自动识别',
    model: '本地规则引擎',
    userId: actor.id,
    userName: actor.name,
    userStudentNo: actor.studentNo,
    errorCode: 'AI_KEY_NOT_CONFIGURED',
    latencyMs: Math.round(8 + Math.random() * 40),
    usage: { total_tokens: 0 },
    createdAt: nowIso(),
  })
  writeJSON(AI_KEY, records.slice(0, 200))
}

function listAiRecords(actor, scope, limit) {
  const all = readAiRecords()
  const filtered = scope === 'all' ? all : all.filter((item) => item.userId === actor.id)
  return filtered.slice(0, limit)
}

/* ------------------------------------------------------------- 设置 */

function readSettings() {
  const stored = readJSON(SETTINGS_KEY, null)
  if (stored && typeof stored === 'object') return stored
  const initial = {
    sceneSwitches: { classroom: true, lostfound: true, groupbuy: true, forum: true },
    aiParams: { threshold: 0.72, timeout: 8, fallback: true },
  }
  writeJSON(SETTINGS_KEY, initial)
  return initial
}

function aiProviderInfo() {
  return {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    enabled: true,
    configured: false,
    keyLast4: '',
    keyUpdatedAt: null,
    lastTestOk: null,
  }
}

/* ------------------------------------------------------------- 审计 */

function readAuditLogs() {
  const stored = readJSON(AUDIT_KEY, null)
  return Array.isArray(stored) ? stored : []
}

function addAuditLog(actor, action, targetType, targetId, detail = '') {
  const logs = readAuditLogs()
  logs.unshift({
    id: uid('log'),
    actorUserId: actor?.id || '',
    actorName: actor?.name || '演示环境',
    action,
    targetType,
    targetId,
    detail,
    ipAddress: '127.0.0.1',
    createdAt: nowIso(),
  })
  writeJSON(AUDIT_KEY, logs.slice(0, 200))
}

/* ------------------------------------------------------------- 路由 */

function scopeFor(actor, kind, requested) {
  if (requested !== 'all') return 'own'
  const permission = kind === 'notifications' ? 'notifications.view.any' : 'aiRecords.view.any'
  const allowed = Boolean(actor.permissions?.actions?.[permission])
  if (!allowed) {
    throw httpError(
      403,
      kind === 'notifications' ? 'NOTIFICATION_SCOPE_FORBIDDEN' : 'AI_RECORD_SCOPE_FORBIDDEN',
      '当前角色不能查看其他用户的记录',
    )
  }
  return 'all'
}

function requirePermission(actor, permission) {
  if (!actor.permissions?.actions?.[permission]) {
    throw httpError(403, 'PERMISSION_DENIED', '当前角色没有执行该操作的权限')
  }
}

function requireSuperAdmin(actor) {
  if (actor.roleKey !== 'super_admin') {
    throw httpError(403, 'SUPER_ADMIN_ONLY', '该操作仅高级管理员可用')
  }
}

async function dispatch(pathname, method, body, headers) {
  const url = new URL(pathname, 'https://demo.local')

  /* -------------------------------------------------------------- 认证 */

  if (method === 'GET' && url.pathname === '/auth/demo-accounts') {
    const users = ensureUsers()
    return ok({
      accounts: users.filter((item) => !item.isDeleted).map(loginAccount),
      studentNumbers: studentNumbers(),
    })
  }

  if (method === 'GET' && url.pathname === '/auth/next-number') {
    return ok(studentNumbers())
  }

  if (method === 'POST' && url.pathname === '/auth/login') {
    const studentNo = String(body?.studentNo || '').trim()
    const name = String(body?.name || '').trim()
    const password = String(body?.password || '')
    if (!studentNo || !name || !password) {
      throw httpError(422, 'CREDENTIALS_REQUIRED', '请填写学号、姓名和密码')
    }
    const users = ensureUsers()
    const record = users.find(
      (item) => !item.isDeleted && String(item.studentNo) === studentNo && item.name === name,
    )
    if (!record || String(record.password || '') !== password) {
      throw httpError(401, 'INVALID_CREDENTIALS', '学号、姓名或密码不正确')
    }
    if (record.status === 'disabled') {
      throw httpError(403, 'ACCOUNT_DISABLED', '该账号已被停用，请联系管理员')
    }
    record.loginAt = nowIso()
    saveUsers(users)
    const session = createSession(record)
    return ok({
      user: serializeUser(record),
      token: session.token,
      expiresAt: session.expiresAt,
      studentNumbers: studentNumbers(),
    })
  }

  if (method === 'POST' && url.pathname === '/auth/register') {
    const name = String(body?.name || '').trim()
    const password = String(body?.password || '')
    if (!name) throw httpError(422, 'NAME_REQUIRED', '请填写姓名')
    if (password.length < 6) throw httpError(422, 'PASSWORD_TOO_SHORT', '密码至少 6 位')
    const users = ensureUsers()
    if (users.some((item) => !item.isDeleted && item.name === name)) {
      throw httpError(409, 'NAME_TAKEN', '该姓名已被使用，请换一个姓名或联系管理员')
    }
    const studentNo = allocateStudentNo()
    const record = {
      id: uid('u'),
      studentNo,
      name,
      roleKey: 'student',
      college: '',
      bio: '',
      password,
      source: 'custom',
      status: 'active',
      mustChangePassword: false,
      createdAt: nowIso(),
      loginAt: nowIso(),
    }
    users.push(record)
    saveUsers(users)
    addAuditLog(null, '创建人物并分配学号', 'user', record.id, { name, studentNo })
    const session = createSession(record)
    return ok({
      user: serializeUser(record),
      token: session.token,
      expiresAt: session.expiresAt,
      nextStudentNo: studentNumbers().nextStudentNo,
      studentNumbers: studentNumbers(),
      accounts: users.filter((item) => !item.isDeleted).map(loginAccount),
    })
  }

  if (method === 'GET' && url.pathname === '/auth/me') {
    const actor = authenticate(headers)
    return ok({ user: serializeUser(actor) })
  }

  if (method === 'POST' && url.pathname === '/auth/logout') {
    removeKey(SESSION_KEY)
    return ok({ loggedOut: true })
  }

  if (method === 'PATCH' && url.pathname === '/me') {
    const actor = authenticate(headers)
    const users = ensureUsers()
    const target = users.find((item) => item.id === actor.id)
    if (!target) throw httpError(404, 'USER_NOT_FOUND', '账号不存在')
    if (typeof body?.name === 'string' && body.name.trim() && body.name.trim() !== target.name) {
      const name = body.name.trim()
      if (users.some((item) => !item.isDeleted && item.name === name && item.id !== target.id)) {
        throw httpError(409, 'NAME_TAKEN', '该姓名已被使用，请换一个姓名或联系管理员')
      }
      target.name = name
    }
    if (typeof body?.college === 'string') target.college = body.college.trim()
    if (typeof body?.bio === 'string') target.bio = body.bio.trim()
    if (typeof body?.avatarUrl === 'string') target.avatarUrl = body.avatarUrl
    target.updatedAt = nowIso()
    saveUsers(users)
    return ok({ user: serializeUser(target) })
  }

  if (method === 'PATCH' && url.pathname === '/me/password') {
    const actor = authenticate(headers)
    const users = ensureUsers()
    const target = users.find((item) => item.id === actor.id)
    if (!target) throw httpError(404, 'USER_NOT_FOUND', '账号不存在')
    if (String(target.password || '') !== String(body?.currentPassword || '')) {
      throw httpError(422, 'PASSWORD_INCORRECT', '当前密码不正确')
    }
    const next = String(body?.newPassword || '')
    if (next.length < 6) throw httpError(422, 'PASSWORD_TOO_SHORT', '新密码至少 6 位')
    target.password = next
    target.updatedAt = nowIso()
    saveUsers(users)
    return ok({ user: serializeUser(target) })
  }

  /* ------------------------------------------------------------- 通知 */

  if (url.pathname === '/notifications' && method === 'GET') {
    const actor = authenticate(headers)
    const scope = scopeFor(actor, 'notifications', url.searchParams.get('scope') || 'own')
    const limit = Number(url.searchParams.get('limit')) || 200
    return ok({ items: listNotifications(actor, scope, limit), scope })
  }

  if (url.pathname === '/notifications' && method === 'POST') {
    const actor = authenticate(headers)
    requirePermission(actor, 'notifications.use')
    const title = String(body?.title || '').trim()
    if (!title) throw httpError(422, 'NOTIFICATION_TITLE_REQUIRED', '通知标题不能为空')
    const users = ensureUsers()
    const recipientUserId =
      body?.recipientUserId && body.recipientUserId !== actor.id ? String(body.recipientUserId) : ''
    const recipientName =
      !recipientUserId && body?.recipientName && body.recipientName !== actor.name
        ? String(body.recipientName)
        : ''
    const recipient = recipientUserId
      ? users.find((item) => item.id === recipientUserId && !item.isDeleted)
      : recipientName
        ? users.find((item) => item.name === recipientName && !item.isDeleted)
        : users.find((item) => item.id === actor.id && !item.isDeleted)
    if (!recipient) throw httpError(404, 'NOTIFICATION_RECIPIENT_NOT_FOUND', '通知接收人不存在或已停用')
    const items = ensureNotifications(actor)
    const notification = {
      id: uid('nt'),
      ownerId: recipient.id,
      ownerName: recipient.name,
      actorId: actor.id,
      actorName: actor.name,
      type: body?.type || 'system',
      title,
      content: String(body?.content || ''),
      link: String(body?.link || ''),
      read: Boolean(body?.read),
      important: Boolean(body?.important),
      sourceType: String(body?.sourceType || ''),
      sourceId: String(body?.sourceId || ''),
      time: nowIso(),
    }
    items.unshift(notification)
    saveNotifications(items)
    return ok({ notification }, 201)
  }

  if (url.pathname === '/notifications/read-all' && method === 'POST') {
    const actor = authenticate(headers)
    const items = ensureNotifications(actor)
    let updated = 0
    items.forEach((item) => {
      if (item.ownerId === actor.id && !item.read) {
        item.read = true
        updated += 1
      }
    })
    saveNotifications(items)
    return ok({ updated })
  }

  if (url.pathname === '/notifications/read' && method === 'DELETE') {
    const actor = authenticate(headers)
    const items = ensureNotifications(actor)
    const rest = items.filter((item) => !(item.ownerId === actor.id && item.read))
    saveNotifications(rest)
    return ok({ deleted: items.length - rest.length })
  }

  const notificationMatch = url.pathname.match(/^\/notifications\/([^/]+)$/)
  if (notificationMatch && method === 'PATCH') {
    const actor = authenticate(headers)
    const id = decodeURIComponent(notificationMatch[1])
    const items = ensureNotifications(actor)
    const target = items.find((item) => item.id === id && item.ownerId === actor.id)
    if (!target) throw httpError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在或不属于当前用户')
    if ('read' in (body || {})) target.read = Boolean(body.read)
    if ('important' in (body || {})) target.important = Boolean(body.important)
    saveNotifications(items)
    return ok({ notification: target })
  }

  if (notificationMatch && method === 'DELETE') {
    const actor = authenticate(headers)
    const id = decodeURIComponent(notificationMatch[1])
    const items = ensureNotifications(actor)
    const index = items.findIndex((item) => item.id === id && item.ownerId === actor.id)
    if (index < 0) throw httpError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在或不属于当前用户')
    items.splice(index, 1)
    saveNotifications(items)
    return ok({ deleted: true })
  }

  /* --------------------------------------------------------- 共享文档 */

  if (url.pathname === '/shared/meta' && method === 'GET') {
    authenticate(headers)
    const documents = SHARED_RESOURCES.map((resource) => readShared(resource))
      .filter(Boolean)
      .map((item) => ({
        resource: item.resource,
        version: item.version,
        updatedAt: item.updatedAt,
      }))
    return ok({ documents })
  }

  const sharedGet = url.pathname.match(/^\/shared\/([a-z]+)$/)
  if (sharedGet && method === 'GET') {
    authenticate(headers)
    const resource = sharedGet[1]
    if (!SHARED_RESOURCES.includes(resource)) {
      throw httpError(404, 'SHARED_RESOURCE_NOT_FOUND', '未知的共享资源')
    }
    return ok({ document: readShared(resource) })
  }

  const sharedChanges = url.pathname.match(/^\/shared\/([a-z]+)\/changes$/)
  if (sharedChanges && method === 'PUT') {
    const actor = authenticate(headers)
    const resource = sharedChanges[1]
    if (!SHARED_RESOURCES.includes(resource)) {
      throw httpError(404, 'SHARED_RESOURCE_NOT_FOUND', '未知的共享资源')
    }
    const permission = {
      classroom: 'classroom.apply',
      lostfound: 'lostfound.use',
      groupbuy: 'groupbuy.use',
      forum: 'forum.publish',
      dispatch: 'aiRecords.use',
    }[resource]
    if (permission) requirePermission(actor, permission)
    const document = applyChanges(resource, body || {})
    return ok({ version: document.version, data: document.data })
  }

  /* ------------------------------------------------------------- AI */

  if (url.pathname === '/ai/parse' && method === 'POST') {
    const actor = authenticate(headers)
    recordAiFailure(actor, 'parse', '自动识别')
    throw httpError(
      503,
      'AI_KEY_NOT_CONFIGURED',
      '演示环境未配置 DeepSeek API Key，已自动切换到本地规则引擎',
    )
  }

  if (url.pathname === '/ai/generate' && method === 'POST') {
    const actor = authenticate(headers)
    recordAiFailure(actor, String(body?.task || 'generate'), '')
    throw httpError(
      503,
      'AI_KEY_NOT_CONFIGURED',
      '演示环境未配置 DeepSeek API Key，已自动切换到本地规则引擎',
    )
  }

  if (url.pathname === '/ai/records' && method === 'GET') {
    const actor = authenticate(headers)
    const scope = scopeFor(actor, 'aiRecords', url.searchParams.get('scope') || 'own')
    const limit = Number(url.searchParams.get('limit')) || 200
    return ok({ records: listAiRecords(actor, scope, limit), scope })
  }

  /* --------------------------------------------------------- 系统管理 */

  if (url.pathname === '/system/bootstrap' && method === 'GET') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    const users = ensureUsers()
    return ok({
      users: users.map(serializeUser),
      assignableRoles: ROLES,
      auditLogs: readAuditLogs(),
      studentNumbers: studentNumbers(),
      aiProvider: aiProviderInfo(),
      settings: readSettings(),
    })
  }

  if (url.pathname === '/system/audit-logs' && method === 'GET') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    return ok({ logs: readAuditLogs() })
  }

  if (url.pathname === '/system/settings' && method === 'PATCH') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    const settings = readSettings()
    if (body?.sceneSwitches && typeof body.sceneSwitches === 'object') {
      settings.sceneSwitches = { ...settings.sceneSwitches, ...body.sceneSwitches }
    }
    if (body?.aiParams && typeof body.aiParams === 'object') {
      settings.aiParams = { ...settings.aiParams, ...body.aiParams }
    }
    writeJSON(SETTINGS_KEY, settings)
    addAuditLog(actor, '更新系统配置', 'settings', 'default', settings)
    return ok({ settings })
  }

  if (url.pathname === '/system/reset-demo' && method === 'POST') {
    const session = readSession()
    const keys = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach(removeKey)
    if (session) {
      // 重置后保留当前登录人，避免把演示者直接踢回登录页。
      ensureUsers()
      writeJSON(SESSION_KEY, session)
    }
    return ok({ reset: true })
  }

  if (url.pathname === '/system/reset-all' && method === 'POST') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    if (String(body?.confirmation || '').trim() !== '重置全部内容') {
      throw httpError(
        422,
        'RESET_CONFIRMATION_REQUIRED',
        '请输入“重置全部内容”确认本次操作',
      )
    }
    const users = ensureUsers()
    let avatarsCleared = 0
    for (const user of users) {
      if (user.avatarUrl) {
        user.avatarUrl = ''
        user.updatedAt = nowIso()
        avatarsCleared += 1
      }
    }
    saveUsers(users)
    const sharedDocuments = SHARED_RESOURCES.filter((resource) =>
      Boolean(readShared(resource)),
    ).length
    SHARED_RESOURCES.forEach((resource) => removeKey(sharedKey(resource)))
    removeKey(NOTIFY_KEY)
    removeKey(AI_KEY)
    removeKey(AUDIT_KEY)
    addAuditLog(actor, '一键重置全部内容', 'all_content', 'demo', {
      avatarsCleared,
      sharedDocuments,
    })
    return ok({
      avatarsCleared,
      sharedDocuments,
      notifications: 0,
      aiUsage: 0,
      auditLogs: 0,
      uploadedFiles: 0,
      uploadErrors: 0,
      currentUser: serializeUser(users.find((user) => user.id === actor.id)),
    })
  }

  const systemUser = url.pathname.match(/^\/system\/users\/([^/]+)$/)
  if (systemUser && method === 'PATCH') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    const id = decodeURIComponent(systemUser[1])
    const users = ensureUsers()
    const target = users.find((item) => item.id === id)
    if (!target) throw httpError(404, 'USER_NOT_FOUND', '目标账号不存在')
    if (target.id === actor.id) throw httpError(409, 'CANNOT_MODIFY_SELF', '不能修改自己的权限或账号状态')
    if (target.roleKey === 'super_admin') {
      throw httpError(403, 'SUPER_ADMIN_PROTECTED', '高级管理员账号不可被修改')
    }
    if (body?.roleKey && ROLE_LEVEL[body.roleKey]) target.roleKey = body.roleKey
    if (body?.status) target.status = body.status === 'disabled' ? 'disabled' : 'active'
    target.updatedAt = nowIso()
    saveUsers(users)
    addAuditLog(actor, '更新账号', 'user', target.id, body)
    return ok({ user: serializeUser(target) })
  }

  if (systemUser && method === 'DELETE') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    const id = decodeURIComponent(systemUser[1])
    const users = ensureUsers()
    const target = users.find((item) => item.id === id)
    if (!target) throw httpError(404, 'USER_NOT_FOUND', '目标账号不存在')
    if (target.id === actor.id) throw httpError(409, 'CANNOT_DELETE_SELF', '不能删除当前登录账号')
    if (target.roleKey === 'super_admin') {
      throw httpError(403, 'SUPER_ADMIN_PROTECTED', '高级管理员账号不可删除')
    }
    if (target.source !== 'custom') {
      throw httpError(403, 'BUILTIN_ACCOUNT_PROTECTED', '内置演示账号不可删除')
    }
    target.isDeleted = true
    target.status = 'disabled'
    target.deletedAt = nowIso()
    saveUsers(users)
    releaseStudentNo(target.studentNo)
    addAuditLog(actor, '删除人物并释放学号', 'user', target.id, {
      name: target.name,
      releasedStudentNo: target.studentNo,
    })
    return ok({ user: serializeUser(target), studentNumbers: studentNumbers() })
  }

  if (url.pathname === '/system/ai-provider' && method === 'GET') {
    authenticate(headers)
    return ok({ provider: aiProviderInfo() })
  }

  if (url.pathname === '/system/ai-provider' && method === 'PATCH') {
    const actor = authenticate(headers)
    requireSuperAdmin(actor)
    throw httpError(
      422,
      'AI_KEY_UNSUPPORTED_IN_DEMO',
      '静态演示环境不会保存 API Key：请使用 Node 后端一体化部署来配置 DeepSeek',
    )
  }

  if (url.pathname === '/system/ai-provider/test' && method === 'POST') {
    authenticate(headers)
    throw httpError(
      503,
      'AI_KEY_NOT_CONFIGURED',
      '静态演示环境未配置 DeepSeek API Key，AI 功能由本地规则引擎接管',
    )
  }

  if (url.pathname === '/health' && method === 'GET') {
    return ok({ status: 'demo', mode: 'static' })
  }

  throw httpError(404, 'ROUTE_NOT_FOUND', `演示服务未实现该接口：${method} ${url.pathname}`)
}

/* ------------------------------------------------------------- 安装 */

let installed = false
let nativeFetch = null

export function installDemoApi() {
  if (installed || typeof window === 'undefined') return
  installed = true
  nativeFetch = window.fetch.bind(window)

  window.fetch = async function demoFetch(input, init = {}) {
    let url = ''
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || ''
    } catch {
      url = ''
    }
    let parsed = null
    try {
      parsed = new URL(url, window.location.href)
    } catch {
      parsed = null
    }
    const isSameOrigin = parsed && parsed.origin === window.location.origin
    const apiIndex = parsed ? parsed.pathname.indexOf('/api/') : -1
    if (!isSameOrigin || apiIndex < 0) {
      return nativeFetch(input, init)
    }

    const path = parsed.pathname.slice(apiIndex + 4) + parsed.search
    const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
    let body = init.body
    if (typeof body === 'string' && body) {
      try {
        body = JSON.parse(body)
      } catch {
        body = null
      }
    } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = body
    } else if (!body) {
      body = null
    }

    const headers = init.headers || (typeof input === 'object' && input?.headers) || {}

    try {
      return await dispatch(path, method, body, headers)
    } catch (error) {
      if (!error || typeof error !== 'object') {
        return fail(httpError(500, 'INTERNAL_ERROR', String(error)))
      }
      return fail(error)
    }
  }

  // 静态托管没有真实后端，登录态过期时不应触发“后端不可用”提示。
  window.__CAMPUS_DEMO_API__ = true
}

export function uninstallDemoApi() {
  if (!installed || !nativeFetch) return
  window.fetch = nativeFetch
  installed = false
}
