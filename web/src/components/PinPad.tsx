import { useEffect, useRef, useState } from 'react';

/** Console-style PIN pad: dots fill as you type, shakes and clears on a wrong PIN. */
export default function PinPad({ onSubmit, length = 4 }: {
  onSubmit: (pin: string) => Promise<boolean>;
  length?: number;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const press = (d: string) => {
    if (busy) return;
    setError(false);
    if (d === '⌫') return setPin((p) => p.slice(0, -1));
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
      if (!ok) setError(true);
    }, wait);
    return () => clearTimeout(t);
  }, [pin, length, busy, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('⌫');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={boxRef}>
      <div className={`pin-dots${error ? ' error' : ''}`} style={{ justifyContent: 'center', marginBottom: 22 }}>
        {Array.from({ length: Math.max(length, pin.length) }).map((_, i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
        ))}
      </div>
      <div className="pin-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k === '' ? <span key={i} /> : (
            <button key={i} type="button" className="pin-key" onClick={() => press(k)} aria-label={k === '⌫' ? 'delete' : k}>
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
