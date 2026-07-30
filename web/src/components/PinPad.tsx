import { useEffect, useState } from 'react';
import { BackIcon } from './Icons';

/** The vault keypad: cold keys, dots set as you enter, the pad refuses a wrong code. */
export default function PinPad({ onSubmit, length = 4 }: {
  onSubmit: (pin: string) => Promise<boolean>;
  length?: number;
}) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const press = (d: string) => {
    if (busy) return;
    setBad(false);
    if (d === 'del') return setPin((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    setPin(pin + d);
  };

  // submit at 4 digits automatically after a short pause, or at 6 immediately
  useEffect(() => {
    if (pin.length < length || busy) return;
    const wait = pin.length >= 6 ? 0 : 350;
    const t = setTimeout(async () => {
      setBusy(true);
      const ok = await onSubmit(pin);
      setPin(''); // always clear: prevents re-render loops from resubmitting the same PIN
      setBusy(false);
      if (!ok) setBad(true);
    }, wait);
    return () => clearTimeout(t);
  }, [pin, length, busy, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <div className={`pin-dots${bad ? ' bad' : ''}`} style={{ marginBottom: 24 }}>
        {Array.from({ length: Math.max(length, pin.length) }).map((_, i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' set' : ''}`} />
        ))}
      </div>
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
          k === '' ? <span key={i} /> : (
            <button
              key={i}
              type="button"
              className="key"
              onClick={() => press(k)}
              aria-label={k === 'del' ? 'Delete last digit' : k}
            >
              {k === 'del' ? <BackIcon size={20} /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
