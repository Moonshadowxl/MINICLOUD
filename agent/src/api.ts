import type { AgentConfig } from './config.js';

export interface RemoteEntry {
  id: string; path: string; name: string; isDir: boolean; size: number; mtime: number | null;
}

/** Thin authenticated client. Access tokens are minted from the stored device token. */
export class Client {
  private accessToken: string | null = null;

  constructor(private config: AgentConfig) {}

  private async refresh(): Promise<void> {
    const res = await fetch(`${this.config.server}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceToken: this.config.deviceToken }),
    });
    if (!res.ok) throw new Error('not signed in — run: minicloud-agent login');
    this.accessToken = ((await res.json()) as { accessToken: string }).accessToken;
  }

  async fetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    if (!this.accessToken) await this.refresh();
    const res = await fetch(`${this.config.server}/api${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${this.accessToken}` },
    });
    if (res.status === 401 && !retried) {
      this.accessToken = null;
      return this.fetch(path, init, true);
    }
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = { ...(init.headers as Record<string, string>) };
    if (typeof init.body === 'string') headers['content-type'] = 'application/json';
    const res = await this.fetch(path, { ...init, headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `${res.status} on ${path}`);
    }
    return res.json() as Promise<T>;
  }

  async tree(remoteBase: string): Promise<RemoteEntry[]> {
    const r = await this.json<{ entries: RemoteEntry[] }>(`/files/tree?path=${encodeURIComponent(remoteBase)}`);
    return r.entries;
  }

  /** Upload one file: small ones in a single multipart, big ones as resumable chunks. */
  async upload(remotePath: string, data: Buffer, mtime: number): Promise<void> {
    const CHUNK = 4 * 1024 * 1024;
    if (data.length <= CHUNK) {
      const form = new FormData();
      const dir = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : '';
      const name = remotePath.split('/').pop()!;
      form.append('mtimes', JSON.stringify({ [name]: mtime }));
      form.append('f', new Blob([new Uint8Array(data)]), encodeURIComponent(name));
      const res = await this.fetch(`/files/batch?base=${encodeURIComponent(dir)}`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      return;
    }
    const up = await this.json<{ id: string; chunkSize: number; chunkCount: number }>('/uploads', {
      method: 'POST',
      body: JSON.stringify({ path: remotePath, size: data.length, mtime }),
    });
    // resumable: ask what already arrived (e.g. we crashed mid-upload last run)
    const status = await this.json<{ received: number[] }>(`/uploads/${up.id}`);
    const have = new Set(status.received);
    for (let i = 0; i < up.chunkCount; i++) {
      if (have.has(i)) continue;
      const res = await this.fetch(`/uploads/${up.id}/chunks/${i}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(data.subarray(i * up.chunkSize, (i + 1) * up.chunkSize)),
      });
      if (!res.ok) throw new Error(`chunk ${i} failed: ${res.status}`);
    }
    await this.json(`/uploads/${up.id}/complete`, { method: 'POST' });
  }

  async download(entry: RemoteEntry): Promise<Buffer> {
    const res = await this.fetch(`/files/${entry.id}/content`);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async trash(entry: RemoteEntry): Promise<void> {
    await this.json(`/files/${entry.id}`, { method: 'DELETE' });
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.server}/api/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
