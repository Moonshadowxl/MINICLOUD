import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, connectEvents, fmtBytes, type ServedApp, type Usage } from '../api';
import { CHAMBERS } from '../accession';
import { greetingFor } from '../greetings';
import { useSession } from '../state';
import { ArchiveIcon, IssueIcon, OpenWorldIcon } from '../components/Icons';

/** Box labels: colour AND a band pattern, so colour is never the only signal. */
const LABELS = [
  { key: 'files', name: 'Files', shelf: '', color: 'var(--lbl-files)', band: 'none' },
  { key: 'media', name: 'Media', shelf: 'media', color: 'var(--lbl-media)', band: 'repeating-linear-gradient(90deg, oklch(0.13 0.016 250 / 0.55) 0 2px, transparent 2px 4px)' },
  { key: 'projects', name: 'Projects', shelf: 'projects', color: 'var(--lbl-projects)', band: 'radial-gradient(circle at 1px 1.5px, oklch(0.13 0.016 250 / 0.6) 0.9px, transparent 1px)' },
  { key: 'apps', name: 'Apps', shelf: 'apps', color: 'var(--lbl-apps)', band: 'repeating-linear-gradient(45deg, oklch(0.13 0.016 250 / 0.5) 0 1.5px, transparent 1.5px 3.5px)' },
] as const;

const COLS = 12;
const ROWS = 5;
const SLOTS = COLS * ROWS;

/**
 * CH·01 — the rack elevation. Every slot on the shelving is 1/60th of the pool, so how
 * full the vault is can be counted rather than estimated off a curve. Each run of crates
 * is also the way into the shelf it stands for, so the reading is the navigation.
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
  const total = usage ? Math.max(1, LABELS.reduce((n, l) => n + (usage.breakdown[l.key] ?? 0), 0)) : 1;

  return (
    <>
      <div className="ch-head">
        <div className="titling">
          <span className="reg num">{CHAMBERS.overview.no} · {CHAMBERS.overview.title}</span>
          <h1>{greeting.title}</h1>
        </div>
      </div>

      {/* The rack is the reading AND the way in: each run of crates is the shelf it stands
          for, and the condition band above already carries the totals, so nothing is
          restated here. */}
      <section aria-label="Rack occupancy" style={{ marginBottom: 34 }}>
        {usage ? (
          <>
            <Rack usage={usage} />
            <div className="rack-key">
              {LABELS.map((l) => {
                const bytes = usage.breakdown[l.key] ?? 0;
                return (
                  <Link className="run" to={`/files/${l.shelf}`} key={l.key}>
                    <span className="run-swatch" style={{ background: l.color, ['--slot-band' as string]: l.band }} />
                    <span className="run-name">{l.name}</span>
                    <span className="run-q num">{fmtBytes(bytes)}</span>
                    <span className="run-share num">{Math.round((bytes / total) * 100)}%</span>
                  </Link>
                );
              })}
            </div>
            <p className="reg" style={{ marginTop: 14, letterSpacing: '0.1em' }}>
              One crate = {fmtBytes(usage.quota / SLOTS)}
            </p>
          </>
        ) : (
          <div className="frosted" style={{ height: 300 }} />
        )}
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
