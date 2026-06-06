'use client';
// Page-level guard for the CRM Settings module. The dashboard sidebar
// already hides this entry when the user's role lacks `crm_settings`, but
// the nav alone is not enforcement — a cached stale profile can flash the
// link, in-page deep links (e.g. "Edit stages →" on Pipeline) bypass the
// nav, and direct URL navigation ignores it entirely. This layout is the
// hard gate: it reads the freshest /auth/me, intersects role permissions
// with the client entitlement, and redirects unauthorized roles back to
// the CRM home. The backend already enforces the same gate via
// `requireModuleAccess('crm_settings')` on /api/v1/crm/settings/*, so
// API calls would 403 even if this guard were absent — this is the UX
// layer that keeps the user from staring at a half-loaded screen.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { getStoredUser } from '../../../../lib/auth';

export default function CrmSettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = getStoredUser();
      // Platform/super admins always pass — they don't have an org_role-scoped
      // permission set. Anyone with no client_id is a platform user.
      const role = (cached?.role || '').toLowerCase().replace(/-/g, '_');
      const isPlatform = !cached?.client_id && (
        ['super_admin', 'admin', 'main_admin', 'master_admin'].includes(role) ||
        role.includes('admin')
      );
      if (isPlatform) { if (!cancelled) setState('allowed'); return; }

      try {
        const fresh: any = await api.get('/api/v1/auth/me');
        const u = fresh?.data ?? fresh;
        const perms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
        const entitled: string[] = Array.isArray(u?.enabled_modules) ? u.enabled_modules : [];
        const entitledOk = entitled.length === 0 || entitled.includes('crm_settings');
        const permOk = perms.length === 0 || perms.includes('crm_settings');
        if (cancelled) return;
        if (entitledOk && permOk) setState('allowed');
        else { setState('denied'); router.replace('/dashboard/crm'); }
      } catch {
        // Fall back to cached perms if /auth/me is unreachable. Better to
        // err on the side of letting the backend's 403 surface than to
        // lock out a legitimate user during a transient API hiccup.
        const perms: string[] = Array.isArray((cached as any)?.permissions) ? (cached as any).permissions : [];
        if (!cancelled) setState(perms.length === 0 || perms.includes('crm_settings') ? 'allowed' : 'denied');
        if (!cancelled && perms.length > 0 && !perms.includes('crm_settings')) router.replace('/dashboard/crm');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (state === 'checking') {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Checking access…</div>;
  }
  if (state === 'denied') {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>You don&apos;t have access to CRM Settings.</div>;
  }
  return <>{children}</>;
}
