import { useCallback, useState } from 'react';
import { useModal } from './useModal';
import { Cross } from '../icons';

/**
 * In-world confirm and prompt.
 *
 * The browser's own `confirm()` and `prompt()` were the only chrome a user ever
 * saw in this app, and they showed up on its most destructive action — removing a
 * profile and everything it stored, on a machine explicitly meant to be shared.
 * A grey system sheet is the wrong place to make that decision.
 */

interface Ask {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Present a text field, resolving to the string (or null when cancelled). */
  field?: { label: string; initial?: string; placeholder?: string; hint?: string };
  /** Require this word typed back before the action can run. */
  typeToConfirm?: string;
}

type Pending = Ask & { resolve: (v: string | boolean | null) => void };

export function useAsk() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (a: Ask) => new Promise<boolean>((resolve) => setPending({ ...a, resolve: (v) => resolve(v !== null && v !== false) })),
    [],
  );
  const prompt = useCallback(
    (a: Ask & { field: NonNullable<Ask['field']> }) =>
      new Promise<string | null>((resolve) =>
        setPending({ ...a, resolve: (v) => resolve(typeof v === 'string' ? v : null) }),
      ),
    [],
  );

  const dialog = pending ? <AskDialog ask={pending} onDone={() => setPending(null)} /> : null;
  return { confirm, prompt, dialog };
}

function AskDialog({ ask, onDone }: { ask: Pending; onDone: () => void }) {
  const [value, setValue] = useState(ask.field?.initial ?? '');
  const [typed, setTyped] = useState('');
  const close = useCallback((result: string | boolean | null) => { ask.resolve(result); onDone(); }, [ask, onDone]);
  const cancel = useCallback(() => close(null), [close]);
  const ref = useModal(cancel);

  const gate = ask.typeToConfirm;
  const ready = !gate || typed.trim().toLowerCase() === gate.toLowerCase();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    close(ask.field ? value : true);
  };

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && cancel()}>
      <form ref={ref as never} className="modal" role="dialog" aria-modal="true"
        aria-label={ask.title} onSubmit={submit}>
        <div className="modal-head">
          <h3>{ask.title}</h3>
          <button type="button" className="modal-x" onClick={cancel} aria-label="Cancel">
            <Cross size={16} />
          </button>
        </div>
        <div className="modal-body">
          {ask.body && <p className="soft">{ask.body}</p>}
          {ask.field && (
            <div className="field">
              <label htmlFor="ask-field">{ask.field.label}</label>
              <input
                id="ask-field" data-autofocus className="input" value={value}
                placeholder={ask.field.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
              {ask.field.hint && <span className="hint">{ask.field.hint}</span>}
            </div>
          )}
          {gate && (
            <div className="field">
              <label htmlFor="ask-gate">Type <code>{gate}</code> to confirm</label>
              <input
                id="ask-gate" data-autofocus={!ask.field ? '' : undefined} className="input"
                value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button className={`btn ${ask.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ready}>
            {ask.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
