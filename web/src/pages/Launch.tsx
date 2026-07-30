import { useEffect, useState } from 'react';
import { api, type Entry, type ServedApp } from '../api';
import { useToast } from '../state';
import { Back, Broadcast, Document, Folder } from '../icons';

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
      <div className="page-head">
        <h1>Launch</h1>
        <button className="btn btn-primary" onClick={() => setServing(true)}>Serve a folder</button>
      </div>

      <div className="page">
      {apps === null ? (
        <div className="skeleton" style={{ height: 110 }} />
      ) : apps.length === 0 ? (
        <div className="empty">
          <Broadcast size={32} className="empty-sym" />
          <h3>Nothing on the air</h3>
          <p>Any stored folder with an <code>index.html</code> can be given a real URL and served
             straight from this machine — public to anyone, or private to the people here.</p>
          <button className="btn btn-primary" onClick={() => setServing(true)}>Serve a folder</button>
        </div>
      ) : (
        <div className="rows">
          {apps.map((a) => (
            <div className="row" key={a.id}>
              <span className="file-sym dir" aria-hidden><Broadcast size={20} /></span>
              <div className="grow">
                <div className="name static">{a.name}</div>
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
                <button className="btn btn-sm" onClick={() => copy(a.urls[0])}>Copy URL</button>
                <button className="btn btn-sm" onClick={() => flip(a)}>
                  Make {a.visibility === 'public' ? 'private' : 'public'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => stop(a)}>Stop</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

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
      toast(`"${r.app.name}" is on the air`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Serve a folder">
        <div className="modal-head"><h3>Serve a folder</h3></div>
        <div className="modal-body">

        <div className="field">
          <label>Pick what to serve {browsePath && <>— in <code>{browsePath}</code></>}</label>
          <div className="picker">
            {browsePath && (
              <button className="btn btn-sm" style={{ margin: 6 }}
                onClick={() => setBrowsePath(browsePath.split('/').slice(0, -1).join('/'))}>
                <Back size={13} /> up
              </button>
            )}
            {entries.map((e) => (
              <div key={e.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer',
                  background: path === e.path ? 'var(--iron-wash)' : undefined,
                }}
                onClick={() => { setPath(e.path); if (!name) setName(e.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')); }}
                onDoubleClick={() => e.isDir && setBrowsePath(e.path)}
              >
                <span className="file-sym" aria-hidden>{e.isDir ? <Folder size={18} /> : <Document size={18} />}</span>
                <span className="grow">{e.name}</span>
                {e.isDir && (
                  <button className="btn btn-sm" onClick={(ev) => { ev.stopPropagation(); setBrowsePath(e.path); }}>
                    open
                  </button>
                )}
              </div>
            ))}
            {entries.length === 0 && <div className="hint" style={{ padding: 12 }}>No folders or html files here.</div>}
          </div>
          {path && <div className="hint soft">Serving: <code>{path}</code></div>}
        </div>

        <div className="field">
          <label htmlFor="app-name">Name (becomes the URL)</label>
          <input id="app-name" className="input" value={name} placeholder="my-app"
            onChange={(e) => setName(e.target.value.toLowerCase())} />
          {name && <div className="hint measure">/s/{name}/ · {name}.mini</div>}
        </div>

        <div className="field">
          <label>Who can open it?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['private', 'public'] as const).map((v) => (
              <button key={v} type="button"
                className={`btn btn-sm ${visibility === v ? 'btn-primary' : ''}`}
                onClick={() => setVisibility(v)}>
                {v === 'private' ? 'Private — people here' : 'Public — anyone'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!path || !name || busy} onClick={submit}>
            {busy ? 'Going live…' : 'Go live'}
          </button>
        </div>
      </div>
    </div>
  );
}
