'use client';
// Verified onboarding: pre-joining checks for the people about to join. Every external check is a SIMULATION with
// repeatable canned answers. Clearing a person writes the verified details to their employee record.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, HrmsPage, Loading, Note, ProgressBar, T, useIsCompact } from '../ui';
import { useHrmsDb } from '../../../lib/hrms/db';
import { fmtDate } from '../../../lib/hrms/format';
import { clearToJoin, workforceStore } from '../../../lib/hrms/workforce/store';
import { MANDATORY, SIMULATION_LABEL, STEP_ORDER, readiness } from '../../../lib/hrms/workforce/verifyEngine';
import { Panel, muted, strong } from './shared';
import VerifyStepRow from './VerifyStepRow';

export default function VerifiedOnboarding() {
  const db = useHrmsDb();
  const wf = workforceStore.use();
  const narrow = useIsCompact(900);
  const [pick, setPick] = useState<string | null>(null);
  if (!db || !wf) return <Loading />;

  const cases = wf.verify.cases;
  const sel = cases.find((c) => c.id === pick) ?? cases[0];
  const idx = sel ? cases.indexOf(sel) : 0;
  const r = sel ? readiness(sel) : null;
  const emp = sel?.employeeId ? db.employees.find((e) => e.id === sel.employeeId) : undefined;

  const clear = () => {
    if (!sel) return;
    const res = clearToJoin(sel.id);
    if (!res.ok) toast.error(res.error);
    else toast.success(res.value.wroteToEmployee ? `${sel.name} is cleared to join. The verified details are on the employee record.` : `${sel.name} is cleared to join. There is no employee record yet to update.`);
  };

  return (
    <HrmsPage
      eyebrow="HRMS · Verified onboarding"
      title="Verified onboarding"
      description="Check a joiner's PAN, Aadhaar, bank account, UAN, education and last employer before day one."
      actions={<Badge tone="warn" mono>All checks simulated</Badge>}
    >
      <div data-testid="sim-banner" role="note" style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--warn-w)', color: 'var(--warn)', fontSize: 13.5, lineHeight: 1.55 }}>
        <b>Every external check on this page is a simulation.</b> {SIMULATION_LABEL} The format checks are real (PAN shape, Aadhaar checksum, IFSC, account number, UAN). The answer from the &ldquo;registry&rdquo; is canned and repeatable, so the same input always gives the same result. A live version needs vendors, consent flows and contracts.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }} role="list" aria-label="People in onboarding">
        {cases.map((c) => {
          const rr = readiness(c);
          const on = c.id === sel?.id;
          return (
            <button key={c.id} type="button" role="listitem" aria-pressed={on} data-testid={`person-${c.id}`} onClick={() => setPick(c.id)}
              style={{ textAlign: 'left', padding: 14, borderRadius: T.radius.lg, border: `${on ? 2 : 1}px solid ${on ? T.info : T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15 }}>{c.name}</span>
              <span style={muted}>{c.role} · joins {fmtDate(c.joinDate)}</span>
              <ProgressBar pct={rr.pct} tone={c.cleared || rr.canClear ? 'ok' : rr.pct >= 50 ? 'info' : 'warn'} />
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: T.dim }}>
                <span>{rr.mandatoryDone} of {rr.mandatoryTotal} required checks</span>
                {c.cleared ? <Badge tone="ok" dot>Cleared to join</Badge> : rr.canClear ? <Badge tone="info" dot>Ready to clear</Badge> : <Badge tone="warn" dot>{rr.blocking.length} blocking</Badge>}
              </span>
            </button>
          );
        })}
      </div>

      {sel && r && (
        <>
          <Panel title={`Joining readiness: ${sel.name}`} testId="readiness"
            right={<span style={muted}>{emp ? <>Employee record <Link href={`/dashboard/hrms/employees/${emp.id}`} style={{ color: T.info, fontWeight: 600 }}>{emp.code}</Link></> : 'Candidate: no employee record yet'}</span>}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={strong}>{r.pct}% ready</span>
                  <span style={muted}>{r.doneCount} of {STEP_ORDER.length} checks done · {r.mandatoryDone} of {r.mandatoryTotal} required</span>
                </div>
                <ProgressBar pct={r.pct} tone={r.canClear ? 'ok' : 'info'} height={10} />
              </div>
              {sel.cleared ? (
                <Badge tone="ok" dot>Cleared to join</Badge>
              ) : (
                <Button variant="primary" data-testid="clear-join" disabled={!r.canClear} title={r.canClear ? undefined : `Blocked by: ${r.blocking.map((b) => b.label).join(', ')}`} onClick={clear}>Clear to join</Button>
              )}
            </div>
            {sel.cleared ? (
              <Note tone="ok">
                <span data-testid="cleared-note">Cleared to join on {fmtDate(sel.cleared.on)} by {sel.cleared.by}. {sel.cleared.wroteToEmployee
                  ? 'The verified PAN, Aadhaar (last four), UAN and bank account are now on the employee record, and the PAN, Aadhaar and bank documents are marked verified.'
                  : 'There is no employee record yet. Create one from Lifecycle, then copy these details across.'}{' '}
                Marking the person as joined is a separate step in <Link href="/dashboard/hrms/lifecycle" style={{ color: 'inherit', fontWeight: 700 }}>Lifecycle</Link>.</span>
              </Note>
            ) : (
              <div data-testid="blocking" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ ...strong, fontSize: 13.5 }}>{r.blocking.length ? `What is blocking ${sel.name.split(' ')[0]}` : 'Nothing is blocking. All required checks are done.'}</div>
                {r.blocking.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.6 }}>
                    {r.blocking.map((b) => <li key={b.key}><b>{b.label}</b>: {b.why}</li>)}
                  </ul>
                )}
                {r.optionalPending.length > 0 && <div style={muted}>Not blocking, but recommended: {r.optionalPending.map((b) => b.label.toLowerCase()).join(', ')}.</div>}
              </div>
            )}
          </Panel>

          <Panel title="Checks" testId="steps" right={<span style={muted}>{MANDATORY.length} required, {STEP_ORDER.length - MANDATORY.length} recommended</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {STEP_ORDER.map((k) => <VerifyStepRow key={`${sel.id}-${k}`} c={sel} k={k} sampleSeed={24 + idx} />)}
            </div>
          </Panel>
          <div style={muted}>Name on the offer letter: <b style={{ color: T.text }}>{sel.name}</b>. A name on a PAN or bank account that differs is shown side by side, and HR decides: accept it with a reason, or ask for a correction.</div>
        </>
      )}
    </HrmsPage>
  );
}
