import { useState, type ReactNode } from 'react';
import { useSheet } from '../useSheet';
import { AlarmIcon } from './Icons';

/**
 * The vault asks its own questions. Every confirmation and every short answer runs through
 * these sheets — a browser `confirm()` or `prompt()` would drop the user out of the chamber
 * at exactly the moments that matter most: destroying something, or naming it.
 */

export function ConfirmSheet({ title, note, body, cta, danger, onConfirm, onCancel }: {
  title: string;
  note?: string;
  body: ReactNode;
  cta: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sheet = useSheet(onCancel);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={sheet} className="sheet" role="alertdialog" aria-modal="true" aria-label={title} style={{ maxWidth: 440 }}>
        <div className="sheet-head">
          <div className="titling">
            <h3>{title}</h3>
            {note && <span className="reg reg-sm">{note}</span>}
          </div>
        </div>
        <div className="sheet-body">{body}</div>
        <div className="sheet-foot">
          <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-alarm' : 'btn-portal'}`} onClick={onConfirm}>
            {danger && <AlarmIcon size={15} />} {cta}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AskSheet({ title, note, label, hint, initial = '', placeholder, cta, inputMode, onDone, onCancel }: {
  title: string;
  note?: string;
  label: string;
  hint?: string;
  initial?: string;
  placeholder?: string;
  cta: string;
  inputMode?: 'numeric' | 'text';
  onDone: (value: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const sheet = useSheet<HTMLFormElement>(onCancel);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: 420 }}
        onSubmit={(e) => { e.preventDefault(); onDone(v.trim()); }}
      >
        <div className="sheet-head">
          <div className="titling">
            <h3>{title}</h3>
            {note && <span className="reg reg-sm">{note}</span>}
          </div>
        </div>
        <div className="sheet-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ask">{label}</label>
            <input
              id="ask"
              className={`input${inputMode === 'numeric' ? ' num' : ''}`}
              value={v}
              autoFocus
              inputMode={inputMode}
              placeholder={placeholder}
              onChange={(e) => setV(inputMode === 'numeric' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)}
            />
            {hint && <span className="hint">{hint}</span>}
          </div>
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
          <button className="btn btn-portal">{cta}</button>
        </div>
      </form>
    </div>
  );
}
