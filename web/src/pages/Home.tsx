import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, connectEvents, fmtAgo, fmtBytes, type ServedApp, type Usage } from '../api';
import { greetingFor } from '../greetings';
import { useClock, useSession } from '../state';
import { GENUS, SkyCover, Broadcast, type GenusKey } from '../icons';

/**
 * The station reading.
 *
 * Capacity is reported the way an observer reports sky: a station circle filled
 * to its okta, with the exact figure in tabular type beside it. That refuses the
 * big-number-and-progress-bar template and gives the number a real instrument.
 */

const ORDER: GenusKey[] = ['files', 'media', 'projects', 'apps'];
const TINT: Record<GenusKey, string> = {
  files: 'var(--g-files)',
  media: 'var(--g-media)',
  projects: 'var(--g-projects)',
  apps: 'var(--g-apps)',
};

const OKTA_WORD = [
  'clear', 'almost clear', 'a little cover', 'scattered', 'half covered',
  'more than half', 'mostly covered', 'nearly full', 'full',
];

export default function Home() {
  const { user } = useSession();
  const clock = useClock();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apps, setApps] = useState<ServedApp[] | null>(null);
  /** The one authored motion of the app: the circle fills to its true reading once. */
  const [settled, setSettled] = useState(false);

  const load = () => {
    api<Usage>('/usage').then(setUsage).catch(() => undefined);
    api<{ apps: ServedApp[] }>('/apps').then((r) => setApps(r.apps)).catch(() => undefined);
  };

  useEffect(() => {
    load();
    const t = setTimeout(() => setSettled(true), 90);
    const stop = connectEvents((type, data) => {
      if (type === 'usage') setUsage((u) => ({ ...(u as Usage), ...(data as Usage) }));
      if (type === 'apps-changed') load();
    });
    return () => { clearTimeout(t); stop(); };
  }, []);

  const greeting = greetingFor(user!.displayName);
  const fraction = usage ? Math.min(1, usage.used / Math.max(1, usage.quota)) : 0;
  const okta = Math.round(fraction * 8);
  const free = usage ? Math.max(0, usage.quota - usage.used) : 0;
  const liveTotal = usage
    ? Math.max(1, ORDER.reduce((s, k) => s + (usage.breakdown[k] ?? 0), 0))
    : 1;

  return (
    <>
      <header className="station-head">
        <div>
          <span className="caption">Station · {user!.displayName}</span>
          <h1>{greeting.title}</h1>
          <div className="sub">{greeting.sub}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="clock">{clock}</div>
          <span className="caption" style={{ color: 'oklch(0.84 0.03 235)' }}>
            Last sync {usage ? fmtAgo(usage.lastSync) : '—'}
          </span>
        </div>
      </header>

      <section className="reading" aria-label="Storage in use">
        <div className="skycover-figure">
          <SkyCover fraction={settled ? fraction : 0} size={78} />
          <span className="okta-read">{okta}/8</span>
        </div>
        <div className="reading-body">
          {usage ? (
            <>
              <div className="reading-figure">
                {fmtBytes(usage.used)} <span className="of">of {fmtBytes(usage.quota)}</span>
              </div>
              <p className="reading-note">
                {fmtBytes(free)} still free — {OKTA_WORD[okta]}.
                {usage.trashBytes > 0 && <> {fmtBytes(usage.trashBytes)} of that is waiting in the trash.</>}
                {okta >= 7 && <span className="over"> Running out of room.</span>}
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ width: 280, height: 46 }} />
          )}
        </div>
      </section>

      <section aria-label="What is stored">
        <div className="section-head" style={{ margin: '24px 34px 0', padding: '0 0 9px' }}>
          <h3>What's stored</h3>
          <span className="caption">Extent</span>
        </div>
        {ORDER.map((key, i) => {
          const g = GENUS[key];
          const Sym = g.symbol;
          const bytes = usage?.breakdown[key] ?? 0;
          return (
            <div className="specimen" key={key}>
              <span className="specimen-plate">{String(i + 1).padStart(2, '0')}</span>
              <span className="specimen-sym" style={{ color: TINT[key] }}><Sym size={22} /></span>
              <span>
                <span className="specimen-name">
                  {key[0].toUpperCase() + key.slice(1)}
                  <span className="abbr">{g.abbr}</span>
                </span>
                {' '}
                <span className="specimen-latin">{g.latin}</span>
              </span>
              <span className="specimen-extent">{usage ? fmtBytes(bytes) : '—'}</span>
              <span className="specimen-bar" aria-hidden>
                <i style={{ transform: `scaleX(${settled && usage ? bytes / liveTotal : 0})`, background: TINT[key] }} />
              </span>
            </div>
          );
        })}
      </section>

      <section className="section" aria-label="Apps being served">
        <div className="section-head">
          <h3 className="live-mark">
            {apps && apps.length > 0 && <span className="live-dot" />}
            On the air
          </h3>
          <span className="caption">{apps?.length ?? 0} serving</span>
        </div>
        {apps === null ? (
          <div className="skeleton" style={{ height: 64, marginTop: 12 }} />
        ) : apps.length === 0 ? (
          <div className="empty" style={{ padding: '26px 0 10px' }}>
            <Broadcast size={30} className="empty-sym" />
            <p>Nothing is on the air. Any folder here with an <code>index.html</code> can be given a real URL and served straight from this machine.</p>
            <Link to="/launch" className="btn btn-sm">Serve a folder</Link>
          </div>
        ) : (
          <div className="rows">
            {apps.map((a) => (
              <div className="row row-tight" key={a.id}>
                <div className="grow">
                  <div className="name static">{a.name}</div>
                  <a className="meta" href={a.urls[0]} target="_blank" rel="noreferrer">{a.urls[0]}</a>
                </div>
                <span className={`badge ${a.visibility}`}>{a.visibility}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The plate's footing: the shared pool, and the one thing worth acting on. */}
      <footer className="station-foot">
        <span>
          Pool <span className="measure">{usage ? `${fmtBytes(usage.poolUsed)} / ${fmtBytes(usage.poolTotal)}` : '—'}</span>
          {' '}across everyone on this machine
        </span>
        <span className="hint">
          Keep a copy of <code>data/keys/master.key</code> somewhere else — without it none of this can be read.
        </span>
      </footer>
    </>
  );
}
