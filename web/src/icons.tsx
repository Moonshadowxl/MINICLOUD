/**
 * The plate's notation.
 *
 * Everything drawn here follows one grammar: a 24-unit field, 1.25 hairline
 * stroke, square-ish joins, no filled shapes except where a fill carries
 * meaning (sky cover, live state). Meteorological charts have had a working
 * symbol set for 150 years; the file types borrow its restraint rather than
 * inventing rounded pictograms.
 */

interface GlyphProps {
  size?: number;
  className?: string;
}

const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

// ---------- cloud genera: the four storage categories ----------

/** Cirrus — fine, fibrous, high. The many fine strands of a codebase. */
export const Cirrus = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M3 13c3.6-.4 6-1.6 7.4-3.2C11.8 8.2 13.3 7 15.4 7c1.9 0 3.1 1 3.1 2.3 0 1-.7 1.7-1.7 1.7" />
    <path d="M5 17c3.2-.3 5.6-1.2 7.2-2.5" />
  </svg>
);

/** Cumulus — piled, bright, detached. Photos and video. */
export const Cumulus = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M4 16.5h16" />
    <path d="M5.5 16.5a3.4 3.4 0 0 1 1.1-5.3 4.6 4.6 0 0 1 8.9-1.4 3.6 3.6 0 0 1 3 6.7" />
  </svg>
);

/** Stratus — a flat, even layer. The everyday sheet of ordinary files. */
export const Stratus = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M3.5 9.5h13.5" />
    <path d="M5.5 13h15" />
    <path d="M3.5 16.5h11" />
  </svg>
);

/** Cumulonimbus — the one actually producing weather. Apps that are serving. */
export const Cumulonimbus = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M4 8.5h16" />
    <path d="M6.5 8.5a4 4 0 0 1 4-4.2 4.2 4.2 0 0 1 4.2 4.2" />
    <path d="M8 12.5h8" />
    <path d="M9.5 16.2 8.4 19M14.5 16.2 13.4 19M12 16.2 10.9 19" />
  </svg>
);

export const GENUS = {
  files: { symbol: Stratus, abbr: 'St', latin: 'Stratus' },
  media: { symbol: Cumulus, abbr: 'Cu', latin: 'Cumulus' },
  projects: { symbol: Cirrus, abbr: 'Ci', latin: 'Cirrus' },
  apps: { symbol: Cumulonimbus, abbr: 'Cb', latin: 'Cumulonimbus' },
} as const;

export type GenusKey = keyof typeof GENUS;

// ---------- sky cover: the capacity reading ----------

/**
 * The WMO station circle, filled to its okta (eighths of sky covered).
 * A meter that reads like an instrument instead of a progress bar: the
 * fraction is legible at a glance and exact underneath.
 */
export function SkyCover({ fraction, size = 64 }: { fraction: number; size?: number }) {
  const okta = Math.max(0, Math.min(8, Math.round(fraction * 8)));
  /** Something is stored, but less than an eighth — a trace, not nothing. */
  const trace = okta === 0 && fraction > 0;
  const r = 10;
  const c = 12;

  // Sectors are drawn clockwise from twelve o'clock, the way an observer fills them.
  const wedge = (eighths: number) => {
    if (eighths <= 0) return null;
    if (eighths >= 8) return <circle cx={c} cy={c} r={r} fill="currentColor" stroke="none" />;
    const angle = (eighths / 8) * 2 * Math.PI;
    const x = c + r * Math.sin(angle);
    const y = c - r * Math.cos(angle);
    const large = eighths > 4 ? 1 : 0;
    return <path d={`M${c} ${c} L${c} ${c - r} A${r} ${r} 0 ${large} 1 ${x} ${y} Z`} fill="currentColor" stroke="none" />;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="skycover" role="img"
      aria-label={trace ? 'Sky cover under one okta' : `Sky cover ${okta} oktas of 8`}>
      {/* Graticule: eighth marks around the rim, so an empty circle still reads
          as a calibrated instrument rather than an unfinished ring. */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * 2 * Math.PI;
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        return (
          <path
            key={i}
            d={`M${c + (r - 2.4) * sin} ${c - (r - 2.4) * cos} L${c + r * sin} ${c - r * cos}`}
            stroke="currentColor" strokeWidth={0.7} opacity={0.42}
          />
        );
      })}
      {wedge(okta)}
      {trace && <path d={`M${c} ${c - r} V${c - r * 0.42}`} stroke="currentColor" strokeWidth={1.6} />}
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={1.4} />
      {/* the observer's meridian, kept visible through the fill */}
      <path d={`M${c} ${c - r} V${c + r}`} stroke="var(--paper-lit)" strokeWidth={okta > 0 ? 0.9 : 0} opacity={0.5} />
    </svg>
  );
}

// ---------- file notation ----------

export const Folder = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M3 6.5h6l1.6 2.2H21V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const Document = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
    <path d="M14 3.5V7.5h4" />
    <path d="M8.5 12.5h7M8.5 15.5h7" />
  </svg>
);

export const Picture = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <rect x="3.5" y="5.5" width="17" height="13" />
    <path d="M3.5 15l4.5-4 4 3.5 3.5-3 5 4.5" />
    <circle cx="8.6" cy="9.6" r="1.3" />
  </svg>
);

export const Motion = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <rect x="3.5" y="5.5" width="17" height="13" />
    <path d="M3.5 9h17M3.5 15h17" />
    <path d="M10 10.8l3.6 2.2-3.6 2.2z" />
  </svg>
);

export const Sound = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M5 14.5v-5h3l4-3.5v12l-4-3.5z" />
    <path d="M15.5 9.5a4 4 0 0 1 0 5M18 7.5a7 7 0 0 1 0 9" />
  </svg>
);

export const Code = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M9 8.5 4.5 12 9 15.5M15 8.5 19.5 12 15 15.5" />
    <path d="M13 5.5l-2 13" />
  </svg>
);

export const Archive = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <rect x="3.5" y="4.5" width="17" height="4" />
    <path d="M5 8.5V19a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V8.5" />
    <path d="M10 12.5h4" />
  </svg>
);

// ---------- interface notation ----------

export const Station = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" />
    <path d="M4.4 4.4a10.7 10.7 0 0 0 0 15.2M19.6 4.4a10.7 10.7 0 0 1 0 15.2" />
  </svg>
);

export const Plate = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <rect x="3.5" y="4.5" width="17" height="15" />
    <path d="M3.5 16h17M6.5 4.5v11.5" />
  </svg>
);

export const Broadcast = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M12 13.5 8 20.5h8z" />
    <circle cx="12" cy="10" r="1.6" />
    <path d="M8.8 6.8a4.5 4.5 0 0 0 0 6.4M15.2 6.8a4.5 4.5 0 0 1 0 6.4" />
    <path d="M6.2 4.2a8.2 8.2 0 0 0 0 11.6M17.8 4.2a8.2 8.2 0 0 1 0 11.6" />
  </svg>
);

export const Instrument = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 12 15.5 8.5" />
    <path d="M12 3.5v2M20.5 12h-2M12 20.5v-2M3.5 12h2" />
  </svg>
);

export const Lens = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.4 15.4 20 20" />
  </svg>
);

export const Rule = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M4 12h16" />
    <path d="M8 9.5v5M12 8.5v7M16 9.5v5" />
  </svg>
);

export const Down = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M12 4.5v13" />
    <path d="M7 12.5 12 17.5 17 12.5" />
    <path d="M5 20h14" />
  </svg>
);

export const Cross = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Check = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

export const Back = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M11 6.5 5.5 12 11 17.5" />
    <path d="M5.5 12H19" />
  </svg>
);

export const Plus = ({ size = 20, className }: GlyphProps) => (
  <svg {...svg(size, className)}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

/** Which notation a stored entry gets. */
export function glyphFor(entry: { isDir: boolean; mime: string; category?: string }) {
  if (entry.isDir) return Folder;
  if (entry.mime.startsWith('video/')) return Motion;
  if (entry.mime.startsWith('audio/')) return Sound;
  if (entry.mime.startsWith('image/')) return Picture;
  if (entry.mime === 'application/zip') return Archive;
  if (/^(text\/(javascript|css|html)|application\/(json|xml))/.test(entry.mime)) return Code;
  if (entry.category === 'projects') return Code;
  return Document;
}
