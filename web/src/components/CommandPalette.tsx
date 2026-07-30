import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtBytes, type SearchHit } from '../api';

/**
 * Search everything, from anywhere: ⌘K / Ctrl-K.
 *
 * Matches come from file names *and* file contents, so the answer to "where did
 * I put that function" is two keystrokes away instead of a folder crawl.
 */

const HL_OPEN = '\u0002';
const HL_CLOSE = '\u0003';

/** How much context to keep before the first match, in characters. */
const LEAD_CHARS = 40;

/**
 * Server snippets arrive as plain text with sentinel markers around each match.
 * Splitting on the markers means the file's own contents render as text and can
 * never smuggle markup into this list.
 *
 * Source files are mostly newlines and indentation, so a raw snippet can push the
 * actual match past the two visible lines. Whitespace is collapsed to single
 * spaces and a long run-up is elided, which keeps the highlight on screen.
 */
function Snippet({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { text: string; hit: boolean }[] = [];
    let seenHit = false;
    for (const chunk of text.split(HL_OPEN)) {
      const [head, ...rest] = chunk.split(HL_CLOSE);
      if (!seenHit && out.length === 0) {
        out.push({ text: head, hit: false });
        continue;
      }
      seenHit = true;
      out.push({ text: head, hit: true });
      if (rest.length) out.push({ text: rest.join(HL_CLOSE), hit: false });
    }

    const flat = out.map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ') }));
    const lead = flat[0];
    if (lead && !lead.hit && lead.text.length > LEAD_CHARS) {
      lead.text = `…${lead.text.slice(-LEAD_CHARS).trimStart()}`;
    }
    return flat.filter((p) => p.text !== '');
  }, [text]);

  return (
    <div className="cp-snippet">
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </div>
  );
}

const iconFor = (h: SearchHit) => {
  if (h.isDir) return '📁';
  if (h.mime.startsWith('video/')) return '🎬';
  if (h.mime.startsWith('audio/')) return '🎵';
  if (h.mime.startsWith('image/')) return '🖼️';
  return '📄';
};

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Debounced as-you-type search; a slow response can never overwrite a newer one.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); setBusy(false); return; }
    setBusy(true);
    let live = true;
    const t = setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`)
        .then((r) => { if (live) { setHits(r.hits); setActive(0); } })
        .catch(() => { if (live) setHits([]); })
        .finally(() => { if (live) setBusy(false); });
    }, 130);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const open = useCallback((hit: SearchHit) => {
    const parent = hit.isDir ? hit.path : hit.path.slice(0, Math.max(0, hit.path.lastIndexOf('/')));
    const dest = parent.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    // ?open= tells the Files page to pop the viewer for this file once it loads
    navigate(`/files/${dest}${hit.isDir ? '' : `?open=${hit.fileId}`}`);
    onClose();
  }, [navigate, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (!hits?.length) return;
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(hits[active]);
    }
  };

  // keep the highlighted row in view when arrowing past the fold
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, hits]);

  return (
    <div className="backdrop cp-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="cp-input-row">
          <svg className="cp-search-ico" width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="cp-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search files and code…"
            aria-label="Search files and code"
            autoComplete="off"
            spellCheck={false}
          />
          {busy && <span className="cp-spinner" aria-hidden />}
        </div>

        <div className="cp-results" ref={listRef} role="listbox" aria-label="Results">
          {hits === null ? (
            <div className="cp-hint">
              <p>Search by name, or by what's inside — function names, notes, config values.</p>
            </div>
          ) : hits.length === 0 ? (
            <div className="cp-hint">
              <p>No matches for “{query.trim()}”.</p>
            </div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.fileId}
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                className={`cp-row${i === active ? ' active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => open(h)}
              >
                <span className="cp-ico" aria-hidden>{iconFor(h)}</span>
                <span className="cp-body">
                  <span className="cp-name">
                    {h.name}
                    <span className="cp-path">{h.path}</span>
                  </span>
                  {h.snippet && <Snippet text={h.snippet} />}
                </span>
                <span className="cp-size">{h.isDir ? 'Folder' : fmtBytes(h.size)}</span>
              </button>
            ))
          )}
        </div>

        <div className="cp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

/** Global ⌘K / Ctrl-K listener. Returns [isOpen, open, close]. */
export function usePalette(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  // stable identities, so the palette's own callbacks don't churn every render
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return [open, show, hide];
}
