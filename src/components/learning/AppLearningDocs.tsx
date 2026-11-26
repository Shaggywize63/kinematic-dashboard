'use client';
/**
 * App Learning Hub — document uploader.
 *
 * Lets an admin upload training / support files that appear in the field app's
 * Learning Hub (the mobile `.learning` screen, backed by GET /api/v1/learning →
 * learning_materials). Used twice:
 *   - People  → category "Training"  (training material)
 *   - Support → category "Support"   (help / support docs)
 *
 * Limits (per the client's request): at most MAX_FILES files in total across
 * both categories, each at most MAX_MB. The cap is enforced here in the UI —
 * uploads are admin-only, and the count is read live from the list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Upload, FileText, Film, Image as ImageIcon, FileType, ExternalLink } from 'lucide-react';
import api from '../../lib/api';
import { Button, Card, PageHeader } from '../ui';

export const MAX_FILES = 30;        // total across Training + Support, per the request
export const MAX_MB = 25;           // per file

type MatType = 'video' | 'pdf' | 'slides' | 'document' | 'link' | 'image';

function typeForFile(f: File): MatType {
  const n = f.name.toLowerCase();
  const m = (f.type || '').toLowerCase();
  if (m.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(n)) return 'video';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(n)) return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/\.(ppt|pptx|key)$/.test(n)) return 'slides';
  return 'document';
}

function iconFor(t?: string) {
  switch (t) {
    case 'video': return Film;
    case 'image': return ImageIcon;
    case 'pdf': return FileType;
    default: return FileText;
  }
}

interface Material { id: string; title: string; category?: string | null; type?: string; file_url?: string }

export default function AppLearningDocs({
  category, heading, blurb,
}: {
  category: 'Training' | 'Support';
  heading: string;
  blurb: string;
}) {
  const [all, setAll] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/api/v1/learning');
      setAll(((r?.data ?? r) || []) as Material[]);
    } catch { setAll([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mine = all.filter((m) => (m.category || '') === category);
  const totalUsed = all.length;
  const atCap = totalUsed >= MAX_FILES;

  const onPick = (f: File | null) => {
    if (!f) { setPicked(null); return; }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_MB}MB per file.`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setPicked(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const upload = async () => {
    if (!picked) { toast.error('Choose a file first.'); return; }
    if (!title.trim()) { toast.error('Give it a title.'); return; }
    if (atCap) { toast.error(`You've reached the ${MAX_FILES}-file limit. Delete one to add another.`); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', picked);
      const up: any = await api.postForm('/api/v1/upload/material', fd);
      const fileUrl = up?.data?.url ?? up?.url;
      if (!fileUrl) throw new Error('Upload did not return a file URL');
      await api.post('/api/v1/learning', {
        title: title.trim(),
        type: typeForFile(picked),
        file_url: fileUrl,
        category,
        target_roles: ['executive', 'supervisor', 'admin', 'city_manager', 'super_admin'],
        is_mandatory: false,
      });
      toast.success('Added to the Learning Hub');
      setTitle(''); setPicked(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/v1/learning/${id}`);
      setAll((prev) => prev.filter((m) => m.id !== id));
      toast.success('Removed');
    } catch (e: any) { toast.error(e?.message || 'Failed to remove'); }
  };

  return (
    <div>
      <PageHeader title={heading} description={blurb} />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Upload a file</div>
            <div style={{ fontSize: 12, color: atCap ? 'var(--red)' : 'var(--text-dim)' }}>
              {totalUsed}/{MAX_FILES} files used · max {MAX_MB}MB each
            </div>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (shown in the app)"
            maxLength={120}
            disabled={busy}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.mp4,.mov,.webm"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              disabled={busy || atCap}
              style={{ fontSize: 13, color: 'var(--text-dim)' }}
            />
            <Button onClick={upload} disabled={busy || atCap || !picked || !title.trim()}>
              <Upload size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: '-2px' }} />
              {busy ? 'Uploading…' : 'Add to Learning Hub'}
            </Button>
          </div>
          {atCap && (
            <div style={{ fontSize: 12, color: 'var(--red)' }}>
              The {MAX_FILES}-file limit is reached. Delete a file below to upload another.
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
        ) : mine.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
            No {category.toLowerCase()} files yet. Upload one above — it appears in the app's Learning Hub.
          </div>
        ) : (
          mine.map((m, i) => {
            const Icon = iconFor(m.type);
            return (
              <div key={m.id || i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: i < mine.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-dim)' }}>
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{m.type || 'document'}</div>
                </div>
                {m.file_url && (
                  <a href={m.file_url} target="_blank" rel="noreferrer" title="Open" style={{ color: 'var(--text-dim)', display: 'inline-flex', padding: 6 }}>
                    <ExternalLink size={15} strokeWidth={1.8} />
                  </a>
                )}
                <button onClick={() => remove(m.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'inline-flex', padding: 6 }}>
                  <Trash2 size={15} strokeWidth={1.8} />
                </button>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
