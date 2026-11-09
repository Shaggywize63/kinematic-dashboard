'use client';
// POSH: the Internal Committee, an anonymised complaint register, the annual-report data and awareness training.
// Every confidential field is withheld on purpose. Names and details are never held in this preview.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, Modal, Note, ProgressBar, Stat, T, useIsCompact, type Col } from '../ui';
import { Field, Input, Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { diffDays, fmtDate, fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import {
  POSH_NATURE_LABEL, POSH_STATUS_LABEL, annualReport, headcount, icChecks, poshCounts, trainingCoverage,
} from '../../../lib/hrms/assist/policies';
import { addPoshSession, advancePoshCase, logPoshCase } from '../../../lib/hrms/assist/store';
import type { PoshCase, PoshNature, PoshState, PolicyState } from '../../../lib/hrms/assist/types';
import { Tiles } from './shared';

const YEAR = Number(PREVIEW_TODAY.slice(0, 4));
const statusTone = (s: PoshCase['status']) => (s === 'closed' ? 'ok' : s === 'received' ? 'info' : 'warn') as 'ok' | 'info' | 'warn';

function Locked() {
  return <span title="Complainant, respondent and details are withheld by design. Visible only to Internal Committee members in the live product." style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: T.mute, fontSize: 12.5 }}>
    <svg aria-hidden width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
    Withheld
  </span>;
}

export default function PoshTab({ db, state }: { db: HrmsDb; state: PolicyState }) {
  const narrow = useIsCompact(900);
  const posh: PoshState = state.posh;
  const [logging, setLogging] = useState(false);
  const [sessioning, setSessioning] = useState(false);
  const checks = icChecks(db, posh.committee, PREVIEW_TODAY);
  const people = headcount(db);
  const counts = poshCounts(posh.cases);
  const report = annualReport(posh.cases, posh.sessions, YEAR, PREVIEW_TODAY);
  const cover = trainingCoverage(db, posh.sessions, YEAR);
  const nameOf = (m: PoshState['committee']['members'][number]) => (m.role === 'external' ? m.name ?? 'External member' : fullName(db.employees.find((e) => e.id === m.employeeId) ?? { firstName: m.employeeId ?? '', lastName: '' }));
  const roleLabel = { presiding: 'Presiding officer', member: 'Member', external: 'External member' } as const;

  const caseCols: Col<PoshCase>[] = [
    { key: 'id', label: 'Case ID', render: (c) => <code style={{ fontFamily: T.mono, fontSize: 13 }}>{c.id}</code>, nowrap: true },
    { key: 'rec', label: 'Received', render: (c) => fmtDate(c.receivedOn).replace(/^\d+ /, ''), nowrap: true },
    { key: 'nat', label: 'Nature', render: (c) => POSH_NATURE_LABEL[c.nature], nowrap: true },
    { key: 'st', label: 'Status', render: (c) => <Badge tone={statusTone(c.status)} dot>{POSH_STATUS_LABEL[c.status]}</Badge>, nowrap: true },
    { key: 'age', label: 'Open for', align: 'right', render: (c) => (c.status === 'closed' ? `${diffDays(c.receivedOn, c.closedOn ?? PREVIEW_TODAY)} days (closed)` : `${diffDays(c.receivedOn, PREVIEW_TODAY)} days`), nowrap: true },
    { key: 'locked', label: 'Names and details', render: () => <Locked />, nowrap: true },
    { key: 'next', label: '', align: 'right', render: (c) => (c.status === 'closed' ? <span style={{ color: T.mute, fontSize: 12.5 }}>{c.outcome === 'action_taken' ? 'Action taken' : 'No action'}</span> : (
      <Button size="sm" onClick={() => { advancePoshCase(c.id); toast.success(`${c.id} moved on`); }} aria-label={`Move ${c.id} to the next stage`}>Next stage</Button>)), nowrap: true },
  ];

  return (
    <div data-testid="posh-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Note tone="warn">
        <b>Locked by design.</b> This page shows counts and categories only. Names, details and findings are never held here. In the live product they are visible only to Internal Committee members.
      </Note>

      <Card padding={16}>
        <CardTitle right={<ConfidenceBadge level="reported" />}>Internal Committee (IC)</CardTitle>
        <div data-testid="ic-requirement" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
          The Act is reported to require an Internal Committee at any office with <b>10 or more employees</b>. Meridian has <b>{people}</b>, so an IC is needed.
          <span style={{ color: T.dim }}> Reported, not checked against the Act&apos;s text. Please confirm with your legal advisor.</span>
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: narrow ? '1fr' : '1.1fr 1fr' }}>
          <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
            <table data-testid="ic-members" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
              <thead><tr>{['Role', 'Name', 'From'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, background: T.panel, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {posh.committee.members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}`, fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>{roleLabel[m.role]}</td>
                    <td style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}`, fontSize: 13.5 }}>{nameOf(m)}{m.org ? <div style={{ fontSize: 12, color: T.mute }}>{m.org}</div> : null}</td>
                    <td style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.dim, whiteSpace: 'nowrap' }}>{m.role === 'external' ? 'Outside the company' : db.departments.find((d) => d.id === db.employees.find((e) => e.id === m.employeeId)?.departmentId)?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.dim }}>Tenure: {fmtDate(posh.committee.constitutedOn)} to {fmtDate(posh.committee.tenureEnds)}</div>
          </div>
          <ul data-testid="ic-checks" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checks.map((c) => (
              <li key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45 }}>
                <Badge tone={c.ok ? 'ok' : 'red'}>{c.ok ? 'OK' : 'Check'}</Badge>
                <span><span style={{ color: T.text }}>{c.label}</span><br /><span style={{ color: T.mute, fontSize: 12.5 }}>{c.detail}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ marginTop: 12 }}><Note>Advisor note: the points checked here are what the Act is reported to ask of an IC. They are a prompt for your advisor, not a legal opinion, and they do not replace one.</Note></div>
      </Card>

      <Card padding={16}>
        <CardTitle right={<Button variant="primary" onClick={() => setLogging(true)} data-testid="posh-log-open">Log a case</Button>}>Complaint register (anonymised)</CardTitle>
        <Tiles min={140}>
          {counts.byStatus.map((s) => <Stat key={s.key} label={s.label} value={<span data-testid={`posh-count-${s.key}`}>{s.count}</span>} />)}
        </Tiles>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }} data-testid="posh-nature">
          {counts.byNature.map((n) => <Badge key={n.key} tone={n.count ? 'info' : 'neutral'}>{n.label}: {n.count}</Badge>)}
        </div>
        <div data-testid="posh-register"><DataTable columns={caseCols} rows={posh.cases} minWidth={760} empty="No cases in the register." /></div>
        <div style={{ marginTop: 10 }}>
          <Note>Only the case ID, the month received, the category and the stage are recorded. “Next stage” stands in for the Internal Committee, which is the only group that would move a case in the live product. Time limits for each stage are set by the Act. Confirm them with your advisor.</Note>
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>Annual report data ({YEAR})</CardTitle>
        <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
          <table data-testid="posh-annual" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <tbody>
              {[
                ['Cases filed in the year', report.filed, 'filed', null],
                ['Cases disposed of', report.disposed, 'disposed', null],
                ['Cases pending at year end', report.pendingAtYearEnd, 'pending', null],
                ['Pending for more than 90 days', report.pendingOver90, 'over90', 'indicative'],
                ['Awareness sessions held', report.sessions, 'sessions', null],
              ].map(([label, value, key, conf]) => (
                <tr key={String(key)}>
                  <td style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}`, fontSize: 14 }}>{label}{conf ? <> <ConfidenceBadge level={conf as 'indicative'} /></> : null}</td>
                  <td data-testid={`posh-report-${key}`} style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}`, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontFamily: T.heading }}>{value as number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}><Note>Worked out from the register and the sessions below. The report format, the 90-day line and where to file are for your advisor to confirm.</Note></div>
      </Card>

      <Card padding={16}>
        <CardTitle right={<Button onClick={() => setSessioning(true)} data-testid="posh-session-open">Record a session</Button>}>Awareness training coverage ({YEAR})</CardTitle>
        <div data-testid="posh-coverage" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 14 }}><b data-testid="posh-trained">{cover.trained}</b> of <b>{cover.total}</b> people trained ({Math.round(cover.pct)}%)</div>
          <ProgressBar pct={cover.pct} tone={cover.pct >= 90 ? 'ok' : cover.pct >= 70 ? 'warn' : 'red'} />
        </div>
        <div style={{ fontSize: 13, color: T.dim, marginBottom: 6 }}>Sessions: {posh.sessions.filter((s) => s.date.startsWith(String(YEAR))).map((s) => `${fmtDate(s.date)}, ${s.title} (${s.attendees.length})`).join('; ') || 'none this year'}</div>
        {cover.pending.length ? (
          <>
            <div style={{ fontWeight: 600, fontSize: 13.5, margin: '10px 0 6px' }}>Not yet trained ({cover.pending.length})</div>
            <ul data-testid="posh-pending" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cover.pending.map((e) => <li key={e.id}><Badge tone="warn">{fullName(e)}</Badge></li>)}
            </ul>
          </>
        ) : <Badge tone="ok">Everyone is trained</Badge>}
      </Card>

      {logging && <LogCaseModal onClose={() => setLogging(false)} />}
      {sessioning && <SessionModal db={db} pending={cover.pending.map((e) => e.id)} onClose={() => setSessioning(false)} />}
    </div>
  );
}

function LogCaseModal({ onClose }: { onClose: () => void }) {
  const [nature, setNature] = useState<PoshNature>('verbal');
  const [date, setDate] = useState(PREVIEW_TODAY);
  const err = date > PREVIEW_TODAY ? 'The date cannot be in the future.' : !date ? 'Pick a date.' : undefined;
  return (
    <Modal title="Log a case in the register" onClose={onClose} width={480}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="posh-log-save" disabled={!!err} title={err} onClick={() => { const id = logPoshCase(nature, date); toast.success(`${id} logged`); onClose(); }}>Log case</Button></>}>
      <Note tone="warn">Only the category and the date are recorded. Do not type names or details anywhere in this preview.</Note>
      <Field label="Nature of the complaint" htmlFor="posh-nature">
        <Select id="posh-nature" value={nature} onChange={(e) => setNature(e.target.value as PoshNature)}>
          {(Object.keys(POSH_NATURE_LABEL) as PoshNature[]).map((k) => <option key={k} value={k}>{POSH_NATURE_LABEL[k]}</option>)}
        </Select>
      </Field>
      <Field label="Date received" htmlFor="posh-date" error={err}><Input id="posh-date" type="date" max={PREVIEW_TODAY} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!err} /></Field>
    </Modal>
  );
}

function SessionModal({ db, pending, onClose }: { db: HrmsDb; pending: string[]; onClose: () => void }) {
  const [title, setTitle] = useState('Awareness session');
  const [date, setDate] = useState(PREVIEW_TODAY);
  const [mode, setMode] = useState<'in_person' | 'online'>('online');
  const [who, setWho] = useState<Set<string>>(new Set(pending));
  const live = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const errs: Record<string, string> = {};
  if (title.trim().length < 3) errs.title = 'Give the session a name.';
  if (date > PREVIEW_TODAY) errs.date = 'Record a session after it has happened.';
  if (!who.size) errs.who = 'Pick at least one person who attended.';
  const toggle = (id: string) => setWho((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal title="Record an awareness session" onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="posh-session-save" disabled={!!Object.keys(errs).length} title={Object.values(errs)[0]} onClick={() => { addPoshSession({ title: title.trim(), date, mode, attendees: [...who] }); toast.success('Session recorded'); onClose(); }}>Save session</Button></>}>
      <Field label="Session name" htmlFor="ps-title" error={errs.title}><Input id="ps-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errs.title} /></Field>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
        <Field label="Date held" htmlFor="ps-date" error={errs.date}><Input id="ps-date" type="date" max={PREVIEW_TODAY} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errs.date} /></Field>
        <Field label="How" htmlFor="ps-mode"><Select id="ps-mode" value={mode} onChange={(e) => setMode(e.target.value as 'online' | 'in_person')}><option value="online">Online</option><option value="in_person">In person</option></Select></Field>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6, padding: 0 }}>Who attended ({who.size} picked; people not yet trained are picked for you)</legend>
        <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', maxHeight: 220, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 8 }}>
          {live.map((e) => (
            <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, cursor: 'pointer', minHeight: 28 }}>
              <input type="checkbox" checked={who.has(e.id)} onChange={() => toggle(e.id)} style={{ width: 16, height: 16 }} /> {fullName(e)}
            </label>
          ))}
        </div>
        {errs.who && <div role="alert" style={{ color: T.red, fontSize: 12, marginTop: 4 }}>{errs.who}</div>}
      </fieldset>
    </Modal>
  );
}
