import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import yazl from 'yazl';
import type { Ctx } from '../app.js';
import { StorageError, normPath, type Category, type FileRow } from '../storage.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function pub(f: FileRow) {
  return {
    id: f.id,
    path: f.path,
    name: f.name,
    isDir: !!f.is_dir,
    size: f.size,
    mime: f.mime,
    category: f.category,
    mtime: f.mtime,
    createdAt: f.created_at,
    deletedAt: f.deleted_at,
  };
}

export function fileRoutes(app: FastifyInstance, ctx: Ctx, requireAuth: Guard): void {
  const { storage, auth, events } = ctx;

  app.get('/files', { preHandler: requireAuth }, async (req) => {
    const { path = '' } = req.query as { path?: string };
    return { entries: storage.list(req.userId, path).map(pub) };
  });

  app.get('/files/stat', { preHandler: requireAuth }, async (req) => {
    const { path = '' } = req.query as { path?: string };
    const f = storage.stat(req.userId, path);
    if (!f) throw new StorageError(404, 'not found');
    return { file: pub(f) };
  });

  app.post('/files/mkdir', { preHandler: requireAuth }, async (req) => {
    const { path } = req.body as { path: string };
    return { file: pub(storage.mkdir(req.userId, path)) };
  });

  app.post('/files/move', { preHandler: requireAuth }, async (req) => {
    const { from, to } = req.body as { from: string; to: string };
    storage.move(req.userId, from, to);
    return { ok: true };
  });

  /**
   * Batched small-file upload for folders/codebases: one multipart request carries many
   * files; each part's filename is its relative path. Big files use /uploads instead.
   */
  app.post('/files/batch', { preHandler: requireAuth }, async (req) => {
    const { base = '', category } = req.query as { base?: string; category?: Category };
    const basePath = base ? normPath(base) : '';
    const saved: string[] = [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const rel = normPath(decodeURIComponent(part.filename ?? ''));
      if (!rel) throw new StorageError(400, 'file part missing a path');
      const content = await part.toBuffer();
      const full = basePath ? `${basePath}/${rel}` : rel;
      await storage.writeFile(req.userId, full, content, { category });
      saved.push(full);
    }
    await storage.cleanupStaleBlobs(req.userId);
    auth.touchSync(req.userId);
    events.emit(req.userId, 'files-changed', { paths: saved });
    events.emit(req.userId, 'usage', storage.usage(req.userId));
    return { saved: saved.length, paths: saved };
  });

  /** Download / stream one file. Range requests decrypt only the chunks they touch. */
  app.get('/files/:id/content', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { download } = req.query as { download?: string };
    const f = storage.byId(req.userId, id);
    if (f.is_dir) throw new StorageError(400, 'use /zip for folders');
    if (download !== undefined) {
      reply.header('content-disposition', `attachment; filename="${encodeURIComponent(f.name)}"`);
    }
    return sendFile(ctx, req, reply, req.userId, f);
  });

  /** Whole folder (or file) as a zip — grab your codebase back in one click. */
  app.get('/files/:id/zip', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const f = storage.byId(req.userId, id);
    const zip = new yazl.ZipFile();
    const targets = f.is_dir ? storage.descendants(req.userId, f.path).filter((x) => !x.is_dir) : [f];
    const prefixLen = f.is_dir ? f.path.length + 1 : f.path.length - f.name.length;
    reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${encodeURIComponent(f.name)}.zip"`);
    for (const target of targets) {
      zip.addReadStream(
        Readable.from(storage.readRange(req.userId, target, 0, Math.max(0, target.size - 1))),
        target.path.slice(prefixLen) || target.name,
      );
    }
    zip.end();
    return reply.send(zip.outputStream);
  });

  app.delete('/files/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const f = storage.byId(req.userId, id);
    storage.trash(req.userId, f.path);
    events.emit(req.userId, 'files-changed', { paths: [f.path] });
    events.emit(req.userId, 'usage', storage.usage(req.userId));
    return { ok: true };
  });

  app.get('/files/trash', { preHandler: requireAuth }, async (req) => ({
    entries: storage.listTrash(req.userId).map(pub),
  }));

  app.post('/files/:id/restore', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    storage.restore(req.userId, id);
    events.emit(req.userId, 'files-changed', {});
    return { ok: true };
  });

  app.delete('/files/:id/purge', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await storage.purge(req.userId, id);
    events.emit(req.userId, 'usage', storage.usage(req.userId));
    return { ok: true };
  });

  app.get('/files/:id/versions', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    return { versions: storage.listVersions(req.userId, id) };
  });

  app.post('/files/:id/versions/:versionId/restore', { preHandler: requireAuth }, async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    storage.restoreVersion(req.userId, id, versionId);
    await storage.cleanupStaleBlobs(req.userId);
    events.emit(req.userId, 'files-changed', {});
    return { ok: true };
  });

  app.get('/usage', { preHandler: requireAuth }, async (req) => ({
    ...storage.usage(req.userId),
    lastSync: auth.lastSync(req.userId),
  }));
}

/** Shared by downloads and app serving: streams a stored file with HTTP Range support. */
export async function sendFile(
  ctx: Ctx,
  req: FastifyRequest,
  reply: FastifyReply,
  ownerUserId: string,
  f: FileRow,
): Promise<FastifyReply> {
  reply.header('accept-ranges', 'bytes').header('content-type', f.mime);

  if (f.size === 0) {
    return reply.code(200).header('content-length', 0).send('');
  }

  const range = parseRange(req.headers.range, f.size);
  if (req.headers.range && !range) {
    return reply.code(416).header('content-range', `bytes */${f.size}`).send();
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? f.size - 1;
  if (range) {
    reply.code(206).header('content-range', `bytes ${start}-${end}/${f.size}`);
  }
  reply.header('content-length', end - start + 1);
  return reply.send(Readable.from(ctx.storage.readRange(ownerUserId, f, start, end)));
}

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    // suffix range: last N bytes
    const n = Math.min(Number(m[2]), size);
    return n === 0 ? null : { start: size - n, end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) return null;
  return { start, end };
}
