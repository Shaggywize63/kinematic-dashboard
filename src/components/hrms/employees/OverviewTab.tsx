'use client';
// Overview: key facts, statutory completeness checklist that links to the fixing tab, reporting chain, and dates to watch.

import Link from 'next/link';
import { Badge, Card, CardTitle, KeyValue, ProgressBar, T, useIsCompact, type Tone } from '../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { diffDays, fmtDate, fullName, tenure } from '../../../lib/hrms/format';
import { checkPan } from '../../../lib/hrms/validators';
import {
  EMPLOYMENT_TYPES, MISSING_TAB, addMonthsToDate, directReports, labelOf, profileHref, relativeDays, reportingChain, statutorySummary, type DateNote, type TabKey,
} from './logic';

interface Item { label: string; ok: boolean; applicable: boolean; detail: string; tab: TabKey; missingKey: string }

function checklist(e: Employee, db: HrmsDb): { items: Item[]; pct: number } {
  const { comp, esiApplicable } = statutorySummary(db, e);
  const miss = (k: string) => comp.missing.includes(k);
  const mandatory = e.documents.filter((d) => d.mandatory);
  const received = mandatory.filter((d) => d.status === 'verified' || d.status === 'uploaded').length;
  const items: Item[] = [
    { label: 'PAN', missingKey: 'PAN', ok: !miss('PAN'), applicable: true, detail: e.pan && checkPan(e.pan).ok ? 'On file' : e.pan ? 'Not a valid PAN' : 'Missing', tab: 'statutory' },
    { label: 'Aadhaar', missingKey: 'Aadhaar', ok: !miss('Aadhaar'), applicable: true, detail: e.aadhaarLast4 ? (e.aadhaarVerified ? 'On file, verified' : 'On file, not verified') : 'Missing', tab: 'statutory' },
    { label: 'UAN', missingKey: 'UAN', ok: !miss('UAN'), applicable: e.pfMember, detail: !e.pfMember ? 'Not a PF member' : miss('UAN') ? 'Missing or invalid' : 'On file', tab: 'statutory' },
    { label: 'UAN Aadhaar-seeded', missingKey: 'UAN not Aadhaar-seeded', ok: !miss('UAN not Aadhaar-seeded'), applicable: e.pfMember, detail: !e.pfMember ? 'Not a PF member' : miss('UAN not Aadhaar-seeded') ? 'Not seeded: the PF return will skip this person' : 'Seeded', tab: 'statutory' },
    { label: 'ESIC number', missingKey: 'ESIC number', ok: !miss('ESIC number'), applicable: esiApplicable, detail: !esiApplicable ? 'ESI does not apply at the current gross' : miss('ESIC number') ? 'Missing, and ESI applies at the current gross' : 'On file', tab: 'statutory' },
    { label: 'Bank account', missingKey: 'Bank account', ok: !miss('Bank account'), applicable: true, detail: miss('Bank account') ? 'Missing or invalid' : 'On file', tab: 'statutory' },
    { label: 'Mandatory documents', missingKey: 'Mandatory documents', ok: !miss('Mandatory documents'), applicable: true, detail: `${received} of ${mandatory.length} received`, tab: 'documents' },
    { label: 'Salary structure and CTC', missingKey: 'Salary structure', ok: !miss('Salary structure'), applicable: true, detail: miss('Salary structure') ? 'Not set, so no payslip can be generated' : 'Set', tab: 'salary' },
  ];
  return { items, pct: comp.pct };
}

function dateNotes(e: Employee): DateNote[] {
  const notes: DateNote[] = [];
  const today = PREVIEW_TODAY;
  if (e.joinDate > today) notes.push({ tone: 'warn', text: `Joins on ${fmtDate(e.joinDate)} (${relativeDays(e.joinDate)}).` });
  if (e.probationMonths > 0 && e.joinDate <= today) {
    const end = addMonthsToDate(e.joinDate, e.probationMonths);
    if (e.confirmationDate && e.confirmationDate <= today) notes.push({ tone: 'ok', text: `Confirmed on ${fmtDate(e.confirmationDate)} after a ${e.probationMonths}-month probation.` });
    else if (end < today) notes.push({ tone: 'red', text: `Probation ended on ${fmtDate(end)} (${relativeDays(end)}) and there is no confirmation date. Confirm or extend.` });
    else if (diffDays(today, end) <= 30) notes.push({ tone: 'warn', text: `Probation ends on ${fmtDate(end)} (${relativeDays(end)}). Decide on confirmation.` });
    else notes.push({ tone: 'neutral', text: `On probation until ${fmtDate(end)} (${relativeDays(end)}).` });
  } else if (e.probationMonths > 0 && e.joinDate > today) {
    notes.push({ tone: 'neutral', text: `Probation of ${e.probationMonths} months, ending ${fmtDate(addMonthsToDate(e.joinDate, e.probationMonths))} if they join on time.` });
  }
  if (e.contractEndDate) {
    const n = diffDays(today, e.contractEndDate);
    if (n < 0) notes.push({ tone: 'red', text: `Contract ended on ${fmtDate(e.contractEndDate)} (${relativeDays(e.contractEndDate)}). Renew it or start the exit.` });
    else if (n <= 60) notes.push({ tone: 'warn', text: `Contract ends on ${fmtDate(e.contractEndDate)} (${relativeDays(e.contractEndDate)}). Renew or plan the exit.` });
    else notes.push({ tone: 'neutral', text: `Contract runs until ${fmtDate(e.contractEndDate)} (${relativeDays(e.contractEndDate)}).` });
  }
  if (e.lastWorkingDate) {
    if (e.status === 'exited') notes.push({ tone: 'neutral', text: `Left on ${fmtDate(e.lastWorkingDate)} (${relativeDays(e.lastWorkingDate)}). Full and final settlement is due within two working days.` });
    else notes.push({ tone: diffDays(today, e.lastWorkingDate) <= 30 ? 'warn' : 'neutral', text: `Last working day is ${fmtDate(e.lastWorkingDate)} (${relativeDays(e.lastWorkingDate)}). Notice period ${e.noticeDays} days.` });
  } else if (e.status !== 'exited') {
    notes.push({ tone: 'neutral', text: `Notice period is ${e.noticeDays} days.` });
  }
  return notes;
}

export default function OverviewTab({ e, db, go }: { e: Employee; db: HrmsDb; go: (t: TabKey) => void }) {
  const narrow = useIsCompact(900);
  const { items, pct } = checklist(e, db);
  const open = items.filter((i) => i.applicable && !i.ok).length;
  const chain = reportingChain(db, e);
  const reports = directReports(db, e);
  const loc = db.locations.find((l) => l.id === e.locationId);
  const manager = e.reportingToId ? db.employees.find((x) => x.id === e.reportingToId) : undefined;
  const t = e.joinDate > PREVIEW_TODAY ? null : tenure(e.joinDate, e.status === 'exited' && e.lastWorkingDate ? e.lastWorkingDate : PREVIEW_TODAY);
  const tenureText = !t ? `Joins ${relativeDays(e.joinDate)}` : t.totalMonths < 1 ? 'Less than a month' : [t.years ? `${t.years} ${t.years === 1 ? 'year' : 'years'}` : '', t.months ? `${t.months} ${t.months === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ');
  const notes = dateNotes(e);
  const tone = (n: DateNote['tone']): Tone => n;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Card>
          <CardTitle>Key facts</CardTitle>
          <KeyValue rows={[
            { label: 'Employee code', value: <span style={{ fontFamily: T.mono }}>{e.code}</span> },
            { label: 'Employment type', value: labelOf(EMPLOYMENT_TYPES, e.employmentType) },
            { label: 'Legal entity', value: db.entities.find((x) => x.id === e.entityId)?.name },
            { label: 'Location', value: loc ? `${loc.name}, ${loc.city}, ${loc.state}` : undefined },
            { label: 'Department', value: db.departments.find((x) => x.id === e.departmentId)?.name },
            { label: 'Designation', value: db.designations.find((x) => x.id === e.designationId)?.name },
            { label: 'Joined', value: `${fmtDate(e.joinDate)}` },
            { label: 'Tenure', value: tenureText },
            { label: 'Reports to', value: manager ? <Link href={profileHref(manager.id)} style={{ color: T.info, fontWeight: 600 }}>{fullName(manager)}</Link> : 'No manager set' },
            { label: 'Shift', value: db.shifts.find((x) => x.id === e.shiftId)?.name },
            { label: 'Email', value: <a href={`mailto:${e.email}`} style={{ color: T.info }}>{e.email}</a> },
            { label: 'Mobile', value: e.mobile },
          ]} />
        </Card>

        <Card>
          <CardTitle>Dates to watch</CardTitle>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map((n, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: T.text, lineHeight: 1.45 }}>
                <Badge tone={tone(n.tone)} dot style={{ marginTop: 1, flexShrink: 0 }}>{n.tone === 'red' ? 'Overdue' : n.tone === 'warn' ? 'Soon' : n.tone === 'ok' ? 'Done' : 'Info'}</Badge>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 10 }}>Counted from {fmtDate(PREVIEW_TODAY)}, the preview&apos;s today.</div>
        </Card>

        <Card>
          <CardTitle>Reporting line</CardTitle>
          {chain.length === 0 && reports.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.dim }}>No manager and no direct reports are set for this employee.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: T.mute, marginBottom: 6 }}>Chain of command (top first)</div>
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Reporting chain">
                  {[...chain].reverse().map((m, i) => (
                    <li key={m.id} style={{ paddingLeft: i * 18, fontSize: 14 }}>
                      <Link href={profileHref(m.id)} style={{ color: T.info, fontWeight: 600 }}>{fullName(m)}</Link>
                      <span style={{ color: T.mute }}> {db.designations.find((x) => x.id === m.designationId)?.name}</span>
                    </li>
                  ))}
                  <li style={{ paddingLeft: chain.length * 18, fontSize: 14, fontWeight: 700, color: T.text }}>{fullName(e)} <span style={{ fontWeight: 400, color: T.mute }}>(this employee)</span></li>
                </ol>
              </div>
              {reports.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: T.mute, marginBottom: 6 }}>Direct reports ({reports.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {reports.map((r) => <Link key={r.id} href={profileHref(r.id)} style={{ fontSize: 13, color: T.info, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: T.infoWash, textDecoration: 'none' }}>{fullName(r)}</Link>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle right={<span style={{ fontSize: 13, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>{pct}% complete</span>}>Statutory completeness</CardTitle>
        <ProgressBar pct={pct} tone={pct >= 100 ? 'ok' : pct >= 75 ? 'info' : pct >= 50 ? 'warn' : 'red'} height={8} />
        <div style={{ fontSize: 13, color: T.dim, margin: '10px 0 6px' }}>{open === 0 ? 'Everything that applies is on file.' : `${open} ${open === 1 ? 'item needs' : 'items need'} attention. Select one to open the tab that fixes it.`}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }} aria-label="Completeness checklist">
          {items.map((it) => {
            const needs = it.applicable && !it.ok;
            const tab = MISSING_TAB[it.missingKey] ?? it.tab;
            return (
              <li key={it.label} data-testid={`check-${it.missingKey}`} data-state={!it.applicable ? 'na' : it.ok ? 'ok' : 'missing'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <span aria-hidden style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: needs ? T.warnWash : T.okWash, color: needs ? T.warn : T.ok }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {needs ? <path d="M12 6v7M12 18h.01" /> : <path d="M5 12l5 5 9-10" />}
                  </svg>
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{it.label}</div>
                  <div style={{ fontSize: 12.5, color: needs ? T.warn : T.dim }}>{it.detail}</div>
                </div>
                {needs && (
                  <a href={profileHref(e.id, tab)} onClick={(ev) => { ev.preventDefault(); go(tab); }}
                    style={{ fontSize: 13, color: T.info, fontWeight: 600, whiteSpace: 'nowrap', padding: '8px 0', minHeight: 20 }}>
                    Fix in {tab === 'statutory' ? 'Statutory' : tab === 'documents' ? 'Documents' : 'Salary'}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
