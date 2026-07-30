import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, connectEvents, fmtAgo, fmtBytes, type Usage } from '../api';
import { CHAMBERS } from '../accession';
import { useClock, useSession } from '../state';
import { IssueIcon, RackIcon, RegisterIcon, TermsIcon } from './Icons';

const AISLE = [
  { to: '/', end: true, icon: <RackIcon />, ...CHAMBERS.overview },
  { to: '/files', end: false, icon: <RegisterIcon />, ...CHAMBERS.register },
  { to: '/launch', end: false, icon: <IssueIcon />, ...CHAMBERS.issue },
  { to: '/settings', end: false, icon: <TermsIcon />, ...CHAMBERS.terms },
];

/**
 * The chamber: a narrow aisle down the left, a cold-room condition band across the top of
 * the working area, the work itself below. The band is the instrument you glance at — it
 * carries live capacity, the last deposit, and how many accessions are out in the open.
 */
export default function Shell() {
  const { user, signOut } = useSession();
  const clock = useClock();
  const location = useLocation();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [issued, setIssued] = useState<number | null>(null);

  useEffect(() => {
    const load = () => {
      api<Usage>('/usage').then(setUsage).catch(() => undefined);
      api<{ apps: { id: string }[] }>('/apps').then((r) => setIssued(r.apps.length)).catch(() => undefined);
    };
    load();
    return connectEvents((type, data) => {
      if (type === 'usage') setUsage((u) => ({ ...(u as Usage), ...(data as Usage) }));
      if (type === 'apps-changed') load();
    });
  }, []);

  if (!user) return null;

  const pct = usage ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const state = pct > 92 ? 'alarm' : pct > 75 ? 'warn' : 'hold';

  return (
    <div className="vault">
      <aside className="aisle">
        <span className="mark">
          <span className="bolt" />
          <span className="word">Mini<span className="dim">cloud</span></span>
        </span>
        <nav className="chambers" aria-label="Chambers">
          {AISLE.map((c) => (
            <NavLink key={c.to} to={c.to} end={c.end}>
              {c.icon}
              <span className="ch-name">{c.name}</span>
              <span className="ch-no num">{c.no}</span>
            </NavLink>
          ))}
        </nav>
        <div className="aisle-foot">
          <div className="depositor">
            <span className="dep-chip" style={{ background: user.color }}>
              {user.displayName[0]?.toUpperCase()}
            </span>
            <div className="dep-who">
              <div className="n">{user.displayName}</div>
              <button onClick={signOut}>Seal &amp; leave</button>
            </div>
          </div>
        </div>
      </aside>

      <div className="chamber">
        <div className="conditions" role="status" aria-label="Chamber conditions">
          <Cond label="Chamber">
            <span className={`lamp ${state}`} />
            {usage ? `${Math.round(pct)}% full` : '—'}
          </Cond>
          <Cond label="Sealed">{usage ? fmtBytes(usage.used) : '—'}</Cond>
          <Cond label="Free">{usage ? fmtBytes(Math.max(0, usage.quota - usage.used)) : '—'}</Cond>
          <Cond label="Last deposit">{usage ? fmtAgo(usage.lastSync) : '—'}</Cond>
          <Cond label="Issued">
            <span className={`lamp${issued ? ' live' : ''}`} />
            {issued === null ? '—' : issued}
          </Cond>
          <Cond label="Local time" push>{clock}</Cond>
        </div>

        <main className="work">
          {/* the chamber opens: contents clear from frost, once per chamber change */}
          <div className="opens" key={location.pathname.split('/')[1] || 'root'}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Cond({ label, children, push }: { label: string; children: ReactNode; push?: boolean }) {
  return (
    <div className={`cond${push ? ' push' : ''}`}>
      <span className="reg reg-sm">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}
