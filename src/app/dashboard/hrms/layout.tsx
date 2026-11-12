'use client';
// Hard gate for the HRMS module. The sidebar already hides it, but the nav is not enforcement: deep links and
// stale caches ignore it. Allowed today: the master admin only (see lib/hrms/access.ts).
//
// The module has two data sources. Sample (the default) runs on made-up data kept in this browser and never calls the
// server. Live saves people, organisation and payroll on the server (the rest of the module still stays in this browser).
// The choice is remembered in localStorage and read after mount, so it never changes what the first render shows.

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredUser } from '../../../lib/auth';
import { canUseHrms } from '../../../lib/hrms/access';
import { resetDb } from '../../../lib/hrms/db';
import { resetAllAreaStores } from '../../../lib/hrms/areaStore';
import { hydrate, initSource, setSource, useLiveStatus, type LiveStatus, type Source } from '../../../lib/hrms/live/store';
import { Button, Card, EmptyState, Modal, Note, T } from '../../../components/hrms/ui';

const allowed = (): boolean => canUseHrms(getStoredUser());

/** Sections whose data is on the server in live mode. Every other section keeps its data in this browser.
 * Privacy is server-backed for its compliance / consent / retention collections; its Requests and Roles tabs stay local
 * and the page degrades on its own when the privacy tables are missing, so it is not gated as a whole section here. */
const SERVER_BACKED = new Set(['', 'employees', 'organization', 'org-chart', 'payroll', 'payslips', 'time', 'lifecycle', 'privacy']);
/** Sections that cannot show anything useful without the payroll data: they say so instead when payroll could not be loaded. */
const NEEDS_PAYROLL = new Set(['payroll', 'payslips', 'statutory']);
/** Sections that cannot show anything useful without the time-and-leave data: they say so instead when it could not be loaded. */
const NEEDS_TIME = new Set(['time']);
/** Sections that cannot show anything useful without the lifecycle data: they say so instead when it could not be loaded. */
const NEEDS_LIFECYCLE = new Set(['lifecycle']);
/** Sections that read some payroll figures: they stay usable but warn that those figures are missing. */
const READS_PAYROLL = new Set(['my', 'reports']);

function sectionOf(pathname: string | null): string {
  return (pathname ?? '').replace(/^\/dashboard\/hrms\/?/, '').split('/')[0] ?? '';
}

function SourceSwitch({ source, onSample, onLive }: { source: Source; onSample: () => void; onLive: () => void }) {
  const btn = (on: boolean) => ({
    height: 28, padding: '0 12px', border: 0, fontSize: 12.5, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: on ? 'default' : 'pointer',
    background: on ? T.card : 'transparent', color: on ? T.text : 'inherit',
  } as const);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
      <span id="hrms-source-label">Data source</span>
      <div role="group" aria-labelledby="hrms-source-label" style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.borderStrong}` }}>
        <button type="button" data-testid="hrms-source-sample" aria-pressed={source === 'sample'} onClick={onSample} style={btn(source === 'sample')}>Sample</button>
        <button type="button" data-testid="hrms-source-live" aria-pressed={source === 'live'} onClick={onLive} style={btn(source === 'live')}>Live</button>
      </div>
    </div>
  );
}

function SwitchToLive({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Switch to live data?" onClose={onClose} width={520}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onConfirm} style={{ minHeight: 40 }}>Switch to live data</Button></>}>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0 }}>
          <b>What becomes real.</b> Legal entities, locations, departments, designations and employees are loaded from the server, and everything you add or change
          there is saved on the server straight away. So is payroll: salary structures, attendance, adjustments, loans, pay runs and payslips, and full and final settlements.
          Time and leave too: shifts, the weekly roster, leave policies, holiday lists and leave balances. Lifecycle and letters as well: onboarding, exits,
          letter templates and the letters you issue. Privacy as well: the compliance calendar, the consent ledger and the retention rules, with the access log read
          from the server. The server works out the payslips and builds the bank file.
          PAN and bank details are kept encrypted and shown masked; revealing one needs a reason and is written to an access log.
        </p>
        <p style={{ margin: 0 }}>
          <b>What stays in this browser.</b> The other modules, and the Privacy page's data-subject requests and role matrix, are not on the server yet. In live mode they start empty and are saved in this browser only.
        </p>
        <p style={{ margin: 0 }}>Your sample data is not touched, and you can switch back at any time.</p>
      </div>
    </Modal>
  );
}

function PayrollUnavailable({ live }: { live: LiveStatus }) {
  const notReady = live.payrollPhase === 'not_ready';
  return (
    <div style={{ padding: '16px 24px' }} data-testid={notReady ? 'hrms-payroll-not-ready' : 'hrms-payroll-error'}>
      <Card>
        <EmptyState title={notReady ? 'Payroll storage is not set up yet on the server' : 'Could not load payroll'}
          description={notReady
            ? 'The tables that hold live payroll have not been created on the server, so there is nothing to load or save yet. People and organisation still work, and so does the sample data.'
            : <span data-testid="hrms-payroll-error-message">{live.payrollMessage || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
          action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Try again</Button>
            <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
          </div>} />
      </Card>
    </div>
  );
}

function TimeUnavailable({ live }: { live: LiveStatus }) {
  const notReady = live.timePhase === 'not_ready';
  return (
    <div style={{ padding: '16px 24px' }} data-testid={notReady ? 'hrms-time-not-ready' : 'hrms-time-error'}>
      <Card>
        <EmptyState title={notReady ? 'Time and leave storage is not set up yet on the server' : 'Could not load time and leave'}
          description={notReady
            ? 'The tables that hold live time and leave have not been created on the server, so there is nothing to load or save yet. People, organisation and payroll still work, and so does the sample data.'
            : <span data-testid="hrms-time-error-message">{live.timeMessage || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
          action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Try again</Button>
            <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
          </div>} />
      </Card>
    </div>
  );
}

function LifecycleUnavailable({ live }: { live: LiveStatus }) {
  const notReady = live.lifecyclePhase === 'not_ready';
  return (
    <div style={{ padding: '16px 24px' }} data-testid={notReady ? 'hrms-lifecycle-not-ready' : 'hrms-lifecycle-error'}>
      <Card>
        <EmptyState title={notReady ? 'Lifecycle storage is not set up yet on the server' : 'Could not load lifecycle'}
          description={notReady
            ? 'The tables that hold live lifecycle and letters have not been created on the server, so there is nothing to load or save yet. People, organisation, payroll and time still work, and so does the sample data.'
            : <span data-testid="hrms-lifecycle-error-message">{live.lifecycleMessage || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
          action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Try again</Button>
            <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
          </div>} />
      </Card>
    </div>
  );
}

function LiveGate({ live, children }: { live: LiveStatus; children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  if (live.phase === 'idle' || live.phase === 'loading') {
    return <div role="status" data-testid="hrms-live-loading" style={{ padding: 24, color: T.dim, fontSize: 13.5 }}>Loading the HRMS data from the server…</div>;
  }
  if (live.phase === 'not_ready') {
    return (
      <div style={{ padding: '16px 24px' }} data-testid="hrms-live-not-ready">
        <Card>
          <EmptyState title="HRMS storage is not set up yet on the server"
            description="The tables that hold live HRMS data have not been created on the server, so there is nothing to load or save yet. Sample data still works."
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Try again</Button>
              <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
            </div>} />
        </Card>
      </div>
    );
  }
  if (live.phase === 'error') {
    return (
      <div style={{ padding: '16px 24px' }} data-testid="hrms-live-error">
        <Card>
          <EmptyState title="Could not load the live data"
            description={<span data-testid="hrms-live-error-message">{live.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => void hydrate()} style={{ minHeight: 40 }}>Retry</Button>
              <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
            </div>} />
        </Card>
      </div>
    );
  }
  const payrollDown = live.payrollPhase === 'not_ready' || live.payrollPhase === 'error';
  if (payrollDown && NEEDS_PAYROLL.has(section)) return <PayrollUnavailable live={live} />;
  const timeDown = live.timePhase === 'not_ready' || live.timePhase === 'error';
  if (timeDown && NEEDS_TIME.has(section)) return <TimeUnavailable live={live} />;
  const lifecycleDown = live.lifecyclePhase === 'not_ready' || live.lifecyclePhase === 'error';
  if (lifecycleDown && NEEDS_LIFECYCLE.has(section)) return <LifecycleUnavailable live={live} />;
  return (
    <>
      {!SERVER_BACKED.has(section) && (
        <div data-testid="hrms-local-note" style={{ margin: '12px 24px 0' }}>
          <Note tone="warn">
            Saved in this browser only: this part of HRMS is not on the server yet.
          </Note>
        </div>
      )}
      {payrollDown && READS_PAYROLL.has(section) && (
        <div data-testid="hrms-payroll-missing" style={{ margin: '12px 24px 0' }}>
          <Note tone="warn">
            Payroll could not be loaded from the server{live.payrollMessage ? ` (${live.payrollMessage})` : ''}, so payslips and pay figures on this page are empty.
          </Note>
        </div>
      )}
      {children}
    </>
  );
}

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const live = useLiveStatus();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [askLive, setAskLive] = useState(false);

  useEffect(() => {
    const ok = allowed();
    // Apply the remembered data source before the pages mount, so they never flash the wrong one.
    if (ok) initSource();
    setState(ok ? 'allowed' : 'denied');
    if (!ok) router.replace('/dashboard');
  }, [router]);

  if (state === 'checking') return <div style={{ padding: 24, color: 'var(--dim)' }}>Checking access…</div>;
  if (state === 'denied') return <div style={{ padding: 24, color: 'var(--dim)' }}>HRMS is a preview and is not available for your account yet.</div>;

  const isLive = live.source === 'live';
  const tone = isLive ? { bg: T.infoWash, fg: T.info } : { bg: T.warnWash, fg: T.warn };
  return (
    <>
      <div role="status" data-testid="hrms-preview-banner" data-source={live.source} style={{ margin: '12px 24px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: tone.bg, color: tone.fg, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {isLive ? (
          <span data-testid="hrms-banner-text" style={{ minWidth: 0, flex: '1 1 280px' }}>
            <b>Live data.</b> People, organisation and payroll are saved on the server, and so are time and leave, lifecycle and letters, and privacy. The rest of the module still stays in this browser.
            {live.syncing && <span data-testid="hrms-syncing" aria-live="polite"> Saving…</span>}
          </span>
        ) : (
          <span data-testid="hrms-banner-text" style={{ minWidth: 0, flex: '1 1 280px' }}><b>Preview.</b> This module runs on sample data kept in this browser. Nothing is saved to the server yet, and statutory rates are not confirmed for live payroll.</span>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SourceSwitch source={live.source} onSample={() => { if (isLive) setSource('sample'); }} onLive={() => { if (!isLive) setAskLive(true); }} />
          {isLive && (
            <Button size="sm" data-testid="hrms-refresh" onClick={() => void hydrate()} disabled={live.refreshing || live.phase === 'loading'}>{live.refreshing ? 'Refreshing…' : 'Refresh'}</Button>
          )}
          <Button size="sm" variant="ghost" data-testid="hrms-reset" disabled={isLive}
            title={isLive ? 'Reset is for sample data only. It never touches the server.' : undefined}
            onClick={() => { if (window.confirm('Reset the sample data to its starting state? Your changes in this browser will be lost.')) { resetAllAreaStores(); resetDb(); } }}>Reset sample data</Button>
          {isLive && <span data-testid="hrms-reset-reason" style={{ fontSize: 12 }}>Reset is for sample data only. It never touches the server.</span>}
        </div>
      </div>
      {isLive ? <LiveGate live={live}>{children}</LiveGate> : children}
      {askLive && <SwitchToLive onClose={() => setAskLive(false)} onConfirm={() => { setAskLive(false); setSource('live'); }} />}
    </>
  );
}
