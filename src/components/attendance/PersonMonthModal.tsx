'use client';
/**
 * One person's attendance over a range (usually a month): a calendar of coloured days, the counts, and the day-by-day
 * times. Opened from the Monthly summary (click a name) and from the daily record's detail.
 *
 * Reads GET /attendance/team?from&to&user_id — the same endpoint the daily view uses, so a manager sees exactly the
 * people they are allowed to. Days with no record are judged with the client's shift rules (week off / absent), the
 * same as the daily view.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Route } from 'lucide-react';
import api from '../../lib/api';
import Modal from '../crm/shared/Modal';
import { Badge, Button, T, eyebrowStyle, type Tone } from '../ui';
import { eachDay, gapStatus, istTodayYmd, toISTDate, weekdayOf, type RulesLite } from '../../lib/attendanceDay';

interface Rec {
  id?: string;
  date?: string;
  status: string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  total_hours?: number | null;
  late?: { is_late: boolean; minutes_late: number };
}

type DayKind = 'present' | 'half' | 'leave' | 'absent' | 'off' | 'none';
interface Cell { ymd: string; kind: DayKind; rec?: Rec; label: string }

const KIND: Record<DayKind, { bg: string; fg: string; label: string; tone: Tone }> = {
  present: { bg: 'color-mix(in srgb, var(--ok) 22%, transparent)', fg: 'var(--ok)', label: 'Present', tone: 'ok' },
  half: { bg: 'color-mix(in srgb, var(--warn) 22%, transparent)', fg: 'var(--warn)', label: 'Half day', tone: 'warn' },
  leave: { bg: 'color-mix(in srgb, var(--info) 18%, transparent)', fg: 'var(--info)', label: 'On leave', tone: 'info' },
  absent: { bg: 'color-mix(in srgb, var(--red) 20%, transparent)', fg: 'var(--red)', label: 'Absent', tone: 'red' },
  off: { bg: 'var(--s3)', fg: 'var(--mute)', label: 'Week off', tone: 'neutral' },
  none: { bg: 'transparent', fg: 'var(--mute)', label: '', tone: 'neutral' },
};

const fmtTime = (iso?: string | null) => (iso ? new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—');
const fmtHrs = (h?: number | null) => {
  if (h == null) return '—';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function kindOf(rec: Rec | undefined, ymd: string, rules: RulesLite | null): { kind: DayKind; label: string } {
  if (rec) {
    if (rec.status === 'on_leave') return { kind: 'leave', label: 'On leave' };
    if (rec.status === 'absent') return { kind: 'absent', label: 'Absent' };
    if (rec.status === 'half_day') return { kind: 'half', label: 'Half day' };
    const label = rec.late?.is_late ? `Present · late ${rec.late.minutes_late} min` : 'Present';
    return { kind: 'present', label };
  }
  const g = gapStatus(ymd, rules);
  if (g === 'week_off') return { kind: 'off', label: 'Week off' };
  if (g === 'absent') return { kind: 'absent', label: 'Absent' };
  // Future day, or today before the shift has started: nothing to judge yet.
  return { kind: 'none', label: g === 'not_yet' ? 'Not in yet' : '' };
}

export default function PersonMonthModal({
  userId, name, from, to, rules, onClose,
}: {
  userId: string;
  name: string;
  from: string;
  to: string;
  rules: RulesLite | null;
  onClose: () => void;
}) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRecs(null);
    setError('');
    // noCache: an override made a moment ago must show when the view is opened again.
    api.get<unknown>(`/api/v1/attendance/team?from=${from}&to=${to}&user_id=${encodeURIComponent(userId)}`, { noCache: true } as RequestInit)
      .then((res) => {
        if (cancelled) return;
        const r = res as { data?: unknown } | unknown[];
        const arr = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray((r?.data as { data?: unknown } | undefined)?.data) ? (r.data as { data: unknown[] }).data : [];
        setRecs(arr as Rec[]);
      })
      .catch((e: Error) => { if (!cancelled) setError(e?.message || 'Could not load this person’s attendance'); });
    return () => { cancelled = true; };
  }, [userId, from, to, tick]);

  const cells = useMemo<Cell[]>(() => {
    const byDay = new Map<string, Rec>();
    (recs ?? []).forEach((r) => {
      const d = toISTDate(r.date) || toISTDate(r.checkin_at);
      if (d) byDay.set(d, r);
    });
    return eachDay(from, to).map((ymd) => {
      const rec = byDay.get(ymd);
      return { ymd, rec, ...kindOf(rec, ymd, rules) };
    });
  }, [recs, from, to, rules]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, half: 0, leave: 0, absent: 0 };
    cells.forEach((x) => {
      if (x.kind === 'present') { c.present += 1; if (x.rec?.late?.is_late) c.late += 1; }
      else if (x.kind === 'half') c.half += 1;
      else if (x.kind === 'leave') c.leave += 1;
      else if (x.kind === 'absent') c.absent += 1;
    });
    return c;
  }, [cells]);

  // Calendar rows: pad the first week so weekdays line up (Sunday first, matching the weekly-off numbering).
  const weeks = useMemo(() => {
    const rows: Array<Array<Cell | null>> = [];
    let row: Array<Cell | null> = [];
    cells.forEach((c, i) => {
      if (i === 0) for (let k = 0; k < weekdayOf(c.ymd); k++) row.push(null);
      row.push(c);
      if (row.length === 7) { rows.push(row); row = []; }
    });
    if (row.length) { while (row.length < 7) row.push(null); rows.push(row); }
    return rows;
  }, [cells]);

  const today = istTodayYmd();
  const label = from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
  const worked = cells.filter((c) => c.rec && c.rec.checkin_at).reverse();
  const stat = (l: string, v: number, color?: string) => (
    <div key={l} style={{ flex: '1 1 76px', minWidth: 0, background: T.raised, borderRadius: 8, padding: '9px 12px' }}>
      <div style={{ ...eyebrowStyle, fontSize: 9.5 }}>{l}</div>
      <div style={{ fontFamily: T.heading, fontSize: 20, fontWeight: 700, color: v > 0 && color ? color : T.text, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={name} subtitle={label} width={560}>
      {error ? (
        <div role="alert" style={{ background: T.redWash, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.red, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <Button size="sm" onClick={() => setTick((t) => t + 1)}>Retry</Button>
        </div>
      ) : recs === null ? (
        <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <i className="km-skel" style={{ height: 54 }} />
          <i className="km-skel" style={{ height: 150 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stat('Present', counts.present, T.ok)}
            {stat('Late', counts.late, T.warn)}
            {stat('Half day', counts.half, T.warn)}
            {stat('Leave', counts.leave, T.info)}
            {stat('Absent', counts.absent, T.red)}
          </div>

          <div role="group" aria-label="Attendance calendar" data-testid="person-calendar">
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} aria-hidden style={{ flex: 1, textAlign: 'center', fontFamily: T.mono, fontSize: 10, color: T.mute }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {weeks.map((w, wi) => (
                <div key={wi} style={{ display: 'flex', gap: 4 }}>
                  {w.map((c, ci) => c ? (
                    <div
                      key={c.ymd}
                      data-kind={c.kind}
                      title={`${dayLabel(c.ymd)}${c.label ? ` — ${c.label}` : ''}`}
                      aria-label={`${dayLabel(c.ymd)}${c.label ? `, ${c.label}` : ''}`}
                      style={{
                        flex: 1, minWidth: 0, height: 34, borderRadius: 6, background: KIND[c.kind].bg, color: KIND[c.kind].fg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 11.5, fontWeight: 600,
                        boxShadow: c.ymd === today ? `inset 0 0 0 1.5px ${T.text}` : 'none',
                        border: c.kind === 'none' ? `1px dashed ${T.border}` : '1px solid transparent',
                      }}
                    >{Number(c.ymd.slice(8))}</div>
                  ) : <div key={`e${ci}`} style={{ flex: 1 }} />)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, color: T.dim }}>
              {(['present', 'half', 'leave', 'absent', 'off'] as const).map((k) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: KIND[k].bg, border: `1px solid ${KIND[k].fg}` }} />{KIND[k].label}
                </span>
              ))}
            </div>
          </div>

          {worked.length > 0 && (
            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Days worked</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {worked.map((c, i) => (
                  <div key={c.ymd} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 0', borderTop: i === 0 ? 0 : `1px solid ${T.border}`, fontSize: 13 }}>
                    <span style={{ width: 92, color: T.text, fontWeight: 500 }}>{dayLabel(c.ymd)}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtTime(c.rec?.checkin_at)} – {fmtTime(c.rec?.checkout_at)}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.text }}>{fmtHrs(c.rec?.total_hours)}</span>
                    {c.rec?.late?.is_late && <Badge tone="warn">Late {c.rec.late.minutes_late} min</Badge>}
                    {c.kind === 'half' && <Badge tone="warn">Half day</Badge>}
                    <Link href={`/dashboard/travel-report?date=${c.ymd}&user_id=${userId}`} title="Open this day in the travel report" aria-label={`Travel report for ${dayLabel(c.ymd)}`} style={{ marginLeft: 'auto', color: T.mute, display: 'inline-flex', textDecoration: 'none' }}>
                      <Route size={15} strokeWidth={1.7} />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
