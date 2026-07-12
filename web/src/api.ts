/** MiniCloud API client: cookie sessions + silent refresh + chunked/batched uploads. */

export interface PublicUser {
  id: string; username: string; displayName: string; color: string; isOwner: boolean; hasPin: boolean;
}
export interface Entry {
  id: string; path: string; name: string; isDir: boolean; size: number;
  mime: string; category: string; mtime: number | null; createdAt: number; deletedAt: number | null;
}
export interface Usage {
  used: number; quota: number; poolUsed: number; poolTotal: number;
  breakdown: Record<string, number>; trashBytes: number; lastSync: number | null;
}
export interface ServedApp {
  id: string; name: string; rootPath: string; visibility: 'public' | 'private'; createdAt: number; urls: string[];
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, init, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'request failed');
  }
  return res.json() as Promise<T>;
}

export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
};

export const fmtAgo = (t: number | null): string => {
  if (!t) return 'never';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

// ---------- uploads ----------

/** Folders we skip when a whole codebase is dropped in (the .miniignore defaults). */
export const MINIIGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.DS_Store'];

export function ignored(relPath: string): boolean {
  return relPath.split('/').some((part) => MINIIGNORE.includes(part));
}

export interface UploadProgress {
  name: string;
  done: number;   // bytes confirmed
  total: number;  // bytes total
}

const CHUNK_THRESHOLD = 4 * 1024 * 1024;
const BATCH_BYTES = 8 * 1024 * 1024;
const BATCH_FILES = 100;

/**
 * Upload any mix of files. Small files ride together in multipart batches
 * (a codebase with 2000 tiny files ≈ a handful of requests); big files get
 * crash-proof resumable chunk uploads.
 */
export async function uploadFiles(
  files: { file: File; relPath: string }[],
  basePath: string,
  opts: { category?: string; onProgress: (items: UploadProgress[]) => void },
): Promise<void> {
  const keep = files.filter((f) => !ignored(f.relPath));
  const progress: UploadProgress[] = keep.map((f) => ({ name: f.relPath, done: 0, total: f.file.size }));
  const report = () => opts.onProgress([...progress]);
  report();

  const small = keep.filter((f) => f.file.size <= CHUNK_THRESHOLD);
  const big = keep.filter((f) => f.file.size > CHUNK_THRESHOLD);

  // batches of small files
  for (let i = 0; i < small.length; ) {
    const batch: typeof small = [];
    let bytes = 0;
    while (i < small.length && batch.length < BATCH_FILES && bytes <= BATCH_BYTES) {
      batch.push(small[i]);
      bytes += small[i].file.size;
      i++;
    }
    const form = new FormData();
    form.append('mtimes', JSON.stringify(Object.fromEntries(batch.map((f) => [f.relPath, f.file.lastModified]))));
    for (const f of batch) form.append('f', f.file, encodeURIComponent(f.relPath));
    const qs = new URLSearchParams({ base: basePath, ...(opts.category ? { category: opts.category } : {}) });
    await api(`/files/batch?${qs}`, { method: 'POST', body: form });
    for (const f of batch) {
      const p = progress.find((x) => x.name === f.relPath)!;
      p.done = p.total;
    }
    report();
  }

  // chunked big files
  for (const f of big) {
    const p = progress.find((x) => x.name === f.relPath)!;
    const fullPath = basePath ? `${basePath}/${f.relPath}` : f.relPath;
    const up = await api<{ id: string; chunkSize: number; chunkCount: number }>('/uploads', {
      method: 'POST',
      body: JSON.stringify({ path: fullPath, size: f.file.size, mtime: f.file.lastModified, category: opts.category }),
    });
    for (let c = 0; c < up.chunkCount; c++) {
      const blob = f.file.slice(c * up.chunkSize, (c + 1) * up.chunkSize);
      const res = await fetch(`/api/uploads/${up.id}/chunks/${c}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: blob,
      });
      if (!res.ok) throw new ApiError(res.status, `chunk ${c} failed`);
      p.done = Math.min(f.file.size, (c + 1) * up.chunkSize);
      report();
    }
    await api(`/uploads/${up.id}/complete`, { method: 'POST' });
  }
}

/** Live server events (usage changes, uploads, serves) — reconnects on drop. */
export function connectEvents(onEvent: (type: string, data: unknown) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data: unknown };
        onEvent(msg.type, msg.data);
      } catch { /* ignore */ }
    };
    ws.onclose = () => { if (!closed) setTimeout(open, 4000); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}
