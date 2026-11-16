import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const packagePath = path.join(projectDir, 'package.json')
const lockPath = path.join(projectDir, 'package-lock.json')
const contextArg = process.argv.find((arg) => arg.startsWith('--context='))
const context = contextArg?.split('=')[1] || 'manual'

function npmInvocation(args) {
  if (process.platform !== 'win32') {
    return { command: 'npm', args }
  }
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: [
      '/d',
      '/s',
      '/c',
      `npm ${args.map((arg) => String(arg)).join(' ')}`,
    ],
  }
}

function log(level, message) {
  const output = level === 'ERROR' ? console.error : console.log
  output(`[deps][${level}] ${message}`)
}

function fail(message, details = '') {
  log('ERROR', message)
  if (details) {
    for (const line of String(details).trim().split(/\r?\n/).slice(-20)) {
      log('ERROR', line)
    }
  }
  process.exit(1)
}

function runNpmCapture(args) {
  const invocation = npmInvocation(args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: projectDir,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  })
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error,
  }
}

function runNpmStreaming(args) {
  log('INFO', `执行命令：npm ${args.join(' ')}`)
  return new Promise((resolve, reject) => {
    const invocation = npmInvocation(args)
    const child = spawn(invocation.command, invocation.args, {
      cwd: projectDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        npm_config_audit: 'false',
        npm_config_fund: 'false',
      },
    })
    const output = []
    const forward = (stream, level) => {
      let buffer = ''
      stream.on('data', (chunk) => {
        buffer += String(chunk)
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines.filter(Boolean)) {
          output.push(line)
          log(level, line)
        }
      })
      stream.on('end', () => {
        if (buffer.trim()) {
          output.push(buffer)
          log(level, buffer)
        }
      })
    }
    forward(child.stdout, 'INFO')
    forward(child.stderr, 'WARN')
    child.on('error', (error) => {
      reject(
        new Error(
          `无法启动 npm：${error.message}。请确认 Node.js/npm 已正确安装并加入 PATH。`,
        ),
      )
    })
    child.on('exit', (code) => {
      if (code === 0) resolve(output)
      else {
        const error = new Error(`npm 命令失败，退出码 ${code ?? '未知'}`)
        error.output = output.slice(-20).join('\n')
        reject(error)
      }
    })
  })
}

function parseNpmLs(result) {
  const text = result.stdout.trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        // 在下方向调用方展示原始输出。
      }
    }
    throw new Error(`npm ls 返回了无法解析的内容：${text.slice(0, 500)}`)
  }
}

function parseVersion(value) {
  const match = String(value || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/i)
  if (!match) return null
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)]
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function upperForPrefix(base, prefix) {
  const [major, minor, patch] = base
  if (prefix === '~') return [major, minor + 1, 0]
  if (major > 0) return [major + 1, 0, 0]
  if (minor > 0) return [0, minor + 1, 0]
  return [0, 0, patch + 1]
}

function satisfiesComparator(version, comparator) {
  const value = comparator.trim()
  if (!value || value === '*' || value === 'x') return true
  const match = value.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/)
  if (!match) return true
  const operator = match[1] || '='
  const base = parseVersion(match[2])
  if (!base) return true
  const compared = compareVersions(version, base)
  if (operator === '^' || operator === '~') {
    return compared >= 0 && compareVersions(version, upperForPrefix(base, operator)) < 0
  }
  if (operator === '>=') return compared >= 0
  if (operator === '>') return compared > 0
  if (operator === '<=') return compared <= 0
  if (operator === '<') return compared < 0
  return compared === 0
}

function satisfiesRange(versionText, rangeText) {
  const version = parseVersion(versionText)
  const range = String(rangeText || '').trim()
  if (!version || !range) return true
  if (/^(?:file:|link:|workspace:|git\+|https?:)/i.test(range)) return true
  return range.split('||').some((group) => {
    const hyphen = group.trim().match(/^(\S+)\s+-\s+(\S+)$/)
    if (hyphen) {
      const minimum = parseVersion(hyphen[1])
      const maximum = parseVersion(hyphen[2])
      return (
        minimum &&
        maximum &&
        compareVersions(version, minimum) >= 0 &&
        compareVersions(version, maximum) <= 0
      )
    }
    return group
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => satisfiesComparator(version, part))
  })
}

function inspectInstalledVersions(manifest) {
  const missing = new Set()
  const incompatible = new Set()
  const problems = []
  const declared = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  }
  for (const [name, range] of Object.entries(declared)) {
    const packageJsonPath = path.join(projectDir, 'node_modules', ...name.split('/'), 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      missing.add(name)
      problems.push(`missing: ${name}`)
      continue
    }
    try {
      const installed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (!satisfiesRange(installed.version, range)) {
        incompatible.add(name)
        problems.push(`invalid: ${name}@${installed.version} does not satisfy ${range}`)
      }
    } catch {
      incompatible.add(name)
      problems.push(`invalid: ${name} 的 package.json 无法读取`)
    }
  }
  return { missing, incompatible, problems }
}

function dependencyIssues(report, manifest) {
  const packageName = (value) => {
    const text = String(value || '').trim()
    if (text.startsWith('@')) {
      const slash = text.indexOf('/')
      const versionAt = text.indexOf('@', slash + 1)
      return versionAt > 0 ? text.slice(0, versionAt) : text
    }
    const versionAt = text.indexOf('@')
    return versionAt > 0 ? text.slice(0, versionAt) : text
  }
  const problems = Array.isArray(report.problems) ? report.problems : []
  const missing = new Set(
    problems
      .filter((item) => /^missing:|UNMET DEPENDENCY/i.test(item))
      .map((item) =>
        packageName(
          item
            .replace(/^missing:\s*/i, '')
            .replace(/,.*$/, '')
            .trim(),
        ),
      ),
  )
  const incompatible = new Set(
    problems
      .filter((item) => /^invalid:/i.test(item))
      .map((item) =>
        packageName(
          item
            .replace(/^invalid:\s*/i, '')
            .replace(/,.*$/, '')
            .trim(),
        ),
      ),
  )
  for (const [name, dependency] of Object.entries(report.dependencies || {})) {
    if (dependency?.missing) missing.add(name)
    if (dependency?.invalid) incompatible.add(name)
  }
  const installed = inspectInstalledVersions(manifest)
  for (const name of installed.missing) missing.add(name)
  for (const name of installed.incompatible) incompatible.add(name)
  return {
    missing: [...missing].filter(Boolean),
    incompatible: [...incompatible].filter(Boolean),
    problems: [...new Set([...problems, ...installed.problems])],
  }
}

function checkDependencies() {
  const result = runNpmCapture(['ls', '--depth=0', '--json'])
  const report = parseNpmLs(result)
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  return {
    ...dependencyIssues(report, manifest),
    raw: report,
    exitCode: result.code,
    stderr: result.stderr,
  }
}

async function main() {
  log('INFO', `开始检查项目依赖（场景：${context}）`)
  log('INFO', `项目目录：${projectDir}`)

  if (process.env.SKIP_DEPENDENCY_CHECK === '1') {
    log('OK', '启动器已完成本次依赖检测，跳过重复检查')
    return
  }
  if (!fs.existsSync(packagePath)) {
    fail(`未找到 package.json：${packagePath}`)
  }
  if (!fs.existsSync(lockPath)) {
    log('WARN', '未找到 package-lock.json，将按 package.json 的版本范围安装依赖')
  }

  const major = Number(process.versions.node.split('.')[0])
  log('INFO', `Node.js：${process.version}`)
  if (major < 24) {
    fail(
      `当前 Node.js ${process.version} 不满足项目要求（>=24）。请安装 Node.js 24 或更高版本。`,
    )
  }

  const npmVersion = runNpmCapture(['--version'])
  if (npmVersion.code !== 0) {
    fail('无法运行 npm，请确认 npm 已安装并加入 PATH', npmVersion.stderr)
  }
  log('INFO', `npm：${npmVersion.stdout.trim()}`)

  log('INFO', '正在核对 package.json 中的依赖及已安装版本...')
  let issues
  try {
    issues = checkDependencies()
  } catch (error) {
    fail(`依赖检测失败：${error.message}`)
  }

  if (!issues.missing.length && !issues.incompatible.length) {
    const installed = Object.keys(issues.raw.dependencies || {}).length
    log('OK', `依赖检查通过，已安装 ${installed} 个顶层依赖且版本兼容`)
    return
  }

  if (issues.missing.length) {
    log('WARN', `缺少依赖：${issues.missing.join('、')}`)
  }
  if (issues.incompatible.length) {
    log('WARN', `版本不兼容：${issues.incompatible.join('、')}`)
  }

  try {
    if (issues.missing.length) {
      log('INFO', '开始自动安装缺失依赖，请在网络较慢时耐心等待...')
      await runNpmStreaming(['install', '--no-audit', '--no-fund'])
    }
    if (issues.incompatible.length) {
      log('INFO', '开始在 package.json 允许范围内更新不兼容依赖...')
      await runNpmStreaming(['update', '--no-audit', '--no-fund'])
    }
  } catch (error) {
    fail(
      `依赖自动安装/更新失败：${error.message}`,
      [
        error.output || '',
        '可能原因：网络不可用、npm registry 无法访问、代理配置错误，或 node_modules 被其他程序占用。',
        '可运行 npm config get registry 检查源地址，并确认当前目录有写入权限。',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  log('INFO', '安装/更新完成，正在重新验证依赖版本...')
  let verified
  try {
    verified = checkDependencies()
  } catch (error) {
    fail(`依赖复检失败：${error.message}`)
  }
  if (verified.missing.length || verified.incompatible.length) {
    fail(
      '依赖复检未通过',
      [
        verified.missing.length
          ? `仍缺少：${verified.missing.join('、')}`
          : '',
        verified.incompatible.length
          ? `版本仍不兼容：${verified.incompatible.join('、')}`
          : '',
        ...verified.problems,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  log('OK', '依赖已准备完成，所有必需包均可用且版本兼容')
}

main().catch((error) => {
  fail(`依赖管理发生未预期错误：${error?.message || error}`)
})
