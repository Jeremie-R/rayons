import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env, HttpError } from './http'

// Google tokens are stored encrypted (AES-256-GCM) with TOKEN_ENCRYPTION_KEY, so a leaked
// database dump alone doesn't give access to anyone's mail. Format: base64(iv | tag | data).

function key() {
  const raw = Buffer.from(env('TOKEN_ENCRYPTION_KEY'), 'base64')
  if (raw.length !== 32) throw new HttpError(500, 'not_configured', 'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.')
  return raw
}

export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decrypt(sealed: string) {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
