'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';

// Shared "Lead/Contact/Account photo" capture component. Wraps the
// /api/v1/upload/photo flow with two buttons (📷 Take Photo + 📎 Upload
// from Device), a thumbnail + Remove control when a photo is attached,
// and a 8 MB upload cap. Used by the lead, contact, and account create /
// edit forms — duplicating this UI was getting silly.
//
// Backend contract (matches the activity-photo flow):
//   POST /api/v1/upload/photo  multipart/form-data
//     field: photo (image/*)
//     headers: Authorization Bearer + X-Org-Id
//   200: { data: { url: string } } OR { url: string }

export interface CRMPhotoSectionProps {
  value: string;
  onChange: (url: string) => void;
  /** Defaults to "Profile Photo". Used as the section heading. */
  title?: string;
  /** Sub-text under the heading. Customised per-entity to nudge the
   *  right kind of capture (lead = visiting card, account = signage). */
  helperText?: string;
  /** Wrap with `<Section>` for the lead create form's grid layout, or
   *  render bare for modal forms with their own section chrome. */
  unwrapped?: boolean;
}

export function CRMPhotoSection({
  value,
  onChange,
  title = 'Profile Photo (optional)',
  helperText,
  unwrapped = false,
}: CRMPhotoSectionProps) {
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (f: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/photo`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      onChange(url);
      toast.success('Photo uploaded');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current)  cameraRef.current.value  = '';
    }
  };

  const body = (
    <>
      {helperText && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{helperText}</div>
      )}
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Profile photo" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>Photo attached.</div>
          <button type="button" onClick={() => onChange('')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Remove</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* `capture` opens the camera directly on mobile; on desktop
              it's ignored and falls through to the file dialog. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >📷 Take Photo</button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >📎 Upload from Device</button>
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
        </div>
      )}
    </>
  );

  if (unwrapped) return body;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      {body}
    </div>
  );
}
