'use client';
// Exits: for people serving notice, with an exit case, or already gone, the assets they still hold compared with the
// asset list on their Lifecycle exit checklist. The core exit data is only read. Recovery figures are advisory text.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, ConfidenceBadge, DataTable, EmployeeCell, Note, Stat, StatGrid, StatusBadge, T, type Col, type Tone } from '../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { diffDays, fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { Employee, ExitCase, HrmsDb } from '../../../../lib/hrms/types';
import {
  EXIT_STATE_LABEL, everHeldIds, reconcileExit, recoveryAdvice, recoveryDate, typeInfo, type ExitAssetRow,
} from '../../../../lib/hrms/rewards/engines';
import type { Asset, RewardsState } from '../../../../lib/hrms/rewards/types';
import { AdvisorNote, Muted } from '../common';
import { ActionModal } from './AssetModals';

interface Person { employee: Employee; exit?: ExitCase; rows: ExitAssetRow[]; outstanding: Asset[]; asOn: string; recovery: number }

const STATE_TONE: Record<ExitAssetRow['state'], Tone> = {
  return_pending: 'warn', not_on_checklist: 'warn', register_returned_checklist_open: 'info', checklist_returned_register_open: 'red', both_returned: 'ok', checklist_only: 'neutral',
};

export function exitPeople(db: HrmsDb, st: RewardsState): Person[] {
  const out: Person[] = [];
  for (const e of db.employees) {
    const exit = db.exits.filter((x) => x.employeeId === e.id).sort((a, b) => (a.stage === 'closed' ? 1 : 0) - (b.stage === 'closed' ? 1 : 0))[0];
    if (!(e.status === 'on_notice' || e.status === 'exited' || exit)) continue;
    const assets = everHeldIds(st.assets.events, e.id).map((id) => st.assets.items.find((a) => a.id === id)).filter((a): a is Asset => !!a);
    const rows = reconcileExit(assets, e.id, exit?.assets);
    const outstanding = assets.filter((a) => a.status === 'issued' && a.holderId === e.id);
    if (!rows.length) continue;
    // A leaver who has handed everything back, with nothing left to compare, drops off the list.
    if (!outstanding.length && rows.every((r) => r.state === 'both_returned')) continue;
    const asOn = recoveryDate(exit?.lastWorkingDate ?? e.lastWorkingDate, PREVIEW_TODAY);
    out.push({ employee: e, exit, rows, outstanding, asOn, recovery: outstanding.reduce((s, a) => s + recoveryAdvice(a, asOn).recommended, 0) });
  }
  return out.sort((a, b) => (a.exit?.lastWorkingDate ?? a.employee.lastWorkingDate ?? '9999').localeCompare(b.exit?.lastWorkingDate ?? b.employee.lastWorkingDate ?? '9999'));
}

export default function ExitsTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const people = useMemo(() => exitPeople(db, st), [db, st]);
  const [returning, setReturning] = useState<Asset | null>(null);
  const heldCount = people.reduce((s, p) => s + p.outstanding.length, 0);
  const total = people.reduce((s, p) => s + p.recovery, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatGrid min={190}>
        <Stat label="People with assets to return" value={people.filter((p) => p.outstanding.length).length} tone={people.some((p) => p.outstanding.length) ? 'warn' : 'ok'} hint="On notice, with an exit case, or already left" />
        <Stat label="Assets still held" value={heldCount} />
        <Stat label="Advisory recovery if none come back" value={inr(total)} hint={<ConfidenceBadge level="indicative" />} />
      </StatGrid>
      <AdvisorNote>
        The recovery figure is the book value (straight-line depreciation over a stated life) of each asset not yet returned. It is advice, not a decision, and it is never posted to payroll from this page. A deduction from final settlement needs a lawful basis and the employee&apos;s agreement.
      </AdvisorNote>

      {people.length === 0 && <Card><div style={{ padding: 28, textAlign: 'center', color: T.dim, fontSize: 14 }}>No leaver holds an asset, and no exit checklist lists one that is open.</div></Card>}

      {people.map((p) => {
        const lwd = p.exit?.lastWorkingDate ?? p.employee.lastWorkingDate;
        const left = lwd ? diffDays(PREVIEW_TODAY, lwd) : null;
        const rows = p.rows.map((r) => ({ ...r, id: r.key }));
        const cols: Col<(typeof rows)[number]>[] = [
          { key: 'asset', label: 'Asset', render: (r) => r.asset ? (<div><div style={{ fontWeight: 600 }}>{r.asset.make} {r.asset.model}</div><div style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{r.asset.tag}</div></div>) : <span style={{ color: T.mute }}>Not in this register</span> },
          { key: 'reg', label: 'Register', render: (r) => r.asset ? (r.asset.status === 'issued' && r.asset.holderId === p.employee.id ? <Badge tone="warn" dot>Still held</Badge> : <Badge tone="ok" dot>Back with the company</Badge>) : '—' },
          { key: 'chk', label: 'Exit checklist', render: (r) => r.core ? (<div><div>{r.core.returned ? 'Ticked as returned' : 'Not ticked'}</div><div style={{ fontSize: 12, color: T.mute }}>{r.core.name}</div></div>) : <span style={{ color: T.mute }}>{p.exit ? 'Not on the checklist' : 'No checklist'}</span> },
          { key: 'state', label: 'Status', render: (r) => <Badge tone={STATE_TONE[r.state]} dot>{p.employee.status === 'exited' && (r.state === 'return_pending' || r.state === 'not_on_checklist') ? 'Not returned after leaving' : EXIT_STATE_LABEL[r.state]}</Badge> },
          {
            key: 'adv', label: <>If not returned <span style={{ textTransform: 'none', letterSpacing: 0 }}>(advisory)</span></>, align: 'right', nowrap: true,
            render: (r) => {
              if (!r.asset || !p.outstanding.some((a) => a.id === r.asset!.id)) return <span style={{ color: T.mute }}>—</span>;
              const adv = recoveryAdvice(r.asset, p.asOn);
              return (<div><div style={{ fontWeight: 600 }}>{inr(adv.recommended)}</div><div style={{ fontSize: 12, color: T.mute }}>{adv.monthsUsed} of {typeInfo(r.asset.type).lifeYears * 12} months used</div></div>);
            },
          },
          { key: 'act', label: '', align: 'right', render: (r) => r.asset && p.outstanding.some((a) => a.id === r.asset!.id) ? <Button size="sm" aria-label={`Record return of ${r.asset.tag}`} onClick={() => setReturning(r.asset!)}>Record return</Button> : null },
        ];
        return (
          <Card key={p.employee.id} padding={0} style={{ overflow: 'hidden' }}>
            <div data-testid={`exit-person-${p.employee.id}`} style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <EmployeeCell e={p.employee} />
                <StatusBadge status={p.employee.status} />
                {p.exit ? <Badge>Exit stage: {p.exit.stage}</Badge> : <Badge tone="warn">No exit case in Lifecycle</Badge>}
              </div>
              <div style={{ fontSize: 13, color: T.dim }}>
                {lwd ? <>Last working day <b style={{ color: T.text }}>{fmtDate(lwd)}</b> ({left! > 0 ? `in ${left} days` : left === 0 ? 'today' : `${-left!} days ago`})</> : 'No last working day recorded'}
              </div>
            </div>
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DataTable columns={cols} rows={rows} minWidth={860} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13.5 }} data-testid={`exit-recovery-${p.employee.id}`}>
                  {p.outstanding.length
                    ? <>Advisory book value if the {p.outstanding.length} held {p.outstanding.length === 1 ? 'asset is' : 'assets are'} not returned: <b>{inr(p.recovery)}</b> as on {fmtDate(p.asOn)} <ConfidenceBadge level="indicative" /></>
                    : <span style={{ color: T.dim }}>Nothing is held. Check the rows above against the checklist.</span>}
                </div>
                <Link href="/dashboard/hrms/lifecycle?tab=exits" style={{ color: T.info, fontWeight: 600, fontSize: 13.5 }}>{p.exit ? 'Open this exit in Lifecycle' : 'Open Lifecycle to start an exit'}</Link>
              </div>
              {!p.exit && <Note tone="warn">There is no exit case in Lifecycle for {fullName(p.employee)}, so there is no checklist to compare. Start one there so clearance covers these assets.</Note>}
            </div>
          </Card>
        );
      })}
      <Muted>Nothing on this tab changes the core exit checklist. Tick items there once they are back; the comparison above updates on its own.</Muted>
      {returning && <ActionModal db={db} st={st} asset={returning} kind="return" onClose={() => setReturning(null)} />}
    </div>
  );
}
