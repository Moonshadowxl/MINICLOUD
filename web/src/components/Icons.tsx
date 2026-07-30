/**
 * The vault's drawn marks. One family, one stroke weight (1.6), 24-unit grid, square caps —
 * cut like stencils on a cold-store crate. No emoji anywhere in the interface.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Mark({ size = 17, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* --- chambers --- */
export const RackIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 4h18v16H3z" />
    <path d="M3 9.33h18M3 14.67h18M8.5 4v5.33M15.5 9.33v5.34M11 14.67V20" />
  </Mark>
);

export const RegisterIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 3h11l5 5v13H4z" />
    <path d="M14.5 3v6H20" />
    <path d="M7.5 12.5h9M7.5 16.5h6" />
  </Mark>
);

export const IssueIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 13v7h16v-7" />
    <path d="M12 16V3.5" />
    <path d="m7.5 8 4.5-4.5L16.5 8" />
  </Mark>
);

export const TermsIcon = (p: P) => (
  <Mark {...p}>
    <path d="M5 3h14v18H5z" />
    <path d="M8.5 7.5h7M8.5 11.5h7M8.5 15.5h4" />
  </Mark>
);

/* --- forms held in the register --- */
export const ShelfIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 6h6.5l2 2.5H21V19H3z" />
  </Mark>
);

export const ReelIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 4h18v16H3z" />
    <path d="M3 9h18M3 15h18M7.5 4v5M7.5 15v5M16.5 4v5M16.5 15v5" />
  </Mark>
);

export const ToneIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3" />
  </Mark>
);

export const PlateIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 5h18v14H3z" />
    <path d="M3 15.5 8.5 10l4.5 4.5 3-2.5L21 16" />
    <path d="M15.5 8.5h.01" />
  </Mark>
);

export const SourceIcon = (p: P) => (
  <Mark {...p}>
    <path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5" />
    <path d="m13.5 5-3 14" />
  </Mark>
);

export const PageIcon = (p: P) => (
  <Mark {...p}>
    <path d="M5 3h9l5 5v13H5z" />
    <path d="M13.5 3v6H19" />
  </Mark>
);

export const OpenWorldIcon = (p: P) => (
  <Mark {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </Mark>
);

/* --- actions --- */
export const WithdrawIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 15v5h16v-5" />
    <path d="M12 3.5V15" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
  </Mark>
);

export const DepositIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 15v5h16v-5" />
    <path d="M12 15.5V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
  </Mark>
);

export const RelabelIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 14.5 14.5 4l5.5 5.5L9.5 20H4z" />
    <path d="m12 6.5 5.5 5.5" />
  </Mark>
);

export const ThawIcon = (p: P) => (
  <Mark {...p}>
    <path d="M5 6.5h14" />
    <path d="M6.5 6.5 7.5 21h9l1-14.5" />
    <path d="M9.5 6.5V3.5h5v3" />
  </Mark>
);

export const RestoreIcon = (p: P) => (
  <Mark {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 3.5V9h5.5" />
  </Mark>
);

export const CopyIcon = (p: P) => (
  <Mark {...p}>
    <path d="M9 9h11v11H9z" />
    <path d="M15 5H4v11h4" />
  </Mark>
);

export const NewShelfIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 6h6.5l2 2.5H21V19H3z" />
    <path d="M12 11.5v4.5M9.75 13.75h4.5" />
  </Mark>
);

export const ArchiveIcon = (p: P) => (
  <Mark {...p}>
    <path d="M3 4h18v4H3zM4.5 8v12h15V8" />
    <path d="M9.5 12h5" />
  </Mark>
);

export const KeyIcon = (p: P) => (
  <Mark {...p}>
    <circle cx="7.5" cy="12" r="3.5" />
    <path d="M11 12h9.5M17 12v3.5M20.5 12v3" />
  </Mark>
);

export const SealIcon = (p: P) => (
  <Mark {...p}>
    <path d="M5 10.5h14V21H5z" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Mark>
);

export const BackIcon = (p: P) => (
  <Mark {...p}>
    <path d="M20 12H4.5" />
    <path d="m10 5.5-5.5 6.5 5.5 6.5" />
  </Mark>
);

export const UpIcon = (p: P) => (
  <Mark {...p}>
    <path d="M12 20V4.5" />
    <path d="m5.5 11 6.5-6.5 6.5 6.5" />
  </Mark>
);

export const CloseIcon = (p: P) => (
  <Mark {...p}>
    <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
  </Mark>
);

export const PlusIcon = (p: P) => (
  <Mark {...p}>
    <path d="M12 4.5v15M4.5 12h15" />
  </Mark>
);

export const AlarmIcon = (p: P) => (
  <Mark {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </Mark>
);

export const CheckIcon = (p: P) => (
  <Mark {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Mark>
);

/** The register mark for an entry, chosen from its mime and category. */
export function formMark(e: { isDir: boolean; mime: string; category: string; name: string }, size = 17) {
  if (e.isDir) return <ShelfIcon size={size} />;
  if (e.mime.startsWith('video/')) return <ReelIcon size={size} />;
  if (e.mime.startsWith('audio/')) return <ToneIcon size={size} />;
  if (e.mime.startsWith('image/')) return <PlateIcon size={size} />;
  if (e.mime === 'text/html') return <OpenWorldIcon size={size} />;
  if (e.category === 'projects') return <SourceIcon size={size} />;
  return <PageIcon size={size} />;
}
