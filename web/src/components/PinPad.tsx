import { useCallback, useEffect, useRef, useState } from 'react';
import { Back, Check } from '../icons';

const MIN_PIN = 4;
const MAX_PIN = 6;

/**
 * Console-style PIN pad: dots fill as you type, shakes and clears on a wrong PIN.
 *
 * PINs are 4-6 digits, and the server locks the profile out after 5 wrong tries.
 * So this deliberately does NOT guess when you're done: it used to auto-submit
 * the moment you reached 4 digits, which meant anyone with a 5- or 6-digit PIN
 * submitted a wrong prefix on every attempt and locked themselves out. Now only
 * a full 6 digits (the maximum — nothing more can be typed) submits by itself;
 * shorter PINs are confirmed with Enter or the confirm key.
 */
export default function PinPad({ onSubmit }: { onSubmit: (pin: string) => Promise<boolean> }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async (value: string) => {
    if (busyRef.current || value.length < MIN_PIN) return;
    busyRef.current = true;
    setBusy(true);
    const ok = await onSubmit(value);
    setPin(''); // always clear, so a retry never resubmits a stale PIN
    setBusy(false);
    busyRef.current = false;
    if (!ok) setError(true);
  }, [onSubmit]);

  const press = useCallback((key: string) => {
    if (busyRef.current) return;
    setError(false);
    if (key === 'del') return setPin((p) => p.slice(0, -1));
    if (key === 'ok') return setPin((p) => { void submit(p); return p; });
    setPin((p) => {
      if (p.length >= MAX_PIN) return p;
      const next = p + key;
      if (next.length === MAX_PIN) void submit(next);
      return next;
    });
  }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const keys: { key: string; label: React.ReactNode; aria: string }[] = [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => ({ key: d, label: d, aria: d })),
    { key: 'del', label: <Back size={19} />, aria: 'delete' },
    { key: '0', label: '0', aria: '0' },
    { key: 'ok', label: <Check size={19} />, aria: 'confirm PIN' },
  ];

  return (
    <div>
      <div className={`pin-dots${error ? ' error' : ''}`}>
        {Array.from({ length: Math.max(MIN_PIN, pin.length) }).map((_, i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
        ))}
      </div>
      <div className="pin-grid">
        {keys.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`pin-key${k.key === 'ok' ? ' pin-ok' : ''}`}
            onClick={() => press(k.key)}
            aria-label={k.aria}
            disabled={busy || (k.key === 'ok' && pin.length < MIN_PIN)}
        >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
