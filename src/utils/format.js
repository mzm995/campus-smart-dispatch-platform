import dayjs from 'dayjs'

export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 格式化日期 */
export function fmtDate(value, pattern = 'YYYY-MM-DD') {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format(pattern) : '—'
}

export function fmtDateTime(value) {
  return fmtDate(value, 'MM-DD HH:mm')
}

export function fmtClock(value) {
  return fmtDate(value, 'HH:mm')
}

/** 相对时间 */
export function timeAgo(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  if (Number.isNaN(diff)) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return fmtDate(value, 'MM-DD')
}

/** 距离某个时间点的倒计时 */
export function countdown(target) {
  const total = new Date(target).getTime() - Date.now()
  const expired = total <= 0
  const abs = Math.max(total, 0)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const minutes = Math.floor((abs % 3600000) / 60000)
  const seconds = Math.floor((abs % 60000) / 1000)
  let label
  if (expired) label = '已截止'
  else if (days > 0) label = `${days} 天 ${hours} 小时`
  else if (hours > 0) label = `${hours} 时 ${minutes} 分`
  else label = `${minutes} 分 ${seconds} 秒`
  return { total, expired, days, hours, minutes, seconds, label }
}

let seq = 0
/** 简单唯一 id */
export function uid(prefix = 'id') {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

export function pct(n, digits = 0) {
  const v = Number(n) || 0
  return `${(v * 100).toFixed(digits)}%`
}

/** 学号脱敏：2024010123 → 2024****23 */
export function maskStudentNo(no) {
  const s = String(no || '').trim()
  if (s.length <= 6) return s.replace(/.(?=.{1})/g, '*')
  return `${s.slice(0, 4)}****${s.slice(-2)}`
}

/** 手机号脱敏 */
export function maskPhone(phone) {
  const s = String(phone || '')
  if (s.length < 7) return s || '—'
  return `${s.slice(0, 3)}****${s.slice(-2)}`
}

export function initialOf(name) {
  if (!name) return '搭'
  return String(name).trim().slice(0, 1)
}

/** 根据字符串生成稳定的头像渐变 */
export function avatarGradient(seed = '') {
  const palettes = [
    ['#6c63ff', '#a99bff'],
    ['#12b3a6', '#5be0d2'],
    ['#f5a623', '#ffcf70'],
    ['#ff6b6b', '#ffa3a3'],
    ['#3b82f6', '#7fb3ff'],
    ['#8b5cf6', '#c4a7ff'],
    ['#0ea5e9', '#6dd3ff'],
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  const [a, b] = palettes[hash % palettes.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

/** 生成某天之后的日期 */
export function nextDate(weekday, baseHour = 0) {
  const now = dayjs()
  const target = Number(weekday)
  const diff = (target - now.day() + 7) % 7 || 7
  return now.add(diff, 'day').hour(baseHour).minute(0).second(0)
}

/** 生成本周内某个周几的日期（周一为一周开始） */
export function dateOfWeekday(weekday) {
  const now = dayjs()
  const current = now.day() === 0 ? 7 : now.day()
  const diff = Number(weekday) - current
  return now.add(diff, 'day')
}

/** 时间字符串比较：'15:00' */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function overlap(aStart, aEnd, bStart, bEnd) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}

/** '2026-11-04' + '15:00' → ISO */
export function at(dateStr, timeStr) {
  return dayjs(`${dateStr} ${timeStr}`).toISOString()
}

export function formatMoney(n) {
  return Number(n || 0).toFixed(2).replace(/\.00$/, '')
}
