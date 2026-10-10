'use client';
/**
 * Daily Travel Report → one employee's day, from GET /api/v1/attendance/daily-report?date=&user_id=:
 * summary tiles, the route on a map with numbered stops, and a time-ordered timeline of the check-in, each travel
 * leg, each customer visit, each halt and the check-out — with a place name for every point.
 *
 * Place names come from the same reverse-geocode helper Live Trailing uses, cached per coordinate, and never block
 * the report: coordinates show first and are replaced by the name when it arrives. "Export CSV" and "Print / Save
 * as PDF" wait (a few seconds at most) for the names so the output carries them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowLeft, Download, Printer, RefreshCw, UserX } from 'lucide-react';
import api, { type DailyReport } from '../../lib/api';
import { downloadCsv } from '../../lib/exportCsv';
import {
  buildTimeline, fmtDay, fmtHours, fmtKm, isYmd, istToday, modeText, readDailyReport, routePath, slug, timeRange,
  timelineCsvRows, timelinePlaces, TIMELINE_CSV_COLUMNS, type TimelineItem, type TimelineKind,
} from '../../lib/travelReport';
import { fmtClock, fmtMinutes } from '../../lib/visitTime';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, T, useIsCompact, type Tone } from '../ui';
import PlaceText, { knownPlaceName, resolvePlaces } from './PlaceText';
import { shareInflight } from './shareInflight';
import RouteMap, { type RouteMarker } from './RouteMap';
import { alertBox, td, tdNum, tdTime, th } from './styles';

const KIND_TONE: Record<TimelineKind, Tone> = { checkin: 'ok', travel: 'neutral', visit: 'info', halt: 'warn', checkout: 'neutral' };
const METHOD_NOTE: Record<string, string> = {
  gps_trail: 'Along the GPS trail', straight_line: 'Straight line (no GPS trail)', mixed: 'GPS trail and straight line', none: 'No travel recorded',
};

/** "Along the GPS trail · 2 legs" under the total distance. */
function distanceNote(r: DailyReport): string {
  const legs = r.travel.legs.length;
  return [METHOD_NOTE[r.travel.method], legs ? `${legs} ${legs === 1 ? 'leg' : 'legs'}` : ''].filter(Boolean).join(' · ');
}

function Tile({ id, label, value, sub }: { id: string; label: string; value: string; sub?: string }) {
  return (
    <div data-testid={id} style={{ background: T.raised, borderRadius: 8, padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <div data-testid={`${id}-value`} style={{ fontFamily: T.mono, fontSize: 17, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.mute }}>{sub}</div>}
    </div>
  );
}

/** The number on a visit / halt row — the same number the map's marker carries. */
function MarkerNumber({ n, kind }: { n: number; kind: TimelineKind }) {
  return (
    <span aria-label={`Stop ${n}`} style={{
      width: 20, height: 20, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: kind === 'visit' ? T.info : T.warn, color: '#FFFFFF', fontFamily: T.mono, fontSize: 11, fontWeight: 700,
    }}>{n}</span>
  );
}

export default function DayReport({ date, userId, onDateChange, onBack, clientId }: {
  date: string; userId: string; onDateChange: (d: string) => void; onBack: () => void; clientId: string;
}) {
  const narrow = useIsCompact(900);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // True once the person asked for the output (print / CSV): every row then looks up its name, not just visible ones.
  const [eager, setEager] = useState(false);
  const [busy, setBusy] = useState<'csv' | 'print' | null>(null);
  // When the printout was made (set at print time, so nothing time-dependent is rendered on the server).
  const [printedAt, setPrintedAt] = useState('');
  const reqId = useRef(0);
  const shown = useRef('');

  const load = useCallback(async () => {
    const id = ++reqId.current;
    // Another person / day starts from a clean page; a refresh of the same one keeps what is on screen meanwhile.
    const key = `${userId}|${date}`;
    if (shown.current !== key) { shown.current = key; setReport(null); setEager(false); }
    setLoading(true);
    setError('');
    try {
      const res = await shareInflight(`day|${clientId}|${userId}|${date}`, () => api.getDailyTravelReport(date, userId));
      if (id !== reqId.current) return;
      const r = readDailyReport(res);
      if (!r) throw new Error('The server sent an unexpected response.');
      setReport(r);
    } catch (e) {
      if (id !== reqId.current) return;
      setReport(null);
      setError((e as Error)?.message || 'Could not load this day.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [date, userId, clientId]);

  // Refetch when the person or day changes AND when the global client picker changes.
  useEffect(() => { load(); }, [load]);

  const items = useMemo<TimelineItem[]>(() => (report ? buildTimeline(report) : []), [report]);
  const path = useMemo(() => (report ? routePath(report) : []), [report]);
  const markers = useMemo<RouteMarker[]>(() => items
    .filter((i) => i.marker != null && i.at && (i.kind === 'visit' || i.kind === 'halt'))
    .map((i) => ({
      n: i.marker as number, kind: i.kind as 'visit' | 'halt', at: i.at as { lat: number; lng: number },
      title: i.kind === 'visit' ? `${i.marker}. Visit — ${i.detail}` : `${i.marker}. Halt`,
      lines: [timeRange(i), fmtMinutes(i.minutes)],
    })), [items]);
  const start = useMemo(() => items.find((i) => i.kind === 'checkin')?.at ?? null, [items]);
  const end = useMemo(() => items.find((i) => i.kind === 'checkout')?.at ?? null, [items]);

  const hasShift = !!report?.shift.attendance_id;
  const dayLabel = fmtDay(report?.date || date);

  const exportCsv = async () => {
    if (!report || items.length === 0 || busy) return;
    setBusy('csv');
    try {
      await resolvePlaces(timelinePlaces(items));
      downloadCsv(`daily-travel-${slug(report.user.name)}-${report.date || date}`, timelineCsvRows(report, items, knownPlaceName), [...TIMELINE_CSV_COLUMNS]);
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    if (!report || busy) return;
    setBusy('print');
    try {
      await resolvePlaces(timelinePlaces(items));
      flushSync(() => {
        setEager(true); // every row shows its name in the printout, scrolled into view or not
        setPrintedAt(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }));
      });
      // "Save as PDF" names the file after the page title.
      const before = document.title;
      document.title = `Daily Travel Report - ${report.user.name} - ${report.date || date}`;
      window.addEventListener('afterprint', () => { document.title = before; }, { once: true });
      window.print();
    } finally {
      setBusy(null);
    }
  };

  const canAct = !!report && hasShift && !loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tr-noprint" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Button onClick={onBack} icon={<ArrowLeft size={16} strokeWidth={1.6} />}>All employees</Button>
        <Field label="Date" htmlFor="tr-day-date" style={{ width: 190 }}>
          <Input id="tr-day-date" type="date" value={date} max={istToday()} onChange={(e) => { if (isYmd(e.target.value)) onDateChange(e.target.value); }} />
        </Field>
        <IconButton label="Refresh this day" onClick={load} style={{ marginBottom: 2 }}>
          <RefreshCw size={16} strokeWidth={1.6} style={loading ? { animation: 'kspin 1s linear infinite' } : undefined} />
        </IconButton>
        <div style={{ flex: 1 }} />
        <Button onClick={exportCsv} disabled={!canAct || items.length === 0 || !!busy} icon={<Download size={16} strokeWidth={1.6} />}>
          {busy === 'csv' ? 'Preparing…' : 'Export CSV'}
        </Button>
        <Button variant="primary" onClick={print} disabled={!canAct || !!busy} icon={<Printer size={16} strokeWidth={1.6} />}>
          {busy === 'print' ? 'Preparing…' : 'Print / Save as PDF'}
        </Button>
      </div>

      {error && (
        <div role="alert" style={{ ...alertBox, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>{error}</span>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {!report && loading && (
        <Card style={{ color: T.mute, fontSize: 13, textAlign: 'center', padding: 32 }}>
          <div role="status" aria-busy="true">Loading this day…</div>
        </Card>
      )}

      {report && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} data-testid="day-identity">
          <Avatar name={report.user.name} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{report.user.name}</div>
            <div style={{ fontSize: 13, color: T.dim }}>
              {(report.user.role || '').replace(/[_-]/g, ' ')}
              {report.user.employee_id ? <>{report.user.role ? ' · ' : ''}<span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{report.user.employee_id}</span></> : null}
              {(report.user.role || report.user.employee_id) ? ' · ' : ''}{dayLabel}
            </div>
          </div>
          {report.shift.in_progress && <Badge tone="info" dot>In progress</Badge>}
        </div>
      )}

      {report && !hasShift && (
        <Card padding={0}>
          <EmptyState
            icon={<UserX size={20} strokeWidth={1.6} />}
            title={`No attendance on ${dayLabel}`}
            description={`${report.user.name} did not check in that day, so there is no route, visit or halt to report.`}
          />
        </Card>
      )}

      {report && hasShift && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Tile id="tile-km" label="Total distance" value={fmtKm(report.summary.total_km)} sub={distanceNote(report)} />
            <Tile
              id="tile-mode" label="Mode of transport"
              value={report.transport.mode || report.transport.label ? modeText(report.transport.mode, report.transport.label) : '—'}
              sub={report.transport.mode || report.transport.label ? undefined : 'Not recorded'}
            />
            <Tile id="tile-visits" label="Customer visits" value={String(report.summary.visits)} sub={report.summary.visits ? `${fmtMinutes(report.summary.visit_minutes)} at customers` : 'None recorded'} />
            <Tile id="tile-halts" label="Halts" value={String(report.summary.halts)} sub={report.summary.halts ? `${fmtMinutes(report.summary.halt_minutes)} halted` : 'None recorded'} />
            <Tile
              id="tile-shift" label="Shift"
              value={`${fmtClock(report.shift.checkin_at)} – ${report.shift.checkout_at ? fmtClock(report.shift.checkout_at) : 'now'}`}
              sub={report.shift.in_progress ? 'In progress' : fmtHours(report.shift.total_hours)}
            />
          </div>

          <Card padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10, breakInside: 'avoid' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <Eyebrow>Route</Eyebrow>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.dim }}>
                {[['Check-in', T.ok], ['Visit', T.info], ['Halt', T.warn], ['Check-out', T.mute]].map(([l, c]) => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: c }} />{l}
                  </span>
                ))}
              </div>
            </div>
            <RouteMap path={path} markers={markers} start={start} end={end} height={narrow ? 260 : 380} />
            <div style={{ fontSize: 12, color: T.mute }}>
              {report.route.points.length >= 2
                ? `Route drawn from ${report.route.points.length} GPS points${report.route.thinned ? ' (thinned for display)' : ''}. Numbers match the timeline.`
                : path.length >= 2
                  ? 'No GPS trail for this day — the stops are joined by straight lines.'
                  : 'No GPS trail recorded for this day.'}
            </div>
          </Card>

          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Eyebrow>Timeline</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.dim }}>
                {items.length} {items.length === 1 ? 'event' : 'events'}, in the order they started. A halt inside a long drive is listed after the leg it happened on.
              </div>
            </div>
            <div className="tr-scroll" style={{ overflowX: 'auto' }}>
              <table data-testid="timeline" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={th}>Time</th>
                    <th style={th}>Event</th>
                    <th style={th}>Place</th>
                    <th style={{ ...th, textAlign: 'right' }}>Duration</th>
                    <th style={{ ...th, textAlign: 'right' }}>Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.key} data-testid="timeline-row" data-kind={it.kind} style={{ breakInside: 'avoid' }}>
                      <td style={tdTime}>{timeRange(it)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {it.marker != null && <MarkerNumber n={it.marker} kind={it.kind} />}
                          <Badge tone={KIND_TONE[it.kind]}>{it.title}</Badge>
                          {it.openEnd && <Badge tone="info" dot>In progress</Badge>}
                        </div>
                        {it.detail && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4, overflowWrap: 'anywhere' }}>{it.detail}</div>}
                      </td>
                      <td style={{ ...td, minWidth: 190 }}>
                        {it.kind === 'travel' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <PlaceText at={it.at} eager={eager} label="From" />
                            <PlaceText at={it.to} eager={eager} label="To" />
                          </div>
                        ) : <PlaceText at={it.at} eager={eager} />}
                      </td>
                      <td style={tdNum}>{it.minutes != null ? fmtMinutes(it.minutes) : <span style={{ color: T.mute }}>—</span>}</td>
                      <td style={tdNum}>{it.km != null ? fmtKm(it.km) : <span style={{ color: T.mute }}>—</span>}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} style={{ ...td, borderBottom: 0, textAlign: 'center', color: T.mute, padding: 24 }}>Nothing was recorded for this day.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {printedAt && <div className="tr-printonly" style={{ fontSize: 11, color: T.mute }}>Generated {printedAt} · Kinematic</div>}
    </div>
  );
}
