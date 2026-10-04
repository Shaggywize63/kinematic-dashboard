'use client';
// Hard gate for the Finance module. The sidebar already hides it, but the nav is
// not enforcement — deep links and stale caches ignore it. Allowed: the master
// admin, or a client admin whose client was explicitly granted the `finance`
// module. The backend enforces the same rule (requireFinanceAccess); this layer
// just keeps people from staring at a screen of 403s.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '../../../lib/auth';
import { isMasterAdmin } from '../../../lib/clientFeatures';

function allowed(): boolean {
  const u = getStoredUser() as any;
  if (isMasterAdmin(u)) return true;
  const modules: string[] = Array.isArray(u?.enabled_modules) ? u.enabled_modules : [];
  return !!(u?.client_id && modules.includes('finance'));
}

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [clientScoped, setClientScoped] = useState(false);

  useEffect(() => {
    const ok = allowed();
    setState(ok ? 'allowed' : 'denied');
    if (!ok) router.replace('/dashboard');
  }, [router]);

  // The global client picker adds X-Client-Id to every request, so Finance would silently
  // show that client's books instead of the organisation's own. Say so.
  useEffect(() => {
    const read = () => {
      try { setClientScoped(!!window.localStorage.getItem('kinematic_selected_client') && window.localStorage.getItem('kinematic_hide_client_filter') !== '1'); }
      catch { setClientScoped(false); }
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('focus', read);
    return () => { window.removeEventListener('storage', read); window.removeEventListener('focus', read); };
  }, []);

  if (state === 'checking') return <div style={{ padding: 24, color: 'var(--dim)' }}>Checking access…</div>;
  if (state === 'denied') return <div style={{ padding: 24, color: 'var(--dim)' }}>Finance is not available for your account.</div>;
  return (
    <>
      {clientScoped && (
        <div role="status" style={{ margin: '12px 24px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: 'var(--info-w)', color: 'var(--info)' }}>
          A client is selected in the header filter, so Finance shows that client&apos;s books. Clear the client filter to see your organisation&apos;s own books.
        </div>
      )}
      {children}
    </>
  );
}
