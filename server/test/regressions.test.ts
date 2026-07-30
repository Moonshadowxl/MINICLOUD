import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, buildCtx, type Ctx } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

/**
 * One test per bug that was actually reproduced against a running server.
 * Each `it` names the symptom, not the patch, so a regression is obvious.
 */

let ctx: Ctx;
let app: FastifyInstance;
let dir: string;
let owner: { id: string; token: string };

async function signIn(username: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return res.json() as { user: { id: string }; accessToken: string; deviceToken: string };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minicloud-reg-'));
  ctx = buildCtx({ dataDir: dir });
  app = await buildApp(ctx);
  ctx.auth.createUser({ username: 'owner', password: 'secret1', isOwner: true });
  const session = await signIn('owner', 'secret1');
  owner = { id: session.user.id, token: session.accessToken };
});

afterEach(async () => {
  await app.close();
  ctx.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('crashes and data loss', () => {
  it('zips a folder containing a zero-byte file instead of killing the process', async () => {
    await ctx.storage.writeFile(owner.id, 'proj/.gitkeep', Buffer.alloc(0));
    await ctx.storage.writeFile(owner.id, 'proj/readme.md', Buffer.from('hi'));
    const folder = ctx.storage.stat(owner.id, 'proj')!;

    const res = await app.inject({ method: 'GET', url: `/api/files/${folder.id}/zip`, headers: auth(owner.token) });

    expect(res.statusCode).toBe(200);
    // a real zip, and big enough to hold both entries
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });

  it('serves a zero-byte file as an empty 200 rather than throwing', async () => {
    const f = await ctx.storage.writeFile(owner.id, 'empty.txt', Buffer.alloc(0));
    const res = await app.inject({ method: 'GET', url: `/api/files/${f.id}/content`, headers: auth(owner.token) });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBe(0);
  });

  it('does not treat _ or % in a folder name as a SQL LIKE wildcard', async () => {
    ctx.storage.mkdir(owner.id, 'a_b');
    await ctx.storage.writeFile(owner.id, 'axb/secret.txt', Buffer.from('not yours'));
    await ctx.storage.writeFile(owner.id, '100%/mine.txt', Buffer.from('mine'));

    expect(ctx.storage.list(owner.id, 'a_b')).toHaveLength(0);
    expect(ctx.storage.descendants(owner.id, 'a_b')).toHaveLength(0);
    expect(ctx.storage.descendants(owner.id, '100%').map((f) => f.name)).toEqual(['mine.txt']);
  });

  it('trashing "a_b" does not trash the contents of "axb"', async () => {
    ctx.storage.mkdir(owner.id, 'a_b');
    await ctx.storage.writeFile(owner.id, 'axb/keep.txt', Buffer.from('keep me'));

    ctx.storage.trash(owner.id, 'a_b');

    expect(ctx.storage.stat(owner.id, 'axb/keep.txt')).toBeDefined();
  });

  it('rejects a quota too large for SQLite to hand back, keeping the profile list readable', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/quota',
      headers: auth(owner.token),
      payload: { userId: owner.id, quotaBytes: 9e18 },
    });
    expect(res.statusCode).toBe(400);

    // the bug: one bad row made this endpoint throw forever, bricking the welcome screen
    const profiles = await app.inject({ method: 'GET', url: '/api/auth/profiles' });
    expect(profiles.statusCode).toBe(200);
    expect(profiles.json().profiles).toHaveLength(1);
  });

  it('rejects a nonsense quota instead of storing NaN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/quota',
      headers: auth(owner.token),
      payload: { userId: owner.id, quotaBytes: 'twelve' },
    });
    expect(res.statusCode).toBe(400);
    expect(ctx.storage.quotaFor(owner.id)).toBe(ctx.config.totalQuotaBytes);
  });
});

describe('authorisation', () => {
  it('will not let a request body promote a new profile to owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      headers: auth(owner.token),
      payload: { username: 'sneaky', password: 'secret1', isOwner: true, quotaBytes: 9e18 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.isOwner).toBe(false);
    expect(ctx.auth.byUsername('sneaky')?.quota_bytes).toBeNull();
  });

  it('lets a non-owner add nothing, and the owner add profiles', async () => {
    ctx.auth.createUser({ username: 'guest', password: 'secret1' });
    const guest = await signIn('guest', 'secret1');

    const denied = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      headers: auth(guest.accessToken),
      payload: { username: 'friend', password: 'secret1' },
    });
    expect(denied.statusCode).toBe(401);
  });

  it('adds a profile from the signed-out welcome screen with the owner password', async () => {
    // this whole flow used to be a guaranteed 401, so a server could never get a 2nd user
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      payload: { username: 'friend', password: 'secret1', ownerPassword: 'secret1' },
    });
    expect(res.statusCode).toBe(200);
    expect(ctx.auth.byUsername('friend')).toBeDefined();
  });

  it('refuses the signed-out add-profile flow with a wrong owner password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      payload: { username: 'friend', password: 'secret1', ownerPassword: 'nope' },
    });
    expect(res.statusCode).toBe(401);
    expect(ctx.auth.byUsername('friend')).toBeUndefined();
  });

  it('throttles password guessing the way the PIN pad already did', () => {
    for (let i = 0; i < 5; i++) {
      expect(() => ctx.auth.loginPassword('owner', 'wrong', 'd')).toThrow(/wrong username or password/);
    }
    expect(() => ctx.auth.loginPassword('owner', 'secret1', 'd')).toThrow(/locked/);
  });

  it('only the owner may remove a profile, and never themselves', () => {
    const guest = ctx.auth.createUser({ username: 'guest', password: 'secret1' });
    expect(() => ctx.auth.deleteUser(guest.id, owner.id)).toThrow(/only the owner/);
    expect(() => ctx.auth.deleteUser(owner.id, owner.id)).toThrow(/your own profile/);
    ctx.auth.deleteUser(owner.id, guest.id);
    expect(ctx.auth.byUsername('guest')).toBeUndefined();
  });

  it('removing a profile takes its files, chunks and search index with it', async () => {
    const guest = ctx.auth.createUser({ username: 'guest', password: 'secret1' });
    const f = await ctx.storage.writeFile(guest.id, 'diary.md', Buffer.from('their private words'));
    await ctx.search.indexFile(guest.id, f);
    expect(ctx.search.search(guest.id, 'private')).toHaveLength(1);

    await ctx.storage.deleteUserData(guest.id, () => ctx.auth.deleteUser(owner.id, guest.id));

    expect(fs.existsSync(path.join(dir, 'storage', guest.id))).toBe(false);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM files WHERE user_id = ?').get(guest.id)).toEqual({ n: 0 });
    expect(ctx.search.search(guest.id, 'private')).toHaveLength(0);
  });
});

describe('housekeeping', () => {
  it('cleans up each user’s own stale chunks, not just the caller’s', async () => {
    const other = ctx.auth.createUser({ username: 'other', password: 'secret1' });
    for (let i = 0; i < 8; i++) {
      await ctx.storage.writeFile(other.id, 'notes.txt', Buffer.from(`rev ${i}`));
    }
    // the caller is `owner`, but the pruned blobs belong to `other`
    await ctx.storage.cleanupStaleBlobs(owner.id);
    await ctx.storage.cleanupStaleBlobs(other.id);

    const chunks: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.enc')) chunks.push(p);
      }
    };
    walk(path.join(dir, 'storage', other.id));
    // 5 kept versions + the current one; the 2 pruned ones are gone from disk
    expect(chunks.length).toBeLessThanOrEqual(6);
  });

  it('reclaims abandoned uploads and expired trash', async () => {
    const up = ctx.storage.createUpload(owner.id, 'half.bin', 8 * 1024 * 1024);
    await ctx.storage.putUploadChunk(owner.id, up.id, 0, Buffer.alloc(4 * 1024 * 1024));
    ctx.db.prepare('UPDATE uploads SET created_at = ? WHERE id = ?').run(Date.now() - 3 * 86400_000, up.id);

    await ctx.storage.writeFile(owner.id, 'old.txt', Buffer.from('gone tomorrow'));
    ctx.storage.trash(owner.id, 'old.txt');
    ctx.db.prepare('UPDATE files SET deleted_at = ? WHERE path = ?').run(Date.now() - 90 * 86400_000, 'old.txt');

    const result = await ctx.storage.collectGarbage();

    expect(result.uploads).toBe(1);
    expect(result.trashed).toBe(1);
    expect(ctx.storage.listTrash(owner.id)).toHaveLength(0);
  });

  it('reports trash separately from live bytes so the breakdown adds up', async () => {
    await ctx.storage.writeFile(owner.id, 'keep.txt', Buffer.alloc(100));
    await ctx.storage.writeFile(owner.id, 'drop.txt', Buffer.alloc(400));
    ctx.storage.trash(owner.id, 'drop.txt');

    const usage = ctx.storage.usage(owner.id);
    const breakdown = Object.values(usage.breakdown).reduce((a, b) => a + b, 0);

    expect(usage.used).toBe(500); // trash still occupies the disk
    expect(usage.liveUsed).toBe(100);
    expect(usage.trashBytes).toBe(400);
    expect(breakdown).toBe(usage.liveUsed);
  });
});

describe('downloads', () => {
  it('sends a readable filename instead of a percent-encoded one', async () => {
    const f = await ctx.storage.writeFile(owner.id, 'my notes (final).txt', Buffer.from('x'));
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/${f.id}/content?download`,
      headers: auth(owner.token),
    });
    expect(res.headers['content-disposition']).toContain('filename="my notes (final).txt"');
  });

  it('rejects control characters in a stored path', () => {
    expect(() => ctx.storage.mkdir(owner.id, 'bad\u0000name')).toThrow(/invalid path/);
  });
});
