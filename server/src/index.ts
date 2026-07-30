import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp, buildCtx } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const ctx = buildCtx();
  const app = await buildApp(ctx);

  /**
   * This is a home server that is supposed to still be running tomorrow. A single
   * bad request (an unreadable chunk inside a zip stream, say) should cost that one
   * download, not everybody's session and every in-flight upload. Log loudly, keep
   * serving; genuinely fatal problems still fail at startup below.
   */
  process.on('uncaughtException', (err) => app.log.error({ err }, 'uncaught exception — staying up'));
  process.on('unhandledRejection', (err) => app.log.error({ err }, 'unhandled rejection — staying up'));

  // Serve the built PWA (web/dist) when it exists — one process runs everything.
  const webDist = path.resolve(here, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/s/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html'); // SPA fallback
    });
  }

  await app.listen({ port: ctx.config.port, host: ctx.config.host });

  // Upgrading from a version without search? Backfill once so everything already
  // stored is findable, instead of only files uploaded from now on.
  for (const user of ctx.auth.profiles()) {
    if (!ctx.search.isEmptyFor(user.id)) continue;
    const n = await ctx.search.rebuild(user.id);
    if (n > 0) app.log.info(`indexed ${n} files for ${user.username}`);
  }

  // Reclaim space from abandoned uploads and expired trash, now and once a day.
  const sweep = async () => {
    try {
      const r = await ctx.storage.collectGarbage();
      if (r.uploads || r.trashed || r.orphans) app.log.info(r, 'housekeeping');
    } catch (err) {
      app.log.error({ err }, 'housekeeping failed');
    }
  };
  void sweep();
  setInterval(sweep, DAY_MS).unref();

  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  app.log.info(`MiniCloud is up. Local: http://localhost:${ctx.config.port}`);
  for (const n of nets) app.log.info(`             LAN:   http://${n!.address}:${ctx.config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
