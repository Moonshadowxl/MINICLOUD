import path from 'node:path';

export interface Config {
  dataDir: string;
  storageDir: string;
  keysDir: string;
  dbPath: string;
  port: number;
  host: string;
  chunkSize: number;
  /** Total storage pool in bytes, shared by all users unless per-user quotas are set. */
  totalQuotaBytes: number;
  /** Max number of user profiles (PS5-style picker fills a 2x3 grid). */
  maxUsers: number;
  /** Versions kept per file before the oldest is pruned. */
  versionsKept: number;
  /** Days a trashed file is kept before purge. */
  trashRetentionDays: number;
  /**
   * Real domain for wildcard app serving (e.g. "minicld.app" -> myapp.minicld.app).
   * Empty = disabled. Local ".mini" Host routing is always on.
   */
  baseDomain: string;
}

const GB = 1024 * 1024 * 1024;

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = path.resolve(
    overrides.dataDir ?? process.env.MINICLOUD_DATA_DIR ?? path.join(process.cwd(), 'data'),
  );
  return {
    dataDir,
    storageDir: path.join(dataDir, 'storage'),
    keysDir: path.join(dataDir, 'keys'),
    dbPath: path.join(dataDir, 'minicloud.db'),
    port: Number(process.env.MINICLOUD_PORT ?? 8484),
    host: process.env.MINICLOUD_HOST ?? '0.0.0.0',
    chunkSize: 4 * 1024 * 1024,
    totalQuotaBytes: Number(process.env.MINICLOUD_QUOTA_GB ?? 400) * GB,
    maxUsers: 6,
    versionsKept: Number(process.env.MINICLOUD_VERSIONS ?? 5),
    trashRetentionDays: Number(process.env.MINICLOUD_TRASH_DAYS ?? 30),
    baseDomain: process.env.MINICLOUD_BASE_DOMAIN ?? '',
    ...overrides,
  };
}
