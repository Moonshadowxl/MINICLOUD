import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../app.js';
import { StorageError, type Category } from '../storage.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/**
 * Resumable chunked uploads (crash-proof):
 *   POST  /uploads                    -> { id, chunkSize, chunkCount }
 *   GET   /uploads/:id                -> { received: [chunk indexes] }   (resume point)
 *   PUT   /uploads/:id/chunks/:idx    (application/octet-stream body)
 *   POST  /uploads/:id/complete       -> file record (atomic finalize + version bump)
 *   DELETE /uploads/:id               -> abort + discard chunks
 */
export function uploadRoutes(app: FastifyInstance, ctx: Ctx, requireAuth: Guard): void {
  const { storage, auth, events } = ctx;

  app.post('/uploads', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { path: string; size: number; mtime?: number; category?: Category };
    return storage.createUpload(req.userId, body.path, body.size, {
      mtime: body.mtime,
      category: body.category,
    });
  });

  app.get('/uploads/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const up = storage.getUpload(req.userId, id);
    return {
      id: up.id,
      path: up.path,
      size: up.size,
      chunkSize: up.chunk_size,
      chunkCount: storage.chunkCountFor(up.size),
      status: up.status,
      received: storage.receivedChunks(id),
    };
  });

  app.put('/uploads/:id/chunks/:idx', { preHandler: requireAuth }, async (req) => {
    const { id, idx } = req.params as { id: string; idx: string };
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data)) throw new StorageError(400, 'send the chunk as application/octet-stream');
    await storage.putUploadChunk(req.userId, id, Number(idx), data);
    events.emit(req.userId, 'upload-progress', {
      uploadId: id,
      received: storage.receivedChunks(id).length,
      total: storage.chunkCountFor(storage.getUpload(req.userId, id).size),
    });
    return { ok: true };
  });

  app.post('/uploads/:id/complete', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const file = storage.completeUpload(req.userId, id);
    await storage.cleanupStaleBlobs(req.userId);
    auth.touchSync(req.userId);
    events.emit(req.userId, 'files-changed', { paths: [file.path] });
    events.emit(req.userId, 'usage', storage.usage(req.userId));
    return {
      file: { id: file.id, path: file.path, name: file.name, size: file.size, mime: file.mime },
    };
  });

  app.delete('/uploads/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await storage.abortUpload(req.userId, id);
    return { ok: true };
  });
}
