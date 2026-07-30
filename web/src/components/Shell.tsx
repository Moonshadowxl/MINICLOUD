import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../state';
import CommandPalette, { usePalette } from './CommandPalette';

const I = {
  home: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>,
  files: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  launch: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l14 9-14 9z"/></svg>,
  settings: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
};

/** ⌘ on Apple hardware, Ctrl everywhere else. */
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);

export default function Shell() {
  const { user, signOut } = useSession();
  const [paletteOpen, openPalette, closePalette] = usePalette();
  if (!user) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="wordmark"><span className="mini">MINI</span>CLOUD</span>

        <button className="sidebar-search" onClick={openPalette}>
          {I.search}
          <span className="grow">Search</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'}K</kbd>
        </button>

        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>{I.home} Home</NavLink>
          <span className="nav-section">Storage</span>
          <NavLink to="/files">{I.files} Files</NavLink>
          <NavLink to="/launch">{I.launch} Launch</NavLink>
          <span className="nav-section">You</span>
          <NavLink to="/settings">{I.settings} Settings</NavLink>
        </nav>

        <div className="sidebar-bottom">
          <span className="avatar" style={{ background: user.color }}>{user.displayName[0]?.toUpperCase()}</span>
          <div className="sidebar-user">
            <div className="name">{user.displayName}</div>
            <button className="linkish" onClick={signOut}>Switch user</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}
