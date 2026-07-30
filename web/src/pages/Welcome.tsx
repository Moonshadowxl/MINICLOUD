import { useEffect, useRef, useState } from 'react';
import { api, type PublicUser } from '../api';
import { depositorCode } from '../accession';
import { greetingFor, isNight } from '../greetings';
import { useClock, useSession } from '../state';
import PinPad from '../components/PinPad';
import { AlarmIcon, PlusIcon, SealIcon } from '../components/Icons';

interface ProfilesResp { setupNeeded: boolean; maxUsers: number; profiles: PublicUser[] }

/**
 * THE PORTAL — the way into the vault, and the one drenched surface in the app.
 * Light falls in from the entrance, the depositor plates hang in a row beneath it, and
 * picking yours brings up the keypad. Admission is logged, then the chamber opens.
 */
export default function Welcome() {
  const clock = useClock();
  const { setUser } = useSession();
  const [data, setData] = useState<ProfilesResp | null>(null);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [mode, setMode] = useState<'pick' | 'pin' | 'password' | 'setup' | 'add'>('pick');
  const [admitted, setAdmitted] = useState<{ title: string; sub: string } | null>(null);
  const night = isNight();

  const load = () => api<ProfilesResp>('/auth/profiles').then((d) => {
    setData(d);
    if (d.setupNeeded) setMode('setup');
  });
  useEffect(() => { load().catch(() => undefined); }, []);

  const finishing = useRef(false);
  const finish = (user: PublicUser) => {
    if (finishing.current) return; // one admission, one timer — no stale setUser later
    finishing.current = true;
    setAdmitted(greetingFor(user.displayName));
    setTimeout(() => setUser(user), 1750);
  };

  const pick = (p: PublicUser) => {
    setSelected(p);
    setMode(p.hasPin ? 'pin' : 'password');
  };

  return (
    <div className={`portal${night ? ' night' : ''}`}>
      <div className="portal-top">
        <span className="mark">
          <span className="bolt" />
          <span className="word">Mini<span className="dim">cloud</span></span>
        </span>
        <span className="portal-clock">
          <span className="reg reg-sm">Local time</span>
          <span className="t num">{clock}</span>
        </span>
      </div>

      <div className="portal-center">
        {mode === 'pick' && data && (
          <>
            <div className="portal-heading">
              <h1>Who is depositing?</h1>
              <span className="reg">The chamber stays sealed until someone signs in</span>
            </div>
            <div className="plates">
              {data.profiles.map((p) => (
                <button
                  key={p.id}
                  className={`plate${selected?.id === p.id ? ' on' : ''}`}
                  onClick={() => pick(p)}
                >
                  <span className="plate-face" style={{ ['--plate-tint' as string]: p.color }}>
                    <span className="plate-initial">{p.displayName[0]?.toUpperCase()}</span>
                  </span>
                  <span className="plate-tag">
                    <span className="plate-name">{p.displayName}</span>
                    <span className="plate-code num">{depositorCode(p.username)}</span>
                  </span>
                </button>
              ))}
              {data.profiles.length < data.maxUsers && (
                <button className="plate plate-new" onClick={() => { setSelected(null); setMode('add'); }}>
                  <span className="plate-face"><PlusIcon size={26} /></span>
                  <span className="plate-tag">
                    <span className="plate-name">New depositor</span>
                    <span className="plate-code">{data.maxUsers - data.profiles.length} places left</span>
                  </span>
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

      {admitted && (
        <div className="admit" aria-live="polite">
          <div className="admit-inner">
            <span className="line">
              <span className="lamp" />
              <span className="reg reg-sm num">Admitted {clock} · chamber open</span>
            </span>
            <h1>{admitted.title}</h1>
            <span className="sub">{admitted.sub}</span>
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
    <div className="keypad">
      <div className="keypad-head">
        <h2>{user.displayName}</h2>
        <span className="reg reg-sm">Enter your code</span>
      </div>
      <PinPad onSubmit={submit} />
      {error && (
        <div className="form-error" role="alert" style={{ margin: 0 }}>
          <AlarmIcon size={15} /> {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 9 }}>
        <button className="btn btn-quiet btn-sm" onClick={onBack}>Back</button>
        <button className="btn btn-quiet btn-sm" onClick={onPassword}>Use password</button>
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
    <form onSubmit={submit} style={{ width: 'min(330px, 90vw)' }}>
      <div className="portal-heading" style={{ marginBottom: 22 }}>
        <h2>{user.displayName}</h2>
        <span className="reg reg-sm">Sign in with your password</span>
      </div>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" ref={ref} className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && <div className="form-error" role="alert"><AlarmIcon size={15} /> {error}</div>}
      <div style={{ display: 'flex', gap: 9 }}>
        <button type="button" className="btn btn-quiet" onClick={onBack}>Back</button>
        <button className="btn btn-portal" style={{ flex: 1 }} disabled={busy || !password}>
          <SealIcon size={15} /> {busy ? 'Opening…' : 'Open the chamber'}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 14, marginBottom: 0, fontSize: '0.78rem', color: 'var(--rime-3)' }}>
        Signing in with your password trusts this device — after that your code is enough.
      </p>
    </form>
  );
}

function UserForm({ title, note, cta, onSubmit, onBack }: {
  title: string;
  note: string;
  cta: string;
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
    <form onSubmit={submit} style={{ width: 'min(350px, 90vw)' }}>
      <div className="portal-heading" style={{ marginBottom: 22 }}>
        <h2>{title}</h2>
        <span className="reg reg-sm">{note}</span>
      </div>
      <div className="field">
        <label htmlFor="un">Username</label>
        <input id="un" className="input" value={v.username} autoComplete="off"
          onChange={(e) => setV({ ...v, username: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="dn">Display name</label>
        <input id="dn" className="input" value={v.displayName} placeholder={v.username || 'shown on your plate'}
          onChange={(e) => setV({ ...v, displayName: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pw2">Password</label>
        <input id="pw2" className="input" type="password" value={v.password} autoComplete="new-password"
          onChange={(e) => setV({ ...v, password: e.target.value })} />
        <span className="hint">At least 6 characters.</span>
      </div>
      <div className="field">
        <label htmlFor="pin">Quick code — optional</label>
        <input id="pin" className="input num" inputMode="numeric" pattern="\d*" maxLength={6} value={v.pin}
          placeholder="4 to 6 digits"
          onChange={(e) => setV({ ...v, pin: e.target.value.replace(/\D/g, '') })} />
        <span className="hint">Unlocks the chamber on devices you already trust.</span>
      </div>
      {error && <div className="form-error" role="alert"><AlarmIcon size={15} /> {error}</div>}
      <div style={{ display: 'flex', gap: 9 }}>
        {onBack && <button type="button" className="btn btn-quiet" onClick={onBack}>Back</button>}
        <button className="btn btn-portal" style={{ flex: 1 }} disabled={busy || !v.username || !v.password}>
          {busy ? 'Working…' : cta}
        </button>
      </div>
    </form>
  );
}

function SetupForm({ onDone }: { onDone: (u: PublicUser) => void }) {
  return (
    <UserForm
      title="Cut the first chamber"
      note="You are the keyholder — this profile owns the vault"
      cta="Open the vault"
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
      title="New depositor"
      note="Their shelves stay separate from yours"
      cta="Cut their chamber"
      onBack={onBack}
      onSubmit={async (v) => {
        // adding a profile requires someone signed in; the API enforces it
        await api('/auth/users', { method: 'POST', body: JSON.stringify(v) });
        onDone();
      }}
    />
  );
}
