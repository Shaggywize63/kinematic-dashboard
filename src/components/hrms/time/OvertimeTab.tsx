'use client';
// Overtime rule editor and a quarter-to-date table against the cap. The multiplier floor and the quarterly cap come
// from the Labour Codes figures in lib/hrms/rules.ts; payroll reads this same rule when it prices overtime.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmployeeCell, Note, ProgressBar, SearchBox, T, Toolbar, useIsCompact, type Col } from '../ui';
import { FormGrid, Segmented } from '../../ui';
import type { Employee, HrmsDb, OvertimeRule } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { LABOUR_CODES } from '../../../lib/hrms/rules';
import { fmtMonth } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { upsert } from '../../../lib/hrms/actions';
import { CheckField, SelectField, TextField, focusFirstInvalid, primaryStyle } from '../org/formKit';
import { EMPLOYMENT_TYPES, OT_FLAG_PCT, formToOvertime, latestMonths, otHoursOf, overtimeToForm, quarterLabel, quarterMonths, validateOvertime, type OvertimeForm } from './timeLogic';

const DIVISORS = [{ v: '26', l: '26 working days a month' }, { v: '30', l: '30 days a month' }, { v: 'calendar', l: 'Calendar days in the month' }];

export function OvertimeTab({ db }: { db: HrmsDb }) {
  const rule = db.overtimeRules[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rule
        ? <RuleEditor key={JSON.stringify(rule)} rule={rule} />
        : (
          <Card>
            <CardTitle>Overtime rule</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ color: T.dim, fontSize: 14 }}>No overtime rule exists, so payroll pays no overtime. Create the standard one and adjust it.</span>
              <Button variant="primary" style={primaryStyle} onClick={() => upsert('overtimeRules', { id: uid('ot'), name: 'Standard overtime', rateMultiplier: LABOUR_CODES.overtimeMultiplier, quarterlyCapHours: LABOUR_CODES.overtimeQuarterlyCapHours, requiresConsent: true, minMinutes: 30, rateDivisor: 26, womenNightConsent: true, appliesTo: ['permanent', 'contract', 'daily_wage', 'fixed_term'] })}>Create the standard rule</Button>
            </div>
          </Card>
        )}
      <HoursTable db={db} rule={rule} />
    </div>
  );
}

function RuleEditor({ rule }: { rule: OvertimeRule }) {
  const narrow = useIsCompact(800);
  const [f, setF] = useState<OvertimeForm>(overtimeToForm(rule));
  const [tried, setTried] = useState(false);
  const formId = 'overtime-form';
  const legendId = useId();
  const { errors, warnings } = validateOvertime(f);
  const dirty = JSON.stringify(f) !== JSON.stringify(overtimeToForm(rule));
  const set = <K extends keyof OvertimeForm>(k: K, v: OvertimeForm[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    upsert('overtimeRules', formToOvertime(f, rule.id));
    toast.success('Overtime rule saved');
  };

  return (
    <Card>
      <CardTitle right={<ConfidenceBadge level="reported" />}>Overtime rule</CardTitle>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Note tone="info">
          Under the Labour Codes overtime is paid at not less than <b>{LABOUR_CODES.overtimeMultiplier} times</b> the ordinary rate, and is capped at <b>{LABOUR_CODES.overtimeQuarterlyCapHours} hours a quarter</b>. These two figures are reported, not checked against the gazette.
        </Note>
        <FormGrid narrow={narrow} columns={3}>
          <TextField label="Rule name" required value={f.name} onChange={(v) => set('name', v)} error={errors.name} />
          <TextField label="Pay multiplier (times ordinary rate)" required type="number" step={0.25} min={0} value={f.rateMultiplier} onChange={(v) => set('rateMultiplier', v)} error={errors.rateMultiplier}
            hint={`Minimum ${LABOUR_CODES.overtimeMultiplier}x`} />
          <div>
            <TextField label="Quarterly cap (hours)" required type="number" min={1} value={f.quarterlyCapHours} onChange={(v) => set('quarterlyCapHours', v)} error={errors.quarterlyCapHours}
              hint={`Labour Codes limit ${LABOUR_CODES.overtimeQuarterlyCapHours} hours`} aria-describedby={warnings.quarterlyCapHours ? 'ot-cap-warning' : undefined} />
          </div>
          <TextField label="Ignore overtime below (minutes)" required type="number" min={0} max={240} value={f.minMinutes} onChange={(v) => set('minMinutes', v)} error={errors.minMinutes} hint="Short stretches are not paid" />
          <SelectField label="Hourly rate divisor" value={f.rateDivisor} onChange={(v) => set('rateDivisor', v)} hint="Monthly wages are divided by this, then by shift hours">
            {DIVISORS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
          </SelectField>
        </FormGrid>
        {warnings.quarterlyCapHours && <div id="ot-cap-warning" role="status"><Note tone="warn">{warnings.quarterlyCapHours}</Note></div>}

        <FormGrid narrow={narrow}>
          <CheckField label="Overtime needs the employee's consent" checked={f.requiresConsent} onChange={(v) => set('requiresConsent', v)} hint="Consent is recorded on the approval, not on this screen" />
          <CheckField label="Women on night shifts need consent" checked={f.womenNightConsent} onChange={(v) => set('womenNightConsent', v)} hint="Turns on the consent flag in the roster" />
        </FormGrid>

        <fieldset aria-labelledby={legendId} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <legend id={legendId} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, padding: 0, marginBottom: 6 }}>Applies to <span style={{ color: T.red }}>*</span></legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 22px' }}>
            {EMPLOYMENT_TYPES.map((t) => (
              <CheckField key={t.value} label={t.label} checked={f.appliesTo.includes(t.value)}
                onChange={(on) => set('appliesTo', on ? [...f.appliesTo, t.value] : f.appliesTo.filter((x) => x !== t.value))} />
            ))}
          </div>
          {errors.appliesTo && <div role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{errors.appliesTo}</div>}
        </fieldset>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary" type="submit" style={primaryStyle} disabled={!dirty}>Save rule</Button>
          <Button onClick={() => { setF(overtimeToForm(rule)); setTried(false); }} disabled={!dirty}>Discard changes</Button>
          {tried && Object.keys(errors).length > 0 && <span role="alert" style={{ fontSize: 13, color: T.red }}>Fix the highlighted field{Object.keys(errors).length === 1 ? '' : 's'} to save.</span>}
          {!dirty && <span style={{ fontSize: 12.5, color: T.mute }}>Saved. Payroll uses this rule for overtime pay.</span>}
        </div>
      </form>
    </Card>
  );
}

interface OtRow { id: string; emp: Employee; byMonth: Record<string, number>; qtd: number; pct: number; covered: boolean }

function HoursTable({ db, rule }: { db: HrmsDb; rule?: OvertimeRule }) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'with' | 'all'>('with');
  const months = latestMonths(db.attendance, 3);
  const nowMonth = PREVIEW_TODAY.slice(0, 7);
  const qMonths = quarterMonths(nowMonth).filter((m) => m <= nowMonth);
  const cap = rule?.quarterlyCapHours ?? LABOUR_CODES.overtimeQuarterlyCapHours;

  const all: OtRow[] = db.employees.map((emp) => {
    const byMonth: Record<string, number> = {};
    months.forEach((m) => { byMonth[m] = otHoursOf(db.attendance, emp.id, m); });
    const qtd = qMonths.reduce((t, m) => t + otHoursOf(db.attendance, emp.id, m), 0);
    return { id: emp.id, emp, byMonth, qtd, pct: cap ? (qtd / cap) * 100 : 0, covered: !!rule && rule.appliesTo.includes(emp.employmentType) };
  });
  const needle = q.trim().toLowerCase();
  const rows = all.filter((r) => {
    const hasAny = months.some((m) => (r.byMonth[m] ?? 0) > 0);
    if (scope === 'with' ? !hasAny : (r.emp.status === 'exited' || r.emp.status === 'onboarding') && !hasAny) return false;
    return !needle || `${r.emp.firstName} ${r.emp.lastName} ${r.emp.code}`.toLowerCase().includes(needle);
  });
  const flagged = rows.filter((r) => r.pct > OT_FLAG_PCT).length;

  const cols: Col<OtRow>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => r.emp.firstName.toLowerCase(), render: (r) => <EmployeeCell e={r.emp} href={false} sub={`${r.emp.code} · ${db.departments.find((d) => d.id === r.emp.departmentId)?.name ?? ''}`} /> },
    ...months.map((m): Col<OtRow> => ({
      key: m, label: fmtMonth(m), align: 'right', sortValue: (r) => r.byMonth[m] ?? 0,
      render: (r) => <span data-testid={`ot-${r.id}-${m}`} style={{ fontVariantNumeric: 'tabular-nums', color: (r.byMonth[m] ?? 0) ? T.text : T.mute }}>{r.byMonth[m] ?? 0} h</span>,
    })),
    { key: 'qtd', label: 'Quarter to date', align: 'right', sortValue: (r) => r.qtd, render: (r) => <b data-testid={`ot-qtd-${r.id}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.qtd} h</b> },
    {
      key: 'cap', label: `Of ${cap} h cap`, width: 220, sortValue: (r) => r.pct, render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} data-testid={`ot-cap-${r.id}`}>
          <div style={{ flex: 1, minWidth: 70 }}><ProgressBar pct={r.pct} tone={r.pct > 100 ? 'red' : r.pct > OT_FLAG_PCT ? 'warn' : 'ok'} /></div>
          <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>{Math.round(r.pct)}%</span>
          {r.pct > 100 ? <Badge tone="red">Over the cap</Badge> : r.pct > OT_FLAG_PCT ? <Badge tone="warn">Above {OT_FLAG_PCT}%</Badge> : null}
        </div>
      ),
    },
    {
      key: 'rule', label: 'Rule', sortValue: (r) => (r.covered ? 1 : 0), render: (r) => {
        const any = months.some((m) => (r.byMonth[m] ?? 0) > 0);
        return r.covered ? <Badge tone="ok">Covered</Badge> : <Badge tone={any ? 'warn' : 'neutral'}>{any ? 'Not covered, not paid' : 'Not covered'}</Badge>;
      },
    },
  ];

  const footer = (
    <tfoot>
      <tr>
        <td style={ftd}>Total, {rows.length} {rows.length === 1 ? 'person' : 'people'}</td>
        {months.map((m) => <td key={m} style={{ ...ftd, textAlign: 'right' }}>{rows.reduce((t, r) => t + (r.byMonth[m] ?? 0), 0)} h</td>)}
        <td style={{ ...ftd, textAlign: 'right' }}>{rows.reduce((t, r) => t + r.qtd, 0)} h</td>
        <td style={ftd} colSpan={2} />
      </tr>
    </tfoot>
  );

  return (
    <Card>
      <CardTitle right={flagged ? <Badge tone="warn">{flagged} above {OT_FLAG_PCT}% of the cap</Badge> : <Badge tone="ok">Nobody above {OT_FLAG_PCT}% of the cap</Badge>}>Overtime hours by person</CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: T.dim }}>
          Hours come from the attendance summary of the latest {months.length} months. Quarter to date is {quarterLabel(nowMonth)} so far, measured against the {cap} hour cap in the saved rule.
        </div>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search people" width={220} />
          <Segmented<'with' | 'all'> value={scope} onChange={setScope} options={[{ value: 'with', label: 'With overtime' }, { value: 'all', label: 'Everyone' }]} />
        </Toolbar>
        <DataTable columns={cols} rows={rows} minWidth={860} footer={footer} empty={scope === 'with' ? 'Nobody logged overtime in these months.' : 'No one matches this search.'} />
      </div>
    </Card>
  );
}

const ftd = { padding: '10px 14px', fontSize: 13, fontWeight: 600, color: T.text, borderTop: `1px solid ${T.borderStrong}`, background: T.panel } as const;
