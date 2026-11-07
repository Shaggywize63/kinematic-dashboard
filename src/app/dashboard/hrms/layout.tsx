'use client';
// Hard gate for the HRMS module. The sidebar already hides it, but the nav is not enforcement: deep links and
// stale caches ignore it. Allowed today: the master admin, or a client admin whose client was granted the
// `hrms` module. (Same rule as Finance; the backend will enforce it too once it exists.)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '../../../lib/auth';
import { isMasterAdmin } from '../../../lib/clientFeatures';
import { resetDb } from '../../../lib/hrms/db';
import { Button, T } from '../../../components/hrms/ui';

function allowed(): boolean {
  const u = getStoredUser() as any;
  if (isMasterAdmin(u)) return true;
  const modules: string[] = Array.isArray(u?.enabled_modules) ? u.enabled_modules : [];
  return !!(u?.client_id && modules.includes('hrms'));
}

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    const ok = allowed();
    setState(ok ? 'allowed' : 'denied');
    if (!ok) router.replace('/dashboard');
  }, [router]);

  if (state === 'checking') return <div style={{ padding: 24, color: 'var(--dim)' }}>Checking access…</div>;
  if (state === 'denied') return <div style={{ padding: 24, color: 'var(--dim)' }}>HRMS is not available for your account.</div>;
  return (
    <>
      <div role="status" data-testid="hrms-preview-banner" style={{ margin: '12px 24px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: T.warnWash, color: T.warn, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span><b>Preview.</b> This module runs on sample data kept in this browser. Nothing is saved to the server yet, and statutory rates are not confirmed for live payroll.</span>
        <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Reset the sample data to its starting state? Your changes in this browser will be lost.')) resetDb(); }}>Reset sample data</Button>
      </div>
      {children}
    </>
  );
}
