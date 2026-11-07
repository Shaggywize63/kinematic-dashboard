'use client';
// The cards on the HR overview. Each takes data already derived in insights.ts and only draws it.

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, EmptyState, ProgressBar, StatusBadge, T, type Tone } from '../ui';
import { Segmented } from '../../ui';
import { fmtDate, fmtMonthLong, inr } from '../../../lib/hrms/format';
import {
  PAYROLL_LABEL, THIS_MONTH, relDays,
  type AttentionItem, type DueState, type EntityPayroll, type PeopleEvent, type Severity,
} from './insights';
import type { ComplianceTask, HrmsDb } from '../../../lib/hrms/types';

const hoverOn = (e: React.SyntheticEvent<HTMLElement>) => { e.currentTarget.style.background = T.raised; };
const hoverOff = (e: React.SyntheticEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent'; };

// ───────────────────────────── needs attention ─────────────────────────────
const SEV: Record<Severity, { tone: Tone; label: string }> = { red: { tone: 'red', label: 'Urgent' }, warn: { tone: 'warn', label: 'Soon' }, info: { tone: 'info', label: 'FYI' } };
const COLLAPSED = 8;

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const [filter, setFilter] = useState<'all' | 'urgent'>('all');
  const [all, setAll] = useState(false);
  const urgent = items.filter((i) => i.severity === 'red');
  const base = filter === 'urgent' ? urgent : items;
  const shown = all ? base : base.slice(0, COLLAPSED);
  const count = (s: Severity) => items.filter((i) => i.severity === s).length;

  return (
    <section aria-label="Needs attention">
    <Card padding={0}>
      <div style={{ padding: '18px 20px 0' }}>
        <CardTitle right={items.length > 0 && (
          <Segmented value={filter} onChange={(v) => { setFilter(v); setAll(false); }}
            options={[{ value: 'all', label: `All (${items.length})` }, { value: 'urgent', label: `Urgent (${urgent.length})` }]} />
        )}>Needs attention</CardTitle>
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-4px 0 12px' }}>
            {(['red', 'warn', 'info'] as Severity[]).map((s) => count(s) > 0 && <Badge key={s} tone={SEV[s].tone}>{count(s)} {SEV[s].label.toLowerCase()}</Badge>)}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing needs attention" description="Statutory files, registrations, compliance dues, payroll and exits all pass their checks on the sample data." />
      ) : base.length === 0 ? (
        <EmptyState title="Nothing urgent" description="Switch to All to see items that can wait." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((it) => (
            <li key={it.id} style={{ borderTop: `1px solid ${T.border}` }}>
              <Link href={it.href} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 20px', minHeight: 44, textDecoration: 'none', color: T.text }}>
                <span style={{ flex: '0 0 auto', paddingTop: 1 }}><Badge tone={SEV[it.severity].tone}>{SEV[it.severity].label}</Badge></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{it.title}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: T.dim, marginTop: 2, overflowWrap: 'anywhere' }}>
                    <span style={{ color: T.mute }}>{it.area}</span> · {it.detail}
                  </span>
                </span>
                <span aria-hidden style={{ color: T.mute, paddingTop: 1 }}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {base.length > COLLAPSED && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 20px' }}>
          <Button variant="ghost" size="sm" style={{ height: 36 }} onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${base.length}`}
          </Button>
        </div>
      )}
    </Card>
    </section>
  );
}

// ───────────────────────────── payroll status ─────────────────────────────
export function PayrollStatusCard({ entries, onStart, starting }: { entries: EntityPayroll[]; onStart: (p: EntityPayroll) => void; starting?: string | null }) {
  return (
    <section aria-label="Payroll this month">
    <Card>
      <CardTitle right={<span style={{ fontSize: 12.5, color: T.dim }}>{fmtMonthLong(THIS_MONTH)}</span>}>Payroll this month</CardTitle>
      {entries.length === 0 ? <EmptyState title="No one to pay this month" description="No active employees fall in this month's pay period." style={{ padding: '24px 8px' }} /> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((p) => (
            <li key={p.entity.id} data-testid={`payroll-${p.entity.id}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{p.entity.name}</span>
                <StatusBadge status={p.state === 'not_started' ? 'upcoming' : p.state} label={PAYROLL_LABEL[p.state]} />
              </div>
              <div style={{ fontSize: 12.5, color: T.dim }}>
                {p.employees} {p.employees === 1 ? 'person' : 'people'} in the pay period
                {p.payslips ? ` · ${p.payslips} payslips, net ${inr(p.net)}` : ''}
              </div>
              {p.action.kind === 'start' ? (
                <Button variant="primary" style={{ height: 44 }} onClick={() => onStart(p)} disabled={starting === p.entity.id}>
                  {starting === p.entity.id ? 'Starting…' : p.action.label}
                </Button>
              ) : (
                <Button href={`/dashboard/hrms/payroll?month=${p.month}&entity=${p.entity.id}`} style={{ height: 44 }}>{p.action.label}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
    </section>
  );
}

// ───────────────────────────── compliance mini-calendar ─────────────────────────────
const DUE_TONE: Record<DueState, Tone> = { filed: 'ok', overdue: 'red', due_soon: 'warn', upcoming: 'neutral' };
const DUE_LABEL: Record<DueState, string> = { filed: 'Filed', overdue: 'Overdue', due_soon: 'Due soon', upcoming: 'Upcoming' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ComplianceCalendar({ dues, db }: { dues: { task: ComplianceTask; state: DueState; days: number }[]; db: HrmsDb }) {
  return (
    <section aria-label="Next compliance dues">
    <Card>
      <CardTitle right={<Link href="/dashboard/hrms/statutory" style={{ fontSize: 12.5, fontWeight: 600, color: T.info, textDecoration: 'none', padding: '10px 0' }}>Open compliance →</Link>}>Next compliance dues</CardTitle>
      {dues.length === 0 ? <EmptyState title="All filed" description="No compliance task is waiting to be filed." style={{ padding: '24px 8px' }} /> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {dues.map(({ task, state, days }, i) => (
            <li key={task.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
              <div aria-hidden style={{ width: 46, flex: '0 0 46px', textAlign: 'center', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '4px 0', background: T.panel }}>
                <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>{Number(task.dueOn.slice(8, 10))}</div>
                <div style={{ fontSize: 10.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{MON[Number(task.dueOn.slice(5, 7)) - 1]}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{task.name}</div>
                <div style={{ fontSize: 12, color: T.dim }}>{db.entities.find((e) => e.id === task.entityId)?.name} · {fmtDate(task.dueOn)} ({relDays(days)})</div>
              </div>
              <Badge tone={DUE_TONE[state]} dot>{DUE_LABEL[state]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </section>
  );
}

// ───────────────────────────── headcount bars ─────────────────────────────
export function BarList({ title, rows, total }: { title: string; rows: { id: string; label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section aria-label={title}>
    <Card>
      <CardTitle right={<span style={{ fontSize: 12.5, color: T.dim }}>{total} {total === 1 ? 'person' : 'people'}</span>}>{title}</CardTitle>
      {rows.length === 0 ? <EmptyState title="No employees yet" style={{ padding: '24px 8px' }} /> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 1fr) minmax(60px, 2fr) 28px', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: T.text, overflowWrap: 'anywhere' }}>{r.label}</span>
              <ProgressBar pct={(r.count / max) * 100} tone="info" height={8} />
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </section>
  );
}

// ───────────────────────────── birthdays and anniversaries ─────────────────────────────
export function PeopleEvents({ events, windowDays }: { events: PeopleEvent[]; windowDays: number }) {
  return (
    <section aria-label="Birthdays and anniversaries">
    <Card>
      <CardTitle right={<span style={{ fontSize: 12.5, color: T.dim }}>Next {windowDays} days</span>}>Birthdays and anniversaries</CardTitle>
      {events.length === 0 ? <EmptyState title="No dates coming up" description={`No birthday or work anniversary falls in the next ${windowDays} days.`} style={{ padding: '24px 8px' }} /> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, i) => (
            <li key={ev.id} style={{ borderTop: i ? `1px solid ${T.border}` : 0 }}>
              <Link href={`/dashboard/hrms/employees/${ev.employeeId}`} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 4px', textDecoration: 'none', color: T.text, borderRadius: T.radius.sm }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{ev.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: T.dim }}>{fmtDate(ev.date)} · {relDays(ev.days)}</span>
                </span>
                <Badge tone={ev.kind === 'birthday' ? 'info' : 'ok'}>
                  {ev.kind === 'birthday' ? 'Birthday' : `${ev.years} ${ev.years === 1 ? 'year' : 'years'}`}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </section>
  );
}
