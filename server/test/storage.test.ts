import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildCtx, type Ctx } from '../src/app.js';

let ctx: Ctx;
let dir: string;
let userId: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minicloud-test-'));
  ctx = buildCtx({ dataDir: dir });
  const user = ctx.auth.createUser({ username: 'tester', password: 'secret1', pin: '1234', isOwner: true });
  userId = user.id;
});

afterEach(() => {
  ctx.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function uploadWhole(p: string, data: Buffer) {
  const up = ctx.storage.createUpload(userId, p, data.length);
  for (let i = 0; i < up.chunkCount; i++) {
    await ctx.storage.putUploadChunk(userId, up.id, i, data.subarray(i * up.chunkSize, (i + 1) * up.chunkSize));
  }
  return ctx.storage.completeUpload(userId, up.id);
}

describe('encrypted chunked storage', () => {
  it('round-trips a multi-chunk file byte-for-byte', async () => {
    const data = crypto.randomBytes(10 * 1024 * 1024 + 123); // 3 chunks, odd tail
    const file = await uploadWhole('big/video.mp4', data);
    expect(file.size).toBe(data.length);
    const back = await ctx.storage.readWhole(userId, file);
    expect(back.equals(data)).toBe(true);
  });

  it('stores nothing readable on disk (chunks are encrypted)', async () => {
    const marker = Buffer.from('TOP-SECRET-MARKER-'.repeat(100));
    await uploadWhole('secret.txt', marker);
    const found: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else found.push(p);
      }
    };
    walk(path.join(dir, 'storage'));
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) {
      expect(fs.readFileSync(p).includes('TOP-SECRET-MARKER')).toBe(false);
    }
  });

  it('serves arbitrary byte ranges correctly across chunk boundaries', async () => {
    const data = crypto.randomBytes(9 * 1024 * 1024);
    const file = await uploadWhole('range.bin', data);
    const cs = 4 * 1024 * 1024;
    for (const [start, end] of [
      [0, 99],
      [cs - 10, cs + 9], // straddles chunk 0/1
      [cs * 2 - 1, data.length - 1], // straddles into last chunk
      [data.length - 5, data.length - 1],
    ] as const) {
      const parts: Buffer[] = [];
      for await (const part of ctx.storage.readRange(userId, file, start, end)) parts.push(part);
      expect(Buffer.concat(parts).equals(data.subarray(start, end + 1))).toBe(true);
    }
  });

  it('resumes an interrupted upload from the missing chunks', async () => {
    const data = crypto.randomBytes(9 * 1024 * 1024); // 3 chunks
    const up = ctx.storage.createUpload(userId, 'resume.bin', data.length);
    await ctx.storage.putUploadChunk(userId, up.id, 0, data.subarray(0, up.chunkSize));
    // crash here. later: ask what arrived, send only the rest
    expect(ctx.storage.receivedChunks(up.id)).toEqual([0]);
    expect(() => ctx.storage.completeUpload(userId, up.id)).toThrow(/incomplete/);
    for (const i of [1, 2]) {
      await ctx.storage.putUploadChunk(userId, up.id, i, data.subarray(i * up.chunkSize, (i + 1) * up.chunkSize));
    }
    const file = ctx.storage.completeUpload(userId, up.id);
    expect((await ctx.storage.readWhole(userId, file)).equals(data)).toBe(true);
  });

  it('rejects tampered chunk data (GCM auth)', async () => {
    const file = await uploadWhole('tamper.txt', Buffer.from('hello world'));
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
      );
    const chunkFile = walk(path.join(dir, 'storage')).find((p) => p.endsWith('.enc'))!;
    const raw = fs.readFileSync(chunkFile);
    raw[raw.length - 1] ^= 0xff;
    fs.writeFileSync(chunkFile, raw);
    await expect(ctx.storage.readWhole(userId, file)).rejects.toThrow();
  });

  it('keeps versions on overwrite and restores them', async () => {
    const v1 = Buffer.from('version one');
    const v2 = Buffer.from('version two — newer');
    await uploadWhole('notes.txt', v1);
    const file = await uploadWhole('notes.txt', v2);
    expect((await ctx.storage.readWhole(userId, file)).toString()).toBe(v2.toString());
    const versions = ctx.storage.listVersions(userId, file.id);
    expect(versions).toHaveLength(1);
    ctx.storage.restoreVersion(userId, file.id, versions[0].id);
    const restored = ctx.storage.byId(userId, file.id);
    expect((await ctx.storage.readWhole(userId, restored)).toString()).toBe(v1.toString());
  });

  it('prunes old versions past the retention limit', async () => {
    for (let i = 0; i <= 8; i++) {
      await ctx.storage.writeFile(userId, 'evolving.txt', Buffer.from(`rev ${i}`));
    }
    await ctx.storage.cleanupStaleBlobs(userId);
    const file = ctx.storage.stat(userId, 'evolving.txt')!;
    expect(ctx.storage.listVersions(userId, file.id).length).toBeLessThanOrEqual(5);
  });

  it('enforces the quota', async () => {
    ctx.db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(1024, userId);
    expect(() => ctx.storage.createUpload(userId, 'huge.bin', 10_000)).toThrow(/quota/);
  });

  it('trash -> restore -> purge lifecycle', async () => {
    const file = await uploadWhole('proj/src/index.ts', Buffer.from('code'));
    ctx.storage.trash(userId, 'proj');
    expect(ctx.storage.stat(userId, 'proj/src/index.ts')).toBeUndefined();
    const trashed = ctx.storage.listTrash(userId).find((f) => f.path === 'proj')!;
    ctx.storage.restore(userId, trashed.id);
    expect(ctx.storage.stat(userId, 'proj/src/index.ts')).toBeDefined();
    ctx.storage.trash(userId, 'proj');
    await ctx.storage.purge(userId, trashed.id);
    expect(ctx.storage.listTrash(userId)).toHaveLength(0);
    // blob data actually gone from disk
    const enc: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        e.isDirectory() ? walk(p) : p.endsWith('.enc') && enc.push(p);
      }
    };
    walk(path.join(dir, 'storage'));
    expect(enc.filter((p) => !p.includes(file.blob_id ?? '∅'))).toHaveLength(enc.length);
  });

  it('moves folders with all descendants', async () => {
    await uploadWhole('old/deep/a.txt', Buffer.from('a'));
    await uploadWhole('old/b.txt', Buffer.from('b'));
    ctx.storage.move(userId, 'old', 'archive/renamed');
    expect(ctx.storage.stat(userId, 'archive/renamed/deep/a.txt')).toBeDefined();
    expect(ctx.storage.stat(userId, 'archive/renamed/b.txt')).toBeDefined();
    expect(ctx.storage.stat(userId, 'old')).toBeUndefined();
  });

  it('computes usage breakdown by category', async () => {
    await uploadWhole('movie.mp4', crypto.randomBytes(1000));
    await uploadWhole('doc.txt', crypto.randomBytes(500));
    const usage = ctx.storage.usage(userId);
    expect(usage.breakdown.media).toBe(1000);
    expect(usage.breakdown.files).toBe(500);
    expect(usage.used).toBe(1500);
  });

  it('rejects path traversal', () => {
    expect(() => ctx.storage.createUpload(userId, '../../etc/passwd', 10)).toThrow(/invalid path/);
  });
});

describe('auth', () => {
  it('password login registers a trusted device; PIN works only with it', () => {
    const session = ctx.auth.loginPassword('tester', 'secret1', 'test-device');
    expect(session.deviceToken).toBeTruthy();
    const pinSession = ctx.auth.loginPin('tester', '1234', session.deviceToken);
    expect(pinSession.accessToken).toBeTruthy();
    expect(() => ctx.auth.loginPin('tester', '1234', 'bogus.token')).toThrow(/not trusted/);
  });

  it('locks the PIN after repeated failures', () => {
    const session = ctx.auth.loginPassword('tester', 'secret1', 'd');
    for (let i = 0; i < 5; i++) {
      expect(() => ctx.auth.loginPin('tester', '0000', session.deviceToken)).toThrow(/wrong PIN/);
    }
    expect(() => ctx.auth.loginPin('tester', '1234', session.deviceToken)).toThrow(/locked/);
  });

  it('caps profiles at 6', () => {
    for (let i = 0; i < 5; i++) {
      ctx.auth.createUser({ username: `friend${i}`, password: 'secret1' });
    }
    expect(() => ctx.auth.createUser({ username: 'one-too-many', password: 'secret1' })).toThrow(/limit/);
  });

  it('access tokens verify and expire structurally', () => {
    const session = ctx.auth.loginPassword('tester', 'secret1', 'd');
    const parsed = ctx.auth.verifyAccess(session.accessToken);
    expect(parsed?.userId).toBe(userId);
    expect(ctx.auth.verifyAccess('garbage')).toBeNull();
  });
});
