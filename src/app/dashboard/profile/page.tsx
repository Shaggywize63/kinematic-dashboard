'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api, { API_BASE_URL } from '../../../lib/api';
import { getStoredToken, getStoredUser } from '../../../lib/auth';

// Per-user profile page. Today the only editable field is the avatar
// (name + role + email are admin-managed elsewhere). The avatar upload
// hits POST /api/v1/upload/avatar — which lands the file in the
// kinematic-avatars storage bucket — and then PATCH /api/v1/auth/me
// persists the returned URL onto the user's row.

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
  const [saving, setSaving] = useState(false);
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

  // Upload the picked image to /upload/avatar (multipart, field `photo`).
  // Returns the public URL the server stamped onto the avatars bucket.
  // The :type=avatar path on the backend routes the file to the right
  // Supabase storage bucket (kinematic-avatars).
  const uploadAvatar = async (f: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = getStoredToken();
      const r = await fetch(`${API_BASE_URL}/api/v1/upload/avatar`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      setAvatarUrl(url);
      toast.success('Avatar uploaded — click Save to apply');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  // PATCH the user's row with the new avatar URL (or null to clear).
  // Refreshes local cache + the in-memory user so the rest of the
  // dashboard (header + sidebar) sees the new image without a reload.
  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const r: any = await api.patch('/api/v1/auth/me', { avatar_url: avatarUrl || null });
      const updated = r?.data ?? r;
      const merged = { ...(user || {}), ...(updated || {}), avatar_url: avatarUrl || null };
      setUser(merged);
      try { localStorage.setItem('kinematic_user', JSON.stringify(merged)); } catch { /* ignore */ }
      toast.success('Profile saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading profile…</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 22, color: 'var(--text)' }}>My Profile</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-dim)' }}>
        Personalise your avatar. Name, role, and email are managed by your admin in
        Settings → User Directory.
      </p>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18 }}>
          {/* Big circular preview. Falls back to the user's first
              initial so the layout stays stable while uploading. */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
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
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' }}
          >📎 {avatarUrl ? 'Choose new image' : 'Upload image'}</button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl('')}
              disabled={uploading}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >Remove</button>
          )}
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading || (avatarUrl === (user.avatar_url || ''))}
            style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: (saving || uploading || avatarUrl === (user.avatar_url || '')) ? 0.6 : 1 }}
          >{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
