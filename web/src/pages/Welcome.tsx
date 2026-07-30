import { useEffect, useRef, useState } from 'react';
import { api, type PublicUser } from '../api';
import { greetingFor, isNight } from '../greetings';
import { useClock, useSession } from '../state';
import PinPad from '../components/PinPad';
import { Plus, Station } from '../icons';

interface ProfilesResp { setupNeeded: boolean; maxUsers: number; profiles: PublicUser[] }

/**
 * The station log — who is at the instrument.
 *
 * This is the one moment the brief keeps: a console-style "who's here" with a
 * big clock. It now reads as the observation station's own log sheet, and after
 * dark the plate turns to the atlas's night rendering.
 */
export default function Welcome() {
  const clock = useClock();
  const { setUser } = useSession();
  const [data, setData] = useState<ProfilesResp | null>(null);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [mode, setMode] = useState<'pick' | 'pin' | 'password' | 'setup' | 'add'>('pick');
  const [greeting, setGreeting] = useState<{ title: string; sub: string } | null>(null);
  const night = isNight();

  const load = () => api<ProfilesResp>('/auth/profiles').then((d) => {
    setData(d);
    if (d.setupNeeded) setMode('setup');
  });
  useEffect(() => { load().catch(() => undefined); }, []);

  const finishing = useRef(false);
  const finish = (user: PublicUser) => {
    if (finishing.current) return; // one splash, one timer — no stale setUser later
    finishing.current = true;
    setGreeting(greetingFor(user.displayName));
    setTimeout(() => setUser(user), 1750);
  };

  const pick = (p: PublicUser) => {
    setSelected(p);
    setMode(p.hasPin ? 'pin' : 'password');
  };

  /** Back always returns to a clean picker — a leftover `selected` used to blank the screen. */
  const backToPick = () => {
    setSelected(null);
    setMode('pick');
  };

  const today = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className={`welcome${night ? ' night' : ''}`}>
      <div className="welcome-top">
        <div className="station-time">
          <span className="welcome-clock">{clock}</span>
          <span className="caption">{today}</span>
        </div>
        <span className="wordmark"><span className="mini">Mini</span>Cloud</span>
      </div>

      <div className="welcome-center">
        {mode === 'pick' && data && (
          <>
            <div>
              <h1 className="welcome-title">Who's at the station?</h1>
            </div>
            <div className="observers">
              {data.profiles.map((p, i) => (
                <button key={p.id} className="observer" onClick={() => pick(p)}>
                  <span className="observer-mark" style={{ background: p.color }}>
                    {p.displayName[0]?.toUpperCase()}
                  </span>
                  <span className="observer-foot">
                    <span className="observer-name">{p.displayName}</span>
                    <span className="observer-id">
                      OBS-{String(i + 1).padStart(2, '0')}{p.hasPin ? ' · PIN' : ''}
                    </span>
                  </span>
                </button>
              ))}
              {data.profiles.length < data.maxUsers && (
                <button className="observer observer-add" onClick={() => setMode('add')}>
                  <span className="observer-mark"><Plus size={26} /></span>
                  <span className="observer-foot">
                    <span className="observer-name">Add user</span>
                    <span className="observer-id">
                      {data.maxUsers - data.profiles.length} free
                    </span>
                  </span>
                </button>
              )}
            </div>
          </>
        )}

        {mode === 'pin' && selected && (
          <PinUnlock user={selected} onBack={backToPick} onPassword={() => setMode('password')} onDone={finish} />
        )}

        {mode === 'password' && selected && (
          <PasswordLogin user={selected} onBack={backToPick} onDone={finish} />
        )}

        {mode === 'setup' && <SetupForm onDone={finish} />}

        {mode === 'add' && (
          <AddUserForm onBack={backToPick} onDone={() => { backToPick(); load(); }} />
        )}
      </div>

      {/* The plate's footing — closes the sheet and states the one fact that
          makes this product different from the cloud it is named after. */}
      <footer className="welcome-foot">
        <span className="caption">MiniCloud</span>
        <span className="hint">Everything here stays on this machine, encrypted at rest.</span>
      </footer>

      {greeting && (
        <div className="greeting" aria-live="polite">
          <div className="greeting-inner">
            <Station size={54} className="stamp" />
            <h1>{greeting.title}</h1>
            <div className="sub">{greeting.sub}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PinUnlock({ user, onBack, onPassword, onDone }: {
  user: PublicUser;
  onBack: () => void;
  onPassword: () => void;
  onDone: (u: PublicUser) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = async (pin: string) => {
    setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/auth/pin', {
        method: 'POST',
        body: JSON.stringify({ username: user.username, pin }),
      });
      onDone(r.user);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <div className="pinpad">
      <h2>{user.displayName}</h2>
      <PinPad onSubmit={submit} />
      {error && <div className="form-error" style={{ marginBottom: 0 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 9 }}>
        <button className="btn btn-sm" onClick={onBack}>Back</button>
        <button className="btn btn-sm" onClick={onPassword}>Use password</button>
      </div>
    </div>
  );
}

function PasswordLogin({ user, onBack, onDone }: {
  user: PublicUser;
  onBack: () => void;
  onDone: (u: PublicUser) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: user.username, password }),
      });
      onDone(r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="narrow-form">
      <h2>{user.displayName}</h2>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" ref={ref} className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary grow" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </div>
      <p className="hint signin-note">
        Signing in with your password trusts this device, so next time your PIN is enough.
      </p>
    </form>
  );
}

export interface NewProfile {
  username: string;
  displayName: string;
  password: string;
  pin?: string;
  ownerPassword?: string;
}

function UserForm({ title, cta, onSubmit, onBack, needsOwnerPassword }: {
  title: string;
  cta: string;
  /** Adding a profile from the signed-out picker has to be authorised by the owner. */
  needsOwnerPassword?: boolean;
  onBack?: () => void;
  onSubmit: (v: NewProfile) => Promise<void>;
}) {
  const [v, setV] = useState({ username: '', displayName: '', password: '', pin: '', ownerPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...v,
        pin: v.pin || undefined,
        ownerPassword: needsOwnerPassword ? v.ownerPassword : undefined,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="narrow-form">
      <h2>{title}</h2>
      <div className="field">
        <label htmlFor="un">Username</label>
        <input id="un" className="input" value={v.username} autoComplete="off"
          onChange={(e) => setV({ ...v, username: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="dn">Display name</label>
        <input id="dn" className="input" value={v.displayName} placeholder={v.username || 'shown on the picker'}
          onChange={(e) => setV({ ...v, displayName: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pw2">Password</label>
        <input id="pw2" className="input" type="password" value={v.password} autoComplete="new-password"
          onChange={(e) => setV({ ...v, password: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pin">PIN — optional, 4–6 digits</label>
        <input id="pin" className="input" inputMode="numeric" pattern="\d*" maxLength={6} value={v.pin}
          onChange={(e) => setV({ ...v, pin: e.target.value.replace(/\D/g, '') })} />
      </div>
      {needsOwnerPassword && (
        <div className="field">
          <label htmlFor="ownerpw">Owner's password</label>
          <input id="ownerpw" className="input" type="password" autoComplete="off" value={v.ownerPassword}
            onChange={(e) => setV({ ...v, ownerPassword: e.target.value })} />
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        {onBack && <button type="button" className="btn" onClick={onBack}>Back</button>}
        <button className="btn btn-primary grow" disabled={busy || !v.username || !v.password}>
          {busy ? 'Working…' : cta}
        </button>
      </div>
    </form>
  );
}

function SetupForm({ onDone }: { onDone: (u: PublicUser) => void }) {
  return (
    <UserForm
      title="Open the station"
      cta="Create owner profile"
      onSubmit={async (v) => {
        const r = await api<{ user: PublicUser }>('/auth/setup', { method: 'POST', body: JSON.stringify(v) });
        onDone(r.user);
      }}
    />
  );
}

function AddUserForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <UserForm
      title="New profile"
      cta="Add profile"
      onBack={onBack}
      needsOwnerPassword
      onSubmit={async (v) => {
        await api('/auth/users', { method: 'POST', body: JSON.stringify(v) });
        onDone();
      }}
    />
  );
}
