'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api, { API_BASE_URL } from '../../../lib/api';
import { getStoredToken, getStoredUser } from '../../../lib/auth';
import SignedImage from '../../../components/shared/SignedImage';
import ChangePasswordCard from '../../../components/account/ChangePasswordCard';
import { downscaleToJpeg } from '../../../lib/imageResize';

// "My account": the signed-in user's profile picture and password. Name, role and email are
// admin-managed elsewhere. A picked photo is downscaled in the browser, uploaded with
// POST /api/v1/upload/avatar (lands in the private kinematic-avatars bucket) and then persisted
// with PATCH /api/v1/auth/me in the same step — no separate "Save". The password card is its own
// component (ChangePasswordCard).

interface ProfileUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  avatar_url?: string | null;
}

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Seed from local cache first so the page paints instantly, then
    // refresh from /auth/me so a freshly-updated avatar on another tab
    // is reflected here without a logout. Same pattern dashboard/layout
    // uses elsewhere.
    const cached = getStoredUser() as unknown as ProfileUser | null;
    if (cached) { setUser(cached); setAvatarUrl(cached.avatar_url || ''); }
    (async () => {
      try {
        const r: any = await api.get('/api/v1/auth/me');
        const u = r?.data ?? r;
        if (u) { setUser(u); setAvatarUrl(u.avatar_url || ''); }
      } catch { /* keep cached */ }
    })();
  }, []);

  // PATCH the user's row with the avatar URL (or null to clear), then refresh the local cache and tell the
  // dashboard layout so the header and sidebar avatars update without a reload.
  const persistAvatar = async (url: string | null) => {
    const r: any = await api.patch('/api/v1/auth/me', { avatar_url: url });
    const updated = r?.data ?? r;
    const merged = { ...(user || {}), ...(updated || {}), avatar_url: url };
    setUser(merged);
    setAvatarUrl(url || '');
    try { localStorage.setItem('kinematic_user', JSON.stringify(merged)); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('kinematic:profile-updated', { detail: { avatar_url: url } })); } catch { /* ignore */ }
  };

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const MAX_BYTES = 5 * 1024 * 1024; // the avatars bucket refuses > 6 MB

  // Upload the picked image to /upload/avatar (multipart, field `photo`) and save it as the profile picture.
  const uploadAvatar = async (picked: File) => {
    if (!picked) return;
    if (!ALLOWED.includes(picked.type)) { toast.error('Choose a JPEG, PNG or WebP image'); return; }
    setUploading(true);
    try {
      const f = await downscaleToJpeg(picked);
      if (f.size > MAX_BYTES) throw new Error('Image must be under 5 MB');
      const fd = new FormData();
      fd.append('photo', f);
      const token = getStoredToken();
      const r = await fetch(`${API_BASE_URL}/api/v1/upload/avatar`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      const url = json?.data?.url || json?.url;
      if (!r.ok || !url) throw new Error(json?.error || json?.message || 'Upload failed');
      await persistAvatar(url);
      toast.success('Profile picture updated');
    } catch (e: any) { toast.error(e?.message || 'Upload failed'); }
    finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      await persistAvatar(null);
      toast.success('Profile picture removed');
    } catch (e: any) { toast.error(e?.message || 'Could not remove the picture'); }
    finally { setUploading(false); }
  };

  if (!user) {
    return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading profile…</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 22, color: 'var(--text)' }}>My account</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-dim)' }}>
        Your profile picture and password. Name, role and email are managed by your admin in
        Settings → User Directory.
      </p>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18 }}>
          {/* Big circular preview. Falls back to the user's first
              initial so the layout stays stable while uploading. */}
          {avatarUrl ? (
            // kinematic-avatars is a PRIVATE bucket, so the stored URL must be
            // signed before it renders; SignedImage passes non-signable URLs
            // (freshly-picked previews) through unchanged.
            <SignedImage src={avatarUrl} alt="Avatar" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
          ) : (
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: 'var(--s4)', color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 32, border: '1px solid var(--border)',
            }}>
              {(user.name || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{user.name || 'Signed in'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{user.email}</div>
            {user.role && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Role: {user.role}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' }}
          >📎 {avatarUrl ? 'Change picture' : 'Upload picture'}</button>
          {avatarUrl && (
            <button
              type="button"
              onClick={removeAvatar}
              disabled={uploading}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >Remove</button>
          )}
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Saving…</span>}
        </div>

      </div>

      <ChangePasswordCard />
    </div>
  );
}
