import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { now } from './db.js';
import { decrypt, encrypt, newDataKey, randomId, unwrapKey, wrapKey } from './crypto.js';

export class StorageError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export type Category = 'files' | 'media' | 'projects' | 'apps';

export interface FileRow {
  id: string;
  user_id: string;
  path: string;
  name: string;
  is_dir: number;
  blob_id: string | null;
  size: number;
  mime: string;
  category: string;
  mtime: number | null;
  created_at: number;
  deleted_at: number | null;
}

const MEDIA_EXT = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v',
  'mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'aac',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'heic',
]);

const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus',
  pdf: 'application/pdf', zip: 'application/zip', wasm: 'application/wasm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
};

export function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i + 1).toLowerCase();
}

export function mimeOf(p: string): string {
  return MIME[extOf(p)] ?? 'application/octet-stream';
}

export function categoryOf(p: string, explicit?: Category): Category {
  if (explicit) return explicit;
  return MEDIA_EXT.has(extOf(p)) ? 'media' : 'files';
}

/** Normalize a client-supplied storage path; rejects traversal. */
export function normPath(p: string): string {
  const parts = p.replaceAll('\\', '/').split('/').filter((s) => s.length > 0);
  for (const part of parts) {
    if (part === '.' || part === '..') throw new StorageError(400, 'invalid path');
    // Control characters would corrupt paths on export (zip entries, sync agent, disk).
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(part)) throw new StorageError(400, 'invalid path');
  }
  return parts.join('/');
}

/**
 * Escape a string used as a literal inside SQL `LIKE ... ESCAPE '\'`.
 * Without this a folder named "a_b" matches "axb", so listing, trashing or
 * purging one folder silently reaches into an unrelated sibling.
 */
export function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** SQL fragment + params for "everything under this folder". */
function subtreeLike(p: string): string {
  return p ? `${likeLiteral(p)}/%` : '%';
}

export class Storage {
  private keyCache = new Map<string, Buffer>();

  constructor(
    private db: DB,
    private config: Config,
    private masterKey: Buffer,
  ) {
    fs.mkdirSync(config.storageDir, { recursive: true });
  }

  // --- keys ---

  createUserKey(): string {
    return wrapKey(this.masterKey, newDataKey());
  }

  userKey(userId: string): Buffer {
    let key = this.keyCache.get(userId);
    if (!key) {
      const row = this.db.prepare('SELECT data_key FROM users WHERE id = ?').get(userId) as
        | { data_key: string }
        | undefined;
      if (!row) throw new StorageError(404, 'user not found');
      key = unwrapKey(this.masterKey, row.data_key);
      this.keyCache.set(userId, key);
    }
    return key;
  }

  // --- quota ---

  /**
   * Bytes this user occupies. Trashed files still take real disk space, so they
   * still count — but they are reported separately (see `usage`) instead of being
   * silently folded into a total the category breakdown could never add up to.
   */
  usedBytes(userId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE user_id = ? AND is_dir = 0')
      .get(userId) as { used: number };
    return row.used;
  }

  liveBytes(userId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE user_id = ? AND is_dir = 0 AND deleted_at IS NULL',
      )
      .get(userId) as { used: number };
    return row.used;
  }

  poolUsedBytes(): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE is_dir = 0').get() as {
      used: number;
    };
    return row.used;
  }

  quotaFor(userId: string): number {
    const row = this.db.prepare('SELECT quota_bytes FROM users WHERE id = ?').get(userId) as
      | { quota_bytes: number | null }
      | undefined;
    return row?.quota_bytes ?? this.config.totalQuotaBytes;
  }

  assertQuota(userId: string, incomingBytes: number): void {
    if (this.usedBytes(userId) + incomingBytes > this.quotaFor(userId)) {
      throw new StorageError(413, 'storage quota exceeded');
    }
    if (this.poolUsedBytes() + incomingBytes > this.config.totalQuotaBytes) {
      throw new StorageError(413, 'total storage pool exceeded');
    }
  }

  // --- chunk files on disk ---

  private blobDir(userId: string, blobId: string): string {
    return path.join(this.config.storageDir, userId, blobId.slice(0, 2), blobId);
  }

  private chunkPath(userId: string, blobId: string, idx: number): string {
    return path.join(this.blobDir(userId, blobId), `${idx}.enc`);
  }

  private async writeChunk(userId: string, blobId: string, idx: number, plain: Buffer): Promise<void> {
    const dir = this.blobDir(userId, blobId);
    await fsp.mkdir(dir, { recursive: true });
    const finalPath = this.chunkPath(userId, blobId, idx);
    const tmpPath = `${finalPath}.tmp-${randomId(4)}`;
    const data = encrypt(this.userKey(userId), plain);
    const fh = await fsp.open(tmpPath, 'w');
    try {
      await fh.writeFile(data);
      await fh.sync(); // crash-safety: chunk is fully on disk before it counts
    } finally {
      await fh.close();
    }
    await fsp.rename(tmpPath, finalPath);
  }

  async readChunk(userId: string, blobId: string, idx: number): Promise<Buffer> {
    const data = await fsp.readFile(this.chunkPath(userId, blobId, idx));
    return decrypt(this.userKey(userId), data);
  }

  private async deleteBlobData(userId: string, blobId: string): Promise<void> {
    await fsp.rm(this.blobDir(userId, blobId), { recursive: true, force: true });
  }

  chunkCountFor(size: number): number {
    return size === 0 ? 0 : Math.ceil(size / this.config.chunkSize);
  }

  // --- resumable uploads ---

  createUpload(userId: string, rawPath: string, size: number, opts: { mtime?: number; category?: Category } = {}) {
    const p = normPath(rawPath);
    if (!p) throw new StorageError(400, 'path required');
    if (size < 0) throw new StorageError(400, 'bad size');
    this.assertQuota(userId, size);
    const id = randomId();
    const blobId = randomId();
    this.db
      .prepare(
        `INSERT INTO uploads (id, user_id, path, size, chunk_size, blob_id, category, mtime, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .run(id, userId, p, size, this.config.chunkSize, blobId, opts.category ?? null, opts.mtime ?? null, now());
    return { id, chunkSize: this.config.chunkSize, chunkCount: this.chunkCountFor(size) };
  }

  getUpload(userId: string, uploadId: string) {
    const up = this.db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(uploadId, userId) as
      | {
          id: string; user_id: string; path: string; size: number; chunk_size: number;
          blob_id: string; category: string | null; mtime: number | null; status: string;
        }
      | undefined;
    if (!up) throw new StorageError(404, 'upload not found');
    return up;
  }

  receivedChunks(uploadId: string): number[] {
    return (
      this.db.prepare('SELECT idx FROM upload_chunks WHERE upload_id = ? ORDER BY idx').all(uploadId) as {
        idx: number;
      }[]
    ).map((r) => r.idx);
  }

  async putUploadChunk(userId: string, uploadId: string, idx: number, data: Buffer): Promise<void> {
    const up = this.getUpload(userId, uploadId);
    if (up.status !== 'active') throw new StorageError(409, `upload is ${up.status}`);
    const chunkCount = this.chunkCountFor(up.size);
    if (idx < 0 || idx >= chunkCount) throw new StorageError(400, 'chunk index out of range');
    const expected = idx === chunkCount - 1 ? up.size - idx * up.chunk_size : up.chunk_size;
    if (data.length !== expected) {
      throw new StorageError(400, `chunk ${idx}: expected ${expected} bytes, got ${data.length}`);
    }
    await this.writeChunk(userId, up.blob_id, idx, data);
    this.db.prepare('INSERT OR REPLACE INTO upload_chunks (upload_id, idx) VALUES (?, ?)').run(uploadId, idx);
  }

  completeUpload(userId: string, uploadId: string): FileRow {
    const up = this.getUpload(userId, uploadId);
    if (up.status !== 'active') throw new StorageError(409, `upload is ${up.status}`);
    const chunkCount = this.chunkCountFor(up.size);
    const got = this.receivedChunks(uploadId).length;
    if (got !== chunkCount) {
      throw new StorageError(409, `upload incomplete: ${got}/${chunkCount} chunks received`);
    }
    const file = this.finalizeBlobAsFile(userId, up.blob_id, up.path, up.size, {
      category: (up.category as Category | null) ?? undefined,
      mtime: up.mtime ?? undefined,
    });
    this.db.prepare("UPDATE uploads SET status = 'done' WHERE id = ?").run(uploadId);
    return file;
  }

  async abortUpload(userId: string, uploadId: string): Promise<void> {
    const up = this.getUpload(userId, uploadId);
    this.db.prepare("UPDATE uploads SET status = 'aborted' WHERE id = ?").run(uploadId);
    await this.deleteBlobData(userId, up.blob_id);
  }

  /** Write a small (single-request) file straight into the store. Used by folder/batch uploads. */
  async writeFile(
    userId: string,
    rawPath: string,
    content: Buffer,
    opts: { mtime?: number; category?: Category } = {},
  ): Promise<FileRow> {
    const p = normPath(rawPath);
    if (!p) throw new StorageError(400, 'path required');
    this.assertQuota(userId, content.length);
    const blobId = randomId();
    const chunkCount = this.chunkCountFor(content.length);
    for (let i = 0; i < chunkCount; i++) {
      await this.writeChunk(userId, blobId, i, content.subarray(i * this.config.chunkSize, (i + 1) * this.config.chunkSize));
    }
    return this.finalizeBlobAsFile(userId, blobId, p, content.length, opts);
  }

  /** Registers a fully-written blob as the current version of a file (atomic in SQLite). */
  private finalizeBlobAsFile(
    userId: string,
    blobId: string,
    p: string,
    size: number,
    opts: { mtime?: number; category?: Category },
  ): FileRow {
    const t = now();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO blobs (id, user_id, size, chunk_count, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(blobId, userId, size, this.chunkCountFor(size), t);
      this.ensureParentDirs(userId, p, t);
      const existing = this.db
        .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND deleted_at IS NULL')
        .get(userId, p) as FileRow | undefined;
      let fileId: string;
      if (existing) {
        if (existing.is_dir) throw new StorageError(409, 'a folder exists at this path');
        // current content becomes a version
        if (existing.blob_id) {
          this.db
            .prepare('INSERT INTO versions (id, file_id, blob_id, size, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(randomId(), existing.id, existing.blob_id, existing.size, t);
        }
        this.db
          .prepare('UPDATE files SET blob_id = ?, size = ?, mime = ?, category = ?, mtime = ? WHERE id = ?')
          .run(
            blobId, size, mimeOf(p), categoryOf(p, opts.category), opts.mtime ?? t, existing.id,
          );
        fileId = existing.id;
      } else {
        fileId = randomId();
        this.db
          .prepare(
            `INSERT INTO files (id, user_id, path, name, is_dir, blob_id, size, mime, category, mtime, created_at)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          )
          .run(fileId, userId, p, p.split('/').pop()!, blobId, size, mimeOf(p), categoryOf(p, opts.category), opts.mtime ?? t, t);
      }
      this.pruneVersions(userId, fileId);
      this.db.exec('COMMIT');
      return this.db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as unknown as FileRow;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Versions beyond the retention count: delete rows now, chunk data cleaned lazily. */
  private pruneVersions(userId: string, fileId: string): void {
    const stale = this.db
      .prepare(
        `SELECT id, blob_id FROM versions WHERE file_id = ? ORDER BY created_at DESC
         LIMIT -1 OFFSET ?`,
      )
      .all(fileId, this.config.versionsKept) as { id: string; blob_id: string }[];
    for (const v of stale) {
      this.db.prepare('DELETE FROM versions WHERE id = ?').run(v.id);
      this.db.prepare('DELETE FROM blobs WHERE id = ?').run(v.blob_id);
      this.staleBlobs.push({ userId, blobId: v.blob_id });
    }
  }

  /**
   * Blob ids whose disk data should be removed; callers may await cleanupStaleBlobs().
   * Keyed by user because chunk files live under a per-user directory — a cleanup
   * run by user B must not silently skip (and thus leak forever) user A's chunks.
   */
  private staleBlobs: { userId: string; blobId: string }[] = [];

  async cleanupStaleBlobs(userId?: string): Promise<void> {
    const mine = userId ? this.staleBlobs.filter((s) => s.userId === userId) : this.staleBlobs.slice();
    if (mine.length === 0) return;
    this.staleBlobs = this.staleBlobs.filter((s) => !mine.includes(s));
    await Promise.all(mine.map((s) => this.deleteBlobData(s.userId, s.blobId)));
  }

  /** Create every folder in `parts`, skipping ones that already exist. */
  private makeDirs(userId: string, parts: string[], t: number): void {
    const find = this.db.prepare(
      'SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND deleted_at IS NULL',
    );
    const insert = this.db.prepare(
      `INSERT INTO files (id, user_id, path, name, is_dir, mime, category, created_at)
       VALUES (?, ?, ?, ?, 1, 'inode/directory', 'files', ?)`,
    );
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      const existing = find.get(userId, cur) as { id: string; is_dir: number } | undefined;
      if (existing) {
        if (!existing.is_dir) throw new StorageError(409, `a file exists at "${cur}"`);
        continue;
      }
      insert.run(randomId(), userId, cur, part, t);
    }
  }

  /** Create the folders leading up to `p`, but not `p` itself. */
  ensureParentDirs(userId: string, p: string, t: number): void {
    this.makeDirs(userId, p.split('/').slice(0, -1), t);
  }

  mkdir(userId: string, rawPath: string): FileRow {
    const p = normPath(rawPath);
    if (!p) throw new StorageError(400, 'path required');
    this.makeDirs(userId, p.split('/'), now());
    return this.stat(userId, p)!;
  }

  stat(userId: string, p: string): FileRow | undefined {
    return this.db
      .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND deleted_at IS NULL')
      .get(userId, normPath(p)) as FileRow | undefined;
  }

  byId(userId: string, fileId: string): FileRow {
    const f = this.db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as
      | FileRow
      | undefined;
    if (!f) throw new StorageError(404, 'file not found');
    return f;
  }

  list(userId: string, rawPath: string): FileRow[] {
    const p = normPath(rawPath);
    const depth = p ? p.split('/').length + 1 : 1;
    return this.db
      .prepare(
        `SELECT * FROM files
         WHERE user_id = ? AND deleted_at IS NULL AND path LIKE ? ESCAPE '\\'
           AND (LENGTH(path) - LENGTH(REPLACE(path, '/', ''))) = ?
         ORDER BY is_dir DESC, name COLLATE NOCASE`,
      )
      .all(userId, subtreeLike(p), depth - 1) as unknown as FileRow[];
  }

  /** All non-deleted descendants of a folder (for zip download / app serving / recursive ops). */
  descendants(userId: string, rawPath: string): FileRow[] {
    const p = normPath(rawPath);
    return this.db
      .prepare(
        `SELECT * FROM files WHERE user_id = ? AND deleted_at IS NULL AND path LIKE ? ESCAPE '\\'
         ORDER BY path`,
      )
      .all(userId, subtreeLike(p)) as unknown as FileRow[];
  }

  move(userId: string, fromRaw: string, toRaw: string): void {
    const from = normPath(fromRaw);
    const to = normPath(toRaw);
    if (!from || !to) throw new StorageError(400, 'path required');
    const src = this.stat(userId, from);
    if (!src) throw new StorageError(404, 'source not found');
    if (this.stat(userId, to)) throw new StorageError(409, 'destination exists');
    if (src.is_dir && (to === from || to.startsWith(`${from}/`))) {
      throw new StorageError(400, 'cannot move a folder into itself');
    }
    const t = now();
    this.db.exec('BEGIN');
    try {
      this.ensureParentDirs(userId, to, t);
      this.db
        .prepare('UPDATE files SET path = ?, name = ? WHERE id = ?')
        .run(to, to.split('/').pop()!, src.id);
      if (src.is_dir) {
        const kids = this.descendants(userId, from);
        const upd = this.db.prepare('UPDATE files SET path = ? WHERE id = ?');
        for (const k of kids) upd.run(to + k.path.slice(from.length), k.id);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Soft delete into trash (folder = whole subtree). */
  trash(userId: string, rawPath: string): void {
    const p = normPath(rawPath);
    const f = this.stat(userId, p);
    if (!f) throw new StorageError(404, 'not found');
    const t = now();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE files SET deleted_at = ? WHERE id = ?').run(t, f.id);
      if (f.is_dir) {
        this.db
          .prepare(
            `UPDATE files SET deleted_at = ?
             WHERE user_id = ? AND deleted_at IS NULL AND path LIKE ? ESCAPE '\\'`,
          )
          .run(t, userId, subtreeLike(p));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  listTrash(userId: string): FileRow[] {
    return this.db
      .prepare('SELECT * FROM files WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all(userId) as unknown as FileRow[];
  }

  restore(userId: string, fileId: string): void {
    const f = this.byId(userId, fileId);
    if (f.deleted_at === null) return;
    if (this.stat(userId, f.path)) throw new StorageError(409, 'a file now exists at this path');
    const t = now();
    this.db.exec('BEGIN');
    try {
      this.ensureParentDirs(userId, f.path, t); // recreate parents only; f itself is un-deleted below
      this.db.prepare('UPDATE files SET deleted_at = NULL WHERE id = ?').run(f.id);
      if (f.is_dir) {
        this.db
          .prepare(
            `UPDATE files SET deleted_at = NULL
             WHERE user_id = ? AND deleted_at = ? AND path LIKE ? ESCAPE '\\'`,
          )
          .run(userId, f.deleted_at, subtreeLike(f.path));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Permanently remove a trashed file/folder and its blob data + versions. */
  async purge(userId: string, fileId: string): Promise<void> {
    const f = this.byId(userId, fileId);
    if (f.deleted_at === null) throw new StorageError(400, 'file is not in trash');
    const targets = [f, ...(f.is_dir ? this.listTrash(userId).filter((x) => x.path.startsWith(`${f.path}/`)) : [])];
    const blobIds: string[] = [];
    this.db.exec('BEGIN');
    try {
      for (const target of targets) {
        const versions = this.db
          .prepare('SELECT blob_id FROM versions WHERE file_id = ?')
          .all(target.id) as { blob_id: string }[];
        for (const v of versions) blobIds.push(v.blob_id);
        if (target.blob_id) blobIds.push(target.blob_id);
        this.db.prepare('DELETE FROM files WHERE id = ?').run(target.id);
      }
      for (const b of blobIds) this.db.prepare('DELETE FROM blobs WHERE id = ?').run(b);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    await Promise.all(blobIds.map((b) => this.deleteBlobData(userId, b)));
  }

  /**
   * Run `removeRows` (the DB-side delete, which cascades) and then drop the user's
   * encrypted chunk directory. Order matters: if the rm fails we still have no rows
   * pointing at it, and the leftover directory is inert ciphertext.
   */
  async deleteUserData(userId: string, removeRows: () => void): Promise<void> {
    removeRows();
    // `search` is an FTS5 virtual table, so the users->files ON DELETE CASCADE
    // does not reach it; its rows have to be cleared explicitly.
    this.db.prepare('DELETE FROM search WHERE user_id = ?').run(userId);
    this.keyCache.delete(userId);
    this.staleBlobs = this.staleBlobs.filter((s) => s.userId !== userId);
    await fsp.rm(path.join(this.config.storageDir, userId), { recursive: true, force: true });
  }

  listVersions(userId: string, fileId: string) {
    this.byId(userId, fileId);
    return this.db
      .prepare('SELECT id, blob_id, size, created_at FROM versions WHERE file_id = ? ORDER BY created_at DESC')
      .all(fileId) as { id: string; blob_id: string; size: number; created_at: number }[];
  }

  /** Restore an old version: current content becomes a new version, old blob becomes current. */
  restoreVersion(userId: string, fileId: string, versionId: string): void {
    const f = this.byId(userId, fileId);
    const v = this.db
      .prepare('SELECT * FROM versions WHERE id = ? AND file_id = ?')
      .get(versionId, fileId) as { id: string; blob_id: string; size: number } | undefined;
    if (!v) throw new StorageError(404, 'version not found');
    const t = now();
    this.db.exec('BEGIN');
    try {
      if (f.blob_id) {
        this.db
          .prepare('INSERT INTO versions (id, file_id, blob_id, size, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomId(), fileId, f.blob_id, f.size, t);
      }
      this.db.prepare('UPDATE files SET blob_id = ?, size = ?, mtime = ? WHERE id = ?').run(v.blob_id, v.size, t, fileId);
      this.db.prepare('DELETE FROM versions WHERE id = ?').run(v.id);
      this.pruneVersions(userId, fileId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Stream decrypted bytes [start, end] (inclusive) of a file.
   * Only the chunks the range touches are read + decrypted — this is what makes
   * video seeking cheap even though everything on disk is encrypted.
   */
  async *readRange(userId: string, file: FileRow, start: number, end: number): AsyncGenerator<Buffer> {
    if (!file.blob_id) throw new StorageError(400, 'not a regular file');
    // A zero-byte file has no chunks on disk. Without this guard the loop below
    // tries to open chunk 0, and the ENOENT escapes as an unhandled rejection
    // inside whatever stream is consuming us (which used to kill the process).
    if (file.size === 0 || start > end || start >= file.size) return;
    if (start < 0) throw new StorageError(400, 'bad range');
    end = Math.min(end, file.size - 1);
    const cs = this.config.chunkSize;
    const firstChunk = Math.floor(start / cs);
    const lastChunk = Math.floor(end / cs);
    for (let i = firstChunk; i <= lastChunk; i++) {
      const plain = await this.readChunk(userId, file.blob_id, i);
      const from = i === firstChunk ? start - i * cs : 0;
      const to = i === lastChunk ? end - i * cs + 1 : plain.length;
      yield plain.subarray(from, to);
    }
  }

  async readWhole(userId: string, file: FileRow): Promise<Buffer> {
    if (file.size === 0) return Buffer.alloc(0);
    const parts: Buffer[] = [];
    for await (const part of this.readRange(userId, file, 0, file.size - 1)) parts.push(part);
    return Buffer.concat(parts);
  }

  usage(userId: string) {
    const rows = this.db
      .prepare(
        `SELECT category, COALESCE(SUM(size), 0) AS bytes FROM files
         WHERE user_id = ? AND is_dir = 0 AND deleted_at IS NULL GROUP BY category`,
      )
      .all(userId) as { category: string; bytes: number }[];
    const breakdown: Record<string, number> = { files: 0, media: 0, projects: 0, apps: 0 };
    for (const r of rows) breakdown[r.category] = (breakdown[r.category] ?? 0) + r.bytes;

    // Anything under a served app root counts as "apps", whatever it was before.
    const apps = this.db.prepare('SELECT root_path FROM apps WHERE user_id = ?').all(userId) as {
      root_path: string;
    }[];
    for (const app of apps) {
      const sub = this.db
        .prepare(
          `SELECT category, COALESCE(SUM(size), 0) AS bytes FROM files
           WHERE user_id = ? AND is_dir = 0 AND deleted_at IS NULL
             AND (path = ? OR path LIKE ? ESCAPE '\\')
             AND category != 'apps'
           GROUP BY category`,
        )
        .all(userId, app.root_path, subtreeLike(app.root_path)) as { category: string; bytes: number }[];
      for (const r of sub) {
        breakdown[r.category] -= r.bytes;
        breakdown.apps += r.bytes;
      }
    }

    const trashRow = this.db
      .prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM files WHERE user_id = ? AND is_dir = 0 AND deleted_at IS NOT NULL')
      .get(userId) as { bytes: number };

    return {
      used: this.usedBytes(userId),
      /** `used` minus trash — this is what the category breakdown sums to. */
      liveUsed: this.liveBytes(userId),
      quota: this.quotaFor(userId),
      poolUsed: this.poolUsedBytes(),
      poolTotal: this.config.totalQuotaBytes,
      breakdown,
      trashBytes: trashRow.bytes,
    };
  }

  /**
   * Housekeeping, run on boot and daily. Everything here is data that nothing
   * points at any more but that still occupies disk:
   *   - uploads abandoned mid-flight (tab closed, laptop slept) and their chunks
   *   - trashed files past the retention window
   *   - chunk directories with no blob row (crash between disk write and commit)
   */
  async collectGarbage(): Promise<{ uploads: number; trashed: number; orphans: number }> {
    const cutoff = now() - this.config.trashRetentionDays * 24 * 60 * 60 * 1000;
    let uploads = 0;
    let trashed = 0;

    const staleUploads = this.db
      .prepare(
        `SELECT id, user_id, blob_id FROM uploads
         WHERE status = 'active' AND created_at < ?`,
      )
      .all(now() - 24 * 60 * 60 * 1000) as { id: string; user_id: string; blob_id: string }[];
    for (const up of staleUploads) {
      this.db.prepare("UPDATE uploads SET status = 'aborted' WHERE id = ?").run(up.id);
      await this.deleteBlobData(up.user_id, up.blob_id);
      uploads++;
    }
    this.db.prepare("DELETE FROM uploads WHERE status != 'active' AND created_at < ?").run(cutoff);

    const expired = this.db
      .prepare('SELECT id, user_id FROM files WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(cutoff) as { id: string; user_id: string }[];
    for (const f of expired) {
      try {
        await this.purge(f.user_id, f.id);
        trashed++;
      } catch {
        // already gone as part of a purged parent folder
      }
    }

    return { uploads, trashed, orphans: await this.sweepOrphanChunks() };
  }

  /** Chunk directories on disk with no matching blob row — remove them. */
  private async sweepOrphanChunks(): Promise<number> {
    const known = new Set(
      (this.db.prepare('SELECT id FROM blobs').all() as { id: string }[]).map((b) => b.id),
    );
    const active = new Set(
      (this.db.prepare("SELECT blob_id FROM uploads WHERE status = 'active'").all() as { blob_id: string }[]).map(
        (u) => u.blob_id,
      ),
    );
    let removed = 0;
    for (const userDir of await readDirNames(this.config.storageDir)) {
      const userPath = path.join(this.config.storageDir, userDir);
      for (const shard of await readDirNames(userPath)) {
        for (const blobId of await readDirNames(path.join(userPath, shard))) {
          if (known.has(blobId) || active.has(blobId)) continue;
          await fsp.rm(path.join(userPath, shard, blobId), { recursive: true, force: true });
          removed++;
        }
      }
    }
    return removed;
  }
}

async function readDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
