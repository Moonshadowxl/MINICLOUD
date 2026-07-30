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

export interface ToastAction { label: string; run: () => void | Promise<void> }
interface Toast { id: number; text: string; error?: boolean; action?: ToastAction }
const ToastCtx = createContext<(text: string, error?: boolean, action?: ToastAction) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error = false, action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error, action }]);
    // an entry offering a way back stays up long enough to take it
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* the day book: what the vault just recorded */}
      <div className="log" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`log-entry${t.error ? ' bad' : ''}`}>
            <span className={`lamp ${t.error ? 'alarm' : 'live'}`} />
            <span className="log-text">{t.text}</span>
            {t.action && (
              <button
                className="log-undo"
                onClick={() => {
                  void t.action?.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Live clock string like 19:42, ticking on the minute. */
export function useClock(): string {
  const [text, setText] = useState(() => fmt(new Date()));
  useEffect(() => {
    const tick = () => setText(fmt(new Date()));
    const t = setInterval(tick, 1000 * (61 - new Date().getSeconds()));
    return () => clearInterval(t);
  }, [text]);
  return text;
}

const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
