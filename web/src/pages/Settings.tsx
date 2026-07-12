import { useEffect, useState } from 'react';
import { api, fmtBytes, type Entry, type PublicUser } from '../api';
import { useSession, useToast } from '../state';

export default function Settings() {
  const { user } = useSession();
  return (
    <>
      <div className="main-head"><h1>Settings</h1></div>
      <div className="panel-grid" style={{ marginTop: 0 }}>
        <SecurityPanel />
        {user?.isOwner && <ProfilesPanel />}
        <TrashPanel />
        <AboutPanel />
      </div>
    </>
  );
}

function SecurityPanel() {
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pin, setPin] = useState({ current: '', next: '' });

  return (
    <section className="panel">
      <h3>Security</h3>
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/password/set', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
          toast('Password changed ✓');
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
        <button className="btn btn-ghost btn-sm" disabled={!pw.current || pw.next.length < 6}>Update password</button>
      </form>

      <form style={{ marginTop: 20 }} onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/pin/set', { method: 'POST', body: JSON.stringify({ currentPassword: pin.current, pin: pin.next || null }) });
          toast(pin.next ? 'PIN updated ✓' : 'PIN removed');
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
        <button className="btn btn-ghost btn-sm" disabled={!pin.current}>Update PIN</button>
      </form>
    </section>
  );
}

function ProfilesPanel() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<PublicUser[]>([]);
  const load = () => api<{ profiles: PublicUser[] }>('/auth/profiles').then((r) => setProfiles(r.profiles));
  useEffect(() => { load(); }, []);

  const setQuota = async (p: PublicUser) => {
    const gb = prompt(`Quota for ${p.displayName} in GB (empty = shared pool)`);
    if (gb === null) return;
    try {
      await api('/auth/quota', {
        method: 'POST',
        body: JSON.stringify({ userId: p.id, quotaBytes: gb.trim() === '' ? null : Number(gb) * 1024 ** 3 }),
      });
      toast('Quota updated ✓');
    } catch (e) { toast((e as Error).message, true); }
  };

  return (
    <section className="panel">
      <h3>Profiles</h3>
      <div className="rows">
        {profiles.map((p) => (
          <div className="row" key={p.id} style={{ padding: '8px 0' }}>
            <span className="avatar" style={{ background: p.color }}>{p.displayName[0]?.toUpperCase()}</span>
            <div className="grow">
              <div className="name" style={{ cursor: 'default' }}>{p.displayName} {p.isOwner && '· owner'}</div>
              <div className="meta">@{p.username}{p.hasPin ? ' · PIN set' : ''}</div>
            </div>
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setQuota(p)}>Quota</button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.84rem', color: 'var(--ink-faint)' }}>
        New profiles are added from the welcome screen (up to 6).
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
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>Trash is empty.</p>
      ) : (
        <div className="rows">
          {tops.map((e) => (
            <div className="row" key={e.id} style={{ padding: '8px 0' }}>
              <div className="grow">
                <div className="name" style={{ cursor: 'default' }}>{e.name}</div>
                <div className="meta">{e.path}{!e.isDir && ` · ${fmtBytes(e.size)}`}</div>
              </div>
              <div className="actions">
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  try { await api(`/files/${e.id}/restore`, { method: 'POST' }); toast('Restored ✓'); load(); }
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
      <h3>Your server</h3>
      <p style={{ margin: '0 0 8px' }}>
        MiniCloud runs on your own machine. To reach it away from home, install{' '}
        <a href="https://tailscale.com" target="_blank" rel="noreferrer">Tailscale</a> on the server and your
        devices — see <code>docs/</code> in the repo for the walkthrough (plus SSH and auto-start).
      </p>
      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-faint)' }}>
        Back up <code>data/keys/master.key</code> somewhere safe — without it the encrypted files can't be read.
      </p>
    </section>
  );
}
