/**
 * First-run setup: creates the data directory, master key, and database.
 * The owner profile itself is created in the web UI on first visit
 * (or via POST /api/auth/setup).
 */
import { buildCtx } from './app.js';

const ctx = buildCtx();
console.log(`
  MiniCloud is ready to start.

  data dir : ${ctx.config.dataDir}
  database : ${ctx.config.dbPath}
  key file : ${ctx.config.keysDir}/master.key   <-- BACK THIS UP. Without it your files are unreadable.
  pool     : ${(ctx.config.totalQuotaBytes / 1024 ** 3).toFixed(0)} GB (MINICLOUD_QUOTA_GB to change)

  Start the server:   npm start
  Then open:          http://localhost:${ctx.config.port}
  First visit creates the owner profile.
`);
