'use client';
// Exits: a board by stage (notice, clearance, settlement, closed) and a case detail with the clearance
// checklist, asset recovery, notice calculator, settlement clock and the rule for closing an exit.

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, EmptyState, KeyValue, Note, ProgressBar, SearchBox, StatusBadge, Toolbar, T, useIsCompact } from '../ui';
import { Field, Input, Select } from '../../ui';
import { CheckRow, CommitInput, ConfirmDialog, Dialog, RemoveButton, isIsoDate, useOneShotParam, sectionTitle } from './common';
import StartExitModal from './StartExitModal';
import {
  EXIT_REASONS, EXIT_STAGES, STAGE_LABEL, addAsset, addClearance, closeExit, exitChecks, fnfFor, patchClearance, removeAsset, removeClearance,
  reopenExit, setAssetReturned, setClearanceDone, setExitLastWorkingDate, setExitStage, setInterviewDone, setNoticeWaived,
} from '../../../lib/hrms/lifecycleActions';
import { TODAY, relDays } from '../overview/insights';
import { addWorkingDays, computeFnf } from '../../../lib/hrms/engine';
import { LABOUR_CODES } from '../../../lib/hrms/rules';
import { diffDays, fmtDate, fullName, inr } from '../../../lib/hrms/format';
import type { Employee, ExitCase, HrmsDb } from '../../../lib/hrms/types';

const reasonLabel = (r: ExitCase['reason']) => EXIT_REASONS.find((x) => x.value === r)?.label ?? r;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function CaseCard({ db, c, emp, onOpen }: { db: HrmsDb; c: ExitCase; emp: Employee; onOpen: () => void }) {
  const done = c.clearance.filter((i) => i.done).length;
  const f = fnfFor(db, emp.id);
  const d = diffDays(TODAY, c.lastWorkingDate);
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', padding: 12, border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{fullName(emp)}</span>
      <span style={{ fontSize: 12.5, color: T.dim }}>{emp.code} · {reasonLabel(c.reason)}</span>
      <span style={{ fontSize: 12, color: T.dim }}>Last day {fmtDate(c.lastWorkingDate)}</span>
      {c.stage !== 'closed' && <span style={{ fontSize: 12, fontWeight: 600, color: d < 0 ? T.red : T.dim }}>{d < 0 ? `Left ${relDays(d)}` : `Leaves ${relDays(d)}`}</span>}
      <ProgressBar pct={c.clearance.length ? (done / c.clearance.length) * 100 : 0} tone={done === c.clearance.length && done > 0 ? 'ok' : 'info'} />
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 12, color: T.dim, flexWrap: 'wrap' }}>
        <span>{done} of {c.clearance.length} clearances</span>
        <Badge tone={f?.status === 'paid' ? 'ok' : f ? 'info' : 'neutral'}>{f ? `F&F ${f.status}` : 'F&F not started'}</Badge>
      </span>
    </button>
  );
}

// ───────────────────────────── case detail ─────────────────────────────
function ExitDetail({ db, exitId, onClose }: { db: HrmsDb; exitId: string; onClose: () => void }) {
  const c = db.exits.find((x) => x.id === exitId);
  const uid = useId();
  const [lwdDraft, setLwdDraft] = useState(c?.lastWorkingDate ?? '');
  const [dept, setDept] = useState('');
  const [deptOwner, setDeptOwner] = useState('');
  const [deptErr, setDeptErr] = useState('');
  const [asset, setAsset] = useState('');
  const [assetErr, setAssetErr] = useState('');
  const [confirm, setConfirm] = useState<null | 'close' | 'reopen'>(null);
  const [removing, setRemoving] = useState<null | { kind: 'clearance' | 'asset'; id: string; label: string }>(null);
  useEffect(() => { if (c) setLwdDraft(c.lastWorkingDate); }, [c?.lastWorkingDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const narrow = useIsCompact(700);
  if (!c) return null;
  const emp = db.employees.find((e) => e.id === c.employeeId);
  if (!emp) return null;

  const design = db.designations.find((d) => d.id === emp.designationId)?.name;
  const dep = db.departments.find((d) => d.id === emp.departmentId)?.name;
  const closed = c.stage === 'closed';

  // notice calculator
  const required = c.noticeWaived ? 0 : emp.noticeDays;
  const planned = Math.max(0, diffDays(c.resignationDate, c.lastWorkingDate));
  const served = Math.max(0, Math.min(planned, diffDays(c.resignationDate, TODAY)));
  const remaining = Math.max(0, diffDays(TODAY, c.lastWorkingDate));
  const shortfall = Math.max(0, required - planned);

  // settlement clock
  const f = fnfFor(db, emp.id);
  const due = addWorkingDays(c.lastWorkingDate, LABOUR_CODES.settlementWorkingDays);
  const overdue = f?.status !== 'paid' && due < TODAY;
  const fnfResult = f ? computeFnf(db, f) : null;

  const checks = exitChecks(db, c);
  const blockers = checks.filter((k) => !k.ok);
  const pendingClear = c.clearance.filter((i) => !i.done).length;
  const unreturned = c.assets.filter((a) => !a.returned);

  const lwdError = !isIsoDate(lwdDraft) ? 'Enter a valid date' : lwdDraft < c.resignationDate ? 'Cannot be before the resignation date' : '';
  function onLwd(v: string) {
    setLwdDraft(v);
    if (isIsoDate(v) && v >= c!.resignationDate && v !== c!.lastWorkingDate) setExitLastWorkingDate(c!.id, v);
  }
  function addDept() {
    if (dept.trim().length < 2) { setDeptErr('Enter a department name'); return; }
    if (c!.clearance.some((i) => i.department.toLowerCase() === dept.trim().toLowerCase())) { setDeptErr('This department is already on the list'); return; }
    setDeptErr(''); addClearance(c!.id, dept, deptOwner); setDept(''); setDeptOwner('');
  }
  function addAssetItem() {
    if (asset.trim().length < 2) { setAssetErr('Enter what was issued, for example Laptop'); return; }
    setAssetErr(''); addAsset(c!.id, asset); setAsset('');
  }
  function doClose() {
    const r = closeExit(c!.id);
    setConfirm(null);
    if (r.ok) { toast.success(`${fullName(emp!)} is marked as exited.`); onClose(); } else toast.error(r.blockers.join(' '));
  }

  const rowGrid = narrow ? '1fr' : 'minmax(150px, 1.1fr) minmax(120px, 1fr) minmax(150px, 1.4fr) 44px';

  return (
    <Dialog title={`Exit: ${fullName(emp)}`} width={880} onClose={onClose}
      footer={<Button onClick={onClose} style={{ height: 44 }}>Close window</Button>}>
      {/* header */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{design} <span style={{ color: T.dim, fontWeight: 400 }}>· {dep} · {emp.code}</span></div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 2 }}>{reasonLabel(c.reason)}, resigned {fmtDate(c.resignationDate)}</div>
          <div style={{ marginTop: 4 }}><Link href={`/dashboard/hrms/employees/${emp.id}`} style={{ color: T.info, fontWeight: 600, fontSize: 13 }}>Open employee profile</Link></div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Stage">
          {EXIT_STAGES.map((s) => <Badge key={s} tone={s === c.stage ? 'info' : 'neutral'} style={{ fontWeight: s === c.stage ? 700 : 500, opacity: s === c.stage ? 1 : 0.7 }}>{STAGE_LABEL[s]}{s === c.stage ? ' (current)' : ''}</Badge>)}
        </div>
      </div>

      {/* stage controls */}
      {!closed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.stage === 'notice' && <Button variant="primary" style={{ height: 44 }} onClick={() => setExitStage(c.id, 'clearance')}>Start clearance</Button>}
          {c.stage === 'clearance' && (
            <>
              <Button variant="primary" style={{ height: 44 }} disabled={pendingClear > 0} onClick={() => setExitStage(c.id, 'settlement')}>Move to settlement</Button>
              <Button style={{ height: 44 }} onClick={() => setExitStage(c.id, 'notice')}>Back to notice</Button>
              {pendingClear > 0 && <span style={{ fontSize: 12.5, color: T.dim }}>{pendingClear} {pendingClear === 1 ? 'clearance is' : 'clearances are'} pending.</span>}
            </>
          )}
          {c.stage === 'settlement' && <Button style={{ height: 44 }} onClick={() => setExitStage(c.id, 'clearance')}>Back to clearance</Button>}
        </div>
      )}

      {/* notice calculator */}
      <section aria-labelledby={`${uid}-notice`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 id={`${uid}-notice`} style={sectionTitle}>Notice period</h3>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <Field label="Last working date" htmlFor={`${uid}-lwd`} error={lwdError} hint={closed ? 'Locked while the exit is closed.' : undefined}>
            <Input id={`${uid}-lwd`} type="date" value={lwdDraft} disabled={closed} invalid={!!lwdError} onChange={(e) => onLwd(e.target.value)} />
          </Field>
          <CheckRow checked={c.noticeWaived} disabled={closed} onChange={(v) => setNoticeWaived(c.id, v)}>Notice is waived</CheckRow>
        </div>
        <KeyValue columns={3} rows={[
          { label: 'Notice required', value: c.noticeWaived ? 'Waived (0 days)' : days(emp.noticeDays) },
          { label: 'Planned notice (resignation to last day)', value: days(planned) },
          { label: `Served as of ${fmtDate(TODAY)}`, value: days(served) },
          { label: 'Remaining', value: closed ? '—' : days(remaining) },
          { label: 'Shortfall', value: <b style={{ color: shortfall > 0 ? T.red : T.ok }}>{days(shortfall)}</b> },
        ]} />
        {shortfall > 0 && <Note tone="warn">The last working date leaves {days(shortfall)} of notice unserved. Enter {days(planned)} as notice served in the full and final case and the recovery is calculated there.</Note>}
      </section>

      {/* clearance */}
      <section aria-labelledby={`${uid}-clr`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h3 id={`${uid}-clr`} style={sectionTitle}>Clearance by department</h3>
          <span style={{ fontSize: 12.5, color: T.dim }}>{c.clearance.length - pendingClear} of {c.clearance.length} done</span>
        </div>
        {c.clearance.length === 0 ? <EmptyState title="No clearance items" description="Add a department below." style={{ padding: '16px 8px' }} /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {c.clearance.map((i, n) => (
              <li key={i.id} style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 10, alignItems: 'center', borderTop: n ? `1px solid ${T.border}` : 0, padding: narrow ? '6px 0' : 0 }}>
                <CheckRow checked={i.done} onChange={(v) => setClearanceDone(c.id, i.id, v)} disabled={closed}><b>{i.department}</b></CheckRow>
                <CommitInput label={`Owner for ${i.department}`} value={i.owner} onCommit={(v) => patchClearance(c.id, i.id, { owner: v || 'Unassigned' })} />
                <CommitInput label={`Remarks for ${i.department}`} value={i.remarks ?? ''} placeholder="Remarks" onCommit={(v) => patchClearance(c.id, i.id, { remarks: v })} />
                <RemoveButton label={`Remove clearance: ${i.department}`} onClick={() => setRemoving({ kind: 'clearance', id: i.id, label: i.department })} />
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(150px, 1fr) minmax(150px, 1fr) auto', gap: 10, alignItems: 'start', marginTop: 8 }}>
            <Field error={deptErr}><Input aria-label="New clearance department" placeholder="Department, e.g. Admin" value={dept} invalid={!!deptErr} onChange={(e) => setDept(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addDept(); }} /></Field>
            <Input aria-label="New clearance owner" placeholder="Owner" value={deptOwner} onChange={(e) => setDeptOwner(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addDept(); }} />
            <Button onClick={addDept} style={{ height: 36 }}>Add department</Button>
          </div>
        )}
      </section>

      {/* assets */}
      <section aria-labelledby={`${uid}-ast`} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h3 id={`${uid}-ast`} style={sectionTitle}>Asset recovery</h3>
          <span style={{ fontSize: 12.5, color: T.dim }}>{c.assets.length - unreturned.length} of {c.assets.length} returned</span>
        </div>
        {c.assets.length === 0 ? <div style={{ fontSize: 13, color: T.dim, padding: '8px 0' }}>No assets recorded. Add what was issued to this employee.</div> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {c.assets.map((a, n) => (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: n ? `1px solid ${T.border}` : 0 }}>
                <CheckRow checked={a.returned} onChange={(v) => setAssetReturned(c.id, a.id, v)} disabled={closed}>{a.name}</CheckRow>
                <Badge tone={a.returned ? 'ok' : 'warn'}>{a.returned ? 'Returned' : 'Not returned'}</Badge>
                <RemoveButton label={`Remove asset: ${a.name}`} onClick={() => setRemoving({ kind: 'asset', id: a.id, label: a.name })} />
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(220px, 1fr) auto', gap: 10, alignItems: 'start', marginTop: 8 }}>
            <Field error={assetErr}><Input aria-label="New asset" placeholder="Asset issued, e.g. Laptop (serial ending 2291)" value={asset} invalid={!!assetErr} onChange={(e) => setAsset(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAssetItem(); }} /></Field>
            <Button onClick={addAssetItem} style={{ height: 36 }}>Add asset</Button>
          </div>
        )}
      </section>

      {/* exit interview */}
      <section style={{ borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
        <CheckRow checked={c.interviewDone} onChange={(v) => setInterviewDone(c.id, v)} disabled={closed}>Exit interview completed</CheckRow>
      </section>

      {/* settlement */}
      <section aria-labelledby={`${uid}-fnf`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 id={`${uid}-fnf`} style={sectionTitle}>Full and final settlement</h3>
        <KeyValue columns={3} rows={[
          { label: 'Settlement case', value: f ? <StatusBadge status={f.status === 'draft' ? 'draft' : f.status === 'approved' ? 'computed' : 'paid'} label={f.status.replace(/^./, (x) => x.toUpperCase())} /> : <Badge>Not started</Badge> },
          { label: 'Due by (two working days after the last day)', value: <span data-testid="fnf-due">{fmtDate(due)}</span> },
          { label: 'Clock', value: f?.status === 'paid' ? <Badge tone="ok" dot>Settled</Badge> : overdue ? <Badge tone="red" dot>Overdue by {days(diffDays(due, TODAY))}</Badge> : <Badge tone="info" dot>Due {relDays(diffDays(TODAY, due))}</Badge> },
          ...(fnfResult ? [{ label: 'Net settlement (sample rates)', value: inr(fnfResult.net) }] : []),
        ]} />
        <div>
          <Link href={`/dashboard/hrms/payroll?tab=fnf&employee=${emp.id}`} style={{ color: T.info, fontWeight: 600, fontSize: 13.5 }}>
            {f ? 'Open the settlement in payroll' : 'Create the settlement in payroll'}
          </Link>
        </div>
        <div style={{ fontSize: 12, color: T.mute }}>The two-working-day limit comes from the Code on Wages (as reported). Sundays are not counted. Confirm before relying on it.</div>
      </section>

      {/* close */}
      <section aria-labelledby={`${uid}-close`} style={{ border: `1px solid ${closed ? T.border : blockers.length ? T.border : T.ok}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 id={`${uid}-close`} style={sectionTitle}>{closed ? 'This exit is closed' : 'Close this exit'}</h3>
        {closed ? (
          <>
            <div style={{ fontSize: 13, color: T.dim }}>{fullName(emp)} is marked exited with last working date {fmtDate(c.lastWorkingDate)}.</div>
            <div><Button style={{ height: 44 }} onClick={() => setConfirm('reopen')}>Reopen exit</Button></div>
          </>
        ) : (
          <>
            <ul data-testid="close-checks" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checks.map((k) => (
                <li key={k.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}>
                  <Badge tone={k.ok ? 'ok' : 'red'} style={{ flex: '0 0 auto' }}>{k.ok ? 'Done' : 'Blocking'}</Badge>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{k.text}</span>
                </li>
              ))}
              {unreturned.length > 0 && (
                <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: T.dim }}>
                  <Badge tone="warn" style={{ flex: '0 0 auto' }}>Note</Badge>
                  <span>{unreturned.length} {unreturned.length === 1 ? 'asset is' : 'assets are'} not marked returned ({unreturned.map((a) => a.name).join(', ')}). This does not block closing.</span>
                </li>
              )}
            </ul>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" style={{ height: 44 }} disabled={blockers.length > 0} onClick={() => setConfirm('close')}>Close exit</Button>
              {blockers.length > 0 && <span style={{ fontSize: 12.5, color: T.dim }}>Available once the {blockers.length === 1 ? 'blocking item above is' : `${blockers.length} blocking items above are`} done.</span>}
            </div>
          </>
        )}
      </section>

      {confirm === 'close' && (
        <ConfirmDialog title="Close exit" confirmLabel="Close exit" onCancel={() => setConfirm(null)} onConfirm={doClose}>
          <span>Mark {fullName(emp)} as exited with last working date {fmtDate(c.lastWorkingDate)}?</span>
          <span style={{ color: T.dim }}>They leave active headcount and later pay runs. You can reopen the exit if this was a mistake.</span>
        </ConfirmDialog>
      )}
      {confirm === 'reopen' && (
        <ConfirmDialog title="Reopen exit" confirmLabel="Reopen" onCancel={() => setConfirm(null)}
          onConfirm={() => { reopenExit(c.id); setConfirm(null); toast.success(`${fullName(emp)} is back on notice.`); }}>
          <span>Put {fullName(emp)} back on notice and return this case to the settlement stage?</span>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog title={removing.kind === 'clearance' ? 'Remove clearance item' : 'Remove asset'} danger confirmLabel="Remove" onCancel={() => setRemoving(null)}
          onConfirm={() => { if (removing.kind === 'clearance') removeClearance(c.id, removing.id); else removeAsset(c.id, removing.id); setRemoving(null); }}>
          <span>Remove &ldquo;{removing.label}&rdquo; from this exit?</span>
        </ConfirmDialog>
      )}
    </Dialog>
  );
}

// ───────────────────────────── the tab ─────────────────────────────
export default function ExitsTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useOneShotParam('new', () => setStarting(true));
  const closeDetail = useMemo(() => () => setOpenId(null), []);
  const closeStart = useMemo(() => () => setStarting(false), []);

  const needle = q.trim().toLowerCase();
  const rows = db.exits.flatMap((c) => {
    const emp = db.employees.find((e) => e.id === c.employeeId);
    if (!emp) return [];
    if (reason && c.reason !== reason) return [];
    if (needle && !`${fullName(emp)} ${emp.code}`.toLowerCase().includes(needle)) return [];
    return [{ c, emp }];
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search exits by name or code" width={300} />
        <div style={{ width: 200 }}>
          <Select aria-label="Filter by reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">All reasons</option>
            {EXIT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </div>
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" onClick={() => setStarting(true)} style={{ height: 44 }}>Start exit</Button></div>
      </Toolbar>

      {db.exits.length === 0 ? (
        <Card><EmptyState title="No exits in progress" description="When someone resigns or is released, start an exit to track clearance and settlement."
          action={<Button variant="primary" onClick={() => setStarting(true)} style={{ height: 44 }}>Start exit</Button>} /></Card>
      ) : (
        <>
          {rows.length === 0 && <div role="status" style={{ fontSize: 13, color: T.dim }}>No exit matches these filters.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
            {EXIT_STAGES.map((stage) => {
              const col = rows.filter((r) => r.c.stage === stage).sort((a, b) => (a.c.lastWorkingDate < b.c.lastWorkingDate ? -1 : 1));
              return (
                <section key={stage} aria-label={`${STAGE_LABEL[stage]}, ${col.length} ${col.length === 1 ? 'case' : 'cases'}`}
                  style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: narrow ? undefined : 120 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.dim }}>
                    {STAGE_LABEL[stage]}
                    <span style={{ background: T.raised, borderRadius: 999, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{col.length}</span>
                  </h3>
                  {col.length === 0
                    ? <div style={{ fontSize: 12.5, color: T.mute, padding: '6px 2px' }}>No one here</div>
                    : col.map(({ c, emp }) => <CaseCard key={c.id} db={db} c={c} emp={emp} onOpen={() => setOpenId(c.id)} />)}
                </section>
              );
            })}
          </div>
        </>
      )}

      {openId && <ExitDetail db={db} exitId={openId} onClose={closeDetail} />}
      {starting && <StartExitModal db={db} onClose={closeStart} onStarted={() => setStarting(false)} />}
    </div>
  );
}
