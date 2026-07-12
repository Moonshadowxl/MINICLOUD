import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * MiniCloud crypto:
 * - A 32-byte master key lives in a keyfile OUTSIDE the storage dir.
 * - Each user gets a random 32-byte data key, stored wrapped (AES-256-GCM) by the master key.
 * - File content is stored as 4MB chunks, each independently encrypted AES-256-GCM with the
 *   user's data key, so any byte range can be served by decrypting only the chunks it touches.
 * - Passwords/PINs are scrypt-hashed (built into Node — no native deps for the home server).
 */

const IV_LEN = 12;
const TAG_LEN = 16;

export function loadOrCreateMasterKey(keysDir: string): Buffer {
  const keyPath = path.join(keysDir, 'master.key');
  if (fs.existsSync(keyPath)) {
    const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error(`master.key at ${keyPath} is corrupt (expected 32 bytes)`);
    return key;
  }
  fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString('base64') + '\n', { mode: 0o600 });
  return key;
}

export function newDataKey(): Buffer {
  return crypto.randomBytes(32);
}

export function wrapKey(masterKey: Buffer, dataKey: Buffer): string {
  return encrypt(masterKey, dataKey).toString('base64');
}

export function unwrapKey(masterKey: Buffer, wrapped: string): Buffer {
  return decrypt(masterKey, Buffer.from(wrapped, 'base64'));
}

/** iv || tag || ciphertext */
export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decrypt(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Bytes of overhead each stored chunk carries over its plaintext size. */
export const CHUNK_OVERHEAD = IV_LEN + TAG_LEN;

// --- password / PIN hashing (scrypt) ---

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(secret, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

// --- minimal JWT (HS256), secret derived from the master key ---

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function jwtSecret(masterKey: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), 'minicloud-jwt', 32));
}

export function signToken(secret: Buffer, payload: Record<string, unknown>, ttlSeconds: number): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(
    Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(secret: Buffer, token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
