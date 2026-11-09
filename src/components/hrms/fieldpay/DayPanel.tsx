'use client';
// One day of a travel statement: the GPS trail on a small plot with the visits marked, and the numbers beside it.

import { useMemo } from 'react';
import { Badge, Button, Card, CardTitle, KeyValue, Note, T, useIsCompact } from '../ui';
import { GeoPlot, type MapMarker, type MapPath } from '../field/GeoPlot';
import { fmtDate, inr } from '../../../lib/hrms/format';
import { dayEvidence } from '../../../lib/hrms/field/engines';
import { toMin } from '../../../lib/hrms/field/evidence';
import type { FieldEvidence } from '../../../lib/hrms/field/types';
import type { Id } from '../../../lib/hrms/types';
import { gapWindow } from '../../../lib/hrms/fieldpay/engines';
import type { EffectiveTravelDay } from '../../../lib/hrms/fieldpay/types';
import { hm, num1, weekdayName } from './common';

export const dayLabel = (d: string): string => `${weekdayName(d)} ${fmtDate(d).replace(/ \d{4}$/, '')}`;

export default function DayPanel({ ev, employeeId, day, rate, existingDispute, onRaise, name }: {
  ev: FieldEvidence; employeeId: Id; day: EffectiveTravelDay; rate: number; name: string;
  existingDispute?: { status: string };
  onRaise: () => void;
}) {
  const narrow = useIsCompact(900);
  const trail = ev.trails.find((t) => t.employeeId === employeeId && t.date === day.date);
  const de = useMemo(() => dayEvidence(ev, employeeId, day.date), [ev, employeeId, day.date]);
  const odo = ev.odometer.find((o) => o.employeeId === employeeId && o.date === day.date);
  const gap = trail ? gapWindow(trail.points) : undefined;
  const outletName = (id: string) => ev.outlets.find((o) => o.id === id)?.name ?? id;

  const { paths, markers } = useMemo(() => {
    const paths: MapPath[] = [];
    const markers: MapMarker[] = [];
    const pts = trail?.points ?? [];
    let run: typeof pts = [];
    let n = 0;
    const flush = () => { if (run.length > 1) paths.push({ id: `seg${n++}`, points: run.map((p) => p.pos), color: T.info, width: 2.5 }); run = []; };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (i > 0 && toMin(p.t) - toMin(pts[i - 1]!.t) > 30) {
        flush();
        // The straight line across a stretch with no GPS fix is drawn dashed: it is a guess, not a measured path.
        paths.push({ id: `gap${n++}`, points: [pts[i - 1]!.pos, p.pos], color: T.warn, dashed: true, width: 2.5 });
      }
      run.push(p);
    }
    flush();
    if (pts.length) {
      markers.push({ id: 'start', pos: pts[0]!.pos, shape: 'square', color: T.dim, label: `Start ${pts[0]!.t}`, r: 4 });
      markers.push({ id: 'end', pos: pts[pts.length - 1]!.pos, shape: 'square', color: T.dim, label: `End ${pts[pts.length - 1]!.t}`, r: 4 });
    }
    de.visits.forEach((v, i) => markers.push({
      id: v.id, pos: v.pos, label: String(i + 1), r: 5, color: v.verified ? T.ok : T.warn,
      title: `${i + 1}. ${outletName(v.outletId)}, ${v.start} to ${v.end}, ${v.verified ? 'verified' : 'not verified'}`,
    }));
    return { paths, markers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail, de]);

  const decided = day.decidedKm != null;
  return (
    <div data-testid="day-panel">
      <Card>
        <CardTitle right={<Badge tone={day.disputeCandidate ? 'warn' : 'neutral'} dot>{day.disputeCandidate ? 'GPS gap hides distance' : 'No dispute needed'}</Badge>}>
          {name}, {dayLabel(day.date)}
        </CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <GeoPlot paths={paths} markers={markers} height={320} ariaLabel={`GPS trail of ${name} on ${fmtDate(day.date)}`} testId="trail-plot" />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
              <span><span style={{ color: T.info }}>●</span> GPS trail</span>
              <span><span style={{ color: T.warn }}>- - -</span> no GPS fix, line is a guess</span>
              <span><span style={{ color: T.ok }}>●</span> verified visit</span>
              <span><span style={{ color: T.warn }}>●</span> visit not verified</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <KeyValue columns={1} rows={[
              { label: 'GPS distance', value: <b data-testid="day-gps">{num1(day.trailKm)} km</b> },
              { label: 'Odometer', value: odo ? <span data-testid="day-odo">{odo.endKm - odo.startKm} km ({odo.startKm.toLocaleString('en-IN')} to {odo.endKm.toLocaleString('en-IN')}). Photos: start {odo.photoStart ? 'yes' : 'missing'}, end {odo.photoEnd ? 'yes' : 'missing'}</span> : 'No odometer reading' },
              { label: 'Longest stretch with no GPS fix', value: <span data-testid="day-gap">{hm(day.gapMin)}{gap ? ` (${gap.from} to ${gap.to})` : ''}</span> },
              { label: 'Visits', value: `${de.visits.length}, of which ${de.verifiedVisits.length} verified` },
              { label: 'Punch', value: de.punch?.in ? `${de.punch.in} to ${de.punch.out ?? 'no punch-out'}` : 'No punch' },
              { label: 'The statement pays', value: <span data-testid="day-pays"><b>{num1(day.effectiveKm)} km</b>, {inr(day.amount)} at ₹{rate} per km</span> },
            ]} />
            {decided && <Note tone="ok">HR decided {num1(day.decidedKm!)} km for this day. {day.decidedNote}</Note>}
            {!decided && day.note && <Note tone={day.disputeCandidate ? 'warn' : 'info'}>{day.note}</Note>}
            <div>
              <Button onClick={onRaise} disabled={!!existingDispute}>Raise a dispute for this day</Button>
              {existingDispute && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>A dispute for this day already exists ({existingDispute.status.replace('_', ' ')}). Find it under Disputes below.</div>}
            </div>
          </div>
        </div>
        {de.visits.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Visits that day</div>
            <ol data-testid="day-visits" style={{ margin: 0, paddingLeft: 22, columns: narrow ? 1 : 2, fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
              {de.visits.map((v) => (
                <li key={v.id}>{v.start} to {v.end}, {outletName(v.outletId)}{v.verified ? '' : `, not verified (${v.distanceFromOutletM} m from the outlet${v.photo ? '' : ', no photo'})`}</li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    </div>
  );
}
