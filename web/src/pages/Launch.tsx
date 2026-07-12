import { useEffect, useState } from 'react';
import { api, type Entry, type ServedApp } from '../api';
import { useToast } from '../state';

/**
 * Launch: serve any stored folder (or single html file) at a Vercel-style URL.
 * Private = only signed-in MiniCloud users; Public = anyone who can reach the server.
 */
export default function Launch() {
  const [apps, setApps] = useState<ServedApp[] | null>(null);
  const [serving, setServing] = useState(false);
  const toast = useToast();

  const load = () => api<{ apps: ServedApp[] }>('/apps').then((r) => setApps(r.apps)).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  const stop = async (a: ServedApp) => {
    await api(`/apps/${a.id}`, { method: 'DELETE' });
    toast(`Stopped serving "${a.name}" — files kept`);
    load();
  };

  const flip = async (a: ServedApp) => {
    await api(`/apps/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: a.visibility === 'public' ? 'private' : 'public' }),
    });
    load();
  };

  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast('URL copied'));
  };

  return (
    <>
      <div className="main-head">
        <h1>Launch</h1>
        <button className="btn btn-primary" onClick={() => setServing(true)}>Serve something</button>
      </div>

      {apps === null ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : apps.length === 0 ? (
        <div className="empty">
          <div className="big">🚀</div>
          <h3>Nothing live yet</h3>
          <p>Upload a folder with an <code>index.html</code>, then serve it here — it gets a URL like a real deploy.</p>
          <button className="btn btn-primary" onClick={() => setServing(true)}>Serve something</button>
        </div>
      ) : (
        <div className="rows">
          {apps.map((a) => (
            <div className="row" key={a.id}>
              <span className="file-ico" aria-hidden>🚀</span>
              <div className="grow">
                <div className="name" style={{ cursor: 'default' }}>{a.name}</div>
                <div className="meta">
                  from <code>{a.rootPath}</code> ·{' '}
                  {a.urls.map((u, i) => (
                    <span key={u}>
                      {i > 0 && ' · '}
                      <a href={u} target="_blank" rel="noreferrer">{u}</a>
                    </span>
                  ))}
                </div>
              </div>
              <span className={`badge ${a.visibility}`}>{a.visibility}</span>
              <div className="actions">
                <button className="btn btn-ghost btn-sm" onClick={() => copy(a.urls[0])}>Copy URL</button>
                <button className="btn btn-ghost btn-sm" onClick={() => flip(a)}>
                  Make {a.visibility === 'public' ? 'private' : 'public'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => stop(a)}>Stop</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {serving && <ServeDialog onClose={() => setServing(false)} onDone={() => { setServing(false); load(); }} />}
    </>
  );
}

function ServeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [path, setPath] = useState('');
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<{ entries: Entry[] }>(`/files?path=${encodeURIComponent(browsePath)}`)
      .then((r) => setEntries(r.entries.filter((e) => e.isDir || e.mime === 'text/html')))
      .catch(() => setEntries([]));
  }, [browsePath]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ app: ServedApp }>('/apps', {
        method: 'POST',
        body: JSON.stringify({ name, path, visibility }),
      });
      toast(`"${r.app.name}" is live ✓`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Serve an app">
        <h3>Serve an app</h3>

        <div className="field">
          <label>Pick what to serve {browsePath && <>— in <code>{browsePath}</code></>}</label>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, maxHeight: 180, overflow: 'auto' }}>
            {browsePath && (
              <button className="btn btn-ghost btn-sm" style={{ margin: 6 }}
                onClick={() => setBrowsePath(browsePath.split('/').slice(0, -1).join('/'))}>
                ← up
              </button>
            )}
            {entries.map((e) => (
              <div key={e.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer',
                  background: path === e.path ? 'var(--brand-soft)' : undefined,
                }}
                onClick={() => { setPath(e.path); if (!name) setName(e.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')); }}
                onDoubleClick={() => e.isDir && setBrowsePath(e.path)}
              >
                <span>{e.isDir ? '📁' : '🌐'}</span>
                <span style={{ flex: 1 }}>{e.name}</span>
                {e.isDir && (
                  <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setBrowsePath(e.path); }}>
                    open
                  </button>
                )}
              </div>
            ))}
            {entries.length === 0 && <div style={{ padding: 12, color: 'var(--ink-faint)' }}>No folders or html files here.</div>}
          </div>
          {path && <div style={{ fontSize: '0.84rem', color: 'var(--ink-soft)' }}>Serving: <code>{path}</code></div>}
        </div>

        <div className="field">
          <label htmlFor="app-name">Name (becomes the URL)</label>
          <input id="app-name" className="input" value={name} placeholder="my-app"
            onChange={(e) => setName(e.target.value.toLowerCase())} />
          {name && <div style={{ fontSize: '0.84rem', color: 'var(--ink-faint)' }}>→ /s/{name}/ · http://{name}.mini/</div>}
        </div>

        <div className="field">
          <label>Who can open it?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['private', 'public'] as const).map((v) => (
              <button key={v} type="button"
                className={`btn btn-sm ${visibility === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVisibility(v)}>
                {v === 'private' ? 'Private (you only)' : 'Public'}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontWeight: 550 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!path || !name || busy} onClick={submit}>
            {busy ? 'Going live…' : 'Go live'}
          </button>
        </div>
      </div>
    </div>
  );
}
