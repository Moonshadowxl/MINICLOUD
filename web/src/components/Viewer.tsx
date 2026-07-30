import { useEffect, useState } from 'react';
import { fmtBytes, type Entry } from '../api';
import { Cross, Down } from '../icons';
import { useModal } from './useModal';

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

  const dialogRef = useModal(onClose);

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
      <div ref={dialogRef} className={`modal${kind === 'video' || kind === 'text' ? ' wide' : ''}`}
        role="dialog" aria-modal="true" aria-label={entry.name}>
        <div className="modal-head">
          <h3>{entry.name}</h3>
          <span className="measure">{fmtBytes(entry.size)}</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <Cross size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="viewer-body">
            {kind === 'video' && <video src={src} controls autoPlay />}
            {kind === 'audio' && <audio src={src} controls autoPlay />}
            {kind === 'image' && <img src={src} alt={entry.name} />}
            {kind === 'text' && (
              tooBig ? (
                <p className="viewer-note">This file is large — <a href={`${src}?download`} download>download it</a> instead.</p>
              ) : text === null ? (
                <div className="skeleton" style={{ height: 220 }} />
              ) : (
                <pre className="code">
                  {text.split('\n').map((ln, i) => <span className="ln" key={i}>{ln || ' '}</span>)}
                </pre>
              )
            )}
            {kind === 'other' && (
              <p className="viewer-note">
                No preview for this kind of file — <a href={`${src}?download`} download>download {entry.name}</a>.
              </p>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <a className="btn btn-primary" href={`${src}?download`} download={entry.name}>
            <Down size={14} /> Download
          </a>
        </div>
      </div>
    </div>
  );
}
