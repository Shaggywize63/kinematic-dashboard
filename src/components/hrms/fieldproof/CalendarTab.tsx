'use client';
// Team calendar: the eight field people against the days of a month. Each cell says what attendance shows, with a
// letter as well as a colour. The grid is a real grid for keyboards: arrow keys move, Enter opens the day.

import { useRef, useState, type KeyboardEvent } from 'react';
import { Card, CardTitle, T } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import type { FieldEvidence } from '../../../lib/hrms/field/types';
import type { FieldState } from '../../../lib/hrms/field/store';
import { DAY_STATUS_GLYPH, DAY_STATUS_LABEL, dayStatus, monthCounts, monthDates, type DayStatus } from '../../../lib/hrms/fieldproof/logic';
import { weekdayOf } from '../../../lib/hrms/field/evidence';

const MONTHS = [{ key: '2026-10', label: 'October 2026' }, { key: '2026-11', label: 'November 2026' }];

const CELL: Record<DayStatus, { bg: string; fg: string; border?: string; dashed?: boolean }> = {
  present: { bg: T.okWash, fg: T.ok },
  regularised: { bg: T.infoWash, fg: T.info },
  missed: { bg: T.warnWash, fg: T.warn, border: T.warn },
  info: { bg: T.infoWash, fg: T.info, border: T.info, dashed: true },
  rejected: { bg: T.redWash, fg: T.red },
  absent: { bg: T.raised, fg: T.dim },
  off: { bg: 'transparent', fg: T.mute },
  upcoming: { bg: 'transparent', fg: T.mute, border: T.border, dashed: true },
};
const LEGEND: DayStatus[] = ['present', 'regularised', 'missed', 'info', 'rejected', 'absent', 'off', 'upcoming'];

export default function CalendarTab({ db, ev, state, onOpen }: { db: HrmsDb; ev: FieldEvidence; state: FieldState; onOpen: (employeeId: string, date: string) => void }) {
  const [month, setMonth] = useState(MONTHS[0]!.key);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const dates = monthDates(month);
  const people = ev.reps.map((r) => db.employees.find((e) => e.id === r.employeeId)).filter((e): e is NonNullable<typeof e> => !!e);
  const counts = monthCounts(ev, state.regularisations, month);

  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(people.length - 1, r)), cc = Math.max(0, Math.min(dates.length - 1, c));
    setActive({ r: rr, c: cc });
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-r="${rr}"][data-c="${cc}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const { r, c } = active;
    const k = e.key;
    if (k === 'ArrowRight') move(r, c + 1);
    else if (k === 'ArrowLeft') move(r, c - 1);
    else if (k === 'ArrowDown') move(r + 1, c);
    else if (k === 'ArrowUp') move(r - 1, c);
    else if (k === 'Home') move(r, 0);
    else if (k === 'End') move(r, dates.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle right={
          <div role="group" aria-label="Month" style={{ display: 'inline-flex', gap: 6 }}>
            {MONTHS.map((m) => (
              <button key={m.key} type="button" aria-pressed={m.key === month} onClick={() => { setMonth(m.key); setActive({ r: 0, c: 0 }); }}
                style={{ height: 32, padding: '0 12px', borderRadius: T.radius.sm, border: `1px solid ${m.key === month ? T.text : T.border}`, background: m.key === month ? T.raised : T.card, color: T.text, fontFamily: 'inherit', fontSize: 13, fontWeight: m.key === month ? 700 : 500, cursor: 'pointer' }}>{m.label}</button>
            ))}
          </div>
        }>Who was where, day by day</CardTitle>

        <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
          <div ref={gridRef} role="grid" aria-label={`Attendance for ${MONTHS.find((m) => m.key === month)!.label}`} onKeyDown={onKey} data-testid="team-calendar"
            style={{ display: 'grid', gridTemplateColumns: `168px repeat(${dates.length}, 30px)`, minWidth: 168 + dates.length * 30, background: T.card }}>
            <div role="row" style={{ display: 'contents' }}>
              <div role="columnheader" style={{ position: 'sticky', left: 0, zIndex: 2, background: T.panel, padding: '8px 12px', fontSize: 11.5, color: T.mute, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>Person</div>
              {dates.map((d) => {
                const sun = weekdayOf(d) === 0;
                return (
                  <div key={d} role="columnheader" aria-label={fmtDate(d)} style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, color: sun ? T.red : T.dim, background: T.panel, borderBottom: `1px solid ${T.border}`, lineHeight: 1.2 }}>
                    <div style={{ fontWeight: 600 }}>{Number(d.slice(8))}</div>
                    <div style={{ fontSize: 9.5, color: T.mute }}>{'SMTWTFS'[weekdayOf(d)]}</div>
                  </div>
                );
              })}
            </div>
            {people.map((p, r) => (
              <div key={p.id} role="row" style={{ display: 'contents' }}>
                <div role="rowheader" style={{ position: 'sticky', left: 0, zIndex: 1, background: T.card, padding: '4px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: `1px solid ${T.border}`, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(p)}</span>
                  <span style={{ fontSize: 11, color: T.mute }}>{ev.reps.find((x) => x.employeeId === p.id)?.city}</span>
                </div>
                {dates.map((d, c) => {
                  const st = dayStatus(ev, state.regularisations, p.id, d);
                  const sty = CELL[st.status];
                  const isActive = active.r === r && active.c === c;
                  return (
                    <div key={d} role="gridcell" style={{ padding: 2, borderBottom: `1px solid ${T.border}`, display: 'grid', placeItems: 'center' }}>
                      <button type="button" data-r={r} data-c={c} data-status={st.status} data-testid={`cell-${p.id}-${d}`} tabIndex={isActive ? 0 : -1}
                        aria-label={st.status === 'upcoming' ? `${fullName(p)}, ${fmtDate(d)}: ${st.label}` : `${fullName(p)}, ${fmtDate(d)}: ${st.label}. Open the day.`}
                        aria-disabled={st.status === 'upcoming' || undefined} onFocus={() => setActive({ r, c })} onClick={() => { setActive({ r, c }); if (st.status !== 'upcoming') onOpen(p.id, d); }}
                        style={{ width: 26, height: 26, borderRadius: 6, border: sty.border ? `1.5px ${sty.dashed ? 'dashed' : 'solid'} ${sty.border}` : '1px solid transparent', background: sty.bg, color: sty.fg, fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: st.status === 'upcoming' ? 'default' : 'pointer', padding: 0 }}>
                        {DAY_STATUS_GLYPH[st.status]}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Use the arrow keys to move between days and Enter to open one. The evidence covers {fmtDate(ev.from)} to {fmtDate(ev.to)}.</div>
      </Card>

      <Card>
        <CardTitle>Legend</CardTitle>
        <div data-testid="calendar-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          {LEGEND.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 6, display: 'inline-grid', placeItems: 'center', background: CELL[s].bg, color: CELL[s].fg, border: CELL[s].border ? `1.5px ${CELL[s].dashed ? 'dashed' : 'solid'} ${CELL[s].border}` : '1px solid transparent', fontFamily: T.mono, fontSize: 12, fontWeight: 700 }}>{DAY_STATUS_GLYPH[s]}</span>
              {DAY_STATUS_LABEL[s]} <span style={{ color: T.mute, fontVariantNumeric: 'tabular-nums' }}>({counts[s]})</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>Regularised means a manager approved the day from the visit evidence. A missed punch stays amber until someone decides. Absent means there is no punch and no visit at all, which can be leave.</div>
      </Card>
    </div>
  );
}
