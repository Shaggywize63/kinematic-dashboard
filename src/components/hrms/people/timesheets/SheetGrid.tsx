'use client';
// One week of hours: projects as rows, Monday to Sunday as columns, daily and weekly totals, and the checks that apply.
// Editable while the week is a draft or has been returned; read-only once submitted or approved.

import { useState } from 'react';
import { Button, T } from '../../ui';
import { Select } from '../../../ui';
import { addDays, fmtDate } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { DAY_LABELS, dayTotals, lineTotal, sheetTotal, weekDates } from '../../../../lib/hrms/people/timesheetEngine';
import type { Project, Sheet, TimesheetPolicy } from '../../../../lib/hrms/people/types';
import { Muted, ROW_TH } from '../shared';

const cellInput = (bad: boolean, disabled: boolean) => ({
  width: 62, height: 34, boxSizing: 'border-box' as const, textAlign: 'center' as const, borderRadius: T.radius.sm, fontFamily: 'inherit', fontSize: 14,
  border: `1px solid ${bad ? T.red : T.border}`, background: disabled ? T.raised : T.field, color: T.text, fontVariantNumeric: 'tabular-nums' as const,
  boxShadow: bad ? `0 0 0 1px ${T.red}` : 'none',
});

export default function SheetGrid({ sheet, weekStart, projects, policy, editable, onSet, onAddRow, onRemoveRow, rowError }: {
  sheet: Pick<Sheet, 'lines'>; weekStart: string; projects: Project[]; policy: TimesheetPolicy; editable: boolean;
  onSet?: (projectId: string, day: number, hours: number) => void;
  onAddRow?: (projectId: string) => void;
  onRemoveRow?: (projectId: string) => void;
  rowError?: string | null;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState('');
  const dates = weekDates(weekStart);
  const days = dayTotals(sheet);
  const total = sheetTotal(sheet);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const free = projects.filter((p) => !sheet.lines.some((l) => l.projectId === p.id));
  const th = { padding: '8px 4px', fontSize: 11.5, fontWeight: 600, color: T.dim, textAlign: 'center' as const, borderBottom: `1px solid ${T.border}`, background: T.panel, whiteSpace: 'nowrap' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div data-testid="sheet-grid" style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: 'left', padding: '8px 12px', minWidth: 220 }}>Project</th>
              {dates.map((d, i) => <th key={d} scope="col" style={{ ...th, color: i >= 5 ? T.mute : T.dim }}><div>{DAY_LABELS[i]}</div><div style={{ fontWeight: 400 }}>{fmtDate(d).replace(/ \d{4}$/, '')}</div></th>)}
              <th scope="col" style={{ ...th, minWidth: 64 }}>Total</th>
              {editable && <th scope="col" aria-label="Remove row" style={{ ...th, width: 56 }} />}
            </tr>
          </thead>
          <tbody>
            {sheet.lines.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>No projects on this week yet. {editable ? 'Add a project below to start entering hours.' : ''}</td></tr>
            )}
            {sheet.lines.map((l) => {
              const p = byId.get(l.projectId);
              return (
                <tr key={l.projectId} data-testid={`row-${l.projectId}`}>
                  <th scope="row" style={{ ...ROW_TH, position: 'sticky', left: 0, zIndex: 1, background: T.card, textAlign: 'left', padding: '6px 12px', borderTop: `1px solid ${T.border}`, fontWeight: 500 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{p?.name ?? l.projectId}</div>
                    <div style={{ fontSize: 11.5, color: T.mute }}>{p ? `${p.client} · ${p.billable ? 'Billable' : 'Non-billable'}` : ''}</div>
                  </th>
                  {l.hours.map((h, d) => {
                    const key = `${l.projectId}|${d}`;
                    const future = dates[d]! > PREVIEW_TODAY;
                    const disabled = !editable || future;
                    const bad = !Number.isFinite(h) || h < 0 || days[d]! > policy.maxPerDay;
                    const shown = drafts[key] ?? (h > 0 ? String(h) : '');
                    return (
                      <td key={d} style={{ borderTop: `1px solid ${T.border}`, padding: 3, textAlign: 'center' }}>
                        <input type="number" inputMode="decimal" step={0.25} min={0} max={24} data-testid={`h-${l.projectId}-${d}`}
                          aria-label={`${p?.name ?? l.projectId}, ${DAY_LABELS[d]} ${fmtDate(dates[d])}`}
                          title={future ? 'This day has not happened yet' : undefined}
                          value={shown} disabled={disabled} style={cellInput(bad, disabled)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setDrafts((x) => ({ ...x, [key]: raw }));
                            const n = raw === '' ? 0 : Number(raw);
                            if (Number.isFinite(n)) onSet?.(l.projectId, d, n);
                          }}
                          onBlur={() => setDrafts((x) => { const n = { ...x }; delete n[key]; return n; })} />
                      </td>
                    );
                  })}
                  <td data-testid={`rowtotal-${l.projectId}`} style={{ borderTop: `1px solid ${T.border}`, textAlign: 'center', fontWeight: 600, fontSize: 13.5, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{lineTotal(l)}</td>
                  {editable && (
                    <td style={{ borderTop: `1px solid ${T.border}`, padding: 3, textAlign: 'center' }}>
                      <Button size="sm" variant="ghost" aria-label={`Remove ${p?.name ?? l.projectId}`} onClick={() => onRemoveRow?.(l.projectId)}>×</Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" style={{ ...ROW_TH, position: 'sticky', left: 0, zIndex: 1, background: T.card, textAlign: 'left', padding: '8px 12px', borderTop: `2px solid ${T.border}`, fontSize: 13, color: T.dim }}>Daily total</th>
              {days.map((t, d) => (
                <td key={d} data-testid={`daytotal-${d}`} style={{ textAlign: 'center', borderTop: `2px solid ${T.border}`, fontWeight: 600, fontSize: 13.5, color: t > policy.maxPerDay ? T.red : T.text, fontVariantNumeric: 'tabular-nums' }}>{t || '–'}</td>
              ))}
              <td data-testid="week-total" style={{ textAlign: 'center', borderTop: `2px solid ${T.border}`, fontWeight: 700, fontSize: 14, color: total > policy.weeklyCap ? T.warn : T.text, fontVariantNumeric: 'tabular-nums' }}>{total}</td>
              {editable && <td style={{ borderTop: `2px solid ${T.border}` }} />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select aria-label="Add a project" value={adding} onChange={(e) => setAdding(e.target.value)} style={{ width: 280 }}>
            <option value="">Add a project row…</option>
            {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button size="sm" disabled={!adding} onClick={() => { onAddRow?.(adding); setAdding(''); }}>Add row</Button>
          <Muted>To remove a row, set its hours to 0 first.</Muted>
        </div>
      )}
      {rowError && <div role="alert" data-testid="row-error" style={{ fontSize: 13, color: T.red }}>{rowError}</div>}
      {editable && <Muted>Days after {fmtDate(PREVIEW_TODAY)} cannot be filled yet. Steps of 0.25 hour. Next week starts {fmtDate(addDays(weekStart, 7))}.</Muted>}
    </div>
  );
}
