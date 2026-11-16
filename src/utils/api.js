const TOKEN_KEY = 'campus-smart-dispatch-platform:v2:token'
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export function apiUrl(path) {
  return `${API_BASE}/api${path}`
}

export function apiAssetUrl(path) {
  const value = String(path || '')
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/api/')) return `${API_BASE}${value}`
  return apiUrl(value)
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 浏览器禁用存储时，当前页面仍可使用内存中的登录态。
  }
}

export function clearAuthToken() {
  setAuthToken('')
}

export async function apiRequest(
  path,
  { method = 'GET', body, auth = true, signal, timeoutMs = 10_000, keepalive = false } = {},
) {
  const headers = { Accept: 'application/json' }
  const token = getAuthToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = signal ? null : new AbortController()
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null

  let response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal || controller?.signal,
      keepalive,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('服务器响应超时，请稍后重试', { code: 'TIMEOUT' })
    }
    throw new ApiError('无法连接后端服务，请确认项目已完整启动', {
      code: 'NETWORK_ERROR',
    })
  } finally {
    if (timeout) window.clearTimeout(timeout)
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  if (response.ok && !contentType.includes('application/json')) {
    throw new ApiError('API 返回了非 JSON 内容，请检查是否误把静态站点当作后端部署', {
      status: response.status,
      code: 'API_HTML_FALLBACK',
    })
  }

  if (!response.ok || payload?.ok === false) {
    const apiError = payload?.error || {}
    if (response.status === 401 && auth) clearAuthToken()
    throw new ApiError(apiError.message || `请求失败（${response.status}）`, {
      status: response.status,
      code: apiError.code || 'REQUEST_FAILED',
      details: apiError.details,
    })
  }

  return payload?.data ?? payload
}
