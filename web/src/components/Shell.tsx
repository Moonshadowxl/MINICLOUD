import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../state';
import CommandPalette, { usePalette } from './CommandPalette';
import { Broadcast, Instrument, Lens, Plate, Station } from '../icons';

/** ⌘ on Apple hardware, Ctrl everywhere else. */
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);

export default function Shell() {
  const { user, signOut } = useSession();
  const [paletteOpen, openPalette, closePalette] = usePalette();
  if (!user) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="wordmark"><span className="mini">Mini</span>Cloud</span>

        <button className="sidebar-search" onClick={openPalette} aria-label="Search files and code">
          <Lens size={15} />
          <span className="grow">Search</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'}K</kbd>
        </button>

        {/*
          The plate world lives in the visuals and the classification, never in the
          navigation. Someone looking for their files must read the word "Files";
          dressing the primary nav in atlas jargon would be expression obscuring
          the task, which is the one thing an Operate surface may not do.
        */}
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end><Station size={17} /> Home</NavLink>
          <span className="nav-section caption">Storage</span>
          <NavLink to="/files"><Plate size={17} /> Files</NavLink>
          <NavLink to="/launch"><Broadcast size={17} /> Launch</NavLink>
          <span className="nav-section caption">You</span>
          <NavLink to="/settings"><Instrument size={17} /> Settings</NavLink>
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
