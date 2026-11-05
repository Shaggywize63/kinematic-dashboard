'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../lib/api';
import SignedImage, { openSignedUrl } from '../../shared/SignedImage';

const btn: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

/**
 * Photo capture for an activity (activities/new + the edit modal). Uploads the picked / captured image to
 * POST /api/v1/upload/photo through the shared API client (auth refresh + org / client / project headers) and
 * hands the stored URL to the form, which sends it as `image_url` on POST / PATCH /crm/activities.
 * The stored URL points into a private bucket, so the preview goes through <SignedImage>.
 */
export default function ActivityPhotoField({
  value, onChange, label = 'Photo (optional)',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      // The backend's uploadSingle middleware reads the file from the field named `photo`.
      fd.append('photo', f);
      const r = await api.postForm<{ data?: { url?: string }; url?: string; error?: string; message?: string }>('/api/v1/upload/photo', fd);
      const url = r?.data?.url || r?.url;
      if (!url) throw new Error(r?.error || r?.message || 'Upload failed');
      onChange(url);
      toast.success('Image uploaded');
    } catch (e) {
      toast.error((e as Error)?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  return (
    <div role="group" aria-label={label} data-testid="activity-photo-field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <a href={value} onClick={(e) => openSignedUrl(e, value)} target="_blank" rel="noreferrer" title="Open full size">
            <SignedImage src={value} alt="Activity photo" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
          </a>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>Photo attached.</div>
          <button type="button" onClick={() => onChange('')} style={{ ...btn, background: 'transparent', color: 'var(--text-dim)', padding: '6px 12px', fontSize: 12, fontWeight: 400 }}>Remove</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* The camera input carries `capture` so phones open the camera directly; the other opens the file picker.
              On desktop both fall through to the file dialog. */}
          <input ref={cameraRef} data-testid="activity-photo-camera" type="file" accept="image/*" capture="environment" disabled={uploading} style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <input ref={galleryRef} data-testid="activity-photo-input" type="file" accept="image/*" disabled={uploading} style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} style={btn}>📷 Take Photo</button>
          <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading} style={btn}>📎 Upload from Device</button>
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
        </div>
      )}
    </div>
  );
}
