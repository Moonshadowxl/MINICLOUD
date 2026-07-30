import type { DB } from './db.js';
import { now } from './db.js';
import { hashSecret, randomId, sha256, signToken, timingSafeEqualStr, verifySecret, verifyToken } from './crypto.js';
import { StorageError } from './storage.js';
import type { Storage } from './storage.js';
import type { Config } from './config.js';

const ACCESS_TTL = 15 * 60; // seconds
/**
 * Observer inks. Printed-plate colours, all in one saturation family so no
 * profile shouts louder than another and none fights the iron the app is set in.
 */
const COLORS = ['#2f4a5c', '#5a4a7a', '#2c5f5a', '#8a6220', '#463d63', '#4d5f2e'];

/**
 * Largest quota we will store. SQLite happily holds a full 64-bit integer, but
 * node:sqlite throws RangeError when reading one back as a JS number — a single
 * oversized quota used to make /auth/profiles (the whole welcome screen) throw
 * forever, with no way out but hand-editing the database.
 */
const MAX_QUOTA_BYTES = Number.MAX_SAFE_INTEGER;

/** Reject quotas that are unrepresentable, negative, or not a number at all. */
export function cleanQuota(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_QUOTA_BYTES) {
    throw new StorageError(400, 'quota must be a positive number of bytes');
  }
  return Math.floor(n);
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
  isOwner: boolean;
  hasPin: boolean;
}

interface UserRow {
  id: string; username: string; display_name: string; color: string;
  password_hash: string; pin_hash: string | null; quota_bytes: number | null;
  is_owner: number; pin_attempts: number; locked_until: number; last_sync_at: number | null;
  pw_attempts: number; pw_locked_until: number;
}

/** 5 free tries, then 30s doubling per extra failure: 30s, 1m, 2m, 4m… capped at an hour. */
function lockoutMs(attempts: number): number {
  if (attempts < 5) return 0;
  return Math.min(30_000 * 2 ** (attempts - 5), 60 * 60_000);
}

const remainingSecs = (until: number): number => Math.ceil((until - now()) / 1000);

export class Auth {
  constructor(
    private db: DB,
    private config: Config,
    private storage: Storage,
    private secret: Buffer,
  ) {}

  toPublic(u: UserRow): PublicUser {
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      color: u.color,
      isOwner: !!u.is_owner,
      hasPin: !!u.pin_hash,
    };
  }

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  profiles(): PublicUser[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as unknown as UserRow[];
    return rows.map((u) => this.toPublic(u));
  }

  byUsername(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  }

  byId(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  createUser(opts: {
    username: string;
    displayName?: string;
    password: string;
    pin?: string;
    color?: string;
    isOwner?: boolean;
    quotaBytes?: number | null;
  }): PublicUser {
    if (this.userCount() >= this.config.maxUsers) {
      throw new StorageError(409, `user limit reached (max ${this.config.maxUsers})`);
    }
    const username = opts.username.trim();
    if (!/^[a-zA-Z0-9_.-]{2,24}$/.test(username)) {
      throw new StorageError(400, 'username must be 2-24 chars (letters, digits, _ . -)');
    }
    if (opts.password.length < 6) throw new StorageError(400, 'password must be at least 6 characters');
    if (opts.pin !== undefined && !/^\d{4,6}$/.test(opts.pin)) {
      throw new StorageError(400, 'PIN must be 4-6 digits');
    }
    if (this.byUsername(username)) throw new StorageError(409, 'username taken');
    const id = randomId();
    this.db
      .prepare(
        `INSERT INTO users (id, username, display_name, color, password_hash, pin_hash, data_key, quota_bytes, is_owner, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        opts.displayName?.trim() || username,
        opts.color ?? COLORS[this.userCount() % COLORS.length],
        hashSecret(opts.password),
        opts.pin ? hashSecret(opts.pin) : null,
        this.storage.createUserKey(),
        cleanQuota(opts.quotaBytes),
        opts.isOwner ? 1 : 0,
        now(),
      );
    return this.toPublic(this.byId(id)!);
  }

  /** Full login with password; registers the device and returns a long-lived device token. */
  loginPassword(username: string, password: string, deviceName: string) {
    const u = this.byUsername(username);
    // Password login used to be the one unthrottled door: the PIN pad locked out
    // after 5 tries while /auth/login accepted guesses forever.
    if (u && u.pw_locked_until > now()) {
      throw new StorageError(429, `too many attempts — locked for ${remainingSecs(u.pw_locked_until)}s`);
    }
    if (!u || !verifySecret(password, u.password_hash)) {
      if (u) {
        const attempts = u.pw_attempts + 1;
        const ms = lockoutMs(attempts);
        this.db
          .prepare('UPDATE users SET pw_attempts = ?, pw_locked_until = ? WHERE id = ?')
          .run(attempts, ms ? now() + ms : 0, u.id);
      }
      throw new StorageError(401, 'wrong username or password');
    }
    const deviceToken = randomId(32);
    const deviceId = randomId();
    this.db
      .prepare('INSERT INTO devices (id, user_id, name, token_hash, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(deviceId, u.id, deviceName || 'device', sha256(deviceToken), now(), now());
    this.resetPinLock(u.id);
    return { user: this.toPublic(u), deviceToken: `${deviceId}.${deviceToken}`, accessToken: this.accessToken(u) };
  }

  /**
   * Quick unlock with PIN — only from a device that already holds a device token,
   * so a stolen PIN alone is useless. Exponential lockout on wrong attempts.
   */
  loginPin(username: string, pin: string, deviceTokenRaw: string) {
    const u = this.byUsername(username);
    if (!u) throw new StorageError(401, 'unknown user');
    if (!u.pin_hash) throw new StorageError(400, 'no PIN set for this user');
    const device = this.verifyDeviceToken(deviceTokenRaw);
    if (!device || device.user_id !== u.id) throw new StorageError(401, 'device not trusted — sign in with password');
    if (u.locked_until > now()) {
      throw new StorageError(429, `too many attempts — locked for ${remainingSecs(u.locked_until)}s`);
    }
    if (!verifySecret(pin, u.pin_hash)) {
      const attempts = u.pin_attempts + 1;
      const ms = lockoutMs(attempts);
      this.db
        .prepare('UPDATE users SET pin_attempts = ?, locked_until = ? WHERE id = ?')
        .run(attempts, ms ? now() + ms : 0, u.id);
      throw new StorageError(401, 'wrong PIN');
    }
    this.resetPinLock(u.id);
    this.db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(now(), device.id);
    return { user: this.toPublic(u), accessToken: this.accessToken(u) };
  }

  /** A successful sign-in of either kind clears both lockout counters. */
  private resetPinLock(userId: string): void {
    this.db
      .prepare('UPDATE users SET pin_attempts = 0, locked_until = 0, pw_attempts = 0, pw_locked_until = 0 WHERE id = ?')
      .run(userId);
  }

  verifyDeviceToken(raw: string): { id: string; user_id: string } | null {
    const dot = raw.indexOf('.');
    if (dot === -1) return null;
    const deviceId = raw.slice(0, dot);
    const token = raw.slice(dot + 1);
    const row = this.db.prepare('SELECT id, user_id, token_hash FROM devices WHERE id = ?').get(deviceId) as
      | { id: string; user_id: string; token_hash: string }
      | undefined;
    if (!row || !timingSafeEqualStr(row.token_hash, sha256(token))) return null;
    return { id: row.id, user_id: row.user_id };
  }

  accessToken(u: UserRow): string {
    return signToken(this.secret, { sub: u.id, name: u.username, owner: !!u.is_owner }, ACCESS_TTL);
  }

  verifyAccess(token: string): { userId: string; isOwner: boolean } | null {
    const payload = verifyToken(this.secret, token);
    if (!payload || typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, isOwner: !!payload.owner };
  }

  setPin(userId: string, currentPassword: string, pin: string | null): void {
    const u = this.byId(userId);
    if (!u) throw new StorageError(404, 'user not found');
    if (!verifySecret(currentPassword, u.password_hash)) throw new StorageError(401, 'wrong password');
    if (pin !== null && !/^\d{4,6}$/.test(pin)) throw new StorageError(400, 'PIN must be 4-6 digits');
    this.db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(pin ? hashSecret(pin) : null, userId);
    this.resetPinLock(userId);
  }

  setPassword(userId: string, currentPassword: string, newPassword: string): void {
    const u = this.byId(userId);
    if (!u) throw new StorageError(404, 'user not found');
    if (!verifySecret(currentPassword, u.password_hash)) throw new StorageError(401, 'wrong password');
    if (newPassword.length < 6) throw new StorageError(400, 'password must be at least 6 characters');
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(newPassword), userId);
  }

  setQuota(actorId: string, targetUserId: string, quotaBytes: unknown): void {
    const actor = this.byId(actorId);
    if (!actor?.is_owner) throw new StorageError(403, 'only the owner can set quotas');
    if (!this.byId(targetUserId)) throw new StorageError(404, 'user not found');
    this.db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(cleanQuota(quotaBytes), targetUserId);
  }

  /** Owner-password check used by the signed-out "add a profile" path. */
  assertOwnerPassword(password: string): void {
    const owner = this.db.prepare('SELECT * FROM users WHERE is_owner = 1 ORDER BY created_at').get() as
      | UserRow
      | undefined;
    if (!owner) throw new StorageError(409, 'no owner profile yet');
    if (owner.pw_locked_until > now()) {
      throw new StorageError(429, `too many attempts — locked for ${remainingSecs(owner.pw_locked_until)}s`);
    }
    if (!verifySecret(password, owner.password_hash)) {
      const attempts = owner.pw_attempts + 1;
      const ms = lockoutMs(attempts);
      this.db
        .prepare('UPDATE users SET pw_attempts = ?, pw_locked_until = ? WHERE id = ?')
        .run(attempts, ms ? now() + ms : 0, owner.id);
      throw new StorageError(401, 'wrong owner password');
    }
    this.resetPinLock(owner.id);
  }

  /**
   * Delete a profile. Owner only, never yourself, never the last owner.
   * Returns the ids of rows removed so the caller can drop the encrypted chunks;
   * the ON DELETE CASCADE takes care of files/blobs/devices/uploads.
   */
  deleteUser(actorId: string, targetId: string): void {
    const actor = this.byId(actorId);
    if (!actor?.is_owner) throw new StorageError(403, 'only the owner can remove profiles');
    if (actorId === targetId) throw new StorageError(400, 'you cannot remove your own profile');
    const target = this.byId(targetId);
    if (!target) throw new StorageError(404, 'user not found');
    this.db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  }

  touchSync(userId: string): void {
    this.db.prepare('UPDATE users SET last_sync_at = ? WHERE id = ?').run(now(), userId);
  }

  lastSync(userId: string): number | null {
    return (this.byId(userId)?.last_sync_at as number | null) ?? null;
  }

  logoutDevice(deviceTokenRaw: string): void {
    const device = this.verifyDeviceToken(deviceTokenRaw);
    if (device) this.db.prepare('DELETE FROM devices WHERE id = ?').run(device.id);
  }
}
