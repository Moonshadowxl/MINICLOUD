import type { DB } from './db.js';
import type { Storage, FileRow } from './storage.js';
import { extOf, likeLiteral } from './storage.js';

/**
 * Search over everything you have stored.
 *
 * MiniCloud is sold on "drop a whole repo in" — which is only useful if you can
 * find a file again afterwards. This indexes every path, and the *contents* of
 * anything that is plausibly text, into SQLite FTS5. Ranking is bm25 with the
 * path column weighted higher than the body, so `Button.tsx` beats a file that
 * merely mentions buttons.
 *
 * Indexing is incremental (one file at a time, on write/move/delete) and always
 * best-effort: a failure to index must never fail the upload that triggered it.
 */

/** Extensions we read and index the contents of. Everything else is name-only. */
const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'map',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'php', 'pl', 'lua', 'r', 'jl', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat',
  'sql', 'graphql', 'proto', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'xml', 'svg', 'gitignore', 'miniignore', 'dockerfile', 'lock', 'tf', 'tex',
]);

/** Files with no extension that are still worth reading. */
const TEXT_NAMES = new Set([
  'readme', 'license', 'licence', 'changelog', 'makefile', 'dockerfile',
  'procfile', 'gemfile', 'rakefile', 'notice', 'authors', 'todo',
]);

/** Big enough for real source files, small enough that a stray 2GB .log can't hurt. */
const MAX_INDEXED_BYTES = 512 * 1024;

/**
 * Sentinel markers wrapped around each match by snippet(). The client escapes the
 * snippet as text first and only then swaps these for <mark>, so file contents can
 * never inject markup into the results list.
 */
export const HL_OPEN = '\u0002';
export const HL_CLOSE = '\u0003';

export interface SearchHit {
  fileId: string;
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  mime: string;
  mtime: number | null;
  /** Highlighted excerpt from the body, or null for a name-only match. */
  snippet: string | null;
}

export function indexesContentOf(f: FileRow): boolean {
  if (f.is_dir || f.size === 0 || f.size > MAX_INDEXED_BYTES) return false;
  const ext = extOf(f.path);
  if (ext) return TEXT_EXT.has(ext);
  return TEXT_NAMES.has(f.name.toLowerCase().replace(/^\./, ''));
}

/** A buffer is treated as text if it has no NUL bytes and decodes as valid UTF-8. */
function asText(buf: Buffer): string | null {
  if (buf.includes(0)) return null;
  const text = buf.toString('utf8');
  return text.includes('�') ? null : text;
}

export class SearchIndex {
  constructor(
    private db: DB,
    private storage: Storage,
  ) {}

  private remove(fileId: string): void {
    this.db.prepare('DELETE FROM search WHERE file_id = ?').run(fileId);
  }

  /** Index (or re-index) one file. Never throws — search is an add-on, not a gate. */
  async indexFile(userId: string, file: FileRow): Promise<void> {
    try {
      this.remove(file.id);
      if (file.deleted_at !== null) return;
      let body = '';
      if (indexesContentOf(file)) {
        body = asText(await this.storage.readWhole(userId, file)) ?? '';
      }
      this.db
        .prepare('INSERT INTO search (file_id, user_id, path, body) VALUES (?, ?, ?, ?)')
        .run(file.id, userId, file.path, body);
    } catch {
      // unreadable or mid-delete: leave it out of the index rather than fail the request
    }
  }

  /** Drop a file and, if it is a folder, everything beneath it. */
  removeSubtree(userId: string, file: FileRow): void {
    this.remove(file.id);
    if (!file.is_dir) return;
    this.db
      .prepare(`DELETE FROM search WHERE user_id = ? AND path LIKE ? ESCAPE '\\'`)
      .run(userId, `${likeLiteral(file.path)}/%`);
  }

  /** Paths move; the index has to move with them. */
  reindexPaths(userId: string, files: FileRow[]): void {
    const upd = this.db.prepare('UPDATE search SET path = ? WHERE file_id = ?');
    for (const f of files) upd.run(f.path, f.id);
  }

  /**
   * Rebuild from scratch. Used on first boot after upgrading (the index starts
   * empty, so without this nothing you already uploaded would be findable) and
   * from Settings when someone wants to force it.
   */
  async rebuild(userId: string): Promise<number> {
    this.db.prepare('DELETE FROM search WHERE user_id = ?').run(userId);
    const files = this.db
      .prepare('SELECT * FROM files WHERE user_id = ? AND deleted_at IS NULL')
      .all(userId) as unknown as FileRow[];
    for (const f of files) await this.indexFile(userId, f);
    return files.length;
  }

  isEmptyFor(userId: string): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM search WHERE user_id = ?').get(userId) as { n: number };
    return row.n === 0;
  }

  /**
   * Turn whatever someone typed into a valid FTS5 query. Users type `foo.tsx`,
   * `handle(` or `a AND` — all of which are syntax errors to FTS5 — so every term
   * is quoted, and the last one gets a prefix `*` for as-you-type results.
   */
  private static toMatchQuery(raw: string): string | null {
    const terms = raw.toLowerCase().match(/[\p{L}\p{N}_]+/gu);
    if (!terms || terms.length === 0) return null;
    return terms
      .slice(0, 12)
      .map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`))
      .join(' AND ');
  }

  search(userId: string, query: string, limit = 30): SearchHit[] {
    const match = SearchIndex.toMatchQuery(query);
    if (!match) return [];
    const namePrefix = `${likeLiteral(query.trim())}%`;
    const rows = this.db
      .prepare(
        `SELECT s.file_id, f.path, f.name, f.is_dir, f.size, f.mime, f.mtime,
                snippet(search, 3, ?, ?, '\u2026', 12) AS snip
           FROM search s
           JOIN files f ON f.id = s.file_id
          WHERE search MATCH ? AND s.user_id = ? AND f.deleted_at IS NULL
          ORDER BY (CASE WHEN f.name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END),
                   bm25(search, 0.0, 0.0, 4.0, 1.0)
          LIMIT ?`,
      )
      .all(HL_OPEN, HL_CLOSE, match, userId, namePrefix, limit) as {
      file_id: string; path: string; name: string; is_dir: number;
      size: number; mime: string; mtime: number | null; snip: string;
    }[];

    return rows.map((r) => ({
      fileId: r.file_id,
      path: r.path,
      name: r.name,
      isDir: !!r.is_dir,
      size: r.size,
      mime: r.mime,
      mtime: r.mtime,
      // Name-only matches have an empty body, so snippet() has nothing to show.
      snippet: r.snip.includes(HL_OPEN) ? r.snip : null,
    }));
  }
}
