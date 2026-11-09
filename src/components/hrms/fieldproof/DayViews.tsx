'use client';
// The two views of one person-day shared by Visit attendance and Integrity checks: a timeline (punches and visits in
// time order, with why a visit was or was not verified) and a map of the GPS trail with the visits on it.

import { useMemo } from 'react';
import { GeoPlot, type MapMarker, type MapPath } from '../field/GeoPlot';
import { T } from '../ui';
import type { Id, ISODate } from '../../../lib/hrms/types';
import type { FieldEvidence } from '../../../lib/hrms/field/types';
import { dayEvidence } from '../../../lib/hrms/field/engines';
import { timelineFor } from '../../../lib/hrms/fieldproof/logic';

export function DayTimeline({ ev, employeeId, date }: { ev: FieldEvidence; employeeId: Id; date: ISODate }) {
  const items = useMemo(() => timelineFor(ev, employeeId, date), [ev, employeeId, date]);
  if (!items.length) return <div style={{ fontSize: 13.5, color: T.dim }}>No punch, visit or GPS record for this day.</div>;
  return (
    <ol data-testid="day-timeline" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {items.map((e) => {
        const color = e.kind === 'visit' ? (e.verified ? T.ok : T.warn) : e.missing ? T.red : T.info;
        return (
          <li key={e.id} data-kind={e.kind} data-verified={e.kind === 'visit' ? String(!!e.verified) : undefined}
            style={{ display: 'grid', gridTemplateColumns: '56px 18px 1fr', gap: 8, alignItems: 'start', padding: '6px 0' }}>
            <span style={{ fontFamily: T.mono, fontSize: 12.5, color: e.at ? T.dim : T.red, paddingTop: 1 }}>{e.at ?? 'missing'}</span>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: e.kind === 'visit' ? 999 : 2, background: e.missing ? 'transparent' : color, border: `2px solid ${color}`, marginTop: 4, justifySelf: 'center' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: e.missing ? T.red : T.text, fontWeight: e.kind === 'visit' ? 500 : 600 }}>
                {e.n != null && <span style={{ fontFamily: T.mono, color: T.mute, marginRight: 6 }}>{e.n}.</span>}{e.title}
                {e.kind === 'visit' && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color }}>{e.verified ? 'Verified' : 'Not verified'}</span>}
              </div>
              {e.detail && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 1, lineHeight: 1.45 }}>{e.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DayMap({ ev, employeeId, date, height = 280 }: { ev: FieldEvidence; employeeId: Id; date: ISODate; height?: number }) {
  const { paths, markers, count } = useMemo(() => {
    const d = dayEvidence(ev, employeeId, date);
    const trail = ev.trails.find((t) => t.employeeId === employeeId && t.date === date);
    const paths: MapPath[] = trail && trail.points.length > 1 ? [{ id: 'trail', points: trail.points.map((p) => p.pos), color: T.info, width: 2 }] : [];
    const markers: MapMarker[] = d.visits.map((v, i) => {
      const name = ev.outlets.find((o) => o.id === v.outletId)?.name ?? v.outletId;
      return { id: v.id, pos: v.pos, label: String(i + 1), color: v.verified ? T.ok : T.warn, r: 6, title: `${i + 1}. ${name}, ${v.start}, ${v.verified ? 'verified' : 'not verified'}` };
    });
    if (d.punch?.inPos && d.punch.in) markers.push({ id: 'punch-in', pos: d.punch.inPos, shape: 'ring', label: 'In', color: T.text, r: 3, title: `Punched in ${d.punch.in}` });
    if (d.punch?.outPos && d.punch.out) markers.push({ id: 'punch-out', pos: d.punch.outPos, shape: 'ring', label: 'Out', color: T.text, r: 3, title: `Punched out ${d.punch.out}` });
    return { paths, markers, count: d.visits.length };
  }, [ev, employeeId, date]);
  if (!paths.length && !markers.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <GeoPlot paths={paths} markers={markers} height={height} ariaLabel={`GPS trail with ${count} visit${count === 1 ? '' : 's'}`} testId="day-map" />
      <MapLegend />
    </div>
  );
}

export function MapLegend({ extra }: { extra?: { color: string; label: string; ring?: boolean }[] }) {
  const items = [
    { color: T.ok, label: 'Verified visit' }, { color: T.warn, label: 'Visit not verified' }, { color: T.text, label: 'Punch location', ring: true },
    { color: T.info, label: 'GPS trail', line: true }, ...(extra ?? []),
  ] as { color: string; label: string; ring?: boolean; line?: boolean }[];
  return (
    <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', fontSize: 12, color: T.dim }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: i.line ? 16 : 10, height: i.line ? 2 : 10, borderRadius: i.line ? 0 : 999, background: i.ring ? 'transparent' : i.color, border: i.ring ? `2px solid ${i.color}` : undefined }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/** The two check-ins that are too far apart: the day's trail in the background, the jump drawn as a dashed line. */
export function TravelMap({ ev, employeeId, date, a, b, km, mins }: {
  ev: FieldEvidence; employeeId: Id; date: ISODate; a: { pos: { lat: number; lng: number }; end: string; outletId: string }; b: { pos: { lat: number; lng: number }; start: string; outletId: string }; km: number; mins: number;
}) {
  const { paths, markers } = useMemo(() => {
    const d = dayEvidence(ev, employeeId, date);
    const trail = ev.trails.find((t) => t.employeeId === employeeId && t.date === date);
    const name = (id: string) => ev.outlets.find((o) => o.id === id)?.name ?? id;
    const paths: MapPath[] = [
      ...(trail && trail.points.length > 1 ? [{ id: 'trail', points: trail.points.map((p) => p.pos), color: T.info, width: 1.5 }] : []),
      { id: 'jump', points: [a.pos, b.pos], color: T.red, dashed: true, width: 2.5 },
    ];
    const markers: MapMarker[] = [
      ...d.visits.filter((v) => v.pos !== a.pos && v.pos !== b.pos).map((v) => ({ id: v.id, pos: v.pos, color: T.mute, r: 3, title: `${name(v.outletId)}, ${v.start}` })),
      { id: 'a', pos: a.pos, label: `Left ${a.end}`, color: T.ok, r: 6, title: `${name(a.outletId)}, left ${a.end}` },
      { id: 'b', pos: b.pos, label: `Checked in ${b.start}, ${km.toFixed(0)} km away`, color: T.red, r: 6, title: `${name(b.outletId)}, checked in ${b.start}` },
    ];
    return { paths, markers };
  }, [ev, employeeId, date, a, b, km]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <GeoPlot paths={paths} markers={markers} height={260} ariaLabel={`Two check-ins ${km.toFixed(0)} km apart, ${mins} minutes between them`} testId="travel-map" />
      <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', fontSize: 12, color: T.dim }}>
        <span>Green: the last check-in before the jump</span><span>Red: the check-in that cannot be reached in time</span><span>Dashed line: the straight-line jump</span><span>Blue: GPS trail</span>
      </div>
    </div>
  );
}
