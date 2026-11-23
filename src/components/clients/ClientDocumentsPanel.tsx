'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api, { API_BASE_URL, type ClientDocument } from '../../lib/api';
import { getStoredToken } from '../../lib/auth';
import { useConfirm } from '../ConfirmProvider';

/**
 * Client Management → Documents.
 *
 * Reference files for this client (e.g. their own product price list) — a platform admin's own notes to
 * self, not visible to the client's own login. The bytes go through the existing private-materials
 * upload (POST /api/v1/upload/material, field `file`) and are read back with a short-lived signed URL
 * (GET /api/v1/media/sign); this panel only drives that two-step flow and the metadata CRUD on top of it.
 */

const box: React.CSSProperties = { background: 'var(--s3)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' };
const ACCENT = '#3E9EFF';
const RED = '#E01E2C';

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const MAX_BYTES = 100 * 1024 * 1024; // matches the backend's material-upload limit

function fmtBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const btn = (text: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; danger?: boolean; testId?: string }) => (
  <button
    type="button" onClick={onClick} disabled={opts?.disabled} data-testid={opts?.testId}
    style={{
      height: 32, padding: '0 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
      border: opts?.primary ? 'none' : `1px solid ${opts?.danger ? 'rgba(224,30,44,0.4)' : 'var(--border)'}`,
      background: opts?.primary ? (opts?.disabled ? 'var(--s4)' : ACCENT) : 'transparent',
      color: opts?.primary ? (opts?.disabled ? 'var(--textTert)' : '#fff') : (opts?.danger ? RED : 'var(--textSec)'),
      cursor: opts?.disabled ? 'default' : 'pointer', opacity: opts?.disabled ? 0.7 : 1,
    }}
  >{text}</button>
);

export default function ClientDocumentsPanel({ clientId }: { clientId: string }) {
  const confirm = useConfirm();
  const [docs, setDocs] = useState<ClientDocument[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoadErr('');
    api.listClientDocuments(clientId)
      .then((r) => setDocs(r))
      .catch((e: Error) => setLoadErr(e?.message || 'Could not load this client’s documents.'));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const pick = () => fileRef.current?.click();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!ALLOWED_EXT.includes(ext)) { toast.error(`Choose a ${ALLOWED_EXT.join(', ')} file`); return; }
    if (file.size > MAX_BYTES) { toast.error('File must be under 100 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = getStoredToken();
      const r = await fetch(`${API_BASE_URL}/api/v1/upload/material`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      const path = json?.data?.path || json?.path;
      if (!r.ok || !path) throw new Error(json?.error || json?.message || 'Upload failed');
      await api.addClientDocument(clientId, {
        name: file.name, file_name: file.name, content_type: file.type || null, size_bytes: file.size, path,
      });
      toast.success('Document uploaded');
      load();
    } catch (e: any) { toast.error(e?.message || 'Upload failed'); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const view = async (doc: ClientDocument) => {
    setBusyId(doc.id);
    try {
      const r: any = await api.get(`/api/v1/media/sign?bucket=${encodeURIComponent(doc.bucket)}&path=${encodeURIComponent(doc.path)}`);
      const url = r?.data?.url || r?.url;
      if (!url) throw new Error('Could not get a link for this file');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) { toast.error(e?.message || 'Could not open this file'); }
    finally { setBusyId(''); }
  };

  const remove = async (doc: ClientDocument) => {
    if (!(await confirm({
      title: `Delete ${doc.name}?`,
      message: 'This removes it from the client record.',
      confirmLabel: 'Delete',
      tone: 'danger',
    }))) return;
    setBusyId(doc.id);
    try {
      await api.deleteClientDocument(clientId, doc.id);
      toast.success('Document deleted');
      load();
    } catch (e: any) { toast.error(e?.message || 'Could not delete the document'); }
    finally { setBusyId(''); }
  };

  if (docs === null && !loadErr) return <div style={{ ...box, fontSize: 12, color: 'var(--textTert)' }} data-testid="client-documents-loading">Loading documents…</div>;
  if (loadErr && docs === null) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} data-testid="client-documents-error">
        <span role="alert" style={{ fontSize: 12.5, color: RED, flex: 1, minWidth: 0 }}>{loadErr}</span>
        {btn('Try again', load)}
      </div>
    );
  }

  const list = docs ?? [];

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="client-documents-panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {list.length === 0 ? 'No documents yet' : `${list.length} document${list.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 3, lineHeight: 1.5 }}>
            Reference files for this client — a price list, contract or spec sheet. PDF, Word or PowerPoint, up to 100 MB. Visible to platform admins only.
          </div>
        </div>
        <input ref={fileRef} type="file" accept={ALLOWED_EXT.join(',')} style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} data-testid="client-documents-file-input" />
        {btn(uploading ? 'Uploading…' : 'Upload document', pick, { primary: true, disabled: uploading, testId: 'client-documents-upload' })}
      </div>

      {list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--s2)' }}>
          {list.map((d, i) => (
            <div key={d.id} data-testid={`client-document-${d.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--textTert)', marginTop: 2 }}>
                  {[d.file_name, fmtBytes(d.size_bytes), new Date(d.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
                </div>
              </div>
              {btn(busyId === d.id ? 'Opening…' : 'View', () => view(d), { disabled: !!busyId, testId: `client-document-view-${d.id}` })}
              {btn('Delete', () => remove(d), { danger: true, disabled: !!busyId, testId: `client-document-delete-${d.id}` })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
