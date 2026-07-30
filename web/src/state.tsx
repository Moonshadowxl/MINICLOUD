import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type PublicUser } from './api';

interface Session {
  user: PublicUser | null;
  loading: boolean;
  setUser: (u: PublicUser | null) => void;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<Session>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: PublicUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  return <SessionCtx.Provider value={{ user, loading, setUser, signOut }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

// ---------- toasts ----------

interface Toast { id: number; text: string; error?: boolean }
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/**
 * Live clock string like 19:42, ticking on the minute.
 * A self-rescheduling timeout, not an interval: an interval seeded with
 * "seconds until the next minute" keeps that same odd period forever and
 * drifts off the minute boundary within the hour.
 */
export function useClock(): string {
  const [text, setText] = useState(() => fmt(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      timer = setTimeout(() => {
        setText(fmt(new Date()));
        schedule();
      }, 60_000 - now.getSeconds() * 1000 - now.getMilliseconds());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return text;
}

const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
