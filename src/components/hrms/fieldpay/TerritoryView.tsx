'use client';
// Territory & beats: who covers which outlets, which outlets have gone quiet, where two people's patches overlap.
// Coverage here is about outlets, not a score for anyone.

import { useMemo, useState } from 'react';
import { Badge, Card, CardTitle, Loading, Note, Stat, StatGrid, T, useIsCompact, type Col } from '../ui';
import { Select } from '../../ui';
import { fmtDate, inr } from '../../../lib/hrms/format';
import { getFieldEvidence } from '../../../lib/hrms/field/evidence';
import type { Outlet, Territory } from '../../../lib/hrms/field/types';
import {
  applyMoves, beatPlan, coverageFor, dormantOutlets, outletActivity, outletWeekdays, overlapViews, plannedOutlets, territoryBooked, territoryCoverage,
} from '../../../lib/hrms/fieldpay/engines';
import { fieldPayStore } from '../../../lib/hrms/fieldpay/store';
import type { OutletMove } from '../../../lib/hrms/fieldpay/types';
import type { HrmsDb, Id, Month } from '../../../lib/hrms/types';
import { FIELD_MONTH_LABEL, MonthSelect, PersonSelect, WEEKDAY, linkButtonStyle, makeNamer, personColor, DataTable } from './common';
import { BeatPlanGrid, MapLegend, OutletPanel, OverlapList, TerritoryMap, TierBadge } from './TerritoryParts';

const EMPTY_MOVES: Record<Id, OutletMove> = {};
const TERR_MONTHS = ['2026-10', '2026-11'];     // the visit evidence starts on 1 Oct 2026

export default function TerritoryView({ db }: { db: HrmsDb }) {
  const ev = getFieldEvidence();
  const fp = fieldPayStore.use();
  const [month, setMonth] = useState<Month>('2026-10');
  const [scope, setScope] = useState<string>('city:Delhi');
  const [personId, setPersonId] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const narrow = useIsCompact(900);
  const namer = useMemo(() => makeNamer(db), [db]);
  const moves = fp?.moves ?? EMPTY_MOVES;
  const evx = useMemo(() => applyMoves(ev, moves), [ev, moves]);
  const activity = useMemo(() => outletActivity(ev, month), [ev, month]);
  const weekdays = useMemo(() => outletWeekdays(ev), [ev]);
  const overlapsAll = useMemo(() => overlapViews(evx), [evx]);
  const territoryRows = useMemo(() => ev.territories.map((t) => ({
    ...t, id: t.id, ...territoryBooked(ev, t.id, month), cov: territoryCoverage(evx, t.id, month, activity),
    outlets: plannedOutlets(ev).filter((o) => o.territoryId === t.id).length,
  })), [ev, evx, month, activity]);

  if (!fp) return <Loading />;

  const cities = Array.from(new Set(ev.territories.map((t) => t.city)));
  const scopeTerritories = scope.startsWith('city:') ? ev.territories.filter((t) => t.city === scope.slice(5)) : ev.territories.filter((t) => t.id === scope);
  const scopeIds = new Set(scopeTerritories.map((t) => t.id));
  const repsInScope = ev.reps.filter((r) => scopeIds.has(r.territoryId) && namer.emp(r.employeeId)).map((r) => r.employeeId);
  const person = repsInScope.includes(personId) ? personId : 'all';
  const inView: Outlet[] = plannedOutlets(evx).filter((o) => scopeIds.has(o.territoryId) && (person === 'all' || o.repId === person));
  const viewIds = new Set(inView.map((o) => o.id));
  const visitedInView = inView.filter((o) => (activity.get(o.id)?.verified ?? 0) > 0).length;
  const dormant = dormantOutlets(evx, month, activity).filter((o) => viewIds.has(o.id));
  const overlaps = overlapsAll.filter((p) => (viewIds.has(p.a) || viewIds.has(p.b)) && (person === 'all' || p.repA === person || p.repB === person));
  const selected = selectedId ? plannedOutlets(evx).find((o) => o.id === selectedId) : undefined;
  const planPerson = person !== 'all' ? person : repsInScope.slice().sort((a, b) => namer.name(a).localeCompare(namer.name(b)))[0];
  const moveCount = Object.keys(moves).length;
  const scopeLabel = scope.startsWith('city:') ? `all of ${scope.slice(5)}` : scopeTerritories[0]?.name ?? '';

  type TRow = (typeof territoryRows)[number];
  const tCols: Col<TRow>[] = [
    { key: 'name', label: 'Territory', sortValue: (r) => r.name, nowrap: true, render: (r) => (
      <button type="button" aria-label={`Show ${r.name} only`} onClick={() => { setScope(r.id); setPersonId('all'); setSelectedId(null); }} style={{ ...linkButtonStyle, fontWeight: 600, color: scope === r.id ? T.info : T.text }}>{r.name}</button>
    ) },
    { key: 'people', label: 'People', render: (r) => r.people.map((id) => namer.first(id)).join(', ') },
    { key: 'outlets', label: 'Outlets', align: 'right', sortValue: (r) => r.outlets, render: (r) => r.outlets },
    { key: 'pot', label: 'Potential per month', align: 'right', sortValue: (r) => r.potentialPerMonth, render: (r) => inr(r.potentialPerMonth), nowrap: true },
    { key: 'booked', label: `Booked, ${FIELD_MONTH_LABEL[month]}`, align: 'right', sortValue: (r) => r.booked, render: (r) => inr(r.booked), nowrap: true },
    { key: 'share', label: 'Booked vs potential', align: 'right', sortValue: (r) => r.booked / r.potentialPerMonth, render: (r) => `${Math.round((r.booked / r.potentialPerMonth) * 100)}%`, nowrap: true },
    { key: 'cov', label: 'Outlets visited', align: 'right', sortValue: (r) => r.cov.pct, render: (r) => <span>{r.cov.pct}% <span style={{ color: T.mute }}>({r.cov.visited} of {r.cov.planned})</span></span>, nowrap: true },
  ];

  type PRow = { id: Id; name: string; terr: Territory | undefined; owned: number; visited: number; pct: number; dormant: number; verifiedVisits: number };
  const pRows: PRow[] = repsInScope.map((id) => {
    const c = coverageFor(evx, id, month, activity);
    const rep = ev.reps.find((r) => r.employeeId === id)!;
    return {
      id, name: namer.name(id), terr: ev.territories.find((t) => t.id === rep.territoryId), owned: c.planned, visited: c.visited, pct: c.pct, dormant: c.missedIds.length,
      verifiedVisits: ev.visits.filter((v) => v.employeeId === id && v.verified && v.date.startsWith(month)).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const pCols: Col<PRow>[] = [
    { key: 'name', label: 'Person', sortValue: (r) => r.name, nowrap: true, render: (r) => (
      <button type="button" aria-label={`Show only ${r.name}`} onClick={() => { setPersonId(r.id); setSelectedId(null); }} style={{ ...linkButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: personColor(r.id), display: 'inline-block' }} />{r.name}
      </button>
    ) },
    { key: 'terr', label: 'Territory', render: (r) => r.terr?.name ?? '—', nowrap: true },
    { key: 'owned', label: 'Outlets now', align: 'right', sortValue: (r) => r.owned, render: (r) => r.owned },
    { key: 'visits', label: 'Verified visits', align: 'right', sortValue: (r) => r.verifiedVisits, render: (r) => r.verifiedVisits },
    { key: 'cov', label: 'Outlets visited', align: 'right', sortValue: (r) => r.pct, render: (r) => <span data-testid={`cov-${r.id}`}>{r.pct}% <span style={{ color: T.mute }}>({r.visited} of {r.owned})</span></span>, nowrap: true },
    { key: 'dormant', label: 'Dormant', align: 'right', sortValue: (r) => r.dormant, render: (r) => r.dormant },
  ];

  type DRow = Outlet & { id: string };
  const dCols: Col<DRow>[] = [
    { key: 'name', label: 'Outlet', sortValue: (o) => o.name, nowrap: true, render: (o) => (
      <button type="button" aria-label={`Show ${o.name} on the map`} onClick={() => setSelectedId(o.id)} style={{ ...linkButtonStyle, fontWeight: 600 }}>{o.name}</button>
    ) },
    { key: 'tier', label: 'Tier', sortValue: (o) => o.tier, render: (o) => <TierBadge tier={o.tier} /> },
    { key: 'who', label: 'Belongs to', sortValue: (o) => namer.name(o.repId), render: (o) => namer.name(o.repId), nowrap: true },
    { key: 'area', label: 'Area', render: (o) => o.area, nowrap: true },
    { key: 'day', label: 'Beat day', render: (o) => WEEKDAY[weekdays.get(o.id) ?? 0] },
    { key: 'visits', label: 'Visits this month', align: 'right', render: (o) => { const a = activity.get(o.id); return a?.total ? `${a.total}, none verified` : 'None'; }, nowrap: true },
    { key: 'last', label: 'Last verified visit', render: (o) => { const a = activity.get(o.id); return a?.lastVerified ? fmtDate(a.lastVerified) : 'None since 1 Oct'; }, nowrap: true },
  ];

  return (
    <>
      <Note>Coverage is about outlets: how many planned outlets got a verified visit (phone within 150 m, a photo, at least 5 minutes on site). It is not a performance score for any person. Overlaps and dormant outlets are prompts to rebalance the beats, not to blame anyone.</Note>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <MonthSelect value={month} onChange={setMonth} months={TERR_MONTHS} />
        <Select aria-label="Territory" value={scope} onChange={(e) => { setScope(e.target.value); setPersonId('all'); setSelectedId(null); }} style={{ width: 230 }}>
          {cities.map((c) => <option key={c} value={`city:${c}`}>All of {c}</option>)}
          {ev.territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <PersonSelect value={person} onChange={(v) => { setPersonId(v); setSelectedId(null); }} ids={repsInScope} namer={namer} allLabel="Everyone in view" width={230} />
      </div>

      <StatGrid min={170}>
        <div data-testid="ter-stat-outlets"><Stat label="Outlets in view" value={inView.length} hint={scopeLabel} /></div>
        <div data-testid="ter-stat-coverage"><Stat label="Visited this month" value={`${inView.length ? Math.round((visitedInView / inView.length) * 100) : 0}%`} hint={`${visitedInView} of ${inView.length} outlets, ${FIELD_MONTH_LABEL[month]}`} /></div>
        <div data-testid="ter-stat-dormant"><Stat label="Dormant outlets" value={dormant.length} tone={dormant.length ? 'warn' : undefined} hint="No verified visit this month" /></div>
        <div data-testid="ter-stat-overlaps"><Stat label="Overlapping pairs" value={overlaps.length} tone={overlaps.length ? 'warn' : undefined} hint="Two people, 500 m or less" /></div>
        <div data-testid="ter-stat-moves"><Stat label="Outlets reassigned" value={moveCount} hint={moveCount ? 'Shown on the map and in coverage' : 'None yet'} /></div>
      </StatGrid>

      <div data-testid="territory-table">
        <DataTable<TRow> columns={tCols} rows={territoryRows} minWidth={860} />
      </div>
      {month === '2026-11' && <Note>November is in progress (evidence runs to 6 Nov), so booked revenue and coverage are part-month figures.</Note>}

      <Card>
        <CardTitle right={<Badge tone="neutral">{scopeLabel}{person !== 'all' ? `, ${namer.first(person)}` : ''}</Badge>}>Map of outlets</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <TerritoryMap outlets={inView} activity={activity} overlaps={overlaps} selectedId={selected?.id} namer={namer} onSelect={setSelectedId} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <MapLegend ids={person === 'all' ? repsInScope : [person]} outlets={inView} namer={namer} />
            {selected
              ? <OutletPanel key={selected.id} ev={evx} outlet={selected} activity={activity.get(selected.id)} move={moves[selected.id]} namer={namer} weekday={weekdays.get(selected.id) ?? 0} onClose={() => setSelectedId(null)} />
              : <div style={{ fontSize: 13, color: T.dim }}>Click an outlet on the map, or a name in a list, to see it and reassign it.</div>}
          </div>
        </div>
      </Card>

      <div data-testid="overlap-card">
        <Card>
          <CardTitle>Overlaps</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
              Pairs of outlets that belong to two different people and are 500 m or less apart. Two people calling on the same area waste a trip. The suggestion hands the outlet to the person who already has more outlets around it. You decide.
            </div>
            <OverlapList pairs={overlaps} ev={evx} namer={namer} onShow={setSelectedId} />
          </div>
        </Card>
      </div>

      <div data-testid="people-table">
        <Card padding={0}>
          <div style={{ padding: '16px 20px 0' }}><CardTitle>People in view, {FIELD_MONTH_LABEL[month]}</CardTitle></div>
          <div style={{ padding: '0 16px 16px' }}><DataTable<PRow> columns={pCols} rows={pRows} minWidth={700} /></div>
        </Card>
      </div>

      <Card>
        <CardTitle right={planPerson ? <Badge tone="neutral">{namer.name(planPerson)}</Badge> : undefined}>
          Beat plan{planPerson ? `: ${namer.name(planPerson)}` : ''}
        </CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.dim }}>Six days, Monday to Saturday. {person === 'all' ? 'Pick a person above to see someone else.' : ''} A moved outlet keeps its beat day with its new owner.</div>
          {planPerson && <BeatPlanGrid plan={beatPlan(evx, planPerson)} activity={activity} namer={namer} moves={moves} onSelect={setSelectedId} selectedId={selected?.id} />}
        </div>
      </Card>

      <div data-testid="dormant-card">
        <Card padding={0}>
          <div style={{ padding: '16px 20px 0' }}><CardTitle right={<span style={{ fontSize: 13, color: T.dim }}>{dormant.length} outlets, tier A first</span>}>Dormant outlets</CardTitle>
            <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12 }}>Planned outlets with no verified visit in {FIELD_MONTH_LABEL[month]}. A visit that was made but not verified (too far from the outlet, no photo, or too short) does not count.</div></div>
          <div style={{ padding: '0 16px 16px' }}><DataTable<DRow> columns={dCols} rows={dormant as DRow[]} minWidth={860} empty="Every planned outlet in view had a verified visit." /></div>
        </Card>
      </div>
    </>
  );
}
