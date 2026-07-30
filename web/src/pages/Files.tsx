import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, fmtBytes, uploadFiles, type Entry, type UploadProgress } from '../api';
import { useToast } from '../state';
import Viewer from '../components/Viewer';

const ico = (e: Entry) => {
  if (e.isDir) return '📁';
  if (e.mime.startsWith('video/')) return '🎬';
  if (e.mime.startsWith('audio/')) return '🎵';
  if (e.mime.startsWith('image/')) return '🖼️';
  if (e.mime === 'text/html') return '🌐';
  if (e.category === 'projects') return '🧩';
  return '📄';
};

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

  // Search results link here as /files/<folder>?open=<id> — pop the viewer on that
  // file once the folder has loaded, then drop the param so a refresh is clean.
  const openId = new URLSearchParams(location.search).get('open');
  useEffect(() => {
    if (!openId || !entries) return;
    const hit = entries.find((e) => e.id === openId);
    if (hit) setViewing(hit);
    navigate(location.pathname, { replace: true });
  }, [openId, entries, navigate, location.pathname]);

  const go = (p: string) => navigate(`/files/${p.split('/').map(encodeURIComponent).join('/')}`);

  const doUpload = async (items: { file: File; relPath: string }[], category?: string) => {
    if (items.length === 0) return;
    try {
      await uploadFiles(items, path, {
        category,
        onProgress: (p) => setUploads(p.filter((x) => x.done < x.total)),
      });
      setUploads([]);
      toast(`Uploaded ${items.length === 1 ? items[0].relPath : `${items.length} files`} ✓`);
      load();
    } catch (e) {
      setUploads([]);
      toast(`Upload failed: ${(e as Error).message}`, true);
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
    // whole folder drop = a project (codebase) upload
    doUpload(items, 'projects');
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(0);
    const entries = Array.from(e.dataTransfer.items)
      .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
      .filter(Boolean) as FileSystemEntry[];
    if (entries.length === 0) return onPickFiles(e.dataTransfer.files);
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
    for (const entry of entries) await walk(entry, '');
    doUpload(collected, hasDir ? 'projects' : undefined);
  };

  const del = async (entry: Entry) => {
    await api(`/files/${entry.id}`, { method: 'DELETE' });
    toast(`Moved "${entry.name}" to trash`);
    load();
  };

  const rename = async (entry: Entry) => {
    const name = prompt('New name', entry.name);
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

  const crumbs = path ? path.split('/') : [];

  return (
    <div
      className={`dropzone${dragOver > 0 ? ' over' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); setDragOver((d) => d + 1); }}
      onDragLeave={() => setDragOver((d) => Math.max(0, d - 1))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="main-head">
        <nav className="breadcrumbs" aria-label="Path">
          <button onClick={() => go('')}>Files</button>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span className="sep">/</span>
              <button onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>{c}</button>
            </span>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            const name = prompt('Folder name');
            if (!name) return;
            try {
              await api('/files/mkdir', { method: 'POST', body: JSON.stringify({ path: path ? `${path}/${name}` : name }) });
              load();
            } catch (e) { toast((e as Error).message, true); }
          }}>New folder</button>
          <button className="btn btn-ghost btn-sm" onClick={() => folderInput.current?.click()}>Upload folder</button>
          <button className="btn btn-primary btn-sm" onClick={() => fileInput.current?.click()}>Upload files</button>
        </div>
      </div>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }} />
      {/* @ts-expect-error webkitdirectory is non-standard but universal */}
      <input ref={folderInput} type="file" webkitdirectory="" hidden onChange={(e) => { onPickFolder(e.target.files); e.target.value = ''; }} />

      {entries === null ? (
        <div className="rows">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 46, marginBottom: 8 }} />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <div className="big">🗂️</div>
          <h3>Nothing here yet</h3>
          <p>Drop files anywhere on this page — or drop a whole folder.</p>
          <p className="faint">
            Even an entire repo works: <code>node_modules</code>, <code>.git</code> and build folders are skipped automatically.
          </p>
        </div>
      ) : (
        <div className="rows">
          {entries.map((e) => (
            <div className="row" key={e.id}>
              <span className="file-ico" aria-hidden>{ico(e)}</span>
              <div className="grow">
                <div
                  className="name"
                  role="button"
                  tabIndex={0}
                  onClick={() => (e.isDir ? go(e.path) : setViewing(e))}
                  onKeyDown={(ev) => ev.key === 'Enter' && (e.isDir ? go(e.path) : setViewing(e))}
              >
                  {e.name}
                </div>
                <div className="meta">{e.isDir ? 'Folder' : fmtBytes(e.size)}</div>
              </div>
              <div className="actions">
                {e.isDir ? (
                  <a className="btn btn-ghost btn-sm" href={`/api/files/${e.id}/zip`} download>Zip</a>
                ) : (
                  <a className="btn btn-ghost btn-sm" href={`/api/files/${e.id}/content?download`} download={e.name}>Get</a>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => rename(e)}>Rename</button>
                <button className="btn btn-danger btn-sm" onClick={() => del(e)}>Trash</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="uploads-tray">
          <h4>Uploading {uploads.length} file{uploads.length > 1 ? 's' : ''}…</h4>
          {uploads.slice(0, 5).map((u) => (
            <div className="u-row" key={u.name}>
              <span className="u-name">{u.name}</span>
              <span className="progress"><div style={{ width: `${(u.done / Math.max(1, u.total)) * 100}%` }} /></span>
            </div>
          ))}
          {uploads.length > 5 && <div className="u-row">…and {uploads.length - 5} more</div>}
        </div>
      )}

      {viewing && <Viewer entry={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
