import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, fmtBytes, uploadFiles, type Entry, type UploadProgress } from '../api';
import { CHAMBERS, accession } from '../accession';
import { useToast } from '../state';
import Viewer from '../components/Viewer';
import {
  ArchiveIcon, DepositIcon, NewShelfIcon, RelabelIcon, ShelfIcon, ThawIcon, WithdrawIcon,
  formMark,
} from '../components/Icons';

const when = (t: number | null, created: number) => {
  const d = new Date(t ?? created);
  return `${d.getFullYear()}·${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * CH·02 — the register. Every accession on this shelf, ruled and dense: its code, what it
 * is, its form, its mass, and when it was deposited. The whole chamber is the hatch —
 * drop anywhere, including a whole repo.
 */
export default function Files() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = decodeURIComponent(location.pathname.replace(/^\/files\/?/, '')).replace(/\/+$/, '');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [dragOver, setDragOver] = useState(0);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ entries: Entry[] }>(`/files?path=${encodeURIComponent(path)}`)
      .then((r) => setEntries(r.entries))
      .catch((e) => { toast((e as Error).message, true); setEntries([]); });
  }, [path, toast]);

  useEffect(() => { setEntries(null); load(); }, [load]);

  const go = (p: string) => navigate(`/files/${p.split('/').map(encodeURIComponent).join('/')}`);

  const doUpload = async (items: { file: File; relPath: string }[], category?: string) => {
    if (items.length === 0) return;
    try {
      await uploadFiles(items, path, {
        category,
        onProgress: (p) => setUploads(p.filter((x) => x.done < x.total)),
      });
      setUploads([]);
      toast(items.length === 1 ? `Sealed ${items[0].relPath}` : `Sealed ${items.length} accessions`);
      load();
    } catch (e) {
      setUploads([]);
      toast(`Deposit failed — ${(e as Error).message}`, true);
    }
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    doUpload(Array.from(list).map((f) => ({ file: f, relPath: f.name })));
  };

  const onPickFolder = (list: FileList | null) => {
    if (!list) return;
    const items = Array.from(list).map((f) => ({
      file: f,
      relPath: (f.webkitRelativePath || f.name).replaceAll('\\', '/'),
    }));
    // whole folder drop = a project (codebase) deposit
    doUpload(items, 'projects');
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(0);
    const dropped = Array.from(e.dataTransfer.items)
      .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
      .filter(Boolean) as FileSystemEntry[];
    if (dropped.length === 0) return onPickFiles(e.dataTransfer.files);
    const collected: { file: File; relPath: string }[] = [];
    let hasDir = false;
    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
        collected.push({ file, relPath: prefix + entry.name });
      } else if (entry.isDirectory) {
        hasDir = true;
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readAll = async (): Promise<FileSystemEntry[]> => {
          const out: FileSystemEntry[] = [];
          for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
            if (batch.length === 0) return out;
            out.push(...batch);
          }
        };
        for (const child of await readAll()) await walk(child, `${prefix}${entry.name}/`);
      }
    };
    for (const entry of dropped) await walk(entry, '');
    doUpload(collected, hasDir ? 'projects' : undefined);
  };

  const thaw = async (entry: Entry) => {
    await api(`/files/${entry.id}`, { method: 'DELETE' });
    toast(`${entry.name} moved to the thaw shelf`);
    load();
  };

  const relabel = async (entry: Entry) => {
    const name = prompt('New label', entry.name);
    if (!name || name === entry.name) return;
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    try {
      await api('/files/move', {
        method: 'POST',
        body: JSON.stringify({ from: entry.path, to: parent ? `${parent}/${name}` : name }),
      });
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const newShelf = async () => {
    const name = prompt('Name the shelf');
    if (!name) return;
    try {
      await api('/files/mkdir', { method: 'POST', body: JSON.stringify({ path: path ? `${path}/${name}` : name }) });
      load();
    } catch (e) { toast((e as Error).message, true); }
  };

  const crumbs = path ? path.split('/') : [];

  return (
    <div
      className={`hatch${dragOver > 0 ? ' open' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); setDragOver((d) => d + 1); }}
      onDragLeave={() => setDragOver((d) => Math.max(0, d - 1))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="ch-head">
        <div className="titling">
          <span className="reg num">{CHAMBERS.register.no} · {CHAMBERS.register.title}</span>
          <nav className="location" aria-label="Shelf location">
            <button onClick={() => go('')}>Rack A</button>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <span className="sep">/</span>
                <button onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>{c}</button>
              </span>
            ))}
          </nav>
        </div>
        <div className="acts">
          <button className="btn btn-quiet btn-sm" onClick={newShelf}>
            <NewShelfIcon size={14} /> New shelf
          </button>
          <button className="btn btn-quiet btn-sm" onClick={() => folderInput.current?.click()}>
            <ArchiveIcon size={14} /> Deposit a folder
          </button>
          <button className="btn btn-portal btn-sm" onClick={() => fileInput.current?.click()}>
            <DepositIcon size={14} /> Deposit files
          </button>
        </div>
      </div>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }} />
      {/* @ts-expect-error webkitdirectory is non-standard but universal */}
      <input ref={folderInput} type="file" webkitdirectory="" hidden onChange={(e) => { onPickFolder(e.target.files); e.target.value = ''; }} />

      {dragOver > 0 && (
        <div className="hatch-cue">
          <div>
            <DepositIcon size={34} />
            <h3>Let go to deposit</h3>
            <span className="reg reg-sm">Sealed on arrival, in this shelf</span>
          </div>
        </div>
      )}

      {entries === null ? (
        <div className="register">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="entry" key={i}><span /><div className="frosted" style={{ height: 13, width: `${58 - i * 7}%` }} /></div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bare">
          <span className="glyph"><ShelfIcon size={38} /></span>
          <h3>This shelf is empty</h3>
          <p>Drop files anywhere in the chamber — or drop an entire folder and it lands as one deposit.</p>
          <p className="fine">
            A whole repo works: <code>node_modules</code>, <code>.git</code> and build folders are left outside.
          </p>
          <div className="after">
            <button className="btn btn-portal btn-sm" onClick={() => fileInput.current?.click()}>
              <DepositIcon size={14} /> Deposit files
            </button>
          </div>
        </div>
      ) : (
        <div className="register">
          <div className="register-head" aria-hidden>
            <span />
            <span>Description</span>
            <span>Accession</span>
            <span>Mass</span>
            <span>Deposited</span>
            <span />
          </div>
          {entries.map((e) => (
            <div className="entry" key={e.id}>
              <span className="form-ico">{formMark(e)}</span>
              <div className="desc">
                <button
                  className="desc-name"
                  onClick={() => (e.isDir ? go(e.path) : setViewing(e))}
                >
                  {e.name}
                </button>
              </div>
              <span className="acc num">{e.isDir ? 'Shelf' : accession(e.id, e.category)}</span>
              <span className="mass num">{e.isDir ? '—' : fmtBytes(e.size)}</span>
              <span className="when num">{when(e.mtime, e.createdAt)}</span>
              <div className="row-acts">
                <a
                  className="icon-btn"
                  href={e.isDir ? `/api/files/${e.id}/zip` : `/api/files/${e.id}/content?download`}
                  download={e.isDir ? undefined : e.name}
                  aria-label={e.isDir ? `Withdraw ${e.name} as a zip` : `Withdraw a copy of ${e.name}`}
                  title={e.isDir ? 'Withdraw as zip' : 'Withdraw a copy'}
                >
                  <WithdrawIcon size={15} />
                </a>
                <button className="icon-btn" onClick={() => relabel(e)} aria-label={`Relabel ${e.name}`} title="Relabel">
                  <RelabelIcon size={15} />
                </button>
                <button className="icon-btn danger" onClick={() => thaw(e)} aria-label={`Move ${e.name} to the thaw shelf`} title="Move to thaw shelf">
                  <ThawIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="manifest" role="status" aria-live="polite">
          <div className="manifest-head">
            <span className="lamp live" />
            <span className="reg reg-sm">
              Sealing {uploads.length} accession{uploads.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="manifest-body">
            {uploads.slice(0, 6).map((u) => {
              const pc = Math.round((u.done / Math.max(1, u.total)) * 100);
              return (
                <div className="mrow" key={u.name}>
                  <span className="mn">{u.name}</span>
                  <span className="bar"><i style={{ ['--done' as string]: pc / 100 }} /></span>
                  <span className="pc num">{pc}%</span>
                </div>
              );
            })}
            {uploads.length > 6 && (
              <span className="reg reg-sm">and {uploads.length - 6} more waiting</span>
            )}
          </div>
        </div>
      )}

      {viewing && <Viewer entry={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
