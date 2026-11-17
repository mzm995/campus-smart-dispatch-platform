import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { openDatabase, createDatabaseRepository } from './db.js'
import {
  classrooms as campusClassrooms,
  groupBuys as demoGroupBuys,
} from '../src/mock/seed.js'
import { verifyPassword } from './passwords.js'
import {
  canAccessModule,
  hasPermission,
  isOwner,
  permissionsForRole,
  resolveDataScope,
  SHARED_RESOURCE_PERMISSIONS,
} from './permissions.js'
import {
  decryptSecret,
  encryptSecret,
  loadEncryptionKey,
} from './secrets.js'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = path.resolve(SERVER_DIR, '..')
try {
  loadEnvFile(path.join(PROJECT_DIR, '.env'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const DIST_DIR = path.join(PROJECT_DIR, 'dist')
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'
const DB_PATH = path.resolve(
  process.env.DATABASE_PATH || path.join(PROJECT_DIR, 'server', 'data', 'campus-smart-dispatch-platform.sqlite'),
)
const SECRET_PATH = path.resolve(
  process.env.SECRETS_PATH || path.join(path.dirname(DB_PATH), '.secrets-key'),
)
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_SHARED_DOCUMENT_BYTES = 4 * 1024 * 1024
const UPLOAD_DIR = path.join(path.dirname(DB_PATH), 'uploads')
const MAX_ASSIGNABLE_ROLE_LEVEL = 80
const VALID_USER_STATUSES = new Set(['active', 'pending', 'disabled'])
const SHARED_RESOURCES = new Set([
  'classroom',
  'lostfound',
  'groupbuy',
  'forum',
  'notifications',
  'dispatch',
])
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEEPSEEK_MODEL = 'deepseek-flash'
const DEEPSEEK_MODEL_NAME = 'DeepSeek-V4.1-Flash'
const SETTINGS_KEY = loadEncryptionKey(SECRET_PATH)
const aiRequestWindows = new Map()
const GROUPBUY_DEMO_TIMING = {
  gb_001: { createdHoursAgo: 9, deadlineDays: 2, deadlineHour: 20 },
  gb_002: { createdHoursAgo: 22, deadlineDays: 1, deadlineHour: 18 },
  gb_003: { createdHoursAgo: 30, deadlineDays: 1, deadlineHour: 21 },
  gb_004: { createdHoursAgo: 4, deadlineDays: 1, deadlineHour: 22 },
  gb_005: { createdHoursAgo: 12, deadlineDays: 3, deadlineHour: 18 },
  gb_006: { createdHoursAgo: 52, deadlineDays: -1, deadlineHour: 18 },
}

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function buildGroupbuyDemoData(users) {
  const userIdByName = new Map(
    users
      .filter((user) => !user.isDeleted)
      .map((user) => [user.name, user.id]),
  )
  const now = Date.now()
  return demoGroupBuys.map((template) => {
    const timing = GROUPBUY_DEMO_TIMING[template.id]
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + (timing?.deadlineDays || 0))
    deadline.setHours(timing?.deadlineHour || 20, 0, 0, 0)
    return {
      ...structuredClone(template),
      ownerId: userIdByName.get(template.owner) || '',
      participants: template.participants.map((participant) => ({
        ...participant,
        userId: userIdByName.get(participant.name) || '',
      })),
      createdAt: new Date(
        now - (timing?.createdHoursAgo || 0) * 60 * 60 * 1000,
      ).toISOString(),
      deadline: deadline.toISOString(),
    }
  })
}

const db = openDatabase(DB_PATH)
const repo = createDatabaseRepository(db)
let maintenanceTimer = null
let classroomAvailabilityVersion = 1
const classroomEventClients = new Set()
const ROOMS_BY_ID = new Map(campusClassrooms.map((room) => [room.id, room]))

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const loginAttempts = new Map()

function nowMs() {
  return Date.now()
}

function nowIso() {
  return new Date().toISOString()
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim()
}

function checkLoginRate(req) {
  const key = clientIp(req)
  const now = nowMs()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.startedAt > 60_000) {
    loginAttempts.set(key, { startedAt: now, count: 1 })
    return
  }
  entry.count += 1
  const limit = Number(process.env.LOGIN_RATE_LIMIT) || 20
  if (entry.count > limit) {
    throw new HttpError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试')
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(body)
}

function sendSuccess(res, data, status = 200) {
  sendJson(res, status, { ok: true, data })
}

function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR'
  const message =
    error instanceof HttpError ? error.message : '服务器处理请求时出现异常，请稍后重试'
  if (!(error instanceof HttpError)) {
    console.error('[api] unhandled error', error)
  }
  sendJson(res, status, {
    ok: false,
    error: {
      code,
      message,
      ...(error?.details ? { details: error.details } : {}),
    },
  })
}

function applyCors(req, res) {
  const origin = req.headers.origin
  if (!origin) return
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const localAllowed =
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_LOCAL_CORS === '1'
      ? /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      : false
  if (configured.includes(origin) || localAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  }
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大')
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求内容不是有效的 JSON')
  }
}

async function readBuffer(req, limit = MAX_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'BODY_TOO_LARGE', '上传文件过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function clearUploadDirectory() {
  let entries = []
  try {
    entries = await fsp.readdir(UPLOAD_DIR, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  let uploadedFiles = 0
  let uploadErrors = 0
  for (const entry of entries) {
    if (entry.isDirectory()) continue
    try {
      await fsp.unlink(path.join(UPLOAD_DIR, entry.name))
      uploadedFiles += 1
    } catch {
      uploadErrors += 1
    }
  }
  return { uploadedFiles, uploadErrors }
}

function hasValidImageSignature(buffer, contentType) {
  if (!buffer?.length) return false
  if (contentType === 'image/png') {
    return buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  }
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
  }
  if (contentType === 'image/gif') {
    const signature = buffer.toString('ascii', 0, 6)
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  return false
}

function normalizeName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (!name) throw new HttpError(422, 'NAME_REQUIRED', '请输入姓名')
  if (length > 10) throw new HttpError(422, 'NAME_TOO_LONG', '姓名不能超过 10 个字')
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new HttpError(422, 'NAME_INVALID', '姓名包含不可用字符')
  }
  return name
}

function normalizeStudentNo(value) {
  const studentNo = String(value || '').trim()
  if (!studentNo) throw new HttpError(422, 'STUDENT_NO_REQUIRED', '请输入学号')
  if (studentNo.length > 12) {
    throw new HttpError(422, 'STUDENT_NO_TOO_LONG', '学号不能超过 12 个字符')
  }
  if (!/^\d{1,12}$/.test(studentNo)) {
    throw new HttpError(422, 'STUDENT_NO_INVALID', '学号只能填写数字')
  }
  return studentNo
}

function normalizeLoginPassword(value) {
  const password = String(value ?? '')
  const length = [...password].length
  if (!password) throw new HttpError(422, 'PASSWORD_REQUIRED', '请输入密码')
  if (length > 32) throw new HttpError(422, 'PASSWORD_TOO_LONG', '密码不能超过 32 个字符')
  return password
}

function normalizeNewPassword(value) {
  const password = normalizeLoginPassword(value)
  const length = [...password].length
  if (length < 8) {
    throw new HttpError(422, 'PASSWORD_TOO_SHORT', '新密码至少需要 8 个字符')
  }
  const normalized = password.toLowerCase()
  const weakPasswords = new Set([
    '12345678',
    '123456789',
    'password',
    'password1',
    'qwerty123',
    '11111111',
    '88888888',
    'abc12345',
  ])
  if (weakPasswords.has(normalized) || /^(.)\1+$/.test(password)) {
    throw new HttpError(422, 'PASSWORD_TOO_WEAK', '该密码过于简单，请使用更复杂的密码')
  }
  return password
}

async function invalidCredentials() {
  const delay = 140 + Math.floor(Math.random() * 120)
  await new Promise((resolve) => setTimeout(resolve, delay))
  throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码错误')
}

function normalizeCollege(value, fallback = 'AI+人工智能') {
  const college = String(value ?? fallback).trim().replace(/\s+/g, ' ')
  if (!college) throw new HttpError(422, 'COLLEGE_REQUIRED', '请填写专业或部门')
  if ([...college].length > 30) {
    throw new HttpError(422, 'COLLEGE_TOO_LONG', '专业或部门不能超过 30 个字符')
  }
  return college
}

function normalizeBio(value) {
  const bio = String(value || '').trim()
  if ([...bio].length > 60) {
    throw new HttpError(422, 'BIO_TOO_LONG', '个人简介不能超过 60 个字符')
  }
  return bio
}

function normalizeAvatarUrl(value) {
  const avatarUrl = String(value || '').trim()
  if (!avatarUrl) return ''
  if (
    !/^\/api\/uploads\/images\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/i.test(
      avatarUrl,
    )
  ) {
    throw new HttpError(422, 'AVATAR_URL_INVALID', '头像地址无效，请重新上传图片')
  }
  return avatarUrl
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return ''
  return header.slice(7).trim()
}

function authenticate(req, explicitToken = '') {
  const token = explicitToken || bearerToken(req)
  const user = repo.getSessionUser(token)
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', '登录状态已失效，请重新登录')
  if (user.status !== 'active') {
    repo.deleteSession(token)
    throw new HttpError(403, 'ACCOUNT_INACTIVE', '账号已停用或待审核，请联系管理员')
  }
  return user
}

function requireAdmin(req) {
  const actor = authenticate(req)
  if (actor.roleLevel < 80) {
    throw new HttpError(403, 'ADMIN_REQUIRED', '需要管理员权限')
  }
  return actor
}

function requireSuperAdmin(req) {
  const actor = requireAdmin(req)
  if (actor.roleKey !== 'super_admin') {
    throw new HttpError(403, 'SUPER_ADMIN_REQUIRED', '只有高级管理员可以调整其他账号权限')
  }
  return actor
}

function requirePermission(actor, permission, message = '当前角色无权执行此操作') {
  if (!hasPermission(actor, permission)) {
    throw new HttpError(403, 'FEATURE_FORBIDDEN', message)
  }
  return actor
}

function requireModule(actor, moduleKey, message = '当前角色无权访问该功能') {
  if (!canAccessModule(actor, moduleKey)) {
    throw new HttpError(403, 'MODULE_FORBIDDEN', message)
  }
  return actor
}

function publicSessionPayload(user, token, expiresAt) {
  return { user, token, expiresAt }
}

function issueSession(req, user) {
  repo.updateLastLogin(user.id)
  const freshUser = repo.getUserById(user.id)
  const session = repo.createSession(freshUser.id, req.headers['user-agent'])
  return {
    ...publicSessionPayload(freshUser, session.token, session.expiresAt),
    studentNumbers: repo.getStudentNumberState(),
  }
}

function publicAiProvider(row) {
  return {
    provider: 'deepseek',
    displayName: DEEPSEEK_MODEL_NAME,
    model: DEEPSEEK_MODEL,
    baseUrl: DEEPSEEK_BASE_URL,
    enabled: row ? Boolean(row.enabled) : true,
    configured: Boolean(row?.api_key_ciphertext),
    keyLast4: row?.api_key_last4 || '',
    keyUpdatedAt: row?.api_key_updated_at || null,
    lastTestOk: row?.last_test_ok === null ? null : Boolean(row?.last_test_ok),
    lastTestAt: row?.last_test_at || null,
    lastError: row?.last_error || '',
  }
}

function requireAiConfiguration() {
  const row = repo.getAiProviderSetting('deepseek')
  if (!row?.enabled) {
    throw new HttpError(409, 'AI_DISABLED', 'DeepSeek 模型接入当前已关闭')
  }
  if (!row?.api_key_ciphertext) {
    throw new HttpError(409, 'AI_KEY_NOT_CONFIGURED', '请先在高级管理员页面配置 DeepSeek API Key')
  }
  let apiKey
  try {
    apiKey = decryptSecret(row.api_key_ciphertext, SETTINGS_KEY)
  } catch (error) {
    console.error('[ai] failed to decrypt API key', error)
    throw new HttpError(500, 'AI_KEY_DECRYPT_FAILED', 'API Key 解密失败，请重新配置')
  }
  return {
    row,
    apiKey,
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
  }
}

function checkAiRate(userId) {
  const now = Date.now()
  const recent = (aiRequestWindows.get(userId) || []).filter(
    (timestamp) => now - timestamp < 60_000,
  )
  if (recent.length >= 12) {
    throw new HttpError(429, 'AI_RATE_LIMITED', 'AI 请求过于频繁，请稍后再试')
  }
  recent.push(now)
  aiRequestWindows.set(userId, recent)
}

async function callDeepSeek({
  messages,
  maxTokens = 1800,
  jsonMode = false,
  thinking = true,
}) {
  const config = requireAiConfiguration()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  let response
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        thinking: { type: thinking ? 'enabled' : 'disabled' },
        ...(thinking ? { reasoning_effort: 'low' } : {}),
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpError(504, 'DEEPSEEK_TIMEOUT', 'DeepSeek 请求超时，请稍后重试')
    }
    throw new HttpError(502, 'DEEPSEEK_NETWORK_ERROR', '无法连接 DeepSeek 服务')
  } finally {
    clearTimeout(timeout)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const upstreamMessage =
      payload?.error?.message || `DeepSeek 返回 HTTP ${response.status}`
    const code =
      response.status === 401 || response.status === 403
        ? 'DEEPSEEK_AUTH_FAILED'
        : response.status === 429
          ? 'DEEPSEEK_RATE_LIMITED'
          : 'DEEPSEEK_REQUEST_FAILED'
    throw new HttpError(
      response.status === 429 ? 503 : 502,
      code,
      `DeepSeek 调用失败：${upstreamMessage}`,
    )
  }

  const message = payload?.choices?.[0]?.message
  const content = String(message?.content || '').trim()
  if (!content) {
    throw new HttpError(502, 'DEEPSEEK_EMPTY_RESPONSE', 'DeepSeek 未返回有效内容')
  }
  return {
    content,
    reasoningContent: message?.reasoning_content || '',
    model: payload?.model || config.model,
    requestId: payload?.id || '',
    usage: payload?.usage || null,
  }
}

function parseJsonResponse(content) {
  const stripped = String(content || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new HttpError(502, 'AI_RESPONSE_INVALID', '模型返回的 JSON 格式无效')
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    throw new HttpError(502, 'AI_RESPONSE_INVALID', '模型返回的 JSON 无法解析')
  }
}

async function callLoggedAi(actor, { task, scene = '', messages, ...options }) {
  const startedAt = Date.now()
  const promptChars = messages.reduce(
    (sum, message) => sum + String(message?.content || '').length,
    0,
  )
  try {
    const result = await callDeepSeek({ messages, ...options })
    repo.addAiUsage({
      userId: actor.id,
      task,
      scene,
      model: result.model,
      status: 'success',
      latencyMs: Date.now() - startedAt,
      requestId: result.requestId,
      promptChars,
      usage: result.usage,
    })
    return result
  } catch (error) {
    repo.addAiUsage({
      userId: actor.id,
      task,
      scene,
      model: DEEPSEEK_MODEL,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      errorCode: error?.code || 'AI_REQUEST_FAILED',
      promptChars,
    })
    throw error
  }
}

function canManageAllContent(actor) {
  return Boolean(
    actor.roleLevel >= 80 ||
      hasPermission(actor, 'content.manage.any'),
  )
}

function canModerateForum(actor) {
  return hasPermission(actor, 'forum.moderate') || hasPermission(actor, 'forum.delete.any')
}

function ownerVisible(actor, item, fields) {
  return isOwner(actor, item, fields)
}

function filterSharedData(actor, resource, data) {
  if (!Array.isArray(data)) return data
  if (resource === 'classroom') {
    const scope = actor.permissions?.scopes?.classroom || 'none'
    if (scope === 'all' || canManageAllContent(actor)) return data
    if (scope === 'own') {
      return data.filter((item) =>
        ownerVisible(actor, item, ['applicantId', 'applicant', 'ownerId']),
      )
    }
    return []
  }
  if (resource === 'dispatch') {
    return data.filter((item) =>
      ownerVisible(actor, item, ['actorId', 'ownerId', 'userId', 'userName']),
    )
  }
  if (resource === 'notifications') {
    return data.filter((item) =>
      ownerVisible(actor, item, ['ownerId', 'ownerUserId', 'recipientUserId', 'recipientName']),
    )
  }
  if (resource === 'lostfound') {
    return data.map((item) => {
      if (
        canManageAllContent(actor) ||
        isOwner(actor, item, ['ownerId', 'authorId', 'author', 'contact'])
      ) {
        return item
      }
      return {
        ...item,
        claims: (Array.isArray(item.claims) ? item.claims : []).filter(
          (claim) => claim.helperId && claim.helperId === actor.id,
        ),
      }
    })
  }
  return data
}

function filterSharedDocument(actor, document) {
  if (!document) return document
  return {
    ...document,
    data: filterSharedData(actor, document.resource, document.data),
    viewer: {
      userId: actor.id,
      roleKey: actor.roleKey,
      scope: actor.permissions?.scopes?.[document.resource] || 'shared',
    },
  }
}

function changedRecords(previous, incoming) {
  const before = new Map((previous || []).map((item) => [item?.id, item]))
  const after = new Map((incoming || []).map((item) => [item?.id, item]))
  return { before, after }
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isActorParticipant(actor, participant) {
  return Boolean(
    participant &&
      ((participant.userId && participant.userId === actor.id) ||
        (!participant.userId && participant.name === actor.name)),
  )
}

function inferRecordOwner(actor, item, resource) {
  let name = ''
  if (resource === 'forum') name = String(item.author || '').trim()
  if (resource === 'groupbuy') name = String(item.owner || '').trim()
  if (resource === 'lostfound') {
    name = String(item.author || item.owner || '').trim()
    if (!name && String(item.contact || '').includes('·')) {
      name = String(item.contact).split('·').pop().trim()
    }
  }
  if (resource === 'dispatch') name = String(item.userName || '').trim()
  if (name === actor.name || !name) {
    return {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      userId: actor.id,
    }
  }
  const user = repo.findActiveUserByName(name)
  if (user) {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      userId: user.id,
    }
  }
  return {
    id: `seed:${name}`,
    name,
    role: '学生',
    userId: '',
  }
}

function sanitizeGroupbuyParticipants(actor, previous = [], incoming = []) {
  const previousByKey = new Map(
    previous.map((participant) => [
      participant.userId || `name:${participant.name}`,
      participant,
    ]),
  )
  const incomingByKey = new Map(
    incoming.map((participant) => [
      participant.userId || `name:${participant.name}`,
      participant,
    ]),
  )
  const next = []
  for (const participant of previous) {
    const key = participant.userId || `name:${participant.name}`
    const replacement = incomingByKey.get(key)
    if (isActorParticipant(actor, participant)) {
      if (replacement) {
        next.push({
          ...participant,
          ...replacement,
          userId: actor.id,
          name: actor.name,
          count: Math.max(0, Number(replacement.count) || 0),
        })
      }
      continue
    }
    next.push(participant)
  }
  for (const participant of incoming) {
    const key = participant.userId || `name:${participant.name}`
    if (previousByKey.has(key) || !isActorParticipant(actor, participant)) continue
    next.push({
      ...participant,
      userId: actor.id,
      name: actor.name,
      count: Math.max(1, Number(participant.count) || 1),
    })
  }
  return next.filter((participant) => Number(participant.count) > 0)
}

function sanitizeForumReplies(actor, previous = [], incoming = []) {
  const previousById = new Map(previous.map((reply) => [reply.id, reply]))
  const incomingById = new Map(incoming.map((reply) => [reply.id, reply]))
  const next = []
  for (const reply of previous) {
    const ownsReply =
      (reply.authorId && reply.authorId === actor.id) ||
      (!reply.authorId && reply.author === actor.name)
    if (ownsReply) {
      const replacement = incomingById.get(reply.id)
      if (replacement) next.push({ ...reply, ...replacement, authorId: actor.id, author: actor.name })
      continue
    }
    const replacement = incomingById.get(reply.id)
    next.push(
      replacement
        ? {
            ...reply,
            likes: Number(replacement.likes) || 0,
            liked: Boolean(replacement.liked),
          }
        : reply,
    )
  }
  for (const reply of incoming) {
    if (previousById.has(reply.id)) continue
    next.push({
      ...reply,
      authorId: actor.id,
      author: actor.name,
      authorRole: actor.role,
    })
  }
  return next
}

function sanitizeForumInteraction(actor, previous, incoming) {
  const previousLikedBy = Array.isArray(previous.likedBy) ? previous.likedBy : []
  const incomingLikedBy = Array.isArray(incoming.likedBy) ? incoming.likedBy : previousLikedBy
  const hadLiked = previousLikedBy.includes(actor.name)
  const hasLiked = incomingLikedBy.includes(actor.name)
  const likedBy = previousLikedBy.filter((name) => name !== actor.name)
  if (hasLiked) likedBy.push(actor.name)
  const likes = Math.max(0, (Number(previous.likes) || 0) + Number(hasLiked) - Number(hadLiked))
  return {
    ...previous,
    replies: sanitizeForumReplies(actor, previous.replies || [], incoming.replies || []),
    likes,
    likedBy,
    views: Math.max(Number(previous.views) || 0, Number(incoming.views) || 0),
  }
}

function mergeHiddenRecords(current, incoming, shouldKeep) {
  if (!Array.isArray(current) || !Array.isArray(incoming)) return incoming
  const incomingIds = new Set(incoming.map((item) => item?.id).filter(Boolean))
  const hidden = current.filter((item) => item?.id && !incomingIds.has(item.id) && shouldKeep(item))
  return [...incoming, ...hidden]
}

function sanitizeClassroomMutation(actor, current, incoming) {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, 'INVALID_SHARED_DATA', '教室申请数据必须是数组')
  }
  const reviewAllowed = hasPermission(actor, 'classroom.review')
  const viewAll = actor.permissions?.scopes?.classroom === 'all' || reviewAllowed
  const { before } = changedRecords(current, incoming)
  const next = []
  for (const item of incoming) {
    const previous = item?.id ? before.get(item.id) : null
    if (!previous) {
      next.push({
        ...item,
        applicantId: actor.id,
        applicant: actor.name,
        status: reviewAllowed ? item.status || 'pending' : 'pending',
        reviewedAt: reviewAllowed ? item.reviewedAt || null : null,
      })
      continue
    }
    if (reviewAllowed || canManageAllContent(actor)) {
      next.push(item)
      continue
    }
    const ownsApplication = ownerVisible(actor, previous, ['applicantId', 'applicant', 'ownerId'])
    if (!ownsApplication) throw new HttpError(403, 'CLASSROOM_FORBIDDEN', '班委只能查看和取消自己的教室申请')
    if (!sameRecord(previous, item)) {
      const onlyCancelled =
        previous.status === 'pending' &&
        item.status === 'cancelled' &&
        item.roomId === previous.roomId &&
        item.date === previous.date &&
        item.start === previous.start &&
        item.end === previous.end
      if (!onlyCancelled) {
        throw new HttpError(403, 'CLASSROOM_REVIEW_REQUIRED', '教室申请审批需要管理员及以上角色')
      }
    }
    next.push({ ...previous, ...item, status: item.status })
  }
  return mergeHiddenRecords(current, next, () => true)
}

function sanitizeForumMutation(actor, current, incoming) {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, 'INVALID_SHARED_DATA', '论坛数据必须是数组')
  }
  const manageAll = canModerateForum(actor) || canManageAllContent(actor)
  const { before } = changedRecords(current, incoming)
  const next = []
  for (const item of incoming) {
    const previous = item?.id ? before.get(item.id) : null
    if (!previous) {
      const owner = inferRecordOwner(actor, item, 'forum')
      next.push({
        ...item,
        ownerId: owner.id,
        authorId: owner.userId,
        author: item.author || owner.name,
        authorRole: item.authorRole || owner.role,
      })
      continue
    }
    if (manageAll || ownerVisible(actor, previous, ['authorId', 'ownerId', 'author'])) {
      next.push(item)
      continue
    }
    next.push(sanitizeForumInteraction(actor, previous, item))
  }
  return mergeHiddenRecords(current, next, (item) => {
    return !manageAll && !ownerVisible(actor, item, ['authorId', 'ownerId', 'author'])
  })
}

function sanitizeOwnedMutation(actor, resource, current, incoming, interactionField) {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, 'INVALID_SHARED_DATA', '共享数据必须是数组')
  }
  const manageAll = canManageAllContent(actor)
  const { before } = changedRecords(current, incoming)
  const ownerFields = resource === 'lostfound'
    ? ['ownerId', 'authorId', 'author', 'contact']
    : ['ownerId', 'owner', 'authorId', 'author']
  const next = []
  for (const item of incoming) {
    const previous = item?.id ? before.get(item.id) : null
    if (!previous) {
      const owner = inferRecordOwner(actor, item, resource)
      next.push({
        ...item,
        ownerId: resource === 'dispatch' ? actor.id : owner.id,
        authorId: resource === 'dispatch' ? actor.id : owner.userId,
        owner: resource === 'groupbuy' ? item.owner || owner.name : item.owner,
        author: resource === 'lostfound' ? item.author || owner.name : item.author,
      })
      continue
    }
    if (manageAll || ownerVisible(actor, previous, ownerFields)) {
      next.push({
        ...previous,
        ...item,
        ownerId: previous.ownerId || item.ownerId,
        authorId: previous.authorId || item.authorId,
        author: previous.author || item.author,
      })
      continue
    }
    if (interactionField && Array.isArray(item[interactionField])) {
      const interactionValue = interactionField === 'participants'
        ? sanitizeGroupbuyParticipants(actor, previous.participants || [], item.participants)
        : item[interactionField]
      next.push({ ...previous, [interactionField]: interactionValue })
    } else {
      next.push(previous)
    }
  }
  return mergeHiddenRecords(current, next, (item) => {
    return !manageAll && !ownerVisible(actor, item, ownerFields)
  })
}

function sanitizeLostfoundClaims(actor, previousClaims = [], incomingClaims = []) {
  const previousById = new Map(previousClaims.map((claim) => [claim.id, claim]))
  const incomingById = new Map(incomingClaims.map((claim) => [claim.id, claim]))
  const next = []
  for (const claim of previousClaims) {
    const incoming = incomingById.get(claim.id)
    if (claim.helperId && claim.helperId === actor.id) {
      if (!incoming) continue
      const allowedStatuses =
        claim.kind === 'found_claim'
          ? claim.status === 'approved'
            ? ['approved', 'rewarded', 'claimed']
            : ['submitted', 'cancelled']
          : ['submitted', 'cancelled']
      next.push({
        ...claim,
        status: allowedStatuses.includes(incoming.status)
          ? incoming.status
          : claim.status,
        completedAt: incoming.completedAt || claim.completedAt || null,
        settledAmount:
          claim.kind === 'found_claim' && incoming.settledAmount != null
            ? Math.max(0, Number(incoming.settledAmount) || 0)
            : claim.settledAmount,
        updatedAt: nowIso(),
      })
      continue
    }
    next.push(claim)
  }
  for (const claim of incomingClaims) {
    if (previousById.has(claim.id)) continue
    next.push({
      ...claim,
      helperId: actor.id,
      helperName: actor.name,
      ...(claim.kind === 'found_claim' ? { claimantId: actor.id } : {}),
      status: 'submitted',
    })
  }
  return next
}

function sanitizeLostfoundMutation(actor, current, incoming) {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, 'INVALID_SHARED_DATA', '失物招领数据必须是数组')
  }
  const manageAll = canManageAllContent(actor)
  const { before } = changedRecords(current, incoming)
  const ownerFields = ['ownerId', 'authorId', 'author', 'contact']
  const next = []
  for (const item of incoming) {
    const previous = item?.id ? before.get(item.id) : null
    if (!previous) {
      const owner = inferRecordOwner(actor, item, 'lostfound')
      next.push({
        ...item,
        ownerId: owner.id,
        authorId: owner.userId,
        author: item.author || owner.name,
        claims: Array.isArray(item.claims) ? item.claims : [],
      })
      continue
    }
    if (manageAll || ownerVisible(actor, previous, ownerFields)) {
      next.push({
        ...previous,
        ...item,
        ownerId: previous.ownerId || item.ownerId,
        authorId: previous.authorId || item.authorId,
        author: previous.author || item.author,
      })
      continue
    }
    const sanitizedClaims = sanitizeLostfoundClaims(
      actor,
      Array.isArray(previous.claims) ? previous.claims : [],
      Array.isArray(item.claims) ? item.claims : previous.claims || [],
    )
    const previousClaimIds = new Set(
      (Array.isArray(previous.claims) ? previous.claims : []).map((claim) => claim.id),
    )
    const hasNewClaim = (Array.isArray(item.claims) ? item.claims : []).some(
      (claim) => claim?.id && !previousClaimIds.has(claim.id),
    )
    if (
      hasNewClaim &&
      ['resolved', 'claimed_pending'].includes(previous.status)
    ) {
      throw new HttpError(
        409,
        'LOSTFOUND_CLAIM_CLOSED',
        '该招领信息正在核验或已经完成，不能新增认领申请',
      )
    }
    const completedFoundClaim =
      item.status === 'resolved' &&
      claimantCompletedFoundClaim(previous, sanitizedClaims, actor)
    next.push({
      ...previous,
      claims: sanitizedClaims,
      ...(completedFoundClaim
        ? {
            status: 'resolved',
            resolvedAt: item.resolvedAt || nowIso(),
            claimedBy: actor.id,
          }
        : {}),
    })
  }
  return mergeHiddenRecords(current, next, (item) => {
    return !manageAll && !ownerVisible(actor, item, ownerFields)
  })
}

function claimantCompletedFoundClaim(previous, claims, actor) {
  const previousClaims = new Map(
    (Array.isArray(previous.claims) ? previous.claims : []).map((claim) => [
      claim.id,
      claim,
    ]),
  )
  return claims.some((claim) => {
    const before = previousClaims.get(claim.id)
    return Boolean(
      before &&
        before.kind === 'found_claim' &&
        before.claimantId === actor.id &&
        before.status === 'approved' &&
        ['rewarded', 'claimed'].includes(claim.status),
    )
  })
}

function sanitizeGroupbuyErrand(actor, previous, incoming) {
  if (!previous?.enabled) return previous
  if (!incoming?.enabled) return previous
  const immutable = {
    enabled: previous.enabled,
    tip: previous.tip,
    description: previous.description,
  }
  if (
    previous.status === 'open' &&
    incoming.status === 'accepted' &&
    incoming.runnerId === actor.id
  ) {
    return {
      ...previous,
      ...immutable,
      status: 'accepted',
      runnerId: actor.id,
      runnerName: actor.name,
      runnerContact: '站内联系',
      acceptedAt: incoming.acceptedAt || nowIso(),
      completedAt: null,
      confirmedAt: null,
      cancelledAt: null,
      cancelReason: '',
    }
  }
  if (previous.runnerId === actor.id) {
    if (previous.status === 'accepted' && incoming.status === 'delivered') {
      return {
        ...previous,
        ...immutable,
        status: 'delivered',
        completedAt: incoming.completedAt || nowIso(),
      }
    }
    if (previous.status === 'accepted' && incoming.status === 'open') {
      return {
        ...previous,
        ...immutable,
        status: 'open',
        runnerId: '',
        runnerName: '',
        runnerContact: '',
        acceptedAt: null,
        cancelReason: String(incoming.cancelReason || '').slice(0, 200),
      }
    }
  }
  return previous
}

function sanitizeGroupbuyMutation(actor, current, incoming) {
  if (!Array.isArray(incoming)) {
    throw new HttpError(422, 'INVALID_SHARED_DATA', '拼单数据必须是数组')
  }
  const manageAll = canManageAllContent(actor)
  const { before } = changedRecords(current, incoming)
  const ownerFields = ['ownerId', 'owner', 'authorId', 'author']
  const next = []
  for (const item of incoming) {
    const previous = item?.id ? before.get(item.id) : null
    if (!previous) {
      const owner = inferRecordOwner(actor, item, 'groupbuy')
      next.push({
        ...item,
        ownerId: owner.id,
        authorId: owner.userId,
        owner: item.owner || owner.name,
      })
      continue
    }
    if (manageAll || ownerVisible(actor, previous, ownerFields)) {
      next.push(item)
      continue
    }
    next.push({
      ...previous,
      participants: sanitizeGroupbuyParticipants(
        actor,
        previous.participants || [],
        Array.isArray(item.participants) ? item.participants : previous.participants || [],
      ),
      errand: sanitizeGroupbuyErrand(actor, previous.errand, item.errand),
    })
  }
  return mergeHiddenRecords(current, next, (item) => {
    return !manageAll && !ownerVisible(actor, item, ownerFields)
  })
}

function sanitizeSharedMutation(actor, resource, currentData, incomingData) {
  if (!Array.isArray(incomingData)) return incomingData
  const baseline = Array.isArray(currentData) ? currentData : []
  if (resource === 'classroom') {
    return sanitizeClassroomMutation(actor, baseline, incomingData)
  }
  if (resource === 'forum') {
    return sanitizeForumMutation(actor, baseline, incomingData)
  }
  if (resource === 'lostfound') {
    return sanitizeLostfoundMutation(actor, baseline, incomingData)
  }
  if (resource === 'groupbuy') {
    return sanitizeGroupbuyMutation(actor, baseline, incomingData)
  }
  if (resource === 'notifications') {
    return filterSharedData(actor, resource, incomingData)
  }
  if (resource === 'dispatch') {
    return sanitizeOwnedMutation(actor, resource, baseline, incomingData)
  }
  return incomingData
}

function ensureSharedDocumentSize(data) {
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8')
  if (size > MAX_SHARED_DOCUMENT_BYTES) {
    throw new HttpError(
      413,
      'SHARED_DOCUMENT_TOO_LARGE',
      `共享文档超过 ${Math.round(MAX_SHARED_DOCUMENT_BYTES / 1024 / 1024)}MB 上限，请将图片改为独立上传`,
      { size, limit: MAX_SHARED_DOCUMENT_BYTES },
    )
  }
}

function applySharedChanges(currentData, changes) {
  const current = Array.isArray(currentData) ? currentData : []
  const records = new Map(
    current.filter((item) => item?.id).map((item) => [item.id, item]),
  )
  for (const item of changes.upserts || []) {
    if (!item || typeof item !== 'object' || !item.id) {
      throw new HttpError(422, 'INVALID_SHARED_CHANGE', '增量记录必须包含 id')
    }
    records.set(item.id, item)
  }
  for (const id of changes.deletes || []) records.delete(String(id))
  const order = Array.isArray(changes.order)
    ? changes.order.map(String)
    : [...records.keys()]
  const ordered = []
  const seen = new Set()
  for (const id of order) {
    const item = records.get(id)
    if (!item || seen.has(id)) continue
    seen.add(id)
    ordered.push(item)
  }
  for (const [id, item] of records) {
    if (!seen.has(id)) ordered.push(item)
  }
  return ordered
}

function routePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/'
}

function normalizeClassroomDate(value) {
  const date = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(422, 'CLassROOM_DATE_INVALID', '借阅日期格式应为 YYYY-MM-DD')
  }
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(422, 'CLASSROOM_DATE_INVALID', '借阅日期无效')
  }
  const today = shanghaiDateString()
  if (date < today) {
    throw new HttpError(422, 'CLASSROOM_DATE_PAST', '不能申请过去的日期')
  }
  const maxDate = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10)
  if (date > maxDate) {
    throw new HttpError(422, 'CLASSROOM_DATE_TOO_FAR', '最多可申请未来一年内的教室')
  }
  return date
}

function normalizeClassroomTime(value, fieldName) {
  const time = String(value || '').trim()
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(422, 'CLASSROOM_TIME_INVALID', `${fieldName}格式应为 HH:mm`)
  }
  if (time < '07:00' || time > '22:00') {
    throw new HttpError(422, 'CLASSROOM_TIME_RANGE', `${fieldName}应位于 07:00–22:00 之间`)
  }
  return time
}

function shanghaiDateTime(date, time) {
  const value = new Date(`${date}T${time}:00+08:00`)
  if (Number.isNaN(value.getTime())) {
    throw new HttpError(422, 'CLASSROOM_DATETIME_INVALID', '借阅时段无效')
  }
  return value.toISOString()
}

function weekdayOf(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

function shanghaiDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function emitClassroomAvailability(event) {
  classroomAvailabilityVersion += 1
  const payload = {
    ...event,
    availabilityVersion: classroomAvailabilityVersion,
    occurredAt: nowIso(),
  }
  const message = `event: occupancy\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of classroomEventClients) {
    try {
      client.write(message)
    } catch {
      classroomEventClients.delete(client)
    }
  }
  return payload
}

function groupPickupCode(orderId, userId) {
  const digest = createHmac('sha256', SETTINGS_KEY)
    .update(`group-pickup:${orderId}:${userId}`)
    .digest('hex')
  const numeric = Number.parseInt(digest.slice(0, 12), 16) % 1_000_000
  return String(numeric).padStart(6, '0')
}

function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100)
}

function allocateCents(total, weights) {
  const normalized = weights.map((value) => Math.max(0, Number(value) || 0))
  const weightTotal = normalized.reduce((sum, value) => sum + value, 0)
  if (!normalized.length || weightTotal <= 0) return normalized.map(() => 0)
  const base = normalized.map((value) => Math.floor((total * value) / weightTotal))
  let remainder = total - base.reduce((sum, value) => sum + value, 0)
  for (let index = 0; index < base.length && remainder > 0; index += 1) {
    base[index] += 1
    remainder -= 1
  }
  return base
}

function ensureGroupbuyCommerce(item) {
  if (!item || typeof item !== 'object') return null
  const participants = Array.isArray(item.participants) ? item.participants : []
  const joinedCount = participants.reduce(
    (sum, participant) => sum + Math.max(1, Number(participant.count) || 1),
    0,
  )
  const targetCount = Math.max(2, Number(item.targetCount) || 2)
  const expired =
    item.deadline && new Date(item.deadline).getTime() <= Date.now()
  const defaultStatus = joinedCount >= targetCount
    ? 'formed'
    : expired
      ? 'expired'
      : 'recruiting'
  const current = item.commerce && typeof item.commerce === 'object'
    ? item.commerce
    : {}
  const rawDeliveryMode = String(current.deliveryMode || item.deliveryMode || 'central')
  const deliveryMode = ['self', 'central', 'dorm', 'proxy'].includes(rawDeliveryMode)
    ? rawDeliveryMode
    : 'central'
  const commerce = item.commerce && typeof item.commerce === 'object' ? item.commerce : {}
  Object.assign(commerce, {
    version: Math.max(2, Number(current.version) || 2),
    status: String(current.status || item.commerceStatus || defaultStatus),
    settlementMode: current.settlementMode === 'host_advance' ? 'host_advance' : 'escrow',
    deliveryMode,
    deliveryFee: Math.max(0, Number(current.deliveryFee ?? item.deliveryFee) || 0),
    serviceFeeBps: Math.max(0, Math.min(1000, Number(current.serviceFeeBps) || 0)),
    splitRunnerTip: current.splitRunnerTip !== false,
    paymentWindowMinutes: Math.max(5, Math.min(120, Number(current.paymentWindowMinutes) || 15)),
    formedAt: current.formedAt || null,
    fundedAt: current.fundedAt || null,
    purchasedAt: current.purchasedAt || null,
    shippedAt: current.shippedAt || null,
    readyAt: current.readyAt || null,
    completedAt: current.completedAt || null,
    purchaseReceipt: String(current.purchaseReceipt || ''),
    deliveryProof: String(current.deliveryProof || ''),
    quarantinedCents: Math.max(0, Math.round(Number(current.quarantinedCents) || 0)),
    cancellationReason: String(current.cancellationReason || ''),
  })
  item.commerce = commerce
  return commerce
}

function groupbuyMemberQuotes(item) {
  const commerce = ensureGroupbuyCommerce(item)
  const participants = (item.participants || []).filter(
    (participant) => Number(participant.count) > 0,
  )
  const quantities = participants.map((participant) => Math.max(1, Number(participant.count) || 1))
  const totalQuantity = quantities.reduce((sum, value) => sum + value, 0)
  const deliveryCents = toCents(commerce.deliveryFee)
  const deliveryShares = allocateCents(deliveryCents, quantities)
  const runnerTipCents = item.errand?.enabled && commerce.splitRunnerTip
    ? toCents(item.errand.tip)
    : 0
  const tipShares = allocateCents(runnerTipCents, quantities)
  const serviceBps = Number(commerce.serviceFeeBps) || 0
  const quotes = new Map()
  participants.forEach((participant, index) => {
    const quantity = quantities[index]
    const unitCents = toCents(item.unitPrice)
    const subtotalCents = unitCents * quantity
    const serviceCents = Math.round((subtotalCents * serviceBps) / 10_000)
    const amountCents = subtotalCents + deliveryShares[index] + tipShares[index] + serviceCents
    const key = participant.userId || `name:${participant.name}`
    quotes.set(key, {
      userId: participant.userId || '',
      name: participant.name,
      quantity,
      unitCents,
      subtotalCents,
      deliveryCents: deliveryShares[index],
      runnerTipCents: tipShares[index],
      serviceCents,
      amountCents,
    })
  })
  return quotes
}

function decorateGroupbuyOrder(item, actor) {
  const commerce = ensureGroupbuyCommerce(item)
  const participants = Array.isArray(item.participants) ? item.participants : []
  const quotes = groupbuyMemberQuotes(item)
  const payments = repo.listGroupPaymentOrders(item.id)
  const tickets = repo.listGroupPickupTickets(item.id)
  const ledger = repo.listGroupLedger(item.id)
  const dispute = repo.getOpenGroupDispute(item.id)
  const canManage = actor.id === item.ownerId || actor.roleLevel >= 80
  const viewerQuote = quotes.get(actor.id)
  const viewerPayments = payments.filter(
    (payment) => payment.userId === actor.id && !['released', 'failed'].includes(payment.status),
  )
  const viewerPaymentCents = viewerPayments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  )
  const viewerPaymentStatus = viewerPayments.some((payment) => payment.status === 'captured')
    ? 'captured'
    : viewerPayments.length
      ? 'authorized'
      : 'pending'
  const capturedCents = payments
    .filter((payment) => payment.status === 'captured')
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const requiredCents = [...quotes.values()].reduce(
    (sum, quote) => sum + quote.amountCents,
    0,
  )
  const requiredUsers = participants
    .map((participant) => participant.userId)
    .filter(Boolean)
  const capturedUsers = new Set(
    payments
      .filter((payment) => payment.status === 'captured')
      .map((payment) => payment.userId),
  )
  const allPaid = requiredUsers.every((userId) => capturedUsers.has(userId))
  const viewerTicket = tickets.find((ticket) => ticket.userId === actor.id) || null
  const publicTickets = canManage
    ? tickets.map((ticket) => ({
        ...ticket,
        code: '',
      }))
    : viewerTicket
      ? [{ ...viewerTicket, code: groupPickupCode(item.id, actor.id) }]
      : []
  return {
    ...item,
    commerce: {
      ...commerce,
      requiredCents,
      fundedCents: capturedCents,
      allPaid,
      participantCount: participants.length,
      redeemedCount: tickets.filter((ticket) => ticket.status === 'redeemed').length,
      ticketCount: tickets.length,
    },
    participantQuotes: canManage
      ? participants.map((participant) => {
          const quote = quotes.get(participant.userId || `name:${participant.name}`)
          return {
            userId: participant.userId || '',
            name: participant.name,
            count: Number(participant.count) || 1,
            amountCents: quote?.amountCents || 0,
          }
        })
      : undefined,
    paymentSummary: canManage
      ? payments.map((payment) => ({
          ...payment,
          pickupStatus:
            tickets.find((ticket) => ticket.userId === payment.userId)?.status || 'pending',
        }))
      : undefined,
    pickupTickets: publicTickets,
    ledgerSummary: canManage ? ledger : undefined,
    dispute,
    viewer: {
      isOwner: actor.id === item.ownerId,
      isParticipant: Boolean(viewerQuote),
      quantity: viewerQuote?.quantity || 0,
      paymentStatus: viewerPaymentStatus,
      payableCents: viewerQuote?.amountCents || 0,
      paymentCents: viewerPaymentCents,
      pickupTicket: viewerTicket
        ? {
            ...viewerTicket,
            code:
              viewerTicket.status === 'pending'
                ? groupPickupCode(item.id, actor.id)
                : '',
          }
        : null,
    },
  }
}

function normalizeWatchCriteria(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, 'WATCH_CRITERIA_INVALID', '留意条件格式无效')
  }
  const output = {}
  for (const key of ['item', 'category', 'color', 'place', 'time', 'description']) {
    output[key] = String(value[key] || '').trim().slice(0, 100)
  }
  if (!output.item && !output.description) {
    throw new HttpError(422, 'WATCH_ITEM_REQUIRED', '请至少填写物品名称或特征描述')
  }
  return output
}

function lostfoundWatchScore(criteria, post) {
  const item = String(criteria.item || '').trim()
  const text = `${post.item || ''} ${post.title || ''} ${post.description || ''} ${(
    post.tags || []
  ).join(' ')}`.toLowerCase()
  let score = 0
  const reasons = []
  if (item && text.includes(item.toLowerCase())) {
    score += 45
    reasons.push('物品名称一致')
  } else if (criteria.description) {
    const tokens = String(criteria.description)
      .toLowerCase()
      .split(/[\s，。,.;；]+/)
      .filter((token) => token.length >= 2)
    const hits = tokens.filter((token) => text.includes(token)).length
    if (hits) {
      score += Math.min(35, hits * 10)
      reasons.push('特征描述相近')
    }
  }
  if (criteria.category && post.category === criteria.category) {
    score += 20
    reasons.push('类别一致')
  }
  if (criteria.color && `${post.color || ''} ${text}`.includes(criteria.color)) {
    score += 15
    reasons.push('颜色一致')
  }
  if (criteria.place && `${post.place || ''}`.includes(criteria.place)) {
    score += 15
    reasons.push('地点相近')
  }
  if (criteria.time && `${post.timeText || ''}`.includes(criteria.time)) {
    score += 5
    reasons.push('时间相近')
  }
  return { score: Math.min(100, score), reasons }
}

let classroomMigrationDone = false

function migrateClassroomApplications() {
  if (classroomMigrationDone) return
  classroomMigrationDone = true
  const document = repo.getSharedDocument('classroom')
  const records = Array.isArray(document?.data) ? document.data : []
  for (const item of records) {
    if (!item?.id || !ROOMS_BY_ID.has(item.roomId)) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) continue
    if (!/^\d{2}:\d{2}$/.test(String(item.start || ''))) continue
    if (!/^\d{2}:\d{2}$/.test(String(item.end || ''))) continue
    const room = ROOMS_BY_ID.get(item.roomId)
    const startsAt = shanghaiDateTime(item.date, item.start)
    const endsAt = shanghaiDateTime(item.date, item.end)
    if (endsAt <= startsAt) continue
    try {
      repo.createClassroomApplication({
        id: item.id,
        room,
        date: item.date,
        day: weekdayOf(item.date),
        start: item.start,
        end: item.end,
        startsAt,
        endsAt,
        purpose: String(item.purpose || '教室借用').slice(0, 80),
        people: Math.max(0, Math.min(500, Number(item.people) || 0)),
        applicantId: item.applicantId || 'u_monitor_chen',
        applicantName: item.applicant || '陈子昂',
        contact: String(item.contact || '站内联系').slice(0, 80),
        note: String(item.note || '').slice(0, 500),
        aiReason: String(item.aiReason || '历史申请已迁移').slice(0, 500),
        blockId: `blk_migrated_${item.id}`,
        idempotencyKey: `migrate_${item.id}`,
        holdExpiresAt: new Date(
          Math.max(Date.now() + 60_000, new Date(item.createdAt || Date.now()).getTime() + 86_400_000),
        ).toISOString(),
        initialStatus: item.status === 'approved' ? 'approved' : 'pending',
      })
    } catch (error) {
      console.warn('[classroom] failed to migrate application', item.id, error?.message)
    }
  }
}

async function handleApi(req, res, url) {
  const pathname = routePath(url.pathname)
  const method = req.method || 'GET'

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'GET' && pathname === '/api/health') {
    sendSuccess(res, {
      status: 'ok',
      service: 'campus-smart-dispatch-platform-api',
      version: '1.3.0',
      database: repo.health(),
      time: new Date().toISOString(),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/auth/demo-accounts') {
    sendSuccess(res, {
      accounts: repo.listLoginAccounts(),
      studentNumbers: repo.getStudentNumberState(),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/auth/next-number') {
    sendSuccess(res, repo.getStudentNumberState())
    return
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    checkLoginRate(req)
    const body = await readJson(req)
    const name = normalizeName(body.name)
    const studentNo = normalizeStudentNo(body.studentNo)
    const password = normalizeLoginPassword(body.password)

    const user = repo.getUserByStudentNo(studentNo)
    if (!user) await invalidCredentials()
    if (user.name !== name) await invalidCredentials()
    const credential = repo.getPasswordCredential(user.id)
    if (!credential || !verifyPassword(password, credential.password_hash)) {
      await invalidCredentials()
    }

    if (user.status === 'disabled') {
      throw new HttpError(403, 'ACCOUNT_DISABLED', '该账号已停用，请联系管理员')
    }
    if (user.status === 'pending') {
      throw new HttpError(403, 'ACCOUNT_PENDING', '该账号正在等待管理员审核')
    }

    repo.addAuditLog({
      actorUserId: user.id,
      action: '登录演示系统',
      targetType: 'session',
      targetId: user.id,
      detail: { roleKey: user.roleKey, source: user.source },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, issueSession(req, user))
    return
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    checkLoginRate(req)
    const body = await readJson(req)
    const name = normalizeName(body.name)
    const password = normalizeNewPassword(body.password)
    const requiredCode = String(process.env.REGISTRATION_CODE || '').trim()
    if (requiredCode && String(body.registrationCode || '').trim() !== requiredCode) {
      throw new HttpError(403, 'REGISTRATION_CODE_INVALID', '注册邀请码无效')
    }
    if (repo.findActiveUserByName(name)) {
      throw new HttpError(409, 'NAME_TAKEN', '该姓名已被使用，请换一个姓名或联系管理员')
    }
    let created
    try {
      created = repo.createCustomUser({ name, password })
    } catch (error) {
      if (error?.code === 'NAME_TAKEN') {
        throw new HttpError(409, 'NAME_TAKEN', '该姓名已被使用，请换一个姓名或联系管理员')
      }
      throw error
    }
    if (!created?.user) {
      throw new HttpError(500, 'CREATE_USER_FAILED', '创建演示账号失败')
    }
    repo.addAuditLog({
      actorUserId: created.user.id,
      action: '创建人物并分配学号',
      targetType: 'user',
      targetId: created.user.id,
      detail: {
        name: created.user.name,
        studentNo: created.user.studentNo,
        roleKey: created.user.roleKey,
        nextStudentNo: created.nextStudentNo,
      },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, {
      user: created.user,
      nextStudentNo: created.nextStudentNo,
      studentNumbers: repo.getStudentNumberState(),
      accounts: repo.listLoginAccounts(),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = authenticate(req)
    sendSuccess(res, { user })
    return
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = bearerToken(req)
    if (token) repo.deleteSession(token)
    sendSuccess(res, { loggedOut: true })
    return
  }

  if (method === 'GET' && pathname === '/api/classroom/events') {
    const actor = authenticate(req, String(url.searchParams.get('token') || ''))
    requirePermission(actor, 'classroom.apply')
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(
      `event: ready\ndata: ${JSON.stringify({
        availabilityVersion: classroomAvailabilityVersion,
        connectedAt: nowIso(),
      })}\n\n`,
    )
    classroomEventClients.add(res)
    const heartbeat = setInterval(() => {
      if (!classroomEventClients.has(res)) return
      res.write(`event: ping\ndata: ${JSON.stringify({ time: nowIso() })}\n\n`)
    }, 20_000)
    req.on('close', () => {
      clearInterval(heartbeat)
      classroomEventClients.delete(res)
    })
    return
  }

  if (method === 'GET' && pathname === '/api/classroom/availability') {
    const actor = authenticate(req)
    requirePermission(actor, 'classroom.apply')
    migrateClassroomApplications()
    const today = shanghaiDateString()
    const from = normalizeClassroomDate(url.searchParams.get('from') || today)
    const defaultTo = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const to = normalizeClassroomDate(url.searchParams.get('to') || defaultTo)
    if (to < from) {
      throw new HttpError(422, 'CLASSROOM_RANGE_INVALID', '结束日期不能早于开始日期')
    }
    const span = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000
    if (span > 90) {
      throw new HttpError(422, 'CLASSROOM_RANGE_TOO_LARGE', '单次最多查询 90 天的教室占用')
    }
    const blocks = repo.listRoomBlocks(
      shanghaiDateTime(from, '00:00'),
      shanghaiDateTime(to, '23:59'),
    )
    const courseBlocks = []
    const cursor = new Date(`${from}T00:00:00Z`)
    const endDate = new Date(`${to}T00:00:00Z`)
    while (cursor <= endDate) {
      const date = cursor.toISOString().slice(0, 10)
      const dayOfWeek = weekdayOf(date)
      for (const room of campusClassrooms) {
        for (const busy of room.busy || []) {
          if (Number(busy.day) !== dayOfWeek) continue
          courseBlocks.push({
            id: `course:${room.id}:${date}:${busy.start}:${busy.end}`,
            roomId: room.id,
            sourceType: 'course',
            sourceId: `${room.id}:${dayOfWeek}:${busy.start}:${busy.end}`,
            startsAt: shanghaiDateTime(date, busy.start),
            endsAt: shanghaiDateTime(date, busy.end),
            status: 'active',
            metadata: {
              label: busy.label || '课程安排',
              roomCode: room.code,
              building: room.building,
            },
            version: 1,
          })
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    sendSuccess(res, {
      from,
      to,
      availabilityVersion: classroomAvailabilityVersion,
      blocks: [...courseBlocks, ...blocks],
    })
    return
  }

  if (method === 'GET' && pathname === '/api/classroom/applications') {
    const actor = authenticate(req)
    requirePermission(actor, 'classroom.apply')
    migrateClassroomApplications()
    sendSuccess(res, { applications: repo.listClassroomApplications(actor) })
    return
  }

  if (method === 'POST' && pathname === '/api/classroom/applications') {
    const actor = authenticate(req)
    requirePermission(actor, 'classroom.apply')
    migrateClassroomApplications()
    const body = await readJson(req)
    const room = ROOMS_BY_ID.get(String(body.roomId || ''))
    if (!room) throw new HttpError(404, 'CLASSROOM_NOT_FOUND', '教室不存在')
    const date = normalizeClassroomDate(body.date)
    const start = normalizeClassroomTime(body.start, '开始时间')
    const end = normalizeClassroomTime(body.end, '结束时间')
    if (end <= start) {
      throw new HttpError(422, 'CLASSROOM_TIME_ORDER', '结束时间必须晚于开始时间')
    }
    const durationMinutes =
      (new Date(`2000-01-01T${end}:00Z`) - new Date(`2000-01-01T${start}:00Z`)) / 60_000
    if (durationMinutes > 15 * 60) {
      throw new HttpError(422, 'CLASSROOM_DURATION_TOO_LONG', '单次借用不能超过 15 小时')
    }
    const purpose = String(body.purpose || '').trim().slice(0, 80)
    if (purpose.length < 2) {
      throw new HttpError(422, 'CLASSROOM_PURPOSE_REQUIRED', '请填写借用用途')
    }
    const people = Math.max(0, Math.min(500, Math.round(Number(body.people) || 0)))
    if (room.capacity && people > room.capacity) {
      throw new HttpError(422, 'CLASSROOM_CAPACITY_EXCEEDED', `该教室最多容纳 ${room.capacity} 人`)
    }
    const idempotencyKey = String(body.idempotencyKey || '').trim().slice(0, 100)
    if (!idempotencyKey) {
      throw new HttpError(422, 'IDEMPOTENCY_KEY_REQUIRED', '缺少请求幂等键')
    }
    const createReplay = repo.getGroupActionReceipt(idempotencyKey, actor.id)
    if (createReplay?.result?.orderId) {
      const document = repo.getSharedDocument('groupbuy')
      const existing = (document?.data || []).find(
        (entry) => entry.id === createReplay.result.orderId,
      )
      if (existing) {
        sendSuccess(res, {
          item: decorateGroupbuyOrder(existing, actor),
          version: Number(document.version) || 0,
          replayed: true,
        })
        return
      }
    }
    const startsAt = shanghaiDateTime(date, start)
    const endsAt = shanghaiDateTime(date, end)
    const dayOfWeek = weekdayOf(date)
    const courseConflict = (room.busy || []).find(
      (block) =>
        Number(block.day) === dayOfWeek &&
        block.start < end &&
        block.end > start,
    )
    if (courseConflict) {
      throw new HttpError(
        409,
        'ROOM_TIME_CONFLICT',
        `该时段已有课程安排：${courseConflict.start}–${courseConflict.end}`,
        {
          conflictingBlock: {
            roomId: room.id,
            sourceType: 'course',
            start: courseConflict.start,
            end: courseConflict.end,
            label: courseConflict.label || '课程安排',
          },
        },
      )
    }
    const id = `ap_${randomUUID()}`
    const result = repo.createClassroomApplication({
      id,
      room,
      date,
      day: dayOfWeek,
      start,
      end,
      startsAt,
      endsAt,
      purpose,
      people,
      applicantId: actor.id,
      applicantName: actor.name,
      contact: String(body.contact || '站内联系').trim().slice(0, 80) || '站内联系',
      note: String(body.note || '').trim().slice(0, 500),
      aiReason:
        String(body.aiReason || '').trim().slice(0, 500) ||
        `${room.building} ${room.code} · ${date} ${start}–${end} 已通过服务端时段校验`,
      blockId: `blk_${randomUUID()}`,
      idempotencyKey,
      holdExpiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    })
    if (result.conflict) {
      const conflictDate = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(result.block.startsAt))
      const conflictEnd = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(result.block.endsAt))
      throw new HttpError(
        409,
        'ROOM_TIME_CONFLICT',
        `该时段已被占用（${result.block.status === 'tentative' ? '审核中' : '已批准'}）：${conflictDate}–${conflictEnd}`,
        { conflictingBlock: result.block },
      )
    }
    const emitted = emitClassroomAvailability({
      roomId: room.id,
      date,
      start,
      end,
      sourceId: result.application.id,
      status: 'tentative',
      action: result.existing ? 'idempotent-replay' : 'submitted',
    })
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '提交教室借用申请',
      targetType: 'classroom_application',
      targetId: result.application.id,
      detail: { roomId: room.id, date, start, end, purpose },
      ipAddress: clientIp(req),
    })
    sendSuccess(
      res,
      {
        application: result.application,
        existing: result.existing,
        availabilityVersion: emitted.availabilityVersion,
      },
      result.existing ? 200 : 201,
    )
    return
  }

  const classroomReviewMatch = pathname.match(
    /^\/api\/classroom\/applications\/([^/]+)\/review$/,
  )
  if (method === 'POST' && classroomReviewMatch) {
    const actor = authenticate(req)
    requirePermission(actor, 'classroom.review', '只有管理员可以审核教室申请')
    const id = decodeURIComponent(classroomReviewMatch[1])
    const body = await readJson(req)
    const action = String(body.action || '')
    if (!['approve', 'reject'].includes(action)) {
      throw new HttpError(422, 'CLASSROOM_REVIEW_ACTION_INVALID', '审核动作无效')
    }
    const reason = String(body.reason || '').trim().slice(0, 500)
    const result = repo.closeClassroomApplication(
      id,
      actor,
      action === 'approve' ? 'approved' : 'rejected',
      reason,
      true,
    )
    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        throw new HttpError(404, 'CLASSROOM_APPLICATION_NOT_FOUND', '教室申请不存在')
      }
      throw new HttpError(409, 'CLASSROOM_APPLICATION_NOT_PENDING', '该申请已被处理')
    }
    const app = result.application
    const emitted = emitClassroomAvailability({
      roomId: app.roomId,
      date: app.date,
      start: app.start,
      end: app.end,
      sourceId: app.id,
      status: action === 'approve' ? 'active' : 'released',
      action: action === 'approve' ? 'approved' : 'rejected',
    })
    repo.createNotification({
      ownerUserId: app.applicantId,
      actorUserId: actor.id,
      type: 'status',
      title: action === 'approve' ? '教室申请已通过' : '教室申请未通过',
      content:
        action === 'approve'
          ? `${app.building} ${app.roomCode} · ${app.date} ${app.start}–${app.end} 已通过审核。`
          : `${app.building} ${app.roomCode} · ${app.date} ${app.start}–${app.end}：${reason || '未通过审核'}`,
      link: `/classroom/status/${app.id}`,
      important: action === 'approve',
      sourceType: 'classroom',
      sourceId: app.id,
    })
    repo.addAuditLog({
      actorUserId: actor.id,
      action: action === 'approve' ? '通过教室申请' : '驳回教室申请',
      targetType: 'classroom_application',
      targetId: app.id,
      detail: { reason },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, {
      application: app,
      availabilityVersion: emitted.availabilityVersion,
    })
    return
  }

  const classroomCancelMatch = pathname.match(
    /^\/api\/classroom\/applications\/([^/]+)\/cancel$/,
  )
  if (method === 'POST' && classroomCancelMatch) {
    const actor = authenticate(req)
    requirePermission(actor, 'classroom.apply')
    const id = decodeURIComponent(classroomCancelMatch[1])
    const body = await readJson(req)
    const result = repo.closeClassroomApplication(
      id,
      actor,
      'cancelled',
      String(body.reason || '申请人取消').trim().slice(0, 500),
      false,
    )
    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        throw new HttpError(404, 'CLASSROOM_APPLICATION_NOT_FOUND', '教室申请不存在')
      }
      if (result.code === 'FORBIDDEN') {
        throw new HttpError(403, 'CLASSROOM_CANCEL_FORBIDDEN', '只能取消自己的教室申请')
      }
      if (result.code === 'ALREADY_ENDED') {
        throw new HttpError(409, 'CLASSROOM_ALREADY_ENDED', '该借用时段已经结束')
      }
      throw new HttpError(409, 'CLASSROOM_CANNOT_CANCEL', '该申请当前不能取消')
    }
    const app = result.application
    const emitted = emitClassroomAvailability({
      roomId: app.roomId,
      date: app.date,
      start: app.start,
      end: app.end,
      sourceId: app.id,
      status: 'released',
      action: 'cancelled',
    })
    sendSuccess(res, {
      application: app,
      availabilityVersion: emitted.availabilityVersion,
    })
    return
  }

  if (method === 'GET' && pathname === '/api/lostfound/watches') {
    const actor = authenticate(req)
    requirePermission(actor, 'lostfound.use')
    sendSuccess(res, { watches: repo.listLostfoundWatches(actor.id) })
    return
  }

  if (method === 'POST' && pathname === '/api/lostfound/watches') {
    const actor = authenticate(req)
    requirePermission(actor, 'lostfound.use')
    const body = await readJson(req)
    const criteria = normalizeWatchCriteria(body.criteria)
    const requestedDays = Math.max(1, Math.min(90, Number(body.days) || 30))
    const watch = repo.createLostfoundWatch({
      id: `watch_${randomUUID()}`,
      userId: actor.id,
      criteria,
      expiresAt: new Date(Date.now() + requestedDays * 86_400_000).toISOString(),
    })
    sendSuccess(res, { watch }, 201)
    return
  }

  const lostWatchMatch = pathname.match(/^\/api\/lostfound\/watches\/([^/]+)$/)
  if (method === 'DELETE' && lostWatchMatch) {
    const actor = authenticate(req)
    requirePermission(actor, 'lostfound.use')
    const closed = repo.closeLostfoundWatch(
      decodeURIComponent(lostWatchMatch[1]),
      actor.id,
    )
    if (!closed) throw new HttpError(404, 'WATCH_NOT_FOUND', '留意任务不存在或已经关闭')
    sendSuccess(res, { closed: true })
    return
  }

  if (method === 'POST' && pathname === '/api/lostfound/watches/match') {
    const actor = authenticate(req)
    requirePermission(actor, 'lostfound.use')
    const body = await readJson(req)
    const document = repo.getSharedDocument('lostfound')
    const posts = Array.isArray(document?.data) ? document.data : []
    const post = posts.find((item) => item.id === String(body.postId || ''))
    if (!post || post.type !== 'found') {
      throw new HttpError(404, 'FOUND_POST_NOT_FOUND', '招领信息不存在')
    }
    const matches = []
    for (const watch of repo.listActiveLostfoundWatches()) {
      if (watch.userId === post.ownerId || watch.userId === post.authorId) continue
      const scored = lostfoundWatchScore(watch.criteria, post)
      if (scored.score < 60) continue
      const notification = repo.createNotification({
        ownerUserId: watch.userId,
        actorUserId: actor.id,
        type: 'match',
        title: `发现可能匹配的招领信息（${scored.score}%）`,
        content: `「${post.title}」${scored.reasons.length ? `：${scored.reasons.join('、')}` : ''}`,
        link: `/lostfound?found=${encodeURIComponent(post.id)}`,
        important: scored.score >= 80,
        sourceType: 'lostfound',
        sourceId: post.id,
      })
      if (scored.score >= 80) repo.closeLostfoundWatch(watch.id, watch.userId)
      matches.push({
        watchId: watch.id,
        score: scored.score,
        reasons: scored.reasons,
        notificationId: notification?.id || '',
      })
    }
    sendSuccess(res, { matches })
    return
  }

  if (method === 'GET' && pathname === '/api/groupbuy/orders') {
    const actor = authenticate(req)
    requirePermission(actor, 'groupbuy.use')
    const document = repo.getSharedDocument('groupbuy')
    const items = Array.isArray(document?.data) ? document.data : []
    sendSuccess(res, {
      items: items.map((item) => decorateGroupbuyOrder(item, actor)),
      version: Number(document?.version) || 0,
    })
    return
  }

  if (method === 'POST' && pathname === '/api/groupbuy/orders') {
    const actor = authenticate(req)
    requirePermission(actor, 'groupbuy.use')
    const body = await readJson(req)
    const product = String(body.product || '').trim().slice(0, 80)
    const title = String(body.title || `${product}拼单`).trim().slice(0, 80)
    const pickup = String(body.pickup || '').trim().slice(0, 80)
    const unitPrice = Number(body.unitPrice)
    const targetCount = Math.round(Number(body.targetCount))
    const myCount = Math.round(Number(body.myCount) || 1)
    const deadline = new Date(body.deadline)
    if (title.length < 2 || !product) {
      throw new HttpError(422, 'GROUPBUY_TITLE_REQUIRED', '请填写拼单标题和商品')
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0.01 || unitPrice > 9999) {
      throw new HttpError(422, 'GROUPBUY_PRICE_INVALID', '单价应在 0.01–9999 元之间')
    }
    if (!Number.isFinite(targetCount) || targetCount < 2 || targetCount > 999) {
      throw new HttpError(422, 'GROUPBUY_TARGET_INVALID', '目标份数应在 2–999 之间')
    }
    if (myCount < 1 || myCount > targetCount) {
      throw new HttpError(422, 'GROUPBUY_QUANTITY_INVALID', '发起人份数无效')
    }
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now() + 5 * 60_000) {
      throw new HttpError(422, 'GROUPBUY_DEADLINE_INVALID', '截止时间至少应晚于当前时间 5 分钟')
    }
    if (deadline.getTime() > Date.now() + 30 * 86_400_000) {
      throw new HttpError(422, 'GROUPBUY_DEADLINE_TOO_FAR', '拼单截止时间最多设置 30 天')
    }
    if (!pickup) throw new HttpError(422, 'GROUPBUY_PICKUP_REQUIRED', '请填写取货点')
    const id = `gb_${randomUUID()}`
    const idempotencyKey = String(body.idempotencyKey || '').trim().slice(0, 100)
    if (!idempotencyKey) {
      throw new HttpError(422, 'IDEMPOTENCY_KEY_REQUIRED', '缺少请求幂等键')
    }
    const deliveryMode = ['self', 'central', 'dorm', 'proxy'].includes(body.deliveryMode)
      ? body.deliveryMode
      : 'central'
    const deliveryFee = Math.max(0, Math.min(500, Number(body.deliveryFee) || 0))
    const errandEnabled = Boolean(body.errandEnabled)
    const errandTip = Math.max(0, Math.min(500, Number(body.errandTip) || 0))
    if (errandEnabled && errandTip <= 0) {
      throw new HttpError(422, 'GROUPBUY_ERRAND_TIP_INVALID', '跑腿小费必须大于 0')
    }
    const item = {
      id,
      title,
      product,
      category: String(body.category || '其他').trim().slice(0, 30) || '其他',
      unitPrice: Math.round(unitPrice * 100) / 100,
      targetCount,
      participants: [{
        name: actor.name,
        userId: actor.id,
        count: myCount,
        at: nowIso(),
      }],
      deadline: deadline.toISOString(),
      pickup,
      owner: actor.name,
      ownerId: actor.id,
      note: String(body.note || '').trim().slice(0, 500),
      tone: ['brand', 'teal', 'amber', 'coral', 'slate'].includes(body.tone)
        ? body.tone
        : 'brand',
      createdAt: nowIso(),
      notice: String(body.notice || '').trim().slice(0, 500),
      commerce: {
        version: 2,
        status: 'recruiting',
        settlementMode: body.settlementMode === 'host_advance' ? 'host_advance' : 'escrow',
        deliveryMode,
        deliveryFee,
        serviceFeeBps: 0,
        splitRunnerTip: true,
        paymentWindowMinutes: 15,
        formedAt: null,
        fundedAt: null,
        purchasedAt: null,
        shippedAt: null,
        readyAt: null,
        completedAt: null,
      },
      errand: errandEnabled
        ? {
            enabled: true,
            tip: errandTip,
            description: String(body.errandDescription || '').trim().slice(0, 300),
            status: 'open',
            runnerId: '',
            runnerName: '',
            acceptedAt: null,
            completedAt: null,
            confirmedAt: null,
            cancelledAt: null,
            cancelReason: '',
          }
        : {
            enabled: false,
            tip: 0,
            description: '',
            status: 'none',
          },
    }
    if (!item.errand.description && errandEnabled) {
      throw new HttpError(422, 'GROUPBUY_ERRAND_DESCRIPTION_REQUIRED', '请填写跑腿任务说明')
    }
    const mutation = repo.mutateSharedDocument('groupbuy', actor.id, (data) => {
      if (!Array.isArray(data)) data = []
      const duplicate = data.find((entry) => entry.id === id)
      if (duplicate) throw new HttpError(409, 'GROUPBUY_DUPLICATE', '拼单已存在')
      data.unshift(item)
      const quote = groupbuyMemberQuotes(item).get(actor.id)
      repo.syncGroupPaymentTotal(
        id,
        actor.id,
        quote?.amountCents || 0,
        `create:${actor.id}:${id}`,
      )
      const authorized = repo
        .listGroupPaymentOrders(id)
        .find((payment) => payment.userId === actor.id && payment.status === 'authorized')
      if (authorized) {
        repo.addGroupLedgerEntry({
          id: `ledger_${randomUUID()}`,
          orderId: id,
          userId: actor.id,
          entryType: 'authorization',
          amountCents: authorized.amountCents,
          idempotencyKey: `authorization:${authorized.id}`,
          detail: { mode: 'demo_escrow' },
        })
      }
      repo.saveGroupActionReceipt({
        idempotencyKey,
        orderId: id,
        userId: actor.id,
        action: 'create',
        result: { orderId: id },
      })
      return { orderId: id }
    })
    const created = mutation.data.find((entry) => entry.id === id)
    sendSuccess(
      res,
      { item: decorateGroupbuyOrder(created, actor), version: mutation.version },
      201,
    )
    return
  }

  const groupbuyActionMatch = pathname.match(/^\/api\/groupbuy\/([^/]+)\/actions$/)
  if (method === 'POST' && groupbuyActionMatch) {
    const actor = authenticate(req)
    requirePermission(actor, 'groupbuy.use')
    const orderId = decodeURIComponent(groupbuyActionMatch[1])
    const body = await readJson(req)
    const action = String(body.action || '').trim()
    const idempotencyKey = String(body.idempotencyKey || '').trim().slice(0, 100)
    if (!action || !idempotencyKey) {
      throw new HttpError(422, 'GROUPBUY_ACTION_INVALID', '缺少操作类型或幂等键')
    }
    const replay = repo.getGroupActionReceipt(idempotencyKey, actor.id)
    if (replay) {
      if (replay.result?.removed) {
        sendSuccess(res, { removed: true, replayed: true })
        return
      }
      const document = repo.getSharedDocument('groupbuy')
      const current = (document?.data || []).find((entry) => entry.id === orderId)
      if (!current) throw new HttpError(404, 'GROUPBUY_NOT_FOUND', '拼单不存在')
      sendSuccess(res, {
        item: decorateGroupbuyOrder(current, actor),
        replayed: true,
      })
      return
    }
    const mutation = repo.mutateSharedDocument('groupbuy', actor.id, (data) => {
      if (!Array.isArray(data)) {
        throw new HttpError(500, 'GROUPBUY_DATA_INVALID', '拼单数据格式异常')
      }
      const insideReplay = repo.getGroupActionReceipt(idempotencyKey, actor.id)
      if (insideReplay) return { orderId, replayed: true }
      const item = data.find((entry) => entry.id === orderId)
      if (!item) throw new HttpError(404, 'GROUPBUY_NOT_FOUND', '拼单不存在')
      const commerce = ensureGroupbuyCommerce(item)
      const owner = item.ownerId === actor.id || item.owner === actor.name
      const manageAll = actor.roleLevel >= 80
      const participant = (item.participants || []).find(
        (entry) => entry.userId === actor.id || entry.name === actor.name,
      )
      const notify = []
      const now = nowIso()
      const requireOwner = () => {
        if (!owner && !manageAll) {
          throw new HttpError(403, 'GROUPBUY_OWNER_REQUIRED', '只有发起人可以执行该操作')
        }
      }
      const requireParticipant = () => {
        if (!participant && !owner && !manageAll) {
          throw new HttpError(403, 'GROUPBUY_PARTICIPANT_REQUIRED', '只有参与成员可以执行该操作')
        }
      }
      const recalc = () => {
        const quotes = groupbuyMemberQuotes(item)
        for (const [key, quote] of quotes) {
          if (!quote.userId) continue
          repo.syncGroupPaymentTotal(
            orderId,
            quote.userId,
            quote.amountCents,
            `quote:${orderId}:${quote.userId}:${commerce.status}:${item.participants.length}`,
          )
        }
        return quotes
      }
      const joinedQuantity = () =>
        (item.participants || []).reduce(
          (sum, entry) => sum + Math.max(1, Number(entry.count) || 1),
          0,
        )
      const captureFormation = ({ capture = commerce.settlementMode === 'escrow' } = {}) => {
        recalc()
        const captured = capture ? repo.captureGroupPayments(orderId) : []
        for (const payment of captured) {
          repo.addGroupLedgerEntry({
            id: `ledger_${randomUUID()}`,
            orderId,
            userId: payment.userId,
            entryType: 'escrow_capture',
            amountCents: payment.amountCents,
            idempotencyKey: `capture:${orderId}:${payment.id}`,
            detail: { mode: commerce.settlementMode },
          })
        }
        const participantIds = (item.participants || [])
          .map((entry) => entry.userId)
          .filter((userId) => Boolean(userId) && userId !== item.ownerId)
        repo.ensureGroupPickupTickets(orderId, participantIds)
        commerce.formedAt ||= now
        if (capture) {
          commerce.status = 'funded'
          commerce.fundedAt ||= now
        } else {
          commerce.status = 'formed'
        }
      }
      if (action === 'join') {
        if (commerce.status !== 'recruiting') {
          throw new HttpError(409, 'GROUPBUY_NOT_RECRUITING', '该拼单已停止接龙')
        }
        if (new Date(item.deadline).getTime() <= Date.now()) {
          commerce.status = 'expired'
          throw new HttpError(409, 'GROUPBUY_EXPIRED', '该拼单已经截止')
        }
        const quantity = Math.round(Number(body.quantity) || 1)
        if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
          throw new HttpError(422, 'GROUPBUY_QUANTITY_INVALID', '接龙份数应在 1–99 之间')
        }
        const remaining = Math.max(0, Number(item.targetCount) - joinedQuantity())
        if (quantity > remaining) {
          throw new HttpError(409, 'GROUPBUY_INSUFFICIENT_REMAINING', `剩余仅 ${remaining} 份`)
        }
        const existing = (item.participants || []).find(
          (entry) => entry.userId === actor.id || entry.name === actor.name,
        )
        if (existing) existing.count = Math.max(1, Number(existing.count) || 1) + quantity
        else {
          item.participants = [
            ...(item.participants || []),
            { name: actor.name, userId: actor.id, count: quantity, at: now },
          ]
        }
        const quote = groupbuyMemberQuotes(item).get(actor.id)
        repo.syncGroupPaymentTotal(
          orderId,
          actor.id,
          quote?.amountCents || 0,
          `join:${actor.id}:${orderId}:${idempotencyKey}`,
        )
        if (joinedQuantity() >= Number(item.targetCount)) {
          captureFormation()
          notify.push({
            ownerUserId: item.ownerId,
            actorUserId: actor.id,
            type: 'match',
            title:
              commerce.settlementMode === 'host_advance'
                ? '拼单已成团，等待发起人代付采购'
                : '拼单成团并完成资金托管',
            content:
              commerce.settlementMode === 'host_advance'
                ? `「${item.title}」已满 ${item.targetCount} 份，请发起人先完成代付采购，成员款项将在采购后进入托管。`
                : `「${item.title}」已满 ${item.targetCount} 份，成员款项已进入平台托管，可以开始采购。`,
            link: `/groupbuy/${orderId}`,
            important: true,
            sourceType: 'groupbuy',
            sourceId: orderId,
          })
        } else {
          notify.push({
            ownerUserId: item.ownerId,
            actorUserId: actor.id,
            type: 'status',
            title: '拼单新增接龙',
            content: `${actor.name} 接龙 ${quantity} 份，「${item.title}」还差 ${item.targetCount - joinedQuantity()} 份。`,
            link: `/groupbuy/${orderId}`,
            sourceType: 'groupbuy',
            sourceId: orderId,
          })
        }
      } else if (action === 'leave') {
        if (!participant) throw new HttpError(409, 'GROUPBUY_NOT_JOINED', '你还没有参与该拼单')
        if (commerce.status !== 'recruiting') {
          throw new HttpError(409, 'GROUPBUY_LOCKED', '拼单已成团，不能直接取消，请使用取货码转交')
        }
        const quantity = Math.max(1, Math.round(Number(body.quantity) || Number(participant.count) || 1))
        participant.count = Math.max(0, (Number(participant.count) || 1) - quantity)
        if (participant.count <= 0) {
          item.participants = item.participants.filter((entry) => entry !== participant)
          repo.releaseGroupPaymentsForUser(orderId, actor.id)
        }
        recalc()
      } else if (action === 'purchase') {
        requireOwner()
        if (commerce.status === 'formed') captureFormation({ capture: true })
        if (!['funded', 'formed'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_NOT_FUNDED', '所有成员付款完成并进入托管后才能采购')
        }
        const payments = repo.listGroupPaymentOrders(orderId)
        const capturedUsers = new Set(
          payments.filter((payment) => payment.status === 'captured').map((payment) => payment.userId),
        )
        const allCaptured = (item.participants || []).every((entry) =>
          !entry.userId || capturedUsers.has(entry.userId),
        )
        if (!allCaptured) throw new HttpError(409, 'GROUPBUY_NOT_FUNDED', '仍存在未完成托管的成员')
        commerce.status = 'purchasing'
        commerce.purchasedAt = now
        commerce.purchaseReceipt = String(body.receipt || '').trim().slice(0, 300)
      } else if (action === 'ship') {
        requireOwner()
        if (commerce.status !== 'purchasing') {
          throw new HttpError(409, 'GROUPBUY_NOT_PURCHASED', '请先确认完成采购')
        }
        commerce.status = 'shipping'
        commerce.shippedAt = now
      } else if (action === 'ready') {
        requireOwner()
        if (commerce.status !== 'shipping') {
          throw new HttpError(409, 'GROUPBUY_NOT_SHIPPING', '请先进入配送状态')
        }
        commerce.status = 'ready'
        commerce.readyAt = now
        commerce.deliveryProof = String(body.proof || '').trim().slice(0, 300)
      } else if (action === 'redeem') {
        requireOwner()
        if (!['ready', 'completed'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_NOT_READY', '商品尚未到达领取点')
        }
        const targetUserId = String(body.userId || '').trim()
        const targetParticipant = (item.participants || []).find(
          (entry) => entry.userId === targetUserId,
        )
        if (!targetParticipant) throw new HttpError(404, 'GROUPBUY_MEMBER_NOT_FOUND', '参与者不存在')
        const suppliedCode = String(body.code || '').trim()
        if (!/^\d{6}$/.test(suppliedCode)) {
          throw new HttpError(422, 'PICKUP_CODE_INVALID', '取货码应为 6 位数字')
        }
        if (suppliedCode !== groupPickupCode(orderId, targetUserId)) {
          throw new HttpError(403, 'PICKUP_CODE_MISMATCH', '取货码不正确')
        }
        if (!repo.redeemGroupPickupTicket(orderId, targetUserId, actor.id)) {
          throw new HttpError(409, 'PICKUP_ALREADY_REDEEMED', '该成员的物品已领取')
        }
        notify.push({
          ownerUserId: targetUserId,
          actorUserId: actor.id,
          type: 'status',
          title: '拼单物品领取完成',
          content: `「${item.title}」已完成取货核销。`,
          link: `/groupbuy/${orderId}`,
          sourceType: 'groupbuy',
          sourceId: orderId,
        })
        const tickets = repo.listGroupPickupTickets(orderId)
        if (tickets.length && tickets.every((ticket) => ticket.status === 'redeemed')) {
          commerce.status = 'completed'
          commerce.completedAt = now
          const capturedCents = repo
            .listGroupPaymentOrders(orderId)
            .filter((payment) => payment.status === 'captured')
            .reduce((sum, payment) => sum + payment.amountCents, 0)
          repo.addGroupLedgerEntry({
            id: `ledger_${randomUUID()}`,
            orderId,
            userId: item.ownerId,
            entryType: 'release_to_owner',
            amountCents: capturedCents,
            idempotencyKey: `release:${orderId}`,
            detail: { allTicketsRedeemed: true },
          })
        }
      } else if (action === 'confirm_received') {
        requireParticipant()
        if (!['ready', 'completed'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_NOT_READY', '商品尚未到达领取点')
        }
        const code = String(body.code || '').trim()
        if (code !== groupPickupCode(orderId, actor.id)) {
          throw new HttpError(403, 'PICKUP_CODE_MISMATCH', '取货码不正确')
        }
        if (!repo.redeemGroupPickupTicket(orderId, actor.id, actor.id)) {
          throw new HttpError(409, 'PICKUP_ALREADY_REDEEMED', '你已经确认领取')
        }
        notify.push({
          ownerUserId: item.ownerId,
          actorUserId: actor.id,
          type: 'status',
          title: '参与者已确认领取',
          content: `${actor.name} 已确认收到「${item.title}」。`,
          link: `/groupbuy/${orderId}`,
          important: true,
          sourceType: 'groupbuy',
          sourceId: orderId,
        })
        const tickets = repo.listGroupPickupTickets(orderId)
        if (tickets.length && tickets.every((ticket) => ticket.status === 'redeemed')) {
          commerce.status = 'completed'
          commerce.completedAt = now
          const capturedCents = repo
            .listGroupPaymentOrders(orderId)
            .filter((payment) => payment.status === 'captured')
            .reduce((sum, payment) => sum + payment.amountCents, 0)
          repo.addGroupLedgerEntry({
            id: `ledger_${randomUUID()}`,
            orderId,
            userId: item.ownerId,
            entryType: 'release_to_owner',
            amountCents: capturedCents,
            idempotencyKey: `release:${orderId}`,
            detail: { allTicketsRedeemed: true, completedBy: 'member_confirmation' },
          })
        }
      } else if (action === 'dispute') {
        requireParticipant()
        const reason = String(body.reason || '').trim().slice(0, 1000)
        if (reason.length < 4) {
          throw new HttpError(422, 'GROUPBUY_DISPUTE_REASON_REQUIRED', '请至少填写 4 个字的争议说明')
        }
        if (commerce.status === 'completed') {
          throw new HttpError(409, 'GROUPBUY_ALREADY_COMPLETED', '已完成的订单不能再次发起争议')
        }
        if (!['formed', 'funded', 'purchasing', 'shipping', 'ready'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_DISPUTE_NOT_AVAILABLE', '当前订单状态不能发起交易争议')
        }
        if (repo.getOpenGroupDispute(orderId)) {
          throw new HttpError(409, 'GROUPBUY_DISPUTE_EXISTS', '该拼单已有待处理争议')
        }
        repo.createGroupDispute({
          id: `dispute_${randomUUID()}`,
          orderId,
          userId: actor.id,
          reason,
        })
        commerce.status = 'disputed'
        notify.push({
          ownerUserId: item.ownerId,
          actorUserId: actor.id,
          type: 'status',
          title: '拼单出现争议，资金已冻结',
          content: `${actor.name} 对「${item.title}」发起争议：${reason.slice(0, 120)}`,
          link: `/groupbuy/${orderId}`,
          important: true,
          sourceType: 'groupbuy',
          sourceId: orderId,
        })
      } else if (action === 'resolve_dispute') {
        if (!manageAll) {
          throw new HttpError(403, 'GROUPBUY_ADMIN_REQUIRED', '只有管理员可以处理交易争议')
        }
        const dispute = repo.getOpenGroupDispute(orderId)
        if (!dispute) throw new HttpError(409, 'GROUPBUY_NO_DISPUTE', '该拼单没有待处理争议')
        const accepted = Boolean(body.accepted)
        const resolution = String(body.resolution || '').trim().slice(0, 1000)
        if (!resolution) throw new HttpError(422, 'DISPUTE_RESOLUTION_REQUIRED', '请填写处理结论')
        if (accepted) {
          const refundable = repo
            .listGroupPaymentOrders(orderId)
            .filter((payment) => ['authorized', 'captured'].includes(payment.status))
            .reduce((sum, payment) => sum + payment.amountCents, 0)
          repo.releaseAllGroupPayments(orderId)
          repo.expireGroupPickupTickets(orderId)
          repo.addGroupLedgerEntry({
            id: `ledger_${randomUUID()}`,
            orderId,
            userId: null,
            entryType: 'dispute_refund',
            amountCents: refundable,
            idempotencyKey: `dispute-refund:${dispute.id}`,
            detail: { resolution },
          })
          commerce.status = 'cancelled'
          commerce.cancellationReason = resolution
        } else {
          commerce.status = 'funded'
        }
        repo.resolveGroupDispute(dispute.id, actor.id, resolution, accepted)
        notify.push({
          ownerUserId: item.ownerId,
          actorUserId: actor.id,
          type: 'status',
          title: accepted ? '交易争议已裁定退款' : '交易争议已驳回',
          content: `「${item.title}」：${resolution}`,
          link: `/groupbuy/${orderId}`,
          important: true,
          sourceType: 'groupbuy',
          sourceId: orderId,
        })
      } else if (action === 'cancel') {
        requireOwner()
        if (!['recruiting', 'formed', 'funded', 'expired'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_CANNOT_CANCEL', '已有资金托管或采购记录，请走退款/争议流程')
        }
        const refundable = repo
          .listGroupPaymentOrders(orderId)
          .filter((payment) => ['authorized', 'captured'].includes(payment.status))
          .reduce((sum, payment) => sum + payment.amountCents, 0)
        repo.releaseAllGroupPayments(orderId)
        repo.expireGroupPickupTickets(orderId)
        if (refundable > 0) {
          repo.addGroupLedgerEntry({
            id: `ledger_${randomUUID()}`,
            orderId,
            userId: null,
            entryType: 'order_cancel_refund',
            amountCents: refundable,
            idempotencyKey: `cancel-refund:${orderId}`,
            detail: { reason: String(body.reason || '').slice(0, 300) },
          })
        }
        commerce.status = 'cancelled'
        commerce.cancellationReason = String(body.reason || '发起人取消').slice(0, 500)
      } else if (action === 'accept_errand') {
        const errand = item.errand
        if (!errand?.enabled || errand.status !== 'open') {
          throw new HttpError(409, 'ERRAND_NOT_OPEN', '该跑腿任务当前不可接取')
        }
        if (owner) throw new HttpError(409, 'ERRAND_OWNER_FORBIDDEN', '发起人不能接取自己的跑腿任务')
        errand.status = 'accepted'
        errand.runnerId = actor.id
        errand.runnerName = actor.name
        errand.acceptedAt = now
      } else if (action === 'complete_errand') {
        if (!item.errand?.enabled || item.errand.runnerId !== actor.id) {
          throw new HttpError(403, 'ERRAND_RUNNER_REQUIRED', '只有当前跑腿者可以标记送达')
        }
        if (item.errand.status !== 'accepted') {
          throw new HttpError(409, 'ERRAND_NOT_ACCEPTED', '跑腿任务当前不在配送中')
        }
        item.errand.status = 'delivered'
        item.errand.completedAt = now
      } else if (action === 'confirm_errand') {
        requireOwner()
        if (item.errand?.status !== 'delivered') {
          throw new HttpError(409, 'ERRAND_NOT_DELIVERED', '跑腿者尚未标记送达')
        }
        item.errand.status = 'settled'
        item.errand.confirmedAt = now
        item.errand.settledAmount = Number(item.errand.tip) || 0
        repo.addGroupLedgerEntry({
          id: `ledger_${randomUUID()}`,
          orderId,
          userId: item.errand.runnerId,
          entryType: 'runner_tip',
          amountCents: toCents(item.errand.tip),
          idempotencyKey: `errand-tip:${orderId}`,
          detail: { runnerId: item.errand.runnerId },
        })
      } else if (action === 'cancel_errand') {
        requireOwner()
        if (!['open', 'accepted'].includes(item.errand?.status)) {
          throw new HttpError(409, 'ERRAND_CANNOT_CANCEL', '当前跑腿状态不能取消')
        }
        item.errand.status = 'cancelled'
        item.errand.cancelledAt = now
        item.errand.cancelReason = String(body.reason || '发起人取消').slice(0, 300)
      } else if (action === 'withdraw_errand') {
        if (item.errand?.runnerId !== actor.id || item.errand.status !== 'accepted') {
          throw new HttpError(403, 'ERRAND_WITHDRAW_FORBIDDEN', '当前不能退出该跑腿任务')
        }
        item.errand.status = 'open'
        item.errand.runnerId = ''
        item.errand.runnerName = ''
        item.errand.cancelReason = String(body.reason || '').slice(0, 300)
      } else if (action === 'remove') {
        requireOwner()
        if (!['cancelled', 'expired', 'recruiting'].includes(commerce.status)) {
          throw new HttpError(409, 'GROUPBUY_CANNOT_REMOVE', '交易进行中或已完成，不能删除拼单')
        }
        if (commerce.status === 'recruiting') repo.releaseAllGroupPayments(orderId)
        repo.saveGroupActionReceipt({
          idempotencyKey,
          orderId,
          userId: actor.id,
          action,
          result: { removed: true },
        })
        data.splice(data.indexOf(item), 1)
        return { orderId, removed: true }
      } else {
        throw new HttpError(422, 'GROUPBUY_ACTION_UNSUPPORTED', '不支持的拼单操作')
      }
      for (const payload of notify) {
        if (payload.ownerUserId && payload.ownerUserId !== actor.id) {
          repo.createNotification(payload)
        }
      }
      repo.saveGroupActionReceipt({
        idempotencyKey,
        orderId,
        userId: actor.id,
        action,
        result: { status: commerce.status },
      })
      return { orderId }
    })
    if (mutation.removed) {
      sendSuccess(res, { removed: true, version: mutation.version })
      return
    }
    const updated = mutation.data.find((entry) => entry.id === orderId)
    sendSuccess(res, {
      item: decorateGroupbuyOrder(updated, actor),
      version: mutation.version,
      replayed: Boolean(mutation.replayed),
    })
    return
  }

  if (method === 'POST' && pathname === '/api/uploads/images') {
    authenticate(req)
    const contentType = String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    const extensionByType = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    }
    const extension = extensionByType[contentType]
    if (!extension) {
      throw new HttpError(415, 'IMAGE_TYPE_UNSUPPORTED', '仅支持 JPEG、PNG、WebP 或 GIF 图片')
    }
    const buffer = await readBuffer(req, MAX_IMAGE_BYTES)
    if (!buffer.length) throw new HttpError(422, 'IMAGE_EMPTY', '图片内容为空')
    if (!hasValidImageSignature(buffer, contentType)) {
      throw new HttpError(422, 'IMAGE_INVALID', '图片内容与文件格式不匹配')
    }
    await fsp.mkdir(UPLOAD_DIR, { recursive: true })
    const filename = `${randomUUID()}${extension}`
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buffer)
    sendSuccess(
      res,
      {
        url: `/api/uploads/images/${filename}`,
        mime: contentType,
        size: buffer.length,
      },
      201,
    )
    return
  }

  const uploadMatch = pathname.match(/^\/api\/uploads\/images\/([a-f0-9-]+\.(?:jpg|png|webp|gif))$/i)
  if (method === 'GET' && uploadMatch) {
    const filename = uploadMatch[1]
    const filePath = path.join(UPLOAD_DIR, filename)
    const stat = await fsp.stat(filePath).catch(() => null)
    if (!stat?.isFile()) throw new HttpError(404, 'IMAGE_NOT_FOUND', '图片不存在')
    const extension = path.extname(filename).toLowerCase()
    const mime = {
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    }[extension]
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    fs.createReadStream(filePath).pipe(res)
    return
  }

  if (method === 'GET' && pathname === '/api/notifications') {
    const actor = authenticate(req)
    const requestedScope = url.searchParams.get('scope') || 'own'
    const scope = resolveDataScope(actor, 'notifications', requestedScope)
    if (!scope) {
      throw new HttpError(403, 'NOTIFICATION_SCOPE_FORBIDDEN', '当前角色不能查看其他用户的消息通知')
    }
    const items = repo.listNotifications({
      ownerUserId: actor.id,
      all: scope === 'all',
      limit: Number(url.searchParams.get('limit')) || 200,
    })
    sendSuccess(res, { items, scope })
    return
  }

  if (method === 'POST' && pathname === '/api/notifications') {
    const actor = authenticate(req)
    requirePermission(actor, 'notifications.use')
    const body = await readJson(req)
    const title = String(body.title || '').trim()
    if (!title) throw new HttpError(422, 'NOTIFICATION_TITLE_REQUIRED', '通知标题不能为空')
    const recipientUserId =
      body.recipientUserId && body.recipientUserId !== actor.id
        ? String(body.recipientUserId)
        : ''
    const recipientName =
      !recipientUserId && body.recipientName && body.recipientName !== actor.name
        ? String(body.recipientName)
        : ''
    const notification = repo.createNotification({
      ownerUserId: recipientUserId || actor.id,
      ownerName: recipientUserId ? '' : recipientName || actor.name,
      actorUserId: actor.id,
      type: body.type,
      title,
      content: body.content,
      link: body.link,
      read: body.read,
      important: body.important,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
    })
    if (!notification) {
      throw new HttpError(404, 'NOTIFICATION_RECIPIENT_NOT_FOUND', '通知接收人不存在或已停用')
    }
    sendSuccess(res, { notification }, 201)
    return
  }

  if (method === 'POST' && pathname === '/api/notifications/read-all') {
    const actor = authenticate(req)
    requirePermission(actor, 'notifications.use')
    const updated = repo.markAllNotificationsRead(actor.id)
    sendSuccess(res, { updated })
    return
  }

  if (method === 'DELETE' && pathname === '/api/notifications/read') {
    const actor = authenticate(req)
    requirePermission(actor, 'notifications.use')
    const deleted = repo.clearReadNotifications(actor.id)
    sendSuccess(res, { deleted })
    return
  }

  const notificationMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/)
  if (notificationMatch && method === 'PATCH') {
    const actor = authenticate(req)
    requirePermission(actor, 'notifications.use')
    const id = decodeURIComponent(notificationMatch[1])
    const body = await readJson(req)
    if (!('read' in body) && !('important' in body)) {
      throw new HttpError(422, 'NO_NOTIFICATION_CHANGES', '没有可更新的通知字段')
    }
    const notification = repo.updateNotification(id, actor.id, {
      ...('read' in body ? { read: Boolean(body.read) } : {}),
      ...('important' in body ? { important: Boolean(body.important) } : {}),
    })
    if (!notification) {
      throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在或不属于当前用户')
    }
    sendSuccess(res, { notification })
    return
  }

  if (notificationMatch && method === 'DELETE') {
    const actor = authenticate(req)
    requirePermission(actor, 'notifications.use')
    const id = decodeURIComponent(notificationMatch[1])
    if (!repo.deleteNotification(id, actor.id)) {
      throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在或不属于当前用户')
    }
    sendSuccess(res, { deleted: true })
    return
  }

  if (method === 'GET' && pathname === '/api/ai/records') {
    const actor = authenticate(req)
    requirePermission(actor, 'aiRecords.use')
    const requestedScope = url.searchParams.get('scope') || 'own'
    const scope = resolveDataScope(actor, 'aiRecords', requestedScope)
    if (!scope) {
      throw new HttpError(403, 'AI_RECORD_SCOPE_FORBIDDEN', '当前角色不能查看其他用户的 AI 使用记录')
    }
    const records = repo.listAiUsage({
      userId: actor.id,
      all: scope === 'all',
      limit: Number(url.searchParams.get('limit')) || 200,
    })
    sendSuccess(res, { records, scope })
    return
  }

  if (method === 'GET' && pathname === '/api/shared/meta') {
    const actor = authenticate(req)
    const documents = repo.listSharedDocumentMetadata().filter((item) => {
      const permission = SHARED_RESOURCE_PERMISSIONS[item.resource]
      return Boolean(permission && hasPermission(actor, permission))
    })
    sendSuccess(res, { documents })
    return
  }

  const sharedChangesMatch = pathname.match(/^\/api\/shared\/([a-z-]+)\/changes$/)
  if (sharedChangesMatch) {
    const actor = authenticate(req)
    const resource = sharedChangesMatch[1]
    if (!SHARED_RESOURCES.has(resource)) {
      throw new HttpError(404, 'SHARED_RESOURCE_NOT_FOUND', '共享数据资源不存在')
    }
    const requiredPermission = SHARED_RESOURCE_PERMISSIONS[resource]
    requirePermission(
      actor,
      requiredPermission,
      resource === 'classroom' ? '学生和论坛坛主不能使用教室借用功能' : '当前角色无权访问该业务数据',
    )
    if (method !== 'PUT') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '增量同步接口仅支持 PUT')
    }
    const body = await readJson(req)
    if (typeof body.baseVersion !== 'number') {
      throw new HttpError(422, 'INVALID_SHARED_CHANGE', '缺少 baseVersion')
    }
    if (
      (body.upserts != null && !Array.isArray(body.upserts)) ||
      (body.deletes != null && !Array.isArray(body.deletes)) ||
      (body.order != null && !Array.isArray(body.order))
    ) {
      throw new HttpError(422, 'INVALID_SHARED_CHANGE', '增量同步字段格式无效')
    }
    const stored = repo.getSharedDocument(resource)
    const proposed = applySharedChanges(stored?.data, body)
    const mergedData = sanitizeSharedMutation(
      actor,
      resource,
      stored?.data,
      proposed,
    )
    ensureSharedDocumentSize(mergedData)
    const result = repo.saveSharedDocument(
      resource,
      mergedData,
      body.baseVersion,
      actor.id,
    )
    if (result.conflict) {
      throw new HttpError(
        409,
        'SHARED_VERSION_CONFLICT',
        '云端数据已被其他用户更新，请合并后再提交',
        { currentVersion: result.currentVersion },
      )
    }
    sendSuccess(res, { ...result, data: mergedData })
    return
  }

  const sharedMatch = pathname.match(/^\/api\/shared\/([a-z-]+)$/)
  if (sharedMatch) {
    const actor = authenticate(req)
    const resource = sharedMatch[1]
    if (!SHARED_RESOURCES.has(resource)) {
      throw new HttpError(404, 'SHARED_RESOURCE_NOT_FOUND', '共享数据资源不存在')
    }
    const requiredPermission = SHARED_RESOURCE_PERMISSIONS[resource]
    requirePermission(
      actor,
      requiredPermission,
      resource === 'classroom' ? '学生和论坛坛主不能使用教室借用功能' : '当前角色无权访问该业务数据',
    )
    if (method === 'GET') {
      sendSuccess(res, {
        document: filterSharedDocument(actor, repo.getSharedDocument(resource)),
      })
      return
    }
    if (method === 'PUT') {
      const body = await readJson(req)
      if (!('data' in body) || typeof body.baseVersion !== 'number') {
        throw new HttpError(422, 'INVALID_SHARED_DATA', '缺少 data 或 baseVersion')
      }
      if (
        body.data !== null &&
        typeof body.data !== 'object'
      ) {
        throw new HttpError(422, 'INVALID_SHARED_DATA', '共享数据必须是对象或数组')
      }
      const stored = repo.getSharedDocument(resource)
      const mergedData = sanitizeSharedMutation(
        actor,
        resource,
        stored?.data,
        body.data,
      )
      ensureSharedDocumentSize(mergedData)
      const result = repo.saveSharedDocument(
        resource,
        mergedData,
        body.baseVersion,
        actor.id,
      )
      if (result.conflict) {
        throw new HttpError(
          409,
          'SHARED_VERSION_CONFLICT',
          '云端数据已被其他用户更新，请先同步最新版本',
          { currentVersion: result.currentVersion },
        )
      }
      sendSuccess(res, { ...result, data: mergedData })
      return
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '共享数据接口仅支持 GET 与 PUT')
  }

  if (method === 'PATCH' && pathname === '/api/me') {
    const actor = authenticate(req)
    const body = await readJson(req)
    const patch = {}
    if ('name' in body) patch.name = normalizeName(body.name)
    if ('college' in body) patch.college = normalizeCollege(body.college, actor.college)
    if ('bio' in body) patch.bio = normalizeBio(body.bio)
    if ('avatarUrl' in body) {
      patch.avatarUrl = normalizeAvatarUrl(body.avatarUrl)
      if (patch.avatarUrl) {
        const avatarFile = path.join(UPLOAD_DIR, path.basename(patch.avatarUrl))
        const avatarStat = await fsp.stat(avatarFile).catch(() => null)
        if (!avatarStat?.isFile()) {
          throw new HttpError(422, 'AVATAR_FILE_NOT_FOUND', '头像文件不存在，请重新上传')
        }
      }
    }
    const user = repo.updateProfile(actor.id, patch)
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '更新个人资料',
      targetType: 'user',
      targetId: actor.id,
      detail: { fields: Object.keys(patch) },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { user })
    return
  }

  if (method === 'PATCH' && pathname === '/api/me/password') {
    const actor = authenticate(req)
    if (actor.source === 'builtin') {
      throw new HttpError(
        403,
        'DEMO_PASSWORD_FIXED',
        '内置演示账号的密码统一为 123456，不能修改',
      )
    }
    const body = await readJson(req)
    const currentPassword = normalizeLoginPassword(body.currentPassword)
    const newPassword = normalizeNewPassword(body.newPassword)
    const credential = repo.getPasswordCredential(actor.id)
    if (!credential || !verifyPassword(currentPassword, credential.password_hash)) {
      throw new HttpError(401, 'CURRENT_PASSWORD_INVALID', '当前密码不正确')
    }
    repo.updatePassword(actor.id, newPassword)
    const user = repo.getUserById(actor.id)
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '修改账号密码',
      targetType: 'user_credentials',
      targetId: actor.id,
      detail: {},
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { user })
    return
  }

  if (method === 'POST' && pathname === '/api/ai/parse') {
    const actor = authenticate(req)
    checkAiRate(actor.id)
    const body = await readJson(req)
    const text = String(body.text || '').trim()
    if (!text) throw new HttpError(422, 'AI_TEXT_REQUIRED', '请提供需要解析的校园需求')
    if ([...text].length > 500) {
      throw new HttpError(422, 'AI_TEXT_TOO_LONG', '需求描述不能超过 500 个字符')
    }
    const result = await callLoggedAi(actor, {
      task: 'parse',
      scene: 'auto',
      messages: [
        {
          role: 'system',
          content: `你是校园智能调度平台的 AI 调度助手。只输出 JSON，不要输出 Markdown。
必须返回：
{
  "scene": "classroom|lostfound|groupbuy|forum|unknown",
  "confidence": 0到1的数字,
  "summary": "一句中文摘要",
  "fields": [{"key":"英文键","label":"中文名","value":"字符串","type":"text|number|select|tags|textarea","required":true或false,"options":["仅select使用"]}],
  "missing": ["缺失信息中文名"],
  "routeQuery": {"可继续预填页面的键":"字符串值"}
}
教室场景至少尝试抽取时间、人数、设备、场地类型、地点、用途。
失物场景抽取类型、物品、颜色、地点、时间、特征。
拼单场景抽取商品、价格、目标数量、截止时间、取货地点。
论坛场景抽取分类、标题、正文、标签。
不得编造用户未提供的关键事实；不确定的字段留空并放入 missing。`,
        },
        { role: 'user', content: text },
      ],
      jsonMode: true,
      maxTokens: 1400,
      thinking: true,
    })
    const parsed = parseJsonResponse(result.content)
    sendSuccess(res, {
      ...parsed,
      engine: DEEPSEEK_MODEL_NAME,
      model: result.model,
      requestId: result.requestId,
      usage: result.usage,
    })
    return
  }

  if (method === 'POST' && pathname === '/api/ai/generate') {
    const actor = authenticate(req)
    checkAiRate(actor.id)
    const body = await readJson(req)
    const task = String(body.task || '')
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
    let system = ''
    let userContent = ''
    let jsonMode = true
    let maxTokens = 1400

    if (task === 'forum_draft') {
      const text = String(payload.text || '').trim()
      if (!text) throw new HttpError(422, 'AI_TEXT_REQUIRED', '请先描述想发布的内容')
      system = `你是校园论坛编辑。只输出 JSON：
{"title":"4-40字标题","category":"求助问答|校园分享|活动招募|二手闲置|闲聊灌水","content":"完整中文正文","tags":["最多3个标签"]}
保持真实，不编造具体事实，不输出 Markdown。`
      userContent = `请根据这句话起草帖子：${text}`
    } else if (task === 'lostfound_copy') {
      const summary = JSON.stringify(payload)
      system = `你是校园失物招领文案助手。只输出 JSON：
{"title":"规范招领或寻物标题","content":"完整、克制、可核对的正文","tags":["最多4个标签"],"category":"证件卡类|数码产品|生活用品|学习用品|其他"}
不得编造物品特征，联系方式使用站内联系。`
      userContent = `请根据以下信息生成启事：${summary}`
    } else if (task === 'forum_summary') {
      system = '你是校园论坛讨论摘要助手。用不超过120个中文字符概括共识、结论和仍待确认事项，不编造信息。'
      userContent = JSON.stringify(payload).slice(0, 10000)
      jsonMode = false
      maxTokens = 500
    } else {
      throw new HttpError(422, 'AI_TASK_UNSUPPORTED', '不支持的 AI 生成任务')
    }

    const result = await callLoggedAi(actor, {
      task,
      scene: task === 'forum_draft' ? 'forum' : task === 'lostfound_copy' ? 'lostfound' : 'forum',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      jsonMode,
      maxTokens,
      thinking: task !== 'forum_summary',
    })
    sendSuccess(res, {
      task,
      result: jsonMode ? parseJsonResponse(result.content) : result.content,
      engine: DEEPSEEK_MODEL_NAME,
      model: result.model,
      requestId: result.requestId,
      usage: result.usage,
    })
    return
  }

  if (method === 'PATCH' && pathname === '/api/system/ai-provider') {
    const actor = requireSuperAdmin(req)
    const body = await readJson(req)
    const apiKey = String(body.apiKey || '').trim()
    if (!apiKey) throw new HttpError(422, 'AI_KEY_REQUIRED', '请输入 DeepSeek API Key')
    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey)) {
      throw new HttpError(
        422,
        'AI_KEY_INVALID',
        'API Key 格式无效，应以 sk- 开头并包含至少 16 个有效字符',
      )
    }
    const ciphertext = encryptSecret(apiKey, SETTINGS_KEY)
    const setting = repo.saveAiProviderSetting({
      provider: 'deepseek',
      baseUrl: DEEPSEEK_BASE_URL,
      model: DEEPSEEK_MODEL,
      enabled: body.enabled !== false,
      apiKeyCiphertext: ciphertext,
      apiKeyLast4: apiKey.slice(-4),
      userId: actor.id,
    })
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '更新 DeepSeek API 配置',
      targetType: 'ai_provider',
      targetId: 'deepseek',
      detail: { model: DEEPSEEK_MODEL, keyLast4: apiKey.slice(-4) },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { provider: publicAiProvider(setting) })
    return
  }

  if (method === 'POST' && pathname === '/api/system/ai-provider/test') {
    const actor = requireSuperAdmin(req)
    try {
      const result = await callDeepSeek({
        messages: [
          { role: 'system', content: '只回复 OK 两个英文字母。' },
          { role: 'user', content: '连接测试' },
        ],
        maxTokens: 16,
        thinking: false,
      })
      const setting = repo.updateAiProviderTest({
        provider: 'deepseek',
        ok: true,
      })
      repo.addAuditLog({
        actorUserId: actor.id,
        action: '测试 DeepSeek 模型连接',
        targetType: 'ai_provider',
        targetId: 'deepseek',
        detail: { ok: true, model: result.model, requestId: result.requestId },
        ipAddress: clientIp(req),
      })
      sendSuccess(res, {
        ok: true,
        provider: publicAiProvider(setting),
        reply: result.content,
        model: result.model,
        requestId: result.requestId,
        usage: result.usage,
      })
    } catch (error) {
      repo.updateAiProviderTest({
        provider: 'deepseek',
        ok: false,
        error: error?.message || '连接测试失败',
      })
      throw error
    }
  }

  if (method === 'GET' && pathname === '/api/system/bootstrap') {
    const actor = requireSuperAdmin(req)
    const roles = repo.listRoles().map((role) => ({
      ...role,
      permissions: permissionsForRole(role.key),
    }))
    sendSuccess(res, {
      users: repo.listUsers(),
      roles,
      assignableRoles: roles.filter(
        (role) => role.assignable && role.level <= MAX_ASSIGNABLE_ROLE_LEVEL,
      ),
      canManageUsers: actor.roleKey === 'super_admin',
      settings: repo.getSettings(),
      studentNumbers: repo.getStudentNumberState(),
      aiProvider: publicAiProvider(repo.getAiProviderSetting('deepseek')),
      auditLogs: repo.listAuditLogs(40),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/system/users') {
    requireSuperAdmin(req)
    sendSuccess(res, { users: repo.listUsers() })
    return
  }

  const permissionMatch = pathname.match(/^\/api\/system\/users\/([^/]+)\/permissions$/)
  if (method === 'PATCH' && permissionMatch) {
    const actor = requireSuperAdmin(req)
    const targetId = decodeURIComponent(permissionMatch[1])
    const target = repo.getUserById(targetId)
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', '目标账号不存在')
    if (target.id === actor.id) {
      throw new HttpError(409, 'CANNOT_MODIFY_SELF', '不能修改自己的权限')
    }
    if (target.roleKey === 'super_admin') {
      throw new HttpError(403, 'SUPER_ADMIN_PROTECTED', '高级管理员账号权限不可被修改')
    }
    if (target.isDeleted) {
      throw new HttpError(409, 'ACCOUNT_DELETED', '已删除账号不能修改权限')
    }

    const body = await readJson(req)
    const requestedRole = repo.listRoles().find((role) => role.key === body.roleKey)
    if (!requestedRole || !requestedRole.assignable) {
      throw new HttpError(422, 'ROLE_NOT_ASSIGNABLE', '该权限角色不可分配')
    }
    if (requestedRole.level > MAX_ASSIGNABLE_ROLE_LEVEL) {
      throw new HttpError(403, 'ROLE_LEVEL_EXCEEDED', '最高只能授予管理员权限')
    }

    const updated = repo.updateManagedUser(target.id, {
      roleKey: requestedRole.key,
    })
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '调整账号权限',
      targetType: 'user',
      targetId: target.id,
      detail: {
        before: {
          roleKey: target.roleKey,
          roleLevel: target.roleLevel,
        },
        after: {
          roleKey: updated.roleKey,
          roleLevel: updated.roleLevel,
          permissions: updated.permissions,
        },
      },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { user: updated })
    return
  }

  const userMatch = pathname.match(/^\/api\/system\/users\/([^/]+)$/)
  if (method === 'DELETE' && userMatch) {
    const actor = requireSuperAdmin(req)
    const targetId = decodeURIComponent(userMatch[1])
    const target = repo.getUserById(targetId)
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', '目标账号不存在')
    if (target.id === actor.id) {
      throw new HttpError(409, 'CANNOT_DELETE_SELF', '不能删除当前登录账号')
    }
    if (target.roleKey === 'super_admin') {
      throw new HttpError(403, 'SUPER_ADMIN_PROTECTED', '高级管理员账号不可删除')
    }
    if (target.source !== 'custom') {
      throw new HttpError(403, 'BUILTIN_ACCOUNT_PROTECTED', '内置演示账号不可删除')
    }
    if (target.isDeleted) {
      throw new HttpError(409, 'ACCOUNT_ALREADY_DELETED', '账号已经删除')
    }

    const deleted = repo.softDeleteCustomUser(target.id, actor.id)
    const studentNumbers = repo.getStudentNumberState()
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '删除人物并释放学号',
      targetType: 'user',
      targetId: target.id,
      detail: {
        name: target.name,
        releasedStudentNo: target.studentNo,
        nextStudentNo: studentNumbers.nextStudentNo,
      },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { user: deleted, studentNumbers })
    return
  }

  if (method === 'PATCH' && userMatch) {
    const actor = requireSuperAdmin(req)
    const targetId = decodeURIComponent(userMatch[1])
    const target = repo.getUserById(targetId)
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', '目标账号不存在')
    if (target.id === actor.id) {
      throw new HttpError(409, 'CANNOT_MODIFY_SELF', '不能修改自己的权限或账号状态')
    }
    if (target.roleKey === 'super_admin') {
      throw new HttpError(403, 'SUPER_ADMIN_PROTECTED', '高级管理员账号不可被修改')
    }

    const body = await readJson(req)
    const patch = {}
    if ('roleKey' in body) {
      const requestedRole = repo.listRoles().find((role) => role.key === body.roleKey)
      if (!requestedRole || !requestedRole.assignable) {
        throw new HttpError(422, 'ROLE_NOT_ASSIGNABLE', '该权限等级不可分配')
      }
      if (requestedRole.level > MAX_ASSIGNABLE_ROLE_LEVEL) {
        throw new HttpError(403, 'ROLE_LEVEL_EXCEEDED', '最高只能授予管理员权限')
      }
      patch.roleKey = requestedRole.key
    }
    if ('status' in body) {
      if (!VALID_USER_STATUSES.has(body.status)) {
        throw new HttpError(422, 'STATUS_INVALID', '账号状态无效')
      }
      patch.status = body.status
    }
    if (!Object.keys(patch).length) {
      throw new HttpError(422, 'NO_CHANGES', '没有可更新的账号字段')
    }

    const updated = repo.updateManagedUser(target.id, patch)
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '调整账号权限',
      targetType: 'user',
      targetId: target.id,
      detail: {
        before: { roleKey: target.roleKey, status: target.status },
        after: { roleKey: updated.roleKey, status: updated.status },
      },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { user: updated })
    return
  }

  if (method === 'PATCH' && pathname === '/api/system/settings') {
    const actor = requireSuperAdmin(req)
    const body = await readJson(req)
    const current = repo.getSettings()
    const next = {
      sceneSwitches: { ...current.sceneSwitches },
      aiParams: { ...current.aiParams },
    }

    if (body.sceneSwitches && typeof body.sceneSwitches === 'object') {
      for (const key of ['classroom', 'lostfound', 'groupbuy', 'forum']) {
        if (key in body.sceneSwitches) next.sceneSwitches[key] = Boolean(body.sceneSwitches[key])
      }
    }
    if (body.aiParams && typeof body.aiParams === 'object') {
      const threshold = Number(body.aiParams.threshold)
      const timeout = Number(body.aiParams.timeout)
      if ('threshold' in body.aiParams) {
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
          throw new HttpError(422, 'THRESHOLD_INVALID', '置信度阈值必须在 0 到 1 之间')
        }
        next.aiParams.threshold = threshold
      }
      if ('timeout' in body.aiParams) {
        if (!Number.isInteger(timeout) || timeout < 3 || timeout > 30) {
          throw new HttpError(422, 'TIMEOUT_INVALID', '超时时间必须在 3 到 30 秒之间')
        }
        next.aiParams.timeout = timeout
      }
      for (const key of ['fallback', 'humanReview']) {
        if (key in body.aiParams) next.aiParams[key] = Boolean(body.aiParams[key])
      }
    }

    repo.setSetting('sceneSwitches', next.sceneSwitches, actor.id)
    repo.setSetting('aiParams', next.aiParams, actor.id)
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '更新系统配置',
      targetType: 'system_settings',
      detail: next,
      ipAddress: clientIp(req),
    })
    sendSuccess(res, { settings: repo.getSettings() })
    return
  }

  if (method === 'GET' && pathname === '/api/system/audit-logs') {
    requireSuperAdmin(req)
    sendSuccess(res, { logs: repo.listAuditLogs(100) })
    return
  }

  if (method === 'POST' && pathname === '/api/system/reset-demo') {
    const actor = requireSuperAdmin(req)
    const result = repo.resetDemoData()
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '重置共享演示数据',
      targetType: 'demo_data',
      detail: result,
      ipAddress: clientIp(req),
    })
    sendSuccess(res, result)
    return
  }

  if (method === 'POST' && pathname === '/api/system/restore-groupbuy') {
    const actor = requireSuperAdmin(req)
    const body = await readJson(req)
    if (String(body.confirmation || '').trim() !== '还原拼单原始数据') {
      throw new HttpError(
        422,
        'GROUPBUY_RESTORE_CONFIRMATION_REQUIRED',
        '请输入“还原拼单原始数据”确认本次操作',
      )
    }
    const data = buildGroupbuyDemoData(repo.listUsers())
    const result = repo.restoreGroupbuyDemoData(data, actor.id)
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '还原拼单原始数据',
      targetType: 'groupbuy',
      targetId: 'groupbuy',
      detail: result,
      ipAddress: clientIp(req),
    })
    sendSuccess(res, result)
    return
  }

  if (method === 'POST' && pathname === '/api/system/reset-all') {
    const actor = requireSuperAdmin(req)
    const body = await readJson(req)
    if (String(body.confirmation || '').trim() !== '重置全部内容') {
      throw new HttpError(
        422,
        'RESET_CONFIRMATION_REQUIRED',
        '请输入“重置全部内容”确认本次操作',
      )
    }
    const result = repo.resetAllContent()
    const uploads = await clearUploadDirectory()
    repo.addAuditLog({
      actorUserId: actor.id,
      action: '一键重置全部内容',
      targetType: 'all_content',
      detail: { ...result, ...uploads },
      ipAddress: clientIp(req),
    })
    sendSuccess(res, {
      ...result,
      ...uploads,
      currentUser: repo.getUserById(actor.id),
    })
    return
  }

  throw new HttpError(404, 'API_NOT_FOUND', '接口不存在')
}

async function serveStatic(req, res, url) {
  if (!fs.existsSync(DIST_DIR)) {
    throw new HttpError(
      503,
      'FRONTEND_NOT_BUILT',
      '前端尚未构建，请先运行 npm run build，或使用 npm run dev 启动开发环境',
    )
  }

  const requestedPath = decodeURIComponent(url.pathname)
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.resolve(DIST_DIR, `.${normalized}`)
  if (!filePath.startsWith(DIST_DIR)) {
    throw new HttpError(403, 'PATH_FORBIDDEN', '禁止访问该路径')
  }

  let stat = await fsp.stat(filePath).catch(() => null)
  if (!stat || stat.isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
    stat = await fsp.stat(filePath).catch(() => null)
  }
  if (!stat?.isFile()) throw new HttpError(404, 'NOT_FOUND', '页面不存在')

  const ext = path.extname(filePath).toLowerCase()
  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  let encoding = ''
  if (acceptEncoding.includes('br') && fs.existsSync(`${filePath}.br`)) {
    filePath = `${filePath}.br`
    encoding = 'br'
    stat = await fsp.stat(filePath)
  } else if (acceptEncoding.includes('gzip') && fs.existsSync(`${filePath}.gz`)) {
    filePath = `${filePath}.gz`
    encoding = 'gzip'
    stat = await fsp.stat(filePath)
  }
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    ...(encoding ? { 'Content-Encoding': encoding, Vary: 'Accept-Encoding' } : {}),
    'Cache-Control':
      path.basename(path.dirname(filePath)) === 'assets'
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res)
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持')
    }
    await serveStatic(req, res, url)
  } catch (error) {
    if (res.headersSent) {
      res.end()
      return
    }
    sendError(res, error)
  }
})

server.keepAliveTimeout = 60_000
server.listen(PORT, HOST, () => {
  console.log(`[api] 校园智能调度平台后端已启动：http://127.0.0.1:${PORT}`)
  console.log(`[api] SQLite 数据库：${DB_PATH}`)
  const runCleanup = () => {
    const result = repo.cleanupExpiredData({
      notificationDays: Number(process.env.NOTIFICATION_RETENTION_DAYS) || 180,
      auditDays: Number(process.env.AUDIT_RETENTION_DAYS) || 365,
    })
    if (result.sessions || result.notifications || result.auditLogs) {
      console.log('[api] retention cleanup', result)
    }
  }
  runCleanup()
  maintenanceTimer = setInterval(runCleanup, 60 * 60 * 1000)
  maintenanceTimer.unref()
})

function shutdown(signal) {
  console.log(`[api] 收到 ${signal}，正在关闭服务`)
  if (maintenanceTimer) clearInterval(maintenanceTimer)
  server.close(() => {
    try {
      db.close()
    } finally {
      process.exit(0)
    }
  })
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
