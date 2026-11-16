/**
 * 开发期全路由巡检：控制台错误 / 横向溢出 / 占位文案检查（不参与生产构建）
 * 用法：node scripts/audit.mjs [--base=http://127.0.0.1:4173]
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const baseArg = process.argv.find((a) => a.startsWith('--base='))
const base = baseArg ? baseArg.slice('--base='.length) : 'http://127.0.0.1:4173'

const routes = [
  ['/', '工作台'],
  ['/classroom', '教室借用'],
  ['/classroom/status', '我的申请'],
  ['/classroom/status/ap_seed_001', '申请详情'],
  ['/lostfound', '失物招领广场'],
  ['/lostfound/publish', '发布'],
  ['/groupbuy', '拼单集市'],
  ['/groupbuy/gb_001', '拼单详情'],
  ['/forum', '校园论坛'],
  ['/forum/fp_001', '帖子详情'],
  ['/notifications', '消息通知'],
  ['/ai-record', 'AI 使用记录'],
  ['/profile', '个人资料'],
  ['/not-a-real-page', '404'],
]

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = resolve('.tmp/chrome-audit-profile')
const port = 9334
mkdirSync(profile, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitEndpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return (await res.json()).webSocketDebuggerUrl
    } catch {
      /* retry */
    }
    await sleep(150)
  }
  throw new Error('chrome devtools endpoint not ready')
}

let ws
let seq = 0
const pending = new Map()
let currentErrors = []

function send(method, params = {}, sessionId) {
  const id = ++seq
  const payload = { id, method, params }
  if (sessionId) payload.sessionId = sessionId
  ws.send(JSON.stringify(payload))
  return new Promise((res, rej) => pending.set(id, { res, rej }))
}

let sessionId

async function goto(url) {
  await send('Page.navigate', { url }, sessionId)
  await sleep(1500)
}

async function evaluate(expression) {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  return out.result?.value
}

async function auditViewport(label, width, height, mobile, user, extraRoutes = []) {
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height },
    sessionId,
  )
  await goto(`${base}/`)
  await evaluate(`localStorage.clear()`)
  await evaluate(
    `localStorage.setItem('campus-smart-dispatch-platform:v1:user', ${JSON.stringify(JSON.stringify(user))})`,
  )

  console.log(`\n=== ${label} ${width}x${height} ===`)
  let bad = 0
  for (const [path, name] of [...routes, ...extraRoutes]) {
    currentErrors = []
    await goto(base + path)
    await sleep(400)
    const info = await evaluate(`(() => {
      const root = document.documentElement
      const text = document.body.innerText || ''
      return {
        title: document.title,
        scrollW: root.scrollWidth,
        clientW: root.clientWidth,
        stub: /页面正在开发中|敬请期待|TODO/.test(text),
        h1: (document.querySelector('h1,h2')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 40),
        bad: text.length < 40,
      }
    })()`)
    const overflow = info.scrollW > info.clientW + 1
    const errs = currentErrors.slice(0, 2)
    const ok = !overflow && !info.stub && errs.length === 0 && !info.bad
    if (!ok) bad += 1
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${path.padEnd(38)} ${String(info.scrollW).padStart(5)}/${String(info.clientW).padEnd(5)} ${name}${overflow ? ' OVERFLOW' : ''}${info.stub ? ' STUB' : ''}${info.bad ? ' EMPTY' : ''}${errs.length ? ` ERR:${errs[0].slice(0, 120)}` : ''}`,
    )
  }
  return bad
}

async function main() {
  const browserWs = await waitEndpoint()
  ws = new WebSocket(browserWs)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(msg.error.message))
      else res(msg.result)
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      currentErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      currentErrors.push(msg.params.entry.text)
    }
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Log.enable', {}, sessionId)

  const student = {
    id: 'u_0123',
    studentNo: '2024010123',
    name: '林小满',
    role: '学生',
    college: '数字媒体学院',
    bio: '演示账号',
    loginAt: new Date().toISOString(),
  }
  const admin = {
    id: 'u_0001',
    studentNo: '2021000001',
    name: '周老师',
    role: '高级管理员',
    roleKey: 'super_admin',
    roleLevel: 100,
    college: '学生工作处',
    bio: '演示账号',
    loginAt: new Date().toISOString(),
  }

  let bad = 0
  bad += await auditViewport('桌面', 1440, 1000, false, student)
  bad += await auditViewport('移动', 390, 844, true, student)
  bad += await auditViewport('高级管理员桌面', 1440, 1000, false, admin, [['/system', '系统控制台']])

  console.log(`\n=== 巡检完成：${bad} 项异常 ===`)
  process.exitCode = bad > 0 ? 1 : 0
}

main()
  .catch((err) => {
    console.error('audit failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => {
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    chrome.kill()
  })
