'use client';
// Pieces of the territory screen: the map, the selected-outlet panel, the beat plan grid and the overlap list.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, KeyValue, T } from '../ui';
import { Select } from '../../ui';
import { GeoPlot, type MapMarker } from '../field/GeoPlot';
import { fmtDate } from '../../../lib/hrms/format';
import { reassignOutlet, undoReassignment } from '../../../lib/hrms/fieldpay/store';
import type { FieldEvidence, Outlet } from '../../../lib/hrms/field/types';
import type { Id } from '../../../lib/hrms/types';
import type { OutletActivity, OutletMove, OverlapView } from '../../../lib/hrms/fieldpay/types';
import { WEEKDAY, personColor, type Namer } from './common';

const TYPE_LABEL: Record<Outlet['type'], string> = { retail: 'Retail', distributor: 'Distributor', dealer: 'Dealer', site: 'Site' };
export const TierBadge = ({ tier }: { tier: Outlet['tier'] }) => <Badge tone={tier === 'A' ? 'info' : 'neutral'}>Tier {tier}</Badge>;

// ───────────────────────────── map ─────────────────────────────
export function TerritoryMap({ outlets, activity, overlaps, selectedId, namer, onSelect }: {
  outlets: Outlet[]; activity: Map<Id, OutletActivity>; overlaps: OverlapView[]; selectedId?: Id; namer: Namer; onSelect: (id: Id) => void;
}) {
  const inView = new Set(outlets.map((o) => o.id));
  const markers: MapMarker[] = outlets.map((o) => {
    const visited = (activity.get(o.id)?.verified ?? 0) > 0;
    return {
      id: o.id, pos: o.pos, color: personColor(o.repId), shape: visited ? 'dot' : 'square', r: visited ? 4 : 4.5,
      title: `${o.name}, tier ${o.tier}, ${namer.name(o.repId)}, ${visited ? 'visited' : 'no verified visit'}`,
    };
  });
  const ringed = new Set<Id>();
  for (const p of overlaps) for (const id of [p.a, p.b]) if (inView.has(id) && !ringed.has(id)) {
    ringed.add(id);
    const o = outlets.find((x) => x.id === id)!;
    markers.push({ id: `ring:${id}`, pos: o.pos, shape: 'ring', color: T.warn, r: 4, title: `${o.name}: within 500 m of another person's outlet` });
  }
  const sel = outlets.find((o) => o.id === selectedId);
  if (sel) markers.push({ id: `sel:${sel.id}`, pos: sel.pos, shape: 'ring', color: T.text, r: 7, label: sel.name, title: sel.name });
  return (
    <GeoPlot markers={markers} height={400} ariaLabel="Outlets coloured by person" testId="territory-plot"
      onMarkerClick={(id) => onSelect(id.replace(/^(ring|sel):/, ''))} />
  );
}

export function MapLegend({ ids, outlets, namer }: { ids: Id[]; outlets: Outlet[]; namer: Namer }) {
  return (
    <div data-testid="map-legend" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        {ids.map((id) => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: personColor(id), display: 'inline-block' }} />
            {namer.name(id)} <span style={{ color: T.mute }}>({outlets.filter((o) => o.repId === id).length})</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
        <span>Dot: verified visit this month</span>
        <span>Square: no verified visit</span>
        <span><span style={{ color: T.warn }}>◯</span> Ring: within 500 m of another person&apos;s outlet</span>
      </div>
    </div>
  );
}

// ───────────────────────────── selected outlet ─────────────────────────────
export function OutletPanel({ ev, outlet, activity, move, namer, weekday, onClose }: {
  ev: FieldEvidence; outlet: Outlet; activity?: OutletActivity; move?: OutletMove; namer: Namer; weekday: number; onClose: () => void;
}) {
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const options = ev.reps.map((r) => r.employeeId).filter((id) => id !== outlet.repId && namer.emp(id));
  const target = to || options[0] || '';
  const doMove = () => { const r = reassignOutlet(outlet.id, target); setError(r.ok ? '' : r.error); };
  return (
    <div data-testid="outlet-panel">
      <Card padding={16}>
        <CardTitle right={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>{outlet.name}</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <KeyValue columns={2} rows={[
            { label: 'Belongs to', value: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: personColor(outlet.repId), display: 'inline-block' }} /><span data-testid="outlet-owner">{namer.name(outlet.repId)}</span></span> },
            { label: 'Type and tier', value: `${TYPE_LABEL[outlet.type]}, tier ${outlet.tier}` },
            { label: 'Area', value: outlet.area },
            { label: 'Beat day', value: WEEKDAY[weekday] ?? '—' },
            { label: 'Visits this month', value: `${activity?.total ?? 0}, of which ${activity?.verified ?? 0} verified` },
            { label: 'Last verified visit', value: activity?.lastVerified ? fmtDate(activity.lastVerified) : 'None since 1 Oct' },
          ]} />
          {move && (
            <div style={{ fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span>Moved from {namer.name(move.fromRepId)} by {move.by}. An earlier visit by {namer.first(move.fromRepId)} still counts for the outlet.</span>
              <div><Button size="sm" onClick={() => undoReassignment(outlet.id)}>Undo the move</Button></div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select aria-label="Reassign this outlet to" value={target} onChange={(e) => { setTo(e.target.value); setError(''); }} style={{ width: 220 }}>
              {options.map((id) => <option key={id} value={id}>{namer.name(id)}</option>)}
            </Select>
            <Button onClick={doMove}>Reassign outlet</Button>
          </div>
          {error && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{error}</div>}
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────────── beat plan ─────────────────────────────
export function BeatPlanGrid({ plan, activity, namer, moves, onSelect, selectedId }: {
  plan: Record<number, Outlet[]>; activity: Map<Id, OutletActivity>; namer: Namer; moves: Record<Id, OutletMove>; onSelect: (id: Id) => void; selectedId?: Id;
}) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg }}>
      <div data-testid="beat-plan" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(168px, 1fr))', minWidth: 1020 }}>
        {[1, 2, 3, 4, 5, 6].map((d) => {
          const list = plan[d] ?? [];
          const done = list.filter((o) => (activity.get(o.id)?.verified ?? 0) > 0).length;
          return (
            <div key={d} data-testid={`beat-day-${d}`} style={{ borderLeft: d > 1 ? `1px solid ${T.border}` : undefined, minWidth: 0 }}>
              <div style={{ padding: '10px 12px', background: T.panel, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 13.5 }}>{WEEKDAY[d]}</div>
                <div style={{ fontSize: 12, color: T.dim }}>{list.length} outlets, {done} visited</div>
              </div>
              <ul style={{ margin: 0, padding: 6, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {list.map((o) => {
                  const a = activity.get(o.id);
                  const v = a?.verified ?? 0;
                  const mv = moves[o.id];
                  return (
                    <li key={o.id}>
                      <button type="button" onClick={() => onSelect(o.id)} aria-label={`Show ${o.name} on the map`} style={{
                        width: '100%', textAlign: 'left', border: `1px solid ${o.id === selectedId ? T.info : T.border}`, borderRadius: T.radius.sm, background: T.card, color: T.text,
                        padding: '6px 8px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 2,
                      }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                          <span style={{ color: T.mute, fontWeight: 500 }}>{o.tier}</span>
                        </span>
                        <span style={{ fontSize: 11.5, color: v ? T.dim : T.warn }}>{v ? `${v} verified visit${v === 1 ? '' : 's'}` : (a?.total ? `${a.total} visit${a.total === 1 ? '' : 's'}, none verified` : 'Not visited')}</span>
                        {mv && <span style={{ fontSize: 11.5, color: T.info }}>Moved from {namer.first(mv.fromRepId)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── overlaps ─────────────────────────────
export function OverlapList({ pairs, ev, namer, onShow }: { pairs: OverlapView[]; ev: FieldEvidence; namer: Namer; onShow: (id: Id) => void }) {
  const [all, setAll] = useState(false);
  const byId = new Map(ev.outlets.map((o) => [o.id, o]));
  const shown = all ? pairs : pairs.slice(0, 4);
  if (!pairs.length) return <div data-testid="no-overlaps" style={{ fontSize: 13.5, color: T.dim }}>No outlets of two different people are within 500 m of each other in this view.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ul data-testid="overlap-list" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((p) => {
          const a = byId.get(p.a)!, b = byId.get(p.b)!;
          const s = p.suggestion;
          const moveOutlet = byId.get(s.moveOutletId)!;
          const other = (id: Id) => (id === p.repA ? p.repB : p.repA);
          return (
            <li key={`${p.a}|${p.b}`} data-testid="overlap-row" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <b>{a.name}</b> ({namer.name(p.repA)}, {WEEKDAY[p.weekdayA]}) and <b>{b.name}</b> ({namer.name(p.repB)}, {WEEKDAY[p.weekdayB]}) are <b>{p.metres} m</b> apart.
              </div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>
                Suggested: move {moveOutlet.name} from {namer.first(s.fromRepId)} to {namer.first(s.toRepId)}. {namer.first(s.toRepId)} has {s.nearTo} outlets within 1 km of here, {namer.first(s.fromRepId)} has {s.nearFrom}.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[a, b].map((o) => {
                  const suggested = o.id === s.moveOutletId;
                  const to = other(o.repId);
                  return (
                    <Button key={o.id} size="sm" variant={suggested ? 'primary' : 'secondary'}
                      aria-label={`Move ${o.name} from ${namer.first(o.repId)} to ${namer.first(to)}${suggested ? ' (suggested)' : ''}`}
                      onClick={() => reassignOutlet(o.id, to)}>
                      Move {o.name} to {namer.first(to)}{suggested ? ' (suggested)' : ''}
                    </Button>
                  );
                })}
                <Button size="sm" variant="ghost" onClick={() => onShow(a.id)}>Show on the map</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {pairs.length > 4 && <div><Button size="sm" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${pairs.length}`}</Button></div>}
    </div>
  );
}
