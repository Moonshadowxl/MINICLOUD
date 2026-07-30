/**
 * Accession codes. Everything sealed in the vault carries one: a category prefix and a
 * stable four-figure number derived from the record's id, so the same file always reads
 * the same code on every device without the server having to store one.
 */

const PREFIX: Record<string, string> = {
  files: 'FIL',
  media: 'MED',
  projects: 'PRJ',
  apps: 'APP',
};

/** FNV-1a — small, stable, and good enough to spread ids across four figures. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** e.g. "PRJ·0412" */
export function accession(id: string, category = 'files'): string {
  const prefix = PREFIX[category] ?? 'FIL';
  return `${prefix}·${String(hash(id) % 10000).padStart(4, '0')}`;
}

/** A depositor's own prefix, shown on their plate: "MC·MOON". */
export function depositorCode(username: string): string {
  return `MC·${username.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'GUEST'}`;
}

/** Chamber labels, used by the aisle and by each chamber's own heading. */
export const CHAMBERS = {
  overview: { no: 'CH·01', name: 'Overview', title: 'The rack' },
  register: { no: 'CH·02', name: 'Register', title: 'The register' },
  issue: { no: 'CH·03', name: 'Issue', title: 'Issued to the open' },
  terms: { no: 'CH·04', name: 'Terms', title: 'Deposit agreement' },
} as const;
