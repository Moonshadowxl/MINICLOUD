import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildCtx, type Ctx } from '../src/app.js';
import { HL_OPEN } from '../src/search.js';

let ctx: Ctx;
let dir: string;
let userId: string;

const write = async (p: string, body: string | Buffer) => {
  const file = await ctx.storage.writeFile(userId, p, Buffer.isBuffer(body) ? body : Buffer.from(body));
  await ctx.search.indexFile(userId, file);
  return file;
};

const paths = (q: string) => ctx.search.search(userId, q).map((h) => h.path);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minicloud-search-'));
  ctx = buildCtx({ dataDir: dir });
  userId = ctx.auth.createUser({ username: 'tester', password: 'secret1', isOwner: true }).id;
});

afterEach(() => {
  ctx.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('search', () => {
  it('finds a file by name and by its contents', async () => {
    await write('src/Button.tsx', 'export function Button() { return handleClick(); }');
    await write('notes/todo.md', 'remember to fix handleClick');

    expect(paths('Button')).toContain('src/Button.tsx');
    expect(paths('handleClick').sort()).toEqual(['notes/todo.md', 'src/Button.tsx']);
    expect(paths('todo')).toEqual(['notes/todo.md']);
  });

  it('highlights the matched span in the snippet', async () => {
    await write('a.md', 'the quick brown fox jumps');
    const [hit] = ctx.search.search(userId, 'brown');
    expect(hit.snippet).toContain(`${HL_OPEN}brown`);
  });

  it('matches a prefix so results appear as you type', async () => {
    await write('src/invoices.ts', 'select * from invoices');
    expect(paths('invo')).toEqual(['src/invoices.ts']);
    expect(paths('inv')).toEqual(['src/invoices.ts']);
  });

  it('ranks an exact name match above an incidental mention', async () => {
    await write('deploy.sh', 'echo shipping');
    await write('notes.md', 'we should deploy on friday, then deploy again');
    expect(paths('deploy')[0]).toBe('deploy.sh');
  });

  it('survives input that is not valid FTS5 syntax', async () => {
    await write('a.md', 'hello');
    for (const q of ['', '   ', 'a AND', 'foo(', '"unclosed', '*', 'NEAR/', '^', 'x'.repeat(500)]) {
      expect(() => ctx.search.search(userId, q)).not.toThrow();
    }
  });

  it('indexes names but not contents of binary files', async () => {
    await write('photo.png', crypto.randomBytes(400));
    expect(paths('photo')).toEqual(['photo.png']);
    expect(ctx.search.search(userId, 'photo')[0].snippet).toBeNull();
  });

  it('skips files too large to be worth indexing, but still finds them by name', async () => {
    await write('huge.log', 'x '.repeat(400_000) + 'needle');
    expect(paths('huge')).toEqual(['huge.log']);
    expect(paths('needle')).toEqual([]);
  });

  it('never leaks another user’s files', async () => {
    const other = ctx.auth.createUser({ username: 'other', password: 'secret1' });
    const theirs = await ctx.storage.writeFile(other.id, 'private/salary.md', Buffer.from('confidential figure'));
    await ctx.search.indexFile(other.id, theirs);

    expect(paths('confidential')).toEqual([]);
    expect(paths('salary')).toEqual([]);
    expect(ctx.search.search(other.id, 'confidential')).toHaveLength(1);
  });

  it('follows a rename', async () => {
    const f = await write('old-name.ts', 'const marker = 1;');
    ctx.storage.move(userId, 'old-name.ts', 'new-name.ts');
    ctx.search.reindexPaths(userId, [ctx.storage.byId(userId, f.id)]);

    expect(paths('marker')).toEqual(['new-name.ts']);
    expect(paths('new-name')).toEqual(['new-name.ts']);
  });

  it('drops a whole subtree when a folder is trashed', async () => {
    await write('proj/src/a.ts', 'alpha token');
    await write('proj/src/b.ts', 'beta token');
    await write('keep/c.ts', 'gamma token');
    const folder = ctx.storage.stat(userId, 'proj')!;

    ctx.storage.trash(userId, 'proj');
    ctx.search.removeSubtree(userId, folder);

    expect(paths('token')).toEqual(['keep/c.ts']);
  });

  it('reindexes everything on demand', async () => {
    await ctx.storage.writeFile(userId, 'unindexed.md', Buffer.from('hidden treasure'));
    expect(paths('treasure')).toEqual([]); // written behind the index's back

    const n = await ctx.search.rebuild(userId);

    expect(n).toBeGreaterThan(0);
    expect(paths('treasure')).toEqual(['unindexed.md']);
  });

  it('reflects the newest contents after an overwrite', async () => {
    await write('notes.md', 'first draft about penguins');
    await write('notes.md', 'second draft about walruses');

    expect(paths('walruses')).toEqual(['notes.md']);
    expect(paths('penguins')).toEqual([]);
  });
});
