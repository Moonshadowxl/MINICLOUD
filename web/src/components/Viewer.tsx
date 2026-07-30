import { useEffect, useState } from 'react';
import { fmtBytes, type Entry } from '../api';

const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm', 'xml', 'svg',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'yml', 'yaml', 'toml',
  'ini', 'env', 'sql', 'php', 'vue', 'svelte', 'astro', 'lock', 'gitignore', 'miniignore',
]);

const isText = (e: Entry) =>
  e.mime.startsWith('text/') || TEXT_EXT.has(e.name.split('.').pop()?.toLowerCase() ?? '');

/** In-app preview: video/audio stream (with seek), images, and a line-numbered code view. */
export default function Viewer({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const src = `/api/files/${entry.id}/content`;
  const [text, setText] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);

  const kind = entry.mime.startsWith('video/') ? 'video'
    : entry.mime.startsWith('audio/') ? 'audio'
    : entry.mime.startsWith('image/') ? 'image'
    : isText(entry) ? 'text' : 'other';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind !== 'text') return;
    if (entry.size > 1024 * 1024) { setTooBig(true); return; }
    let live = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => live && setText(t))
      .catch(() => live && setText('(could not load this file)'));
    return () => { live = false; };
  }, [kind, src, entry.size]);

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${kind === 'video' || kind === 'text' ? ' wide' : ''}`} role="dialog" aria-label={entry.name}>
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', fontWeight: 400, flexShrink: 0 }}>
            {fmtBytes(entry.size)}
          </span>
        </h3>
        <div className="viewer-body">
          {kind === 'video' && <video src={src} controls autoPlay />}
          {kind === 'audio' && <audio src={src} controls autoPlay />}
          {kind === 'image' && <img src={src} alt={entry.name} />}
          {kind === 'text' && (
            tooBig ? (
              <p className="viewer-note">This file is large — <a href={`${src}?download`} download>download it</a> instead.</p>
            ) : text === null ? (
              <div className="skeleton" style={{ height: 200 }} />
            ) : (
              <pre className="code">
                {text.split('\n').map((ln, i) => <span className="ln" key={i}>{ln || ' '}</span>)}
              </pre>
            )
          )}
          {kind === 'other' && (
            <p className="viewer-note">
              No preview for this type — <a href={`${src}?download`} download>download {entry.name}</a>.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <a className="btn btn-ghost" href={`${src}?download`} download={entry.name}>Download</a>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
