'use client';
// Run step 2, Checks: the pre-run checks grouped by severity, with a link to fix each one. Blockers need an explicit confirmation.
// Sample data: engine.preRunChecks in the browser. Live data: the server's checks for the run (what compute will act on).

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, Note, T } from '../ui';
import type { HrmsDb, PayRun } from '../../../lib/hrms/types';
import { preRunChecks, type CheckSeverity, type PreRunCheck } from '../../../lib/hrms/engine';
import { logRunAudit } from '../../../lib/hrms/payrollActions';
import { usePreRunChecks } from '../../../lib/hrms/live/payrollCommands';
import { acknowledgedBlockers, isLocked } from './logic';
import type { Step } from './RunStepper';

const GROUPS: { key: CheckSeverity; title: string; tone: 'red' | 'warn' | 'info'; blurb: string }[] = [
  { key: 'blocker', title: 'Blockers', tone: 'red', blurb: 'Someone cannot be paid correctly, or at all, until these are fixed.' },
  { key: 'warning', title: 'Warnings', tone: 'warn', blurb: 'The run can go ahead, but a filing or a payslip may be wrong.' },
  { key: 'info', title: 'For information', tone: 'info', blurb: 'Explains a number you may otherwise question.' },
];

/** Sample data only: the blockers worked out in the browser. Live screens use usePreRunChecks, which asks the server. */
export function blockerCount(db: HrmsDb, run: PayRun): number {
  return preRunChecks(db, run.month, run.entityId).filter((c) => c.severity === 'blocker').length;
}

export default function RunChecks({ db, run, go }: { db: HrmsDb; run: PayRun; go: (s: Step) => void }) {
  const { checks: found, loading, error, reload } = usePreRunChecks(db, run);
  const checks = found ?? [];
  const [agree, setAgree] = useState(false);
  const blockers = checks.filter((c) => c.severity === 'blocker');
  const acked = acknowledgedBlockers(run);
  const locked = isLocked(run);

  const proceed = () => {
    if (blockers.length && acked < blockers.length) {
      logRunAudit(run.id, `Continued past ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}: ${Array.from(new Set(blockers.map((b) => b.title))).join(', ')}`);
    }
    go('compute');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Note>These checks run against the live data every time this page opens, so a fix made on an employee&apos;s record shows up here straight away.</Note>
      {loading && found === null && <div role="status" data-testid="checks-loading" style={{ fontSize: 13.5, color: T.dim }}>Running the checks on the server…</div>}
      {error && (
        <div data-testid="checks-error"><Note tone="red">
          The checks could not be run: {error}. <button type="button" onClick={reload} style={{ border: 0, background: 'transparent', color: T.red, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Try again</button>
        </Note></div>
      )}
      {!loading && !error && checks.length === 0 && <Card><div style={{ fontSize: 14, color: T.ok, fontWeight: 600 }}>No issues found. Everything the checks look at is in order.</div></Card>}
      {GROUPS.map((g) => {
        const items = checks.filter((c) => c.severity === g.key);
        if (!items.length) return null;
        return (
          <Card key={g.key}>
            <CardTitle right={<Badge tone={g.tone}>{items.length}</Badge>}>{g.title}</CardTitle>
            <div style={{ fontSize: 13, color: T.dim, marginTop: -6, marginBottom: 10 }}>{g.blurb}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }} data-testid={`checks-${g.key}`}>
              {items.map((c) => <CheckItem key={c.id} c={c} db={db} />)}
            </ul>
          </Card>
        );
      })}

      {!locked && (
        <Card>
          <CardTitle>Continue</CardTitle>
          {blockers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Note tone="red">{blockers.length} blocker{blockers.length === 1 ? '' : 's'} not fixed. Computing now will leave these people unpaid or skipped, and you can fix them later and recompute.</Note>
              {acked >= blockers.length ? (
                <div style={{ fontSize: 13.5, color: T.ok }}>You have already confirmed continuing past these blockers. It is recorded in the audit trail.</div>
              ) : (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, minHeight: 40, cursor: 'pointer' }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
                  <span>I understand that {blockers.length} blocker{blockers.length === 1 ? '' : 's'} will not be fixed before this run is computed, and I want to continue.</span>
                </label>
              )}
              <div><Button variant="primary" style={{ height: 44, padding: '0 20px', fontSize: 14 }} disabled={(acked < blockers.length && !agree) || loading} onClick={proceed}>Continue to compute</Button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: T.dim }}>No blockers.</span>
              <Button variant="primary" style={{ height: 44, padding: '0 20px', fontSize: 14 }} disabled={loading} onClick={proceed}>Continue to compute</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function CheckItem({ c, db }: { c: PreRunCheck; db: HrmsDb }) {
  const e = c.employeeId ? db.employees.find((x) => x.id === c.employeeId) : undefined;
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{c.title}{e && <span style={{ color: T.mute, fontWeight: 400 }}> · {e.code}</span>}</div>
        <div style={{ fontSize: 13, color: T.dim, marginTop: 2 }}>{c.detail}</div>
      </div>
      {c.fixHref && <Link href={c.fixHref} className="km-btn" data-variant="secondary" style={{ height: 36, padding: '0 14px', borderRadius: T.radius.sm, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Fix</Link>}
    </li>
  );
}
