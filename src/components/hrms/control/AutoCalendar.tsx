'use client';
// The next 60 days as a small calendar: a dot for each due date, and the tasks of a clicked day listed below.

import { useState } from 'react';
import { Card, CardTitle, T, useIsCompact } from '../ui';
import type { HrmsDb, ISODate } from '../../../lib/hrms/types';
import { calendarWeeks } from '../../../lib/hrms/control/autopilot';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate } from '../../../lib/hrms/format';
import { Muted } from './parts';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AutoCalendar({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(600);
  const weeks = calendarWeeks(db, PREVIEW_TODAY, 60);
  const [picked, setPicked] = useState<ISODate | null>(null);
  const day = picked ? weeks.flat().find((d) => d.date === picked) : undefined;
  const gap = narrow ? 3 : 4;
  const total = weeks.flat().reduce((n, d) => n + (d.inRange ? d.tasks.length : 0), 0);
  return (
    <Card>
      <CardTitle right={<Muted>{total} open {total === 1 ? 'due date' : 'due dates'} in the next 60 days</Muted>}>Next 60 days</CardTitle>
      {/* Flex rows, not CSS grid: the dashboard stylesheet collapses inline grid-template-columns to one column on small screens. */}
      <div data-testid="calendar-strip" role="grid" aria-label="Due dates in the next 60 days" style={{ display: 'flex', flexDirection: 'column', gap }}>
        <div role="row" style={{ display: 'flex', gap }}>
          {DOW.map((d) => <div key={d} role="columnheader" style={{ flex: '1 1 0', minWidth: 0, fontSize: 11, color: T.mute, textAlign: 'center', fontFamily: T.mono, textTransform: 'uppercase' }}>{narrow ? d[0] : d}</div>)}
        </div>
        {weeks.map((week) => (
          <div key={week[0]!.date} role="row" style={{ display: 'flex', gap }}>
            {week.map((d) => {
              const has = d.tasks.length > 0;
              const isToday = d.date === PREVIEW_TODAY;
              const first = d.date.endsWith('-01') || d.date === weeks[0]![0]!.date;
              return (
                <button key={d.date} type="button" role="gridcell" disabled={!d.inRange || !has} onClick={() => setPicked(picked === d.date ? null : d.date)}
                  aria-label={`${fmtDate(d.date)}${has ? `: ${d.tasks.length} due` : ''}${isToday ? ', today' : ''}`} data-testid={has && d.inRange ? `cal-${d.date}` : undefined}
                  style={{
                    flex: '1 1 0', minWidth: 0, minHeight: narrow ? 38 : 44, padding: narrow ? 2 : '3px 6px', borderRadius: T.radius.sm, fontFamily: 'inherit', textAlign: 'left',
                    border: `1px solid ${picked === d.date ? T.info : isToday ? T.info : T.border}`, background: has && d.inRange ? T.warnWash : T.card,
                    color: d.inRange ? T.text : T.mute, opacity: d.inRange ? 1 : 0.4, cursor: has && d.inRange ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
                  }}>
                  <span style={{ fontSize: narrow ? 11 : 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.info : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(d.date.slice(8))}{first && !narrow ? ` ${fmtDate(d.date).split(' ')[1]}` : ''}
                  </span>
                  {has && d.inRange && <span style={{ fontSize: narrow ? 10 : 11, color: T.warn, fontWeight: 700, whiteSpace: 'nowrap' }}>{narrow ? d.tasks.length : [...new Set(d.tasks.map((t) => t.law))].join(' ')}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {day && day.tasks.length > 0 && (
        <div data-testid="calendar-day" style={{ marginTop: 12, padding: '10px 12px', background: T.raised, borderRadius: T.radius.md }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>Due on {fmtDate(day.date)}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.dim, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {day.tasks.map((t) => <li key={t.id}>{t.name} ({db.entities.find((e) => e.id === t.entityId)?.name})</li>)}
          </ul>
        </div>
      )}
      <Muted style={{ marginTop: 10 }}>Today, {fmtDate(PREVIEW_TODAY)}, is outlined. Click a highlighted day to see what is due.</Muted>
    </Card>
  );
}
