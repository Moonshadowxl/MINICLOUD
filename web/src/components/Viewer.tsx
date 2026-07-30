import { useEffect, useState } from 'react';
import { fmtBytes, type Entry } from '../api';
import { accession } from '../accession';
import { CloseIcon, WithdrawIcon } from './Icons';

const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm', 'xml', 'svg',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'yml', 'yaml', 'toml',
  'ini', 'env', 'sql', 'php', 'vue', 'svelte', 'astro', 'lock', 'gitignore', 'miniignore',
]);

const isText = (e: Entry) =>
  e.mime.startsWith('text/') || TEXT_EXT.has(e.name.split('.').pop()?.toLowerCase() ?? '');

/**
 * Inspection: an accession lifted off the shelf and read without withdrawing it.
 * Video and audio stream with seeking; images and source are read in place.
 */
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
    fetch(src).then((r) => r.text()).then(setText).catch(() => setText('(this accession could not be read)'));
  }, [kind, src, entry.size]);

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`sheet${kind === 'video' || kind === 'text' ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
      >
        <div className="sheet-head">
          <div className="titling">
            <h3>{entry.name}</h3>
            <span className="reg reg-sm num">
              {accession(entry.id, entry.category)} · {fmtBytes(entry.size)}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close inspection">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="view-body">
            {kind === 'video' && <video src={src} controls autoPlay />}
            {kind === 'audio' && <audio src={src} controls autoPlay />}
            {kind === 'image' && <img src={src} alt={entry.name} />}
            {kind === 'text' && (
              tooBig ? (
                <p className="view-note">
                  Too large to read in the chamber. <a href={`${src}?download`} download>Withdraw a copy</a> instead.
                </p>
              ) : text === null ? (
                <div className="frosted" style={{ height: 220 }} />
              ) : (
                <pre className="listing">
                  {text.split('\n').map((ln, i) => <span className="l" key={i}>{ln || ' '}</span>)}
                </pre>
              )
            )}
            {kind === 'other' && (
              <p className="view-note">
                Nothing in the chamber reads this form.{' '}
                <a href={`${src}?download`} download>Withdraw a copy</a> to open it on your own machine.
              </p>
            )}
          </div>
        </div>

        <div className="sheet-foot">
          <a className="btn btn-quiet" href={`${src}?download`} download={entry.name}>
            <WithdrawIcon size={15} /> Withdraw a copy
          </a>
          <button className="btn btn-portal" onClick={onClose}>Back to the register</button>
        </div>
      </div>
    </div>
  );
}
