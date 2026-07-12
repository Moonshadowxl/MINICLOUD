import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../app.js';
import { tokenFrom } from '../app.js';
import { StorageError, normPath } from '../storage.js';
import { randomId } from '../crypto.js';
import { now } from '../db.js';
import { sendFile } from './files.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

interface AppRow {
  id: string;
  user_id: string;
  name: string;
  root_path: string;
  visibility: string;
  created_at: number;
}

const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

function appUrls(ctx: Ctx, req: FastifyRequest, name: string): string[] {
  const urls = [`${req.protocol}://${req.headers.host}/s/${name}/`, `http://${name}.mini/`];
  if (ctx.config.baseDomain) urls.push(`https://${name}.${ctx.config.baseDomain}/`);
  return urls;
}

function pubApp(ctx: Ctx, req: FastifyRequest, a: AppRow) {
  return {
    id: a.id,
    name: a.name,
    rootPath: a.root_path,
    visibility: a.visibility,
    createdAt: a.created_at,
    urls: appUrls(ctx, req, a.name),
  };
}

export function appRoutes(app: FastifyInstance, ctx: Ctx, requireAuth: Guard): void {
  const { db, storage, events } = ctx;

  app.get('/apps', { preHandler: requireAuth }, async (req) => {
    const rows = db
      .prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.userId) as unknown as AppRow[];
    return { apps: rows.map((a) => pubApp(ctx, req, a)) };
  });

  /** Serve ("Launch") a stored folder or single file as a live app. */
  app.post('/apps', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { name: string; path: string; visibility?: 'public' | 'private' };
    const name = body.name?.trim().toLowerCase();
    if (!NAME_RE.test(name ?? '')) {
      throw new StorageError(400, 'name must be 1-40 chars: lowercase letters, digits, hyphens');
    }
    if (['api', 's', 'www', 'admin'].includes(name)) throw new StorageError(400, 'that name is reserved');
    const rootPath = normPath(body.path);
    if (!storage.stat(req.userId, rootPath)) throw new StorageError(404, 'path not found');
    const existing = db.prepare('SELECT id FROM apps WHERE name = ?').get(name);
    if (existing) throw new StorageError(409, 'an app with this name already exists');
    const id = randomId();
    db.prepare(
      'INSERT INTO apps (id, user_id, name, root_path, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, req.userId, name, rootPath, body.visibility === 'public' ? 'public' : 'private', now());
    events.emit(req.userId, 'apps-changed', {});
    const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as unknown as AppRow;
    return { app: pubApp(ctx, req, row) };
  });

  app.patch('/apps/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { visibility?: 'public' | 'private' };
    const row = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId) as
      | AppRow
      | undefined;
    if (!row) throw new StorageError(404, 'app not found');
    if (body.visibility) {
      db.prepare('UPDATE apps SET visibility = ? WHERE id = ?').run(
        body.visibility === 'public' ? 'public' : 'private',
        id,
      );
    }
    events.emit(req.userId, 'apps-changed', {});
    return { ok: true };
  });

  /** Stop serving (the stored files stay untouched). */
  app.delete('/apps/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const res = db.prepare('DELETE FROM apps WHERE id = ? AND user_id = ?').run(id, req.userId);
    if (res.changes === 0) throw new StorageError(404, 'app not found');
    events.emit(req.userId, 'apps-changed', {});
    return { ok: true };
  });
}

/**
 * The actual serving. Handles:
 *   - /s/<name>/<path...> on the main host
 *   - any Host of the form <name>.mini or <name>.<baseDomain> (wildcard-domain ready)
 * Private apps require a signed-in session (cookie or Bearer token).
 */
export function serveHook(app: FastifyInstance, ctx: Ctx): void {
  const { db, storage } = ctx;

  async function serveApp(req: FastifyRequest, reply: FastifyReply, name: string, rest: string) {
    const row = db.prepare('SELECT * FROM apps WHERE name = ?').get(name.toLowerCase()) as
      | AppRow
      | undefined;
    if (!row) return reply.code(404).type('text/plain').send(`No app named "${name}" is being served.`);

    if (row.visibility !== 'public') {
      const token = tokenFrom(req);
      const session = token ? ctx.auth.verifyAccess(token) : null;
      if (!session) {
        return reply.code(401).type('text/plain').send('This app is private — sign in to MiniCloud first.');
      }
    }

    const root = storage.stat(row.user_id, row.root_path);
    if (!root) return reply.code(404).type('text/plain').send('The served files were deleted.');

    // Single-file serve: always return that file.
    if (!root.is_dir) return sendFile(ctx, req, reply, row.user_id, root);

    let sub: string;
    try {
      sub = normPath(decodeURIComponent(rest));
    } catch {
      return reply.code(400).type('text/plain').send('bad path');
    }
    const tryPaths = sub
      ? [`${row.root_path}/${sub}`, `${row.root_path}/${sub}/index.html`]
      : [`${row.root_path}/index.html`];
    for (const p of tryPaths) {
      const f = storage.stat(row.user_id, p);
      if (f && !f.is_dir) return sendFile(ctx, req, reply, row.user_id, f);
    }
    // SPA-style fallback to the app's index.html for extensionless routes
    if (!sub.includes('.')) {
      const index = storage.stat(row.user_id, `${row.root_path}/index.html`);
      if (index && !index.is_dir) return sendFile(ctx, req, reply, row.user_id, index);
    }
    return reply.code(404).type('text/plain').send('not found in this app');
  }

  app.get('/s/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    return reply.redirect(`/s/${name}/`, 302);
  });

  app.get('/s/:name/*', async (req, reply) => {
    const { name, '*': rest } = req.params as { name: string; '*': string };
    return serveApp(req, reply, name, rest ?? '');
  });

  // Host-header routing: <name>.mini (local DNS) and <name>.<baseDomain> (real wildcard domain)
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host ?? '').split(':')[0].toLowerCase();
    let name: string | null = null;
    if (host.endsWith('.mini')) name = host.slice(0, -'.mini'.length);
    else if (ctx.config.baseDomain && host.endsWith(`.${ctx.config.baseDomain}`)) {
      name = host.slice(0, -(ctx.config.baseDomain.length + 1));
    }
    if (!name || name.includes('.')) return; // main host or nested subdomain -> normal routing
    const url = req.url.split('?')[0];
    return serveApp(req, reply, name, url);
  });
}
