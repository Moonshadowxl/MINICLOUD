import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, connectEvents, fmtAgo, fmtBytes, type ServedApp, type Usage } from '../api';
import { greetingFor } from '../greetings';
import { useClock, useSession } from '../state';

const CATS = [
  { key: 'files', name: 'Files', color: 'var(--cat-files)' },
  { key: 'media', name: 'Media', color: 'var(--cat-media)' },
  { key: 'projects', name: 'Projects', color: 'var(--cat-projects)' },
  { key: 'apps', name: 'Apps', color: 'var(--cat-apps)' },
] as const;

export default function Home() {
  const { user } = useSession();
  const clock = useClock();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apps, setApps] = useState<ServedApp[] | null>(null);

  const load = () => {
    api<Usage>('/usage').then(setUsage).catch(() => undefined);
    api<{ apps: ServedApp[] }>('/apps').then((r) => setApps(r.apps)).catch(() => undefined);
  };

  useEffect(() => {
    load();
    return connectEvents((type, data) => {
      if (type === 'usage') setUsage((u) => ({ ...(u as Usage), ...(data as Usage) }));
      if (type === 'apps-changed') load();
    });
  }, []);

  const pct = usage ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const meterState = pct > 92 ? 'danger' : pct > 75 ? 'warn' : '';
  // The breakdown covers live files only, so scale the bar to that — not to `used`,
  // which also counts trash and would leave an unexplained gap on the right.
  const breakdownTotal = usage ? Math.max(1, CATS.reduce((s, c) => s + (usage.breakdown[c.key] ?? 0), 0)) : 1;

  return (
    <>
      <div className="main-head">
        <div>
          <h1>{greetingFor(user!.displayName).title}</h1>
          <div style={{ color: 'var(--ink-faint)', marginTop: 4 }}>
            Last sync: {usage ? fmtAgo(usage.lastSync) : '…'}
          </div>
        </div>
        <span className="clock">{clock}</span>
      </div>

      <section className="usage-hero" aria-label="Storage used">
        <span className="label">Storage</span>
        {usage ? (
          <>
            <div className="usage-figure">
              {fmtBytes(usage.used)} <span className="of">/ {fmtBytes(usage.quota)}</span>
            </div>
            <div className={`meter ${meterState}`}>
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="usage-sub">
              {fmtBytes(Math.max(0, usage.quota - usage.used))} free
              {usage.trashBytes > 0 && <> · {fmtBytes(usage.trashBytes)} in trash</>}
            </span>
          </>
        ) : (
          <div className="skeleton" style={{ width: 280, height: 58 }} />
        )}
      </section>

      <div className="panel-grid">
        <section className="panel breakdown" aria-label="Storage breakdown">
          <h3>Breakdown</h3>
          {usage ? (
            <>
              <div className="stackbar">
                {CATS.filter((c) => (usage.breakdown[c.key] ?? 0) > 0).map((c) => (
                  <div
                    key={c.key}
                    style={{ width: `${((usage.breakdown[c.key] ?? 0) / breakdownTotal) * 100}%`, background: c.color }}
                  />
                ))}
              </div>
              <ul className="legend">
                {CATS.map((c) => (
                  <li key={c.key}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span className="name">{c.name}</span>
                    <span className="val">{fmtBytes(usage.breakdown[c.key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="skeleton" style={{ height: 120 }} />
          )}
        </section>

        <section className="panel" aria-label="Live apps">
          <h3><span className="live-dot" /> Live</h3>
          {apps === null ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : apps.length === 0 ? (
            <div className="soft">
              <p style={{ margin: '4px 0 10px' }}>Nothing is being served yet.</p>
              <Link to="/launch" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                Serve your first app
              </Link>
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
      </div>
    </>
  );
}
