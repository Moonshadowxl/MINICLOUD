import { useEffect, useRef, useState } from 'react';
import { api, type PublicUser } from '../api';
import { greetingFor, isNight } from '../greetings';
import { useClock, useSession } from '../state';
import PinPad from '../components/PinPad';

interface ProfilesResp { setupNeeded: boolean; maxUsers: number; profiles: PublicUser[] }

/**
 * The console moment: clock top-left, wordmark, profile tiles (selected one highlighted),
 * "+" to add a user, PIN pad on pick, then the time-of-day greeting splash.
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
    // let the splash play, then enter the app
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

  return (
    <div className={`welcome${night ? ' night' : ''}`}>
      <div className="welcome-top">
        <span className="welcome-clock">{clock}</span>
        <span className="wordmark" style={{ fontSize: '1.3rem' }}>
          <span className="mini">MINI</span>CLOUD
        </span>
      </div>

      <div className="welcome-center">
        {mode === 'pick' && data && (
          <>
            <h1 className="welcome-title">Who's here?</h1>
            <div className="profiles">
              {data.profiles.map((p) => (
                <button
                  key={p.id}
                  className={`profile${selected?.id === p.id ? ' selected' : ''}`}
                  onClick={() => pick(p)}
              >
                  <span className="profile-tile" style={{ background: p.color }}>
                    {p.displayName[0]?.toUpperCase()}
                  </span>
                  <span className="profile-name">{p.displayName}</span>
                </button>
              ))}
              {data.profiles.length < data.maxUsers && (
                <button className="profile profile-add" onClick={() => setMode('add')}>
                  <span className="profile-tile">+</span>
                  <span className="profile-name">Add user</span>
                </button>
              )}
            </div>
          </>
        )}

        {mode === 'pin' && selected && (
          <PinUnlock
            user={selected}
            onBack={backToPick}
            onPassword={() => setMode('password')}
            onDone={finish}
          />
        )}

        {mode === 'password' && selected && (
          <PasswordLogin user={selected} onBack={backToPick} onDone={finish} />
        )}

        {mode === 'setup' && <SetupForm onDone={finish} />}

        {mode === 'add' && (
          <AddUserForm onBack={backToPick} onDone={() => { backToPick(); load(); }} />
        )}
      </div>

      {greeting && (
        <div className="greeting" aria-live="polite">
          <div style={{ textAlign: 'center' }}>
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
      <h2>Hi {user.displayName} — your PIN</h2>
      <PinPad onSubmit={submit} />
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>Back</button>
        <button className="btn btn-ghost btn-sm" onClick={onPassword}>Use password</button>
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
      <h2>Welcome back, {user.displayName}</h2>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" ref={ref} className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary grow" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p className="hint signin-note">
        Signing in with your password marks this device as trusted — next time your PIN is enough.
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
        <input id="dn" className="input" value={v.displayName} placeholder={v.username}
          onChange={(e) => setV({ ...v, displayName: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pw2">Password</label>
        <input id="pw2" className="input" type="password" value={v.password} autoComplete="new-password"
          onChange={(e) => setV({ ...v, password: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pin">PIN (4-6 digits, optional) — quick unlock on trusted devices</label>
        <input id="pin" className="input" inputMode="numeric" pattern="\d*" maxLength={6} value={v.pin}
          onChange={(e) => setV({ ...v, pin: e.target.value.replace(/\D/g, '') })} />
      </div>
      {needsOwnerPassword && (
        <div className="field">
          <label htmlFor="ownerpw">Owner's password — to confirm this profile is allowed</label>
          <input id="ownerpw" className="input" type="password" autoComplete="off" value={v.ownerPassword}
            onChange={(e) => setV({ ...v, ownerPassword: e.target.value })} />
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        {onBack && <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>}
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
      title="Set up your MiniCloud"
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
