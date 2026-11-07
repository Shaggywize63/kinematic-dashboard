'use client';
// Hard gate for the HRMS module. The sidebar already hides it, but the nav is not enforcement: deep links and
// stale caches ignore it. Allowed today: the demo account only (demo@kinematic.com). The module runs on sample data
// and has no backend yet, so no real customer and no real admin sees it. isDemoAccount() needs the demo email AND the
// demo token, so a stray stored email never unlocks it.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../../lib/api';
import { resetDb } from '../../../lib/hrms/db';
import { Button, T } from '../../../components/hrms/ui';

const allowed = (): boolean => api.isDemoAccount();

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    const ok = allowed();
    setState(ok ? 'allowed' : 'denied');
    if (!ok) router.replace('/dashboard');
  }, [router]);

  if (state === 'checking') return <div style={{ padding: 24, color: 'var(--dim)' }}>Checking access…</div>;
  if (state === 'denied') return <div style={{ padding: 24, color: 'var(--dim)' }}>HRMS is a preview that is only available on the demo account.</div>;
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
