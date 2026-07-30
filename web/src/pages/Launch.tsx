import { useEffect, useState } from 'react';
import { api, type Entry, type ServedApp } from '../api';
import { CHAMBERS } from '../accession';
import { useToast } from '../state';
import { useSheet } from '../useSheet';
import {
  AlarmIcon, ArchiveIcon, CheckIcon, CloseIcon, CopyIcon, IntoIcon, IssueIcon, OpenWorldIcon,
  SealIcon, ShelfIcon, UpIcon,
} from '../components/Icons';

/**
 * CH·03 — the issue desk. An accession lifted out of cold storage and put where a browser
 * can reach it: /s/<name>/ and http://<name>.mini/. Held means signed-in depositors only;
 * issued means anyone who can reach the server. Stopping puts it back on the shelf.
 */
export default function Launch() {
  const [apps, setApps] = useState<ServedApp[] | null>(null);
  const [issuing, setIssuing] = useState(false);
  const toast = useToast();

  const load = () => api<{ apps: ServedApp[] }>('/apps').then((r) => setApps(r.apps)).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  const recall = async (a: ServedApp) => {
    if (!confirm(`Return "${a.name}" to the shelf? Its links stop working. The files are kept.`)) return;
    await api(`/apps/${a.id}`, { method: 'DELETE' });
    toast(`${a.name} is back on the shelf — files kept`);
    load();
  };

  const flip = async (a: ServedApp) => {
    const next = a.visibility === 'public' ? 'private' : 'public';
    await api(`/apps/${a.id}`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) });
    toast(next === 'public' ? `${a.name} is open to anyone with the link` : `${a.name} is held — depositors only`);
    load();
  };

  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast('Link copied'));
  };

  return (
    <>
      <div className="ch-head">
        <div className="titling">
          <span className="reg num">{CHAMBERS.issue.no} · {CHAMBERS.issue.title}</span>
          <h1>Issue desk</h1>
        </div>
        <div className="acts">
          <button className="btn btn-portal" onClick={() => setIssuing(true)}>
            <IssueIcon size={15} /> Issue an accession
          </button>
        </div>
      </div>

      {apps === null ? (
        <div className="frosted" style={{ height: 140 }} />
      ) : apps.length === 0 ? (
        <div className="bare">
          <span className="glyph"><IssueIcon size={38} /></span>
          <h3>Nothing is out in the open</h3>
          <p>
            Deposit a folder with an <code>index.html</code> in it, then issue it here. It gets a real
            URL and serves straight out of the chamber — nothing is copied or unsealed on disk.
          </p>
          <div className="after">
            <button className="btn btn-portal btn-sm" onClick={() => setIssuing(true)}>
              <IssueIcon size={14} /> Issue an accession
            </button>
          </div>
        </div>
      ) : (
        <div className="register">
          {apps.map((a) => (
            <div className="entry" key={a.id} style={{ gridTemplateColumns: '34px minmax(0, 1fr) auto auto' }}>
              <span className="form-ico"><span className={`lamp ${a.visibility === 'public' ? 'live' : 'hold'}`} /></span>
              <div className="desc">
                <div className="desc-name" style={{ cursor: 'default' }}>{a.name}</div>
                <div className="acc num" style={{ marginTop: 3 }}>
                  from {a.rootPath} · {a.urls.map((u, i) => (
                    <span key={u}>
                      {i > 0 && ' · '}
                      <a href={u} target="_blank" rel="noreferrer">{u}</a>
                    </span>
                  ))}
                </div>
              </div>
              <span className={`stamp ${a.visibility === 'public' ? 'issued' : 'held'}`}>
                {a.visibility === 'public' ? <OpenWorldIcon size={12} /> : <ArchiveIcon size={12} />}
                {a.visibility === 'public' ? 'Issued' : 'Held'}
              </span>
              <div className="row-acts">
                <button className="icon-btn" onClick={() => copy(a.urls[0])} aria-label={`Copy the link to ${a.name}`} title="Copy link">
                  <CopyIcon size={15} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => flip(a)}
                  aria-label={a.visibility === 'public' ? `Hold ${a.name} — depositors only` : `Issue ${a.name} to anyone`}
                  title={a.visibility === 'public' ? 'Hold — depositors only' : 'Issue to anyone'}
                >
                  {a.visibility === 'public' ? <SealIcon size={15} /> : <OpenWorldIcon size={15} />}
                </button>
                <button className="icon-btn danger" onClick={() => recall(a)} aria-label={`Return ${a.name} to the shelf`} title="Return to the shelf">
                  <CloseIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {issuing && <IssueSheet onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); load(); }} />}
    </>
  );
}

/** Issuing commits something to the open world, so it earns a protected, focused step. */
function IssueSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [path, setPath] = useState('');
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const sheet = useSheet(onClose);

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
      toast(`${r.app.name} is live`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-label="Issue an accession">
        <div className="sheet-head">
          <div className="titling">
            <h3>Issue an accession</h3>
            <span className="reg reg-sm">Serve it out of the chamber at a real URL</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>

        <div className="sheet-body">
          <div className="field">
            <label>What should be served{browsePath && <> — in {browsePath}</>}</label>
            <div className="picker">
              {browsePath && (
                <div className="pick">
                  <button type="button" className="pick-take" onClick={() => setBrowsePath(browsePath.split('/').slice(0, -1).join('/'))}>
                    <UpIcon size={15} />
                    <span className="pn">Up one shelf</span>
                  </button>
                </div>
              )}
              {entries.map((e) => (
                <div className={`pick${path === e.path ? ' on' : ''}`} key={e.id}>
                  <button
                    type="button"
                    className="pick-take"
                    aria-pressed={path === e.path}
                    onClick={() => {
                      setPath(e.path);
                      if (!name) {
                        setName(e.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''));
                      }
                    }}
                  >
                    {e.isDir ? <ShelfIcon size={15} /> : <OpenWorldIcon size={15} />}
                    <span className="pn">{e.name}</span>
                    {path === e.path && <CheckIcon size={15} />}
                  </button>
                  {e.isDir && (
                    <button
                      type="button"
                      className="pick-into"
                      onClick={() => setBrowsePath(e.path)}
                      aria-label={`Open the ${e.name} shelf`}
                      title="Open this shelf"
                    >
                      <IntoIcon size={16} />
                    </button>
                  )}
                </div>
              ))}
              {entries.length === 0 && (
                <div style={{ padding: 14, color: 'var(--rime-3)', fontSize: '0.84rem' }}>
                  No folders or html files on this shelf.
                </div>
              )}
            </div>
            {path && <span className="hint">Serving {path}</span>}
          </div>

          <div className="field">
            <label htmlFor="app-name">Name — it becomes the URL</label>
            <input id="app-name" className="input" value={name} placeholder="my-app"
              onChange={(e) => setName(e.target.value.toLowerCase())} />
            {name && <span className="hint num">/s/{name}/ · http://{name}.mini/</span>}
          </div>

          <div className="field">
            <label>Who can open it</label>
            <div className="choice">
              <button
                type="button"
                aria-pressed={visibility === 'private'}
                className={`btn btn-sm seg${visibility === 'private' ? ' on' : ''}`}
                onClick={() => setVisibility('private')}
              >
                <ArchiveIcon size={14} /> Held
              </button>
              <button
                type="button"
                aria-pressed={visibility === 'public'}
                className={`btn btn-sm seg open${visibility === 'public' ? ' on' : ''}`}
                onClick={() => setVisibility('public')}
              >
                <OpenWorldIcon size={14} /> Issued
              </button>
            </div>
            <span className="hint">
              {visibility === 'private'
                ? 'Only signed-in depositors can open it.'
                : 'Anyone who can reach this server can open it — no sign-in.'}
            </span>
          </div>

          {error && <div className="form-error" role="alert"><AlarmIcon size={15} /> {error}</div>}
        </div>

        <div className="sheet-foot">
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-portal" disabled={!path || !name || busy} onClick={submit}>
            <IssueIcon size={15} /> {busy ? 'Issuing…' : 'Issue it'}
          </button>
        </div>
      </div>
    </div>
  );
}
