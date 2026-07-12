import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client, type RemoteEntry } from './api.js';
import { ignored, statePathFor, type FolderPair } from './config.js';

interface Snapshot {
  /** rel path -> { size, mtime } as of the last successful sync */
  files: Record<string, { size: number; mtime: number }>;
  /** write-ahead journal: ops planned but not yet confirmed done */
  pending: Op[];
  lastSync: number | null;
}

type Op =
  | { kind: 'upload'; rel: string }
  | { kind: 'download'; rel: string }
  | { kind: 'trash-remote'; rel: string }
  | { kind: 'delete-local'; rel: string }
  | { kind: 'conflict'; rel: string };

export interface SyncResult {
  uploaded: number; downloaded: number; deleted: number; conflicts: number; skipped: boolean;
}

const loadSnapshot = (p: string): Snapshot => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Snapshot;
  } catch {
    return { files: {}, pending: [], lastSync: null };
  }
};

const saveSnapshot = (p: string, snap: Snapshot): void => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snap));
  fs.renameSync(tmp, p);
};

async function walkLocal(root: string): Promise<Map<string, { size: number; mtime: number }>> {
  const out = new Map<string, { size: number; mtime: number }>();
  const walk = async (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix + e.name;
      if (ignored(rel)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, `${rel}/`);
      else if (e.isFile()) {
        const st = await fsp.stat(full);
        out.set(rel, { size: st.size, mtime: Math.floor(st.mtimeMs) });
      }
    }
  };
  await walk(root, '');
  return out;
}

/**
 * Two-way sync of one folder pair, offline-first:
 * - plan ops by diffing local disk + remote tree against the last-sync snapshot
 * - write the plan to the journal BEFORE executing (crash/offline = replay next run)
 * - never silently overwrite: both-sides-changed becomes a conflict copy
 * - server unreachable = skip quietly; local work is never blocked
 */
export async function syncPair(client: Client, pair: FolderPair, log: (s: string) => void): Promise<SyncResult> {
  const result: SyncResult = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0, skipped: false };
  if (!(await client.ping())) {
    log(`  server unreachable — will retry next run (your local files are untouched)`);
    result.skipped = true;
    return result;
  }

  const statePath = statePathFor(pair);
  const snap = loadSnapshot(statePath);
  await fsp.mkdir(pair.local, { recursive: true });

  const local = await walkLocal(pair.local);
  const remoteList = await client.tree(pair.remote);
  const remote = new Map<string, RemoteEntry>();
  for (const e of remoteList) {
    if (e.isDir) continue;
    const rel = e.path.slice(pair.remote.length + 1);
    if (!ignored(rel)) remote.set(rel, e);
  }

  // ---- plan ----
  const ops: Op[] = [...snap.pending]; // journal replay first
  const planned = new Set(ops.map((o) => `${o.kind}:${o.rel}`));
  const plan = (op: Op) => {
    if (!planned.has(`${op.kind}:${op.rel}`)) {
      ops.push(op);
      planned.add(`${op.kind}:${op.rel}`);
    }
  };

  const rels = new Set([...local.keys(), ...remote.keys(), ...Object.keys(snap.files)]);
  for (const rel of rels) {
    const l = local.get(rel);
    const r = remote.get(rel);
    const s = snap.files[rel];
    const localChanged = l && (!s || l.size !== s.size || l.mtime > s.mtime);
    const remoteChanged = r && (!s || r.size !== s.size || (r.mtime ?? 0) > s.mtime);

    if (l && !r) {
      if (s && !remoteChanged) plan({ kind: 'delete-local', rel }); // deleted on server
      else plan({ kind: 'upload', rel }); // new locally
    } else if (!l && r) {
      if (s && !localChanged) plan({ kind: 'trash-remote', rel }); // deleted locally
      else plan({ kind: 'download', rel }); // new on server
    } else if (l && r) {
      if (localChanged && remoteChanged && (l.size !== r.size || l.mtime !== (r.mtime ?? 0))) plan({ kind: 'conflict', rel });
      else if (localChanged) plan({ kind: 'upload', rel });
      else if (remoteChanged) plan({ kind: 'download', rel });
    }
    // !l && !r: gone on both sides — just forget it below
  }

  // ---- write-ahead journal, then execute ----
  snap.pending = ops;
  saveSnapshot(statePath, snap);

  const done: Op[] = [];
  for (const op of ops) {
    const localPath = path.join(pair.local, op.rel);
    const remotePath = `${pair.remote}/${op.rel}`;
    try {
      if (op.kind === 'upload') {
        const data = await fsp.readFile(localPath);
        const st = await fsp.stat(localPath);
        await client.upload(remotePath, data, Math.floor(st.mtimeMs));
        snap.files[op.rel] = { size: data.length, mtime: Math.floor(st.mtimeMs) };
        result.uploaded++;
        log(`  ↑ ${op.rel}`);
      } else if (op.kind === 'download') {
        const entry = remote.get(op.rel);
        if (entry) {
          const data = await client.download(entry);
          await fsp.mkdir(path.dirname(localPath), { recursive: true });
          await fsp.writeFile(localPath, data);
          const mtime = entry.mtime ?? Date.now();
          await fsp.utimes(localPath, new Date(mtime), new Date(mtime));
          snap.files[op.rel] = { size: data.length, mtime: Math.floor(mtime) };
          result.downloaded++;
          log(`  ↓ ${op.rel}`);
        }
      } else if (op.kind === 'trash-remote') {
        const entry = remote.get(op.rel);
        if (entry) await client.trash(entry);
        delete snap.files[op.rel];
        result.deleted++;
        log(`  ✕ ${op.rel} (trashed on server — restorable from Settings)`);
      } else if (op.kind === 'delete-local') {
        // never hard-delete local work: park it in a local trash folder
        const trashDir = path.join(pair.local, '.minicloud-trash', String(Date.now()));
        await fsp.mkdir(path.join(trashDir, path.dirname(op.rel)), { recursive: true });
        await fsp.rename(localPath, path.join(trashDir, op.rel)).catch(() => undefined);
        delete snap.files[op.rel];
        result.deleted++;
        log(`  ✕ ${op.rel} (moved to .minicloud-trash locally)`);
      } else if (op.kind === 'conflict') {
        const entry = remote.get(op.rel);
        if (entry) {
          const data = await client.download(entry);
          const ext = path.extname(op.rel);
          const conflictRel = `${op.rel.slice(0, op.rel.length - ext.length)} (conflict from server)${ext}`;
          await fsp.mkdir(path.dirname(path.join(pair.local, conflictRel)), { recursive: true });
          await fsp.writeFile(path.join(pair.local, conflictRel), data);
        }
        const mine = await fsp.readFile(localPath);
        const st = await fsp.stat(localPath);
        await client.upload(remotePath, mine, Math.floor(st.mtimeMs));
        snap.files[op.rel] = { size: mine.length, mtime: Math.floor(st.mtimeMs) };
        result.conflicts++;
        log(`  ⚡ ${op.rel}: kept yours, saved server copy as "(conflict from server)"`);
      }
      done.push(op);
      // persist progress as we go — a crash resumes exactly here
      snap.pending = ops.filter((o) => !done.includes(o));
      saveSnapshot(statePath, snap);
    } catch (err) {
      log(`  ! ${op.kind} ${op.rel}: ${(err as Error).message} (kept in journal)`);
    }
  }

  // forget snapshot entries for files gone from both sides
  for (const rel of Object.keys(snap.files)) {
    if (!local.has(rel) && !remote.has(rel)) delete snap.files[rel];
  }
  snap.lastSync = Date.now();
  saveSnapshot(statePath, snap);
  return result;
}

export function deviceName(): string {
  return os.hostname() || 'this device';
}
