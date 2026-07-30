import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { loadConfig, type Config } from './config.js';
import { openDb, type DB } from './db.js';
import { jwtSecret, loadOrCreateMasterKey } from './crypto.js';
import { Storage, StorageError } from './storage.js';
import { Auth } from './auth.js';
import { EventBus } from './events.js';
import { SearchIndex } from './search.js';
import { authRoutes } from './routes/auth.js';
import { fileRoutes } from './routes/files.js';
import { uploadRoutes } from './routes/uploads.js';
import { appRoutes, serveHook } from './routes/apps.js';

export interface Ctx {
  config: Config;
  db: DB;
  storage: Storage;
  auth: Auth;
  events: EventBus;
  search: SearchIndex;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    isOwner: boolean;
  }
}

export function buildCtx(overrides: Partial<Config> = {}): Ctx {
  const config = loadConfig(overrides);
  const db = openDb(config.dbPath);
  const masterKey = loadOrCreateMasterKey(config.keysDir);
  const storage = new Storage(db, config, masterKey);
  const auth = new Auth(db, config, storage, jwtSecret(masterKey));
  return { config, db, storage, auth, events: new EventBus(), search: new SearchIndex(db, storage) };
}

/** Reads the access token from Authorization: Bearer or the mc_token cookie. */
export function tokenFrom(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookieTok = (req.cookies as Record<string, string | undefined>)?.mc_token;
  return cookieTok ?? null;
}

export async function buildApp(ctx: Ctx): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: ctx.config.chunkSize + 1024 * 1024, // one chunk + headroom
  });

  await app.register(cookie);
  await app.register(websocket);
  await app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024, files: 500 },
  });

  // Raw body for chunk uploads
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof StorageError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error(err);
    const anyErr = err as { statusCode?: number; message?: string };
    const code = anyErr.statusCode ?? 500;
    return reply.code(code).send({ error: code >= 500 ? 'internal error' : anyErr.message ?? 'error' });
  });

  // Serve registered apps on foreign hostnames (name.mini / name.<baseDomain>)
  serveHook(app, ctx);

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenFrom(req);
    const session = token ? ctx.auth.verifyAccess(token) : null;
    if (!session) {
      await reply.code(401).send({ error: 'not signed in' });
      return reply;
    }
    req.userId = session.userId;
    req.isOwner = session.isOwner;
  };

  await app.register(async (api) => {
    authRoutes(api, ctx, requireAuth);
    fileRoutes(api, ctx, requireAuth);
    uploadRoutes(api, ctx, requireAuth);
    appRoutes(api, ctx, requireAuth);

    api.get('/health', async () => ({ ok: true, name: 'minicloud', time: Date.now() }));

    api.get('/events', { websocket: true, preHandler: requireAuth }, (socket, req) => {
      ctx.events.subscribe(req.userId, socket);
    });
  }, { prefix: '/api' });

  return app;
}
