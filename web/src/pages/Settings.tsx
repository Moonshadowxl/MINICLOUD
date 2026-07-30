import { useEffect, useState, type ReactNode } from 'react';
import { api, fmtBytes, type Entry, type PublicUser } from '../api';
import { CHAMBERS, depositorCode } from '../accession';
import { useSession, useToast } from '../state';
import { AlarmIcon, KeyIcon, RestoreIcon, ThawIcon } from '../components/Icons';
import { AskSheet, ConfirmSheet } from '../components/Ask';

/**
 * CH·04 — the deposit agreement. Clause by clause, in the order that matters: the master
 * key first, because losing it is the one failure this product cannot undo for you.
 */
export default function Settings() {
  const { user } = useSession();
  return (
    <>
      <div className="ch-head">
        <div className="titling">
          <span className="reg num">{CHAMBERS.terms.no} · {CHAMBERS.terms.title}</span>
          <h1>Terms of deposit</h1>
        </div>
      </div>

      <div className="clauses">
        <Clause title="The master key" note="Read this one" critical>
          <div className="clause-cols">
            <div>
              <p>
                Every file is sealed with AES-256-GCM before it touches the disk, under a key
                held in <code>data/keys/master.key</code> on the server machine. The key never
                leaves it, and nothing here can read your files without it.
              </p>
              <p>
                <strong>Back that file up somewhere else.</strong> If the drive dies and the key
                dies with it, the encrypted chunks are unreadable — by us, by you, by anyone.
                A copy on a USB stick in a drawer is enough.
              </p>
            </div>
            <div className="panel" style={{ background: 'var(--rock-deep)' }}>
              <div className="panel-head"><span className="reg">Keep a copy of</span></div>
              <div className="panel-body" style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--portal)', flexShrink: 0, marginTop: 2 }}><KeyIcon size={20} /></span>
                <div>
                  <code style={{ fontSize: '0.86rem' }}>data/keys/master.key</code>
                  <p className="fine" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--rime-3)' }}>
                    On the machine running MiniCloud, beside the database.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Clause>

        <Clause title="Your way in" note="Password, and the quick code for your PIN">
          <SecurityClause />
        </Clause>

        <Clause title="This device" note="Trust, and how to withdraw it">
          <DeviceClause />
        </Clause>

        {user?.isOwner && (
          <Clause title="Depositors" note="Who else holds a chamber">
            <DepositorsClause />
          </Clause>
        )}

        <Clause title="The thaw shelf" note="Removed, not yet gone">
          <ThawClause />
        </Clause>

        <Clause title="Reaching the vault" note="From outside the house">
          <p>
            MiniCloud runs on your own machine, so it answers on your own network by default. To
            reach it from anywhere, install <a href="https://tailscale.com" target="_blank" rel="noreferrer">Tailscale</a> on
            the server and on your devices — they join one private network and nothing is exposed
            to the internet.
          </p>
          <p className="fine" style={{ fontSize: '0.84rem', color: 'var(--rime-3)' }}>
            The <code>docs/</code> folder in the repo covers that, plus SSH access, starting on
            boot, and the <code>.mini</code> hostnames.
          </p>
        </Clause>
      </div>
    </>
  );
}

function Clause({ title, note, critical, children }: {
  title: string; note: string; critical?: boolean; children: ReactNode;
}) {
  return (
    <section className={`clause${critical ? ' critical' : ''}`}>
      <div className="clause-head">
        <div className="clause-title">
          <h3>{title}</h3>
          <span className="reg reg-sm">{note}</span>
        </div>
      </div>
      <div className="clause-body">{children}</div>
    </section>
  );
}

function SecurityClause() {
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pin, setPin] = useState({ current: '', next: '' });

  return (
    <div className="clause-cols">
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/password/set', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
          });
          toast('Password changed');
          setPw({ current: '', next: '' });
        } catch (err) { toast((err as Error).message, true); }
      }}>
        <div className="field">
          <label htmlFor="cur-pw">Change your password</label>
          <input id="cur-pw" className="input" type="password" placeholder="Current password" value={pw.current}
            autoComplete="current-password" onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div className="field">
          <input className="input" type="password" placeholder="New password" value={pw.next}
            autoComplete="new-password" onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <span className="hint">At least 6 characters.</span>
        </div>
        <button className="btn btn-quiet btn-sm" disabled={!pw.current || pw.next.length < 6}>Update password</button>
      </form>

      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/auth/pin/set', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: pin.current, pin: pin.next || null }),
          });
          toast(pin.next ? 'Quick code updated' : 'Quick code removed');
          setPin({ current: '', next: '' });
        } catch (err) { toast((err as Error).message, true); }
      }}>
        <div className="field">
          <label htmlFor="cur-pw2">Change your quick code</label>
          <input id="cur-pw2" className="input" type="password" placeholder="Your password" value={pin.current}
            autoComplete="current-password" onChange={(e) => setPin({ ...pin, current: e.target.value })} />
        </div>
        <div className="field">
          <input className="input num" inputMode="numeric" maxLength={6} placeholder="New code — 4 to 6 digits"
            value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value.replace(/\D/g, '') })} />
          <span className="hint">Leave it empty to remove the code entirely.</span>
        </div>
        <button className="btn btn-quiet btn-sm" disabled={!pin.current}>Update quick code</button>
      </form>
    </div>
  );
}

function DeviceClause() {
  const [asking, setAsking] = useState(false);
  return (
    <div className="clause-split">
      <p style={{ margin: 0 }}>
        Signing in with your password marks this device as trusted, which is what lets the quick
        code work here. Forgetting the device undoes that: the code stops working until you sign
        in with your password again. Do it on anything shared or borrowed.
      </p>
      <div>
        <button className="btn btn-alarm btn-sm" onClick={() => setAsking(true)}>
          <AlarmIcon size={14} /> Forget this device
        </button>
      </div>
      {asking && (
        <ConfirmSheet
          title="Forget this device?"
          danger
          cta="Forget it"
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            setAsking(false);
            await api('/auth/forget-device', { method: 'POST' });
            location.href = '/';
          }}
          body={
            <p style={{ margin: 0 }}>
              Your quick code stops working here. You will need your password to get back in,
              and signing in with it will trust this device again.
            </p>
          }
        />
      )}
    </div>
  );
}

function DepositorsClause() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<PublicUser[] | null>(null);
  const load = () => api<{ profiles: PublicUser[] }>('/auth/profiles').then((r) => setProfiles(r.profiles)).catch(() => setProfiles([]));
  useEffect(() => { load(); }, []);

  const [quotaFor, setQuotaFor] = useState<PublicUser | null>(null);

  const setQuota = async (p: PublicUser, gb: string) => {
    setQuotaFor(null);
    try {
      await api('/auth/quota', {
        method: 'POST',
        body: JSON.stringify({ userId: p.id, quotaBytes: gb === '' ? null : Number(gb) * 1024 ** 3 }),
      });
      toast(gb === '' ? `${p.displayName} shares the pool` : `${p.displayName} is capped at ${gb} GB`);
    } catch (e) { toast((e as Error).message, true); }
  };

  return (
    <>
      {profiles === null ? (
        <div className="frosted" style={{ height: 70 }} />
      ) : (
        <div className="plainlist">
          {profiles.map((p) => (
            <div className="plainrow" key={p.id}>
              <span className="dep-chip" style={{ background: p.color }}>{p.displayName[0]?.toUpperCase()}</span>
              <div className="grow">
                <div className="t">{p.displayName}{p.isOwner && ' — keyholder'}</div>
                <div className="s">{depositorCode(p.username)} · @{p.username}{p.hasPin ? ' · code set' : ''}</div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => setQuotaFor(p)}>Quota</button>
            </div>
          ))}
        </div>
      )}
      <p className="fine" style={{ fontSize: '0.84rem', color: 'var(--rime-3)', marginTop: 14, marginBottom: 0 }}>
        New depositors are added from the portal, up to six chambers.
      </p>
      {quotaFor && (
        <AskSheet
          title={`Space for ${quotaFor.displayName}`}
          note="How much of the rack they may fill"
          label="Cap in GB"
          hint="Leave it empty and they share the whole pool with everyone else."
          placeholder="e.g. 50"
          inputMode="numeric"
          cta="Set the cap"
          onCancel={() => setQuotaFor(null)}
          onDone={(gb) => setQuota(quotaFor, gb)}
        />
      )}
    </>
  );
}

function ThawClause() {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [purging, setPurging] = useState<Entry | null>(null);
  const load = () => api<{ entries: Entry[] }>('/files/trash').then((r) => setEntries(r.entries)).catch(() => setEntries([]));
  useEffect(() => { load(); }, []);

  // only show the top of each removed tree, not every file inside it
  const tops = (entries ?? []).filter(
    (e) => !(entries ?? []).some((other) => other.isDir && e.path.startsWith(`${other.path}/`)),
  );

  return (
    <>
      <p>
        Anything you remove sits on the thaw shelf for 30 days before it is purged for good.
        Until then it still counts against your space, and you can put it straight back.
      </p>
      {entries === null ? (
        <div className="frosted" style={{ height: 60 }} />
      ) : tops.length === 0 ? (
        <p className="fine" style={{ fontSize: '0.84rem', color: 'var(--rime-3)', margin: 0 }}>
          The thaw shelf is empty.
        </p>
      ) : (
        <div className="plainlist">
          {tops.map((e) => (
            <div className="plainrow" key={e.id}>
              <span style={{ color: 'var(--rime-3)', flexShrink: 0 }}><ThawIcon size={16} /></span>
              <div className="grow">
                <div className="t">{e.name}</div>
                <div className="s">{e.path}{!e.isDir && ` · ${fmtBytes(e.size)}`}</div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="icon-btn" title="Put it back" aria-label={`Put ${e.name} back`}
                  onClick={async () => {
                    try { await api(`/files/${e.id}/restore`, { method: 'POST' }); toast('Back on the shelf'); load(); }
                    catch (err) { toast((err as Error).message, true); }
                  }}>
                  <RestoreIcon size={15} />
                </button>
                <button className="icon-btn danger" title="Purge for good" aria-label={`Purge ${e.name} for good`}
                  onClick={() => setPurging(e)}>
                  <AlarmIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {purging && (
        <ConfirmSheet
          title="Purge it for good?"
          note={purging.name}
          danger
          cta="Purge it"
          onCancel={() => setPurging(null)}
          onConfirm={async () => {
            const e = purging;
            setPurging(null);
            await api(`/files/${e.id}/purge`, { method: 'DELETE' });
            toast('Purged for good');
            load();
          }}
          body={
            <p style={{ margin: 0 }}>
              This deletes the sealed chunks from the disk. There is no thaw shelf after this
              one and no version to fall back on — it is gone.
            </p>
          }
        />
      )}
    </>
  );
}
