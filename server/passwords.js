import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, hashHex] = String(storedHash || '').split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
