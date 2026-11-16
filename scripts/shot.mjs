/**
 * 开发期截图 / 控制台错误检查脚本（不参与生产构建）
 * 用法：
 *   node scripts/shot.mjs <url> <out.png> [--w=1440] [--h=1000] [--mobile] [--login]
 * 说明：
 *   --login  以演示账号「林小满」注入 localStorage 会话，便于截取登录后页面
 * 通过 Chrome DevTools Protocol 驱动本机 Chrome，无需额外依赖。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--w=1440] [--h=1000] [--mobile] [--login]')
  process.exit(1)
}
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}
const width = flag('w', 1440)
const height = flag('h', 1000)
const wait = flag('wait', 4200)
const mobile = args.includes('--mobile')
const login = args.includes('--login')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = resolve('.tmp/chrome-shot-profile')
const port = 9333
mkdirSync(profile, { recursive: true })
mkdirSync(dirname(resolve(out)), { recursive: true })

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
const consoleErrors = []

function send(method, params = {}, sessionId) {
  const id = ++seq
  const payload = { id, method, params }
  if (sessionId) payload.sessionId = sessionId
  ws.send(JSON.stringify(payload))
  return new Promise((res, rej) => pending.set(id, { res, rej }))
}

let sessionId

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
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text)
    }
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const attached = await send('Target.attachToTarget', { targetId, flatten: true })
  sessionId = attached.sessionId

  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Log.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 2, mobile, screenWidth: width, screenHeight: height },
    sessionId,
  )

  const origin = new URL(url).origin
  await send('Page.navigate', { url: `${origin}/` }, sessionId)
  await sleep(1200)

  if (args.includes('--reset')) {
    await send('Runtime.evaluate', { expression: "localStorage.clear()" }, sessionId)
  }

  if (!login) {
    await send('Runtime.evaluate', { expression: "localStorage.removeItem('campus-smart-dispatch-platform:v1:user')" }, sessionId)
  }

  if (login) {
    const isAdmin = args.includes('--admin')
    const user = isAdmin
      ? {
          id: 'u_0001',
          studentNo: '2021000001',
          name: '周老师',
          role: '管理员',
          college: '学生工作处',
          bio: '让校园资源被更公平地调度',
          loginAt: new Date().toISOString(),
        }
      : {
          id: 'u_0123',
          studentNo: '2024010123',
          name: '林小满',
          role: '学生',
          college: '数字媒体学院',
          bio: '用一句话，让校园小事被安排好',
          loginAt: new Date().toISOString(),
        }
    await send(
      'Runtime.evaluate',
      { expression: `localStorage.setItem('campus-smart-dispatch-platform:v1:user', ${JSON.stringify(JSON.stringify(user))})` },
      sessionId,
    )
  }

  await send('Page.navigate', { url }, sessionId)
  await sleep(wait)
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }, sessionId)
  await sleep(400)

  const actArg = args.find((a) => a.startsWith('--act='))
  if (actArg) {
    const expr = actArg.slice('--act='.length)
    await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
    await sleep(flag('act-wait', 2200))
  }

  const act2Arg = args.find((a) => a.startsWith('--act2='))
  if (act2Arg) {
    const expr = act2Arg.slice('--act2='.length)
    await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
    await sleep(flag('act2-wait', 2600))
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
  writeFileSync(resolve(out), Buffer.from(shot.data, 'base64'))

  const metrics = await send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, title: document.title})`,
      returnByValue: true,
    },
    sessionId,
  )
  console.log(`saved ${out} ${width}x${height}${mobile ? ' mobile' : ''}`)
  console.log(`page ${metrics.result.value}`)

  const fontArg = args.find((a) => a.startsWith('--platform-fonts='))
  if (fontArg) {
    const selector = fontArg.slice('--platform-fonts='.length)
    await send('DOM.enable', {}, sessionId)
    await send('CSS.enable', {}, sessionId)
    const doc = await send('DOM.getDocument', { depth: -1 }, sessionId)
    const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector }, sessionId)
    if (node.nodeId) {
      const fonts = await send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId }, sessionId)
      console.log('FONTS:', JSON.stringify(fonts.fonts))
    } else {
      console.log('FONTS: node not found')
    }
  }

  const jsFileArg = args.find((a) => a.startsWith('--js-file='))
  const jsArg = jsFileArg
    ? `--js=${readFileSync(jsFileArg.slice('--js-file='.length), 'utf8').trim()}`
    : args.find((a) => a.startsWith('--js='))
  if (jsArg) {
    const expr = jsArg.slice('--js='.length)
    const evaluated = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
    console.log('JS:', JSON.stringify(evaluated.result.value ?? evaluated.result.description))
  }
  if (consoleErrors.length) {
    console.log('CONSOLE_ERRORS:')
    consoleErrors.slice(0, 10).forEach((e) => console.log(' -', e.slice(0, 300)))
  } else {
    console.log('CONSOLE_ERRORS: none')
  }
}

main()
  .catch((err) => {
    console.error('shot failed:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    chrome.kill()
  })
