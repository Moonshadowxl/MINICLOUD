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

  const finish = (user: PublicUser) => {
    setGreeting(greetingFor(user.displayName));
    // let the splash play, then enter the app
    setTimeout(() => setUser(user), 1750);
  };

  const pick = (p: PublicUser) => {
    setSelected(p);
    setMode(p.hasPin ? 'pin' : 'password');
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
            onBack={() => setMode('pick')}
            onPassword={() => setMode('password')}
            onDone={finish}
          />
        )}

        {mode === 'password' && selected && (
          <PasswordLogin user={selected} onBack={() => setMode('pick')} onDone={finish} />
        )}

        {mode === 'setup' && <SetupForm onDone={finish} />}

        {mode === 'add' && selected === null && (
          <AddUserForm
            onBack={() => setMode('pick')}
            onDone={() => { setMode('pick'); load(); }}
          />
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
      {error && <div style={{ color: 'var(--danger)', fontWeight: 550 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
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
    <form onSubmit={submit} style={{ width: 300 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 18 }}>Welcome back, {user.displayName}</h2>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" ref={ref} className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 10, fontWeight: 550 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginTop: 12 }}>
        Signing in with your password marks this device as trusted — next time your PIN is enough.
      </p>
    </form>
  );
}

function UserForm({ title, cta, onSubmit, onBack, requirePin }: {
  title: string;
  cta: string;
  requirePin?: boolean;
  onBack?: () => void;
  onSubmit: (v: { username: string; displayName: string; password: string; pin?: string }) => Promise<void>;
}) {
  const [v, setV] = useState({ username: '', displayName: '', password: '', pin: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...v, pin: v.pin || undefined });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ width: 320 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 18 }}>{title}</h2>
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
        <label htmlFor="pin">PIN (4-6 digits{requirePin ? '' : ', optional'}) — quick unlock on trusted devices</label>
        <input id="pin" className="input" inputMode="numeric" pattern="\d*" maxLength={6} value={v.pin}
          onChange={(e) => setV({ ...v, pin: e.target.value.replace(/\D/g, '') })} />
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 10, fontWeight: 550 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {onBack && <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>}
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !v.username || !v.password}>
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
      onSubmit={async (v) => {
        // adding a profile requires someone signed in; the API enforces it
        await api('/auth/users', { method: 'POST', body: JSON.stringify(v) });
        onDone();
      }}
    />
  );
}
