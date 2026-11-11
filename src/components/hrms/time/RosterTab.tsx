'use client';
// Weekly roster: employees down the side, Monday to Sunday across. Each cell is a shift or a weekly off, saved the
// moment it changes. Rows and days are checked against the working-time rules and flagged in words, not just colour.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, ConfidenceBadge, EmployeeCell, EmptyState, Note, SearchBox, Stat, StatGrid, Toolbar, T } from '../ui';
import { Select } from '../../ui';
import type { Employee, HrmsDb, Id, ISODate, RosterCell, RosterRow, Shift } from '../../../lib/hrms/types';
import { addDays } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { addToRoster, copyRosterFromPreviousWeek, setRosterCell } from '../../../lib/hrms/orgActions';
import { whenSynced } from '../../../lib/hrms/live/store';
import { ConfirmDialog } from '../org/Confirm';
import { primaryStyle } from '../org/formKit';
import { DAYS, DAYS_LONG, MAX_CONSECUTIVE_DAYS, MAX_WEEKLY_HOURS, analyseRow, dayCoverage, dayShort, durationText, fmtWeek, mondayOf, paidMinutes, weekDates, type RowAnalysis } from './timeLogic';

interface Entry { emp: Employee; row: RosterRow; analysis: RowAnalysis }

const tint = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}26` : T.raised);

export function RosterTab({ db }: { db: HrmsDb }) {
  const thisWeek = mondayOf(PREVIEW_TODAY);
  const [weekStart, setWeekStart] = useState<ISODate>(thisWeek);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [loc, setLoc] = useState('all');
  const [editing, setEditing] = useState<{ employeeId: Id; day: number } | null>(null);
  const [confirmCopy, setConfirmCopy] = useState<number | null>(null);

  const shiftById = useMemo(() => new Map<Id, Shift>(db.shifts.map((s) => [s.id, s])), [db.shifts]);
  const womenNight = db.overtimeRules.some((r) => r.womenNightConsent);
  const rosterable = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');
  const dates = weekDates(weekStart);
  const prevWeek = addDays(weekStart, -7);
  const weekRows = db.roster.filter((r) => r.weekStart === weekStart);
  const prevRows = db.roster.filter((r) => r.weekStart === prevWeek);

  const entries: Entry[] = weekRows.flatMap((row): Entry[] => {
    const emp = rosterable.find((e) => e.id === row.employeeId);
    if (!emp) return [];
    const prev = prevRows.find((p) => p.employeeId === row.employeeId);
    return [{ emp, row, analysis: analyseRow(row, prev, emp, shiftById, womenNight) }];
  }).sort((a, b) => a.emp.firstName.localeCompare(b.emp.firstName));

  const needle = q.trim().toLowerCase();
  const shown = entries.filter(({ emp }) => {
    if (dept !== 'all' && emp.departmentId !== dept) return false;
    if (loc !== 'all' && emp.locationId !== loc) return false;
    return !needle || `${emp.firstName} ${emp.lastName} ${emp.code}`.toLowerCase().includes(needle);
  });
  const missing = rosterable.filter((e) => !weekRows.some((r) => r.employeeId === e.id));
  const withWarnings = entries.filter((x) => x.analysis.warnings.length).length;
  const consentDays = entries.reduce((t, x) => t + x.analysis.consentDays.length, 0);
  const offsSet = entries.reduce((t, x) => t + x.row.days.filter((d) => d === 'off').length, 0);

  const doCopy = () => {
    const n = copyRosterFromPreviousWeek(weekStart);
    // On live data the success message waits until the per-row PUTs reach the server; in sample mode it shows at once.
    whenSynced((ok) => { if (ok) toast.success(`Copied ${n} roster row${n === 1 ? '' : 's'} from last week`); });
    setConfirmCopy(null);
  };
  const askCopy = () => {
    const overwrite = prevRows.filter((src) => weekRows.some((r) => r.employeeId === src.employeeId)).length;
    if (overwrite > 0) setConfirmCopy(overwrite); else doCopy();
  };
  const dayName = (i: number) => `${DAYS_LONG[i]} ${dayShort(dates[i]!)}`;

  const choose = (emp: Employee, i: number, value: string) => {
    setRosterCell(emp.id, weekStart, i, value as RosterCell);
    setEditing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <Button aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>&lsaquo; Previous</Button>
        <div data-testid="week-label" aria-live="polite" style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 15, minWidth: 170, textAlign: 'center' }}>{fmtWeek(weekStart)}</div>
        <Button aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next &rsaquo;</Button>
        <Button variant="ghost" onClick={() => setWeekStart(thisWeek)} disabled={weekStart === thisWeek}>This week</Button>
        <div style={{ flex: 1 }} />
        <Button onClick={askCopy} disabled={prevRows.length === 0} title={prevRows.length === 0 ? 'Last week has no roster to copy' : `Copy ${fmtWeek(prevWeek)}`}>Copy last week</Button>
        {missing.length > 0 && entries.length > 0 && (
          <Button variant="primary" style={primaryStyle} onClick={() => { const n = addToRoster(weekStart, missing.map((e) => e.id)); whenSynced((ok) => { if (ok) toast.success(`Added ${n} ${n === 1 ? 'person' : 'people'} to this week`); }); }}>
            Add {missing.length} not on this week
          </Button>
        )}
      </Toolbar>

      <StatGrid min={170}>
        <Stat label="On this week's roster" value={entries.length} hint={`${rosterable.length} active or on notice`} />
        <Stat label="Weekly offs set" value={offsSet} hint="across all rostered people" />
        <Stat label="People with a rule warning" value={withWarnings} tone={withWarnings ? 'warn' : 'ok'} hint={withWarnings ? 'Shown under each name' : 'Every row passes'} />
        <Stat label="Night shifts needing consent" value={womenNight ? consentDays : 'Rule off'} tone={consentDays ? 'warn' : undefined} hint={womenNight ? 'Women on night shifts, days this week' : 'Turn it on under Overtime'} />
      </StatGrid>

      {entries.length === 0 ? (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
          <EmptyState title={`Nobody is rostered for ${fmtWeek(weekStart)}`}
            description={prevRows.length ? 'Copy last week to start from the same pattern, or give everyone their default shift with Sunday off.' : 'Give everyone their default shift with Sunday off, then adjust the cells.'}
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button onClick={askCopy} disabled={prevRows.length === 0}>Copy last week</Button>
              <Button variant="primary" style={primaryStyle} onClick={() => { const n = addToRoster(weekStart, rosterable.map((e) => e.id)); whenSynced((ok) => { if (ok) toast.success(`Created ${n} roster rows`); }); }}>Create from default shifts</Button>
            </div>} />
        </div>
      ) : (
        <>
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Search people" width={220} />
            <Select aria-label="Filter by department" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 190 }}>
              <option value="all">All departments</option>
              {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select aria-label="Filter by location" value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: 200 }}>
              <option value="all">All locations</option>
              {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <span style={{ fontSize: 12.5, color: T.mute }}>Click a cell to change it. Changes save at once.</span>
          </Toolbar>

          <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
            <table data-testid="roster-grid" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 900 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', minWidth: 210 }}>Employee and rule checks</th>
                  {dates.map((d, i) => (
                    <th key={d} scope="col" style={{ ...th, textAlign: 'center', minWidth: 86, padding: '10px 4px' }}>
                      <div>{DAYS[i]}</div>
                      <div style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: d === PREVIEW_TODAY ? T.red : T.mute }}>{dayShort(d)}{d === PREVIEW_TODAY ? ' (today)' : ''}</div>
                    </th>
                  ))}
                  <th scope="col" style={{ ...th, textAlign: 'right', minWidth: 64 }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>Nobody on this week&apos;s roster matches the filters.</td></tr>}
                {shown.map(({ emp, row, analysis }) => (
                  <tr key={emp.id} data-testid={`roster-row-${emp.id}`}>
                    <th scope="row" style={{ ...td, ...plain, position: 'sticky', left: 0, zIndex: 1, background: T.card, textAlign: 'left', verticalAlign: 'top' }}>
                      <EmployeeCell e={emp} href={false} />
                      {analysis.warnings.length > 0 && (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', marginTop: 8 }}>
                          {analysis.warnings.map((w) => <Badge key={w.id} tone="warn" style={{ height: 'auto', minHeight: 22, whiteSpace: 'normal', padding: '2px 8px', textAlign: 'left' }}><span data-testid={`warn-${emp.id}-${w.id}`}>{w.text}</span></Badge>)}
                        </span>
                      )}
                    </th>
                    {row.days.map((cell, i) => {
                      const shift = cell === 'off' ? undefined : shiftById.get(cell);
                      const consent = analysis.consentDays.includes(i);
                      const isEditing = editing?.employeeId === emp.id && editing.day === i;
                      const label = `${emp.firstName} ${emp.lastName}, ${dayName(i)}`;
                      return (
                        <td key={i} style={{ ...td, padding: 4, textAlign: 'center' }}>
                          {isEditing ? (
                            <select autoFocus aria-label={`Shift for ${label}`} value={cell} className="km-input"
                              onChange={(e) => choose(emp, i, e.target.value)} onBlur={() => setEditing(null)}
                              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                              style={{ width: '100%', height: 36, borderRadius: T.radius.sm, border: `1px solid ${T.borderStrong}`, background: T.field, color: T.text, fontFamily: 'inherit', fontSize: 12.5 }}>
                              <option value="off">Weekly off</option>
                              {db.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start} to {s.end})</option>)}
                              {cell !== 'off' && !shift && <option value={cell}>Unknown shift</option>}
                            </select>
                          ) : (
                            <button type="button" data-testid={`cell-${emp.id}-${i}`} onClick={() => setEditing({ employeeId: emp.id, day: i })}
                              aria-label={`${label}: ${cell === 'off' ? 'weekly off' : shift ? `${shift.name} shift ${shift.start} to ${shift.end}` : 'unknown shift'}${consent ? ', consent needed' : ''}. Change`}
                              title={shift ? `${shift.name}, ${shift.start} to ${shift.end}, ${durationText(paidMinutes(shift))} paid` : cell === 'off' ? 'Weekly off' : 'Unknown shift'}
                              style={{
                                width: '100%', minHeight: 40, padding: '4px 6px', borderRadius: T.radius.sm, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: shift ? T.text : T.dim,
                                background: shift ? tint(shift.color) : T.raised, border: `1px solid ${T.border}`, borderLeft: `4px solid ${shift ? shift.color : T.rule}`,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                              }}>
                              <span>{cell === 'off' ? 'Off' : shift ? shift.name : 'Unknown'}</span>
                              {consent && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.warn, background: T.warnWash, borderRadius: 4, padding: '0 4px' }}>Consent needed</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: analysis.hours > MAX_WEEKLY_HOURS ? T.red : T.text, fontWeight: analysis.hours > MAX_WEEKLY_HOURS ? 700 : 400 }}>{analysis.hours} h</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ ...td, ...plain, position: 'sticky', left: 0, zIndex: 1, background: T.panel, textAlign: 'left', fontSize: 12.5, color: T.dim }}>On duty / off, and consent flags (shown rows)</th>
                  {dates.map((d, i) => {
                    const c = dayCoverage(shown.map((s) => s.row), i);
                    const consent = shown.filter((s) => s.analysis.consentDays.includes(i)).length;
                    return (
                      <td key={d} data-testid={`coverage-day-${i}`} style={{ ...td, background: T.panel, textAlign: 'center', fontSize: 12.5, padding: '8px 4px' }}>
                        <div>{shown.length > 0 && c.working === 0 ? <span style={{ color: T.mute }}>None on duty</span> : <><b style={{ fontVariantNumeric: 'tabular-nums' }}>{c.working}</b> <span style={{ color: T.mute }}>/ {c.off} off</span></>}</div>
                        {consent > 0 && <div style={{ marginTop: 4 }}><Badge tone="warn" style={{ height: 'auto', minHeight: 20, whiteSpace: 'normal', padding: '1px 6px' }}>{consent} need{consent === 1 ? 's' : ''} consent</Badge></div>}
                      </td>
                    );
                  })}
                  <td style={{ ...td, background: T.panel }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Legend">
        <span style={{ fontSize: 12.5, color: T.mute }}>Legend</span>
        {db.shifts.map((s) => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim, border: `1px solid ${T.border}`, borderLeft: `4px solid ${s.color}`, background: tint(s.color), borderRadius: T.radius.sm, padding: '3px 8px' }}>
            <b style={{ color: T.text }}>{s.name}</b> {s.start} to {s.end}{s.isNight ? ', night' : ''}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim, border: `1px solid ${T.border}`, borderLeft: `4px solid ${T.rule}`, background: T.raised, borderRadius: T.radius.sm, padding: '3px 8px' }}><b style={{ color: T.text }}>Off</b> weekly off</span>
      </div>

      <Note tone="info">
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Checks: a weekly off in every week, no more than {MAX_CONSECUTIVE_DAYS} working days in a row (last week&apos;s tail counts), and no more than {MAX_WEEKLY_HOURS} scheduled hours a week
            {womenNight ? '; women on night shifts are marked "consent needed" because the overtime rule asks for it' : ''}.</span>
          <ConfidenceBadge level="reported" />
        </span>
        <div style={{ marginTop: 4 }}>Hours are the paid duration of each shift. The preview cannot see consent records, so the flag stays until you confirm outside this screen.</div>
      </Note>

      {confirmCopy != null && (
        <ConfirmDialog title="Replace this week's roster rows" confirmLabel="Copy and replace" onCancel={() => setConfirmCopy(null)} onConfirm={doCopy}>
          {fmtWeek(weekStart)} already has roster rows for {confirmCopy} of the people on last week&apos;s roster ({fmtWeek(prevWeek)}). Copying replaces those {confirmCopy} row{confirmCopy === 1 ? '' : 's'} with last week&apos;s pattern.
        </ConfirmDialog>
      )}
    </div>
  );
}

const th = { padding: '10px 10px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', background: T.panel } as const;
const plain = { textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 400 } as const;
const td = { padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: T.text, verticalAlign: 'middle' } as const;
