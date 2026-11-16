import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function loadEncryptionKey(secretPath) {
  fs.mkdirSync(path.dirname(secretPath), { recursive: true })
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, randomBytes(32).toString('base64url'), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
  }
  const raw = fs.readFileSync(secretPath, 'utf8').trim()
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(payload, key) {
  const [version, ivText, tagText, encryptedText] = String(payload || '').split(':')
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('加密数据格式无效')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
