import { useEffect, useState } from 'react';
import { api, fmtBytes, type Entry, type PublicUser } from '../api';
import { useSession, useToast } from '../state';
import { Rule } from '../icons';

export default function Settings() {
  const { user } = useSession();
  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="page"><div className="panel-grid">
        <SecurityPanel />
        <SearchPanel />
        {user?.isOwner && <ProfilesPanel />}
        <TrashPanel />
        <AboutPanel />
      </div></div>
    </>
  );
}

function SecurityPanel() {
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pin, setPin] = useState({ current: '', next: '' });

  return (
    <section className="panel">
      <h3>Password &amp; PIN</h3>
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/password/set', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
          toast('Password changed');
          setPw({ current: '', next: '' });
        } catch (err) { toast((err as Error).message, true); }
      }}>
        <div className="field">
          <label>Change password</label>
          <input className="input" type="password" placeholder="Current password" value={pw.current}
            autoComplete="current-password" onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div className="field">
          <input className="input" type="password" placeholder="New password (min 6 chars)" value={pw.next}
            autoComplete="new-password" onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <button className="btn btn-sm" disabled={!pw.current || pw.next.length < 6}>Update password</button>
      </form>

      <form style={{ marginTop: 20 }} onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/pin/set', { method: 'POST', body: JSON.stringify({ currentPassword: pin.current, pin: pin.next || null }) });
          toast(pin.next ? 'PIN updated' : 'PIN removed');
          setPin({ current: '', next: '' });
        } catch (err) { toast((err as Error).message, true); }
      }}>
        <div className="field">
          <label>Change PIN (leave new PIN empty to remove)</label>
          <input className="input" type="password" placeholder="Your password" value={pin.current}
            autoComplete="current-password" onChange={(e) => setPin({ ...pin, current: e.target.value })} />
        </div>
        <div className="field">
          <input className="input" inputMode="numeric" maxLength={6} placeholder="New PIN (4-6 digits)" value={pin.next}
            onChange={(e) => setPin({ ...pin, next: e.target.value.replace(/\D/g, '') })} />
        </div>
        <button className="btn btn-sm" disabled={!pin.current}>Update PIN</button>
      </form>

      <div className="panel-note">
        <button className="btn btn-danger btn-sm" onClick={async () => {
          if (!confirm('Forget this device? PIN unlock stops working here until you sign in with your password again.')) return;
          await api('/auth/forget-device', { method: 'POST' });
          location.href = '/';
        }}>Forget this device</button>
        <p className="hint">
          Removes this device's trusted status — do this on shared or borrowed computers.
        </p>
      </div>
    </section>
  );
}

function ProfilesPanel() {
  const { user } = useSession();
  const toast = useToast();
  const [profiles, setProfiles] = useState<PublicUser[]>([]);
  const load = () => api<{ profiles: PublicUser[] }>('/auth/profiles').then((r) => setProfiles(r.profiles));
  useEffect(() => { load(); }, []);

  const setQuota = async (p: PublicUser) => {
    const gb = prompt(`Quota for ${p.displayName} in GB (empty = shared pool)`);
    if (gb === null) return;
    const trimmed = gb.trim();
    // A stray letter used to sail through as NaN, and a huge number was stored
    // verbatim and then broke every read of the profile list.
    if (trimmed !== '' && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0 || Number(trimmed) > 1e6)) {
      return toast('Enter a size in GB between 0 and 1,000,000 — or leave it empty.', true);
    }
    try {
      await api('/auth/quota', {
        method: 'POST',
        body: JSON.stringify({ userId: p.id, quotaBytes: trimmed === '' ? null : Number(trimmed) * 1024 ** 3 }),
      });
      toast('Quota updated');
    } catch (e) { toast((e as Error).message, true); }
  };

  const remove = async (p: PublicUser) => {
    if (!confirm(`Remove ${p.displayName} and everything they stored? This cannot be undone.`)) return;
    try {
      await api(`/auth/users/${p.id}`, { method: 'DELETE' });
      toast(`Removed ${p.displayName}`);
      load();
    } catch (e) { toast((e as Error).message, true); }
  };

  return (
    <section className="panel">
      <h3>Profiles</h3>
      <div className="rows">
        {profiles.map((p) => (
          <div className="row row-tight" key={p.id}>
            <span className="avatar" style={{ background: p.color }}>{p.displayName[0]?.toUpperCase()}</span>
            <div className="grow">
              <div className="name static">{p.displayName} {p.isOwner && '· owner'}</div>
              <div className="meta">@{p.username}{p.hasPin ? ' · PIN set' : ''}</div>
            </div>
            <div className="actions">
              <button className="btn btn-sm" onClick={() => setQuota(p)}>Quota</button>
              {p.id !== user?.id && (
                <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">
        Add a profile from the welcome screen — “Switch user”, then “Add user”. Up to 6,
        and it asks for your owner password.
      </p>
    </section>
  );
}

function SearchPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const reindex = async () => {
    setBusy(true);
    try {
      const r = await api<{ indexed: number }>('/search/reindex', { method: 'POST' });
      toast(`Reindexed ${r.indexed} files`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h3>Search index</h3>
      <p className="soft" style={{ margin: '0 0 12px' }}>
        Press <kbd>⌘K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to search your files by name or
        by what's inside them. The index keeps itself current as you upload.
      </p>
      <button className="btn btn-sm" onClick={reindex} disabled={busy}>
        <Rule size={14} /> {busy ? 'Reindexing…' : 'Rebuild the index'}
      </button>
      <p className="hint">
        Only needed if results look stale — say, after restoring a backup by hand.
      </p>
    </section>
  );
}

function TrashPanel() {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const load = () => api<{ entries: Entry[] }>('/files/trash').then((r) => setEntries(r.entries)).catch(() => setEntries([]));
  useEffect(() => { load(); }, []);

  const tops = (entries ?? []).filter(
    (e) => !(entries ?? []).some((other) => other.isDir && e.path.startsWith(`${other.path}/`)),
  );

  return (
    <section className="panel">
      <h3>Trash</h3>
      {entries === null ? <div className="skeleton" style={{ height: 60 }} /> : tops.length === 0 ? (
        <p className="soft">Nothing in the trash.</p>
      ) : (
        <div className="rows">
          {tops.map((e) => (
            <div className="row row-tight" key={e.id}>
              <div className="grow">
                <div className="name static">{e.name}</div>
                <div className="meta">{e.path}{!e.isDir && ` · ${fmtBytes(e.size)}`}</div>
              </div>
              <div className="actions">
                <button className="btn btn-sm" onClick={async () => {
                  try { await api(`/files/${e.id}/restore`, { method: 'POST' }); toast('Restored'); load(); }
                  catch (err) { toast((err as Error).message, true); }
                }}>Restore</button>
                <button className="btn btn-danger btn-sm" onClick={async () => {
                  if (!confirm(`Delete "${e.name}" forever? This can't be undone.`)) return;
                  await api(`/files/${e.id}/purge`, { method: 'DELETE' });
                  toast('Deleted forever');
                  load();
                }}>Delete forever</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AboutPanel() {
  return (
    <section className="panel">
      <h3>This machine</h3>
      <p style={{ margin: '0 0 8px' }}>
        MiniCloud runs on your own machine. To reach it away from home, install{' '}
        <a href="https://tailscale.com" target="_blank" rel="noreferrer">Tailscale</a> on the server and your
        devices — see <code>docs/</code> in the repo for the walkthrough (plus SSH and auto-start).
      </p>
      <p className="hint">
        Back up <code>data/keys/master.key</code> somewhere safe — without it the encrypted files can't be read.
      </p>
    </section>
  );
}
