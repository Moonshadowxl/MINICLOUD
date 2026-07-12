import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp, buildCtx } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const ctx = buildCtx();
  const app = await buildApp(ctx);

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

  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  app.log.info(`MiniCloud is up. Local: http://localhost:${ctx.config.port}`);
  for (const n of nets) app.log.info(`             LAN:   http://${n!.address}:${ctx.config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
