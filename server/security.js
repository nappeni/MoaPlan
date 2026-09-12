import { Buffer } from 'node:buffer';
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import fs from 'node:fs/promises';
export const hash = (v) => createHash('sha256').update(v).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function passwordHash(p) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(p, salt, 64).toString('hex');
}
export function checkPassword(p, s) {
  try {
    const [salt, h] = s.split(':');
    return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
}
export async function encryptionKey(dir) {
  if (!process.env.ENCRYPTION_KEY) await fs.mkdir(dir, { recursive: true });
  let k = process.env.ENCRYPTION_KEY;
  if (!k) {
    if (process.env.NODE_ENV === 'production') throw new Error('ENCRYPTION_KEY is required');
    try {
      k = await fs.readFile(dir + '/encryption.key', 'utf8');
    } catch {
      k = token();
      await fs.writeFile(dir + '/encryption.key', k, { mode: 0o600 });
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(k))
    throw new Error('ENCRYPTION_KEY must contain 64 hexadecimal characters');
  return Buffer.from(k, 'hex');
}
export function encrypt(value, key) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key, iv);
  return [
    iv.toString('hex'),
    c.update(value, 'utf8', 'hex') + c.final('hex'),
    c.getAuthTag().toString('hex'),
  ].join('.');
}
export function decrypt(value, key) {
  if (!value) return '';
  const [iv, data, tag] = value.split('.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return d.update(data, 'hex', 'utf8') + d.final('utf8');
}
export const secretFields = [
  'aiKey',
  'instagramToken',
  'r2SecretAccessKey',
  'googleClientSecret',
  'googleRefreshToken',
];
export function settingsView(org) {
  return {
    ...org.settings,
    logoId: org.logo?.id || '',
    secrets: Object.fromEntries(secretFields.map((k) => [k, !!org.secrets[k]])),
  };
}
