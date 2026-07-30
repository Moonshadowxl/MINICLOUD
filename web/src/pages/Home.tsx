import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, connectEvents, fmtBytes, type ServedApp, type Usage } from '../api';
import { CHAMBERS } from '../accession';
import { greetingFor } from '../greetings';
import { useSession } from '../state';
import { ArchiveIcon, IssueIcon, OpenWorldIcon } from '../components/Icons';

/** Box labels: colour AND a band pattern, so colour is never the only signal. */
const LABELS = [
  { key: 'files', name: 'Files', color: 'var(--lbl-files)', band: 'none' },
  { key: 'media', name: 'Media', color: 'var(--lbl-media)', band: 'repeating-linear-gradient(90deg, oklch(0.13 0.016 250 / 0.55) 0 2px, transparent 2px 4px)' },
  { key: 'projects', name: 'Projects', color: 'var(--lbl-projects)', band: 'radial-gradient(circle at 1px 1.5px, oklch(0.13 0.016 250 / 0.6) 0.9px, transparent 1px)' },
  { key: 'apps', name: 'Apps', color: 'var(--lbl-apps)', band: 'repeating-linear-gradient(45deg, oklch(0.13 0.016 250 / 0.5) 0 1.5px, transparent 1.5px 3.5px)' },
] as const;

const COLS = 12;
const ROWS = 5;
const SLOTS = COLS * ROWS;

/**
 * CH·01 — the rack elevation. Every slot on the shelving is 1/60th of the pool, so how
 * full the vault is can be counted rather than estimated off a curve. Boxes are laid in
 * by category, in the order of the key beside them.
 */
export default function Home() {
  const { user } = useSession();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apps, setApps] = useState<ServedApp[] | null>(null);

  const load = () => {
    api<Usage>('/usage').then(setUsage).catch(() => undefined);
    api<{ apps: ServedApp[] }>('/apps').then((r) => setApps(r.apps)).catch(() => setApps([]));
  };

  useEffect(() => {
    load();
    return connectEvents((type, data) => {
      if (type === 'usage') setUsage((u) => ({ ...(u as Usage), ...(data as Usage) }));
      if (type === 'apps-changed') load();
    });
  }, []);

  const greeting = greetingFor(user!.displayName);

  return (
    <>
      <div className="ch-head">
        <div className="titling">
          <span className="reg num">{CHAMBERS.overview.no} · {CHAMBERS.overview.title}</span>
          <h1>{greeting.title}</h1>
        </div>
      </div>

      <section aria-label="Rack occupancy" style={{ marginBottom: 34 }}>
        <div className="rack-wrap">
          <div>
            {usage ? (
              <>
                <div className="rack-reading">
                  <span className="rack-figure">{fmtBytes(usage.used)}</span>
                  <span className="rack-of">sealed of {fmtBytes(usage.quota)}</span>
                </div>
                <Rack usage={usage} />
                <p className="reg" style={{ marginTop: 12, letterSpacing: '0.1em' }}>
                  One slot = {fmtBytes(usage.quota / SLOTS)} · {fmtBytes(Math.max(0, usage.quota - usage.used))} still free
                </p>
              </>
            ) : (
              <>
                <div className="frosted" style={{ width: 300, height: 52, marginBottom: 16 }} />
                <div className="frosted" style={{ height: 210 }} />
              </>
            )}
          </div>

          <div className="panel sealed">
            <div className="panel-head"><span className="reg">Box labels</span></div>
            <div className="panel-body" style={{ paddingTop: 4, paddingBottom: 6 }}>
              <div className="key-list">
                {LABELS.map((l) => (
                  <div className="key-row" key={l.key}>
                    <span
                      className="key-swatch"
                      style={{ background: l.color, ['--slot-band' as string]: l.band }}
                    />
                    <span className="n">{l.name}</span>
                    <span className="q num">{usage ? fmtBytes(usage.breakdown[l.key] ?? 0) : '—'}</span>
                  </div>
                ))}
                <div className="key-row">
                  <span className="key-swatch" style={{ background: 'transparent', border: '1px solid var(--edge-bright)' }} />
                  <span className="n">Thaw shelf</span>
                  <span className="q num">{usage ? fmtBytes(usage.trashBytes) : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" aria-label="Issued to the open">
        <div className="panel-head">
          <span className="reg">{CHAMBERS.issue.no} · Issued to the open</span>
          <Link className="btn btn-quiet btn-sm" to="/launch"><IssueIcon size={14} /> Issue desk</Link>
        </div>
        <div className="panel-body">
          {apps === null ? (
            <div className="frosted" style={{ height: 76 }} />
          ) : apps.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <p style={{ margin: 0 }}>
                Nothing is out in the open. Everything you have is sealed in the chamber, readable only by you.
              </p>
              <Link className="btn btn-quiet btn-sm" to="/launch">Issue your first accession</Link>
            </div>
          ) : (
            <div className="plainlist">
              {apps.map((a) => (
                <div className="plainrow" key={a.id}>
                  <span className={`lamp ${a.visibility === 'public' ? 'live' : 'hold'}`} />
                  <div className="grow">
                    <div className="t">{a.name}</div>
                    <a className="s" href={a.urls[0]} target="_blank" rel="noreferrer">{a.urls[0]}</a>
                  </div>
                  <span className={`stamp ${a.visibility === 'public' ? 'issued' : 'held'}`}>
                    {a.visibility === 'public' ? <OpenWorldIcon size={12} /> : <ArchiveIcon size={12} />}
                    {a.visibility === 'public' ? 'Issued' : 'Held'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Lays the used bytes into slots, category by category, so each label's run of boxes is
 * contiguous and countable. A category smaller than one slot still gets a part-filled slot
 * rather than vanishing.
 */
function Rack({ usage }: { usage: Usage }) {
  const perSlot = usage.quota / SLOTS;
  const cells: { color: string; band: string; fill: number }[] = [];

  for (const l of LABELS) {
    let bytes = usage.breakdown[l.key] ?? 0;
    if (bytes <= 0) continue;
    while (bytes > 0 && cells.length < SLOTS) {
      const fill = Math.min(1, bytes / perSlot);
      cells.push({ color: l.color, band: l.band, fill });
      bytes -= perSlot;
    }
  }

  return (
    <div className="rack" role="img"
      aria-label={`Rack of ${SLOTS} slots, ${cells.length} holding boxes, ${SLOTS - cells.length} empty`}>
      {Array.from({ length: SLOTS }, (_, i) => {
        const cell = cells[i];
        if (!cell) return <span className="slot" key={i} />;
        const part = cell.fill < 0.92;
        return (
          <span
            key={i}
            className={`slot ${part ? 'part' : 'full'}`}
            style={{
              ['--slot-c' as string]: cell.color,
              ['--slot-band' as string]: cell.band,
              ['--fill' as string]: `${Math.max(14, cell.fill * 100)}%`,
            }}
          />
        );
      })}
    </div>
  );
}
