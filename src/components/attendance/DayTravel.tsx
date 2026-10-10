'use client';
/**
 * "Distance travelled" for one person on one day, shown inside the attendance day-detail modal.
 *
 * Mounted only while the modal is open, so GET /attendance/travel is fetched on open and never earlier. It never
 * blocks the modal: while it loads, fails or has nothing to show it says so in its own small box and the rest of
 * the modal stays usable.
 *
 * A "leg" is the travel between two points where the person was NOT at a form: check-in → first form, form →
 * next form, last form → check-out. Time spent at a customer is not travel, so it is in `stops`, not in a leg.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import api, { type AttendanceTravel, type AttendanceTravelLeg, type AttendanceTravelMethod, type AttendanceTravelPoint } from '../../lib/api';
import { fmtClock } from '../../lib/visitTime';
import { Badge, Button, Eyebrow, T } from '../ui';

type State =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; data: AttendanceTravel };

/** "23.4 km" — at most two decimals, no trailing zeros. */
export const fmtKm = (km: number | null | undefined): string => `${Number((Number(km) || 0).toFixed(2))} km`;

const METHOD_NOTE: Record<AttendanceTravelMethod, string> = {
  gps_trail: 'Measured along the GPS trail',
  straight_line: 'No GPS trail — straight-line distance between the points',
  mixed: 'Measured along the GPS trail where there was one, straight-line elsewhere',
  none: '',
};

const KIND_LABEL: Record<AttendanceTravelPoint['kind'], string> = {
  checkin: 'Check-in', form_checkout: 'Visit', form_checkin: 'Visit', checkout: 'Check-out', now: 'Now',
};
const pointLabel = (p: AttendanceTravelPoint) => (p.label && p.label.trim()) || KIND_LABEL[p.kind] || 'Stop';

// One request per person+day at a time: React's dev double-mount (and a quick close/reopen) share the answer in
// flight instead of asking twice. Cleared as soon as it settles, so Retry and the next open always ask afresh.
const inflight = new Map<string, Promise<unknown>>();
function fetchTravel(userId: string, date: string): Promise<unknown> {
  const key = `${userId}|${date}`;
  let p = inflight.get(key);
  if (!p) {
    p = api.getAttendanceTravel(date, userId).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Reads `{success, data}` or the bare payload; anything without a legs list is not a travel answer. */
function readTravel(res: unknown): AttendanceTravel | null {
  const r = res as { data?: unknown } | null;
  const d = (r && typeof r === 'object' && r.data && typeof r.data === 'object' ? r.data : r) as Partial<AttendanceTravel> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.legs)) return null;
  return { ...d, stops: Array.isArray(d.stops) ? d.stops : [], total_km: Number(d.total_km) || 0 } as AttendanceTravel;
}

export default function DayTravel({ userId, date, refreshKey }: { userId: string; date: string; refreshKey?: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  // A newer request (another person / day / Retry) or an unmount makes an older answer irrelevant.
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    setState({ phase: 'loading' });
    fetchTravel(userId, date)
      .then((res) => {
        if (mine !== seq.current) return;
        const data = readTravel(res);
        setState(data ? { phase: 'ready', data } : { phase: 'error' });
      })
      .catch(() => { if (mine === seq.current) setState({ phase: 'error' }); });
  }, [date, userId]);

  useEffect(() => {
    load();
    return () => { seq.current++; };
  }, [load, refreshKey]);

  const box = { background: T.raised, borderRadius: 8, padding: 12 } as const;

  if (state.phase === 'loading') {
    return (
      <div data-testid="day-travel" role="status" aria-busy="true" style={box}>
        <Eyebrow style={{ marginBottom: 6 }}>Distance travelled</Eyebrow>
        <div style={{ fontSize: 12.5, color: T.mute }}>Working out the route…</div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div data-testid="day-travel" style={box}>
        <Eyebrow style={{ marginBottom: 6 }}>Distance travelled</Eyebrow>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
          <span>Couldn’t load the distance for this day.</span>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  const t = state.data;
  if (!t.attendance_id || t.legs.length === 0) {
    return (
      <div data-testid="day-travel" style={box}>
        <Eyebrow style={{ marginBottom: 6 }}>Distance travelled</Eyebrow>
        <div style={{ fontSize: 12.5, color: T.dim }}>
          {t.attendance_id ? 'No travel recorded for this day.' : 'No attendance on this day, so nothing to measure.'}
        </div>
      </div>
    );
  }

  const visitMin = t.stops.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  const note = METHOD_NOTE[t.method];
  return (
    <div data-testid="day-travel" style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow style={{ marginBottom: 4 }}>Distance travelled</Eyebrow>
          <div data-testid="day-travel-total" style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{fmtKm(t.total_km)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {t.in_progress && <Badge tone="info" dot>In progress</Badge>}
          <Badge tone="neutral">{t.legs.length} {t.legs.length === 1 ? 'leg' : 'legs'}</Badge>
        </div>
      </div>
      {(t.stops.length > 0 || note) && (
        <div style={{ fontSize: 12, color: T.mute, marginTop: 6, lineHeight: 1.45 }}>
          {t.stops.length > 0 && <>{t.stops.length} {t.stops.length === 1 ? 'visit' : 'visits'}{visitMin > 0 ? ` · ${visitMin} min at customers` : ''}. </>}
          {note}
        </div>
      )}

      <ol data-testid="day-travel-legs" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        {t.legs.map((l: AttendanceTravelLeg) => (
          <li key={l.index} data-testid="day-travel-leg" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.text, overflowWrap: 'anywhere' }}>{pointLabel(l.from)} → {pointLabel(l.to)}</div>
              <div style={{ fontSize: 12, color: T.mute, marginTop: 1 }}>
                {fmtClock(l.from.at)} – {l.to.kind === 'now' ? 'now' : fmtClock(l.to.at)}
                {l.method === 'straight_line' && <span title={METHOD_NOTE.straight_line}> · straight line</span>}
                {l.method === 'none' && <span title="A point of this leg has no location"> · no location</span>}
              </div>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 12.5, color: T.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtKm(l.km)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
