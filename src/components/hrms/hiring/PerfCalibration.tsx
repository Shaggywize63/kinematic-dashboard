'use client';
// Calibration: how ratings are spread, as an aggregate only. Individual ratings appear inside the HR table and nowhere else,
// a group under five people gets no chart, and a rating can be moved only with a written reason that is kept in a log.
// No forced distribution is applied: there is no target curve and no quota for any rating.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Modal, Note, T, type Col } from '../ui';
import { Field, Segmented, Select, Textarea } from '../../ui';
import { fmtDate } from '../../../lib/hrms/format';
import type { HrmsDb } from '../../../lib/hrms/types';
import { RATING_LABEL, type HiringState, type Review } from '../../../lib/hrms/hiring/types';
import { MIN_TEAM, distributionVisible, finalRating, isSubmitted, ratingDistribution, validateMove } from '../../../lib/hrms/hiring/perfEngines';
import { moveRating } from '../../../lib/hrms/hiring/store';
import { ColumnChart } from './charts';
import { Lead, Row, deptName, empName, subtle, toast, mono } from './shared';
import { participants } from './perfShared';

export default function PerfCalibration({ db, st }: { db: HrmsDb; st: HiringState }) {
  const [scope, setScope] = useState('all');
  const [viewer, setViewer] = useState<'hr' | 'manager'>('hr');
  const [moving, setMoving] = useState<Review | null>(null);
  const all = participants(db, st);
  const inScope = all.filter((p) => scope === 'all' || p.departmentId === scope);
  const ratings = inScope.map((p) => finalRating(p.review)).filter((x): x is number => x != null);
  const size = inScope.length;
  const visible = distributionVisible(size);
  const dist = ratingDistribution(ratings);
  const depts = db.departments.filter((d) => all.some((p) => p.departmentId === d.id));
  const moves = st.reviews.flatMap((r) => r.moves.map((m) => ({ ...m, employeeId: r.employeeId }))).sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));

  type R = (typeof inScope)[number] & { id: string };
  const cols: Col<R>[] = [
    { key: 'e', label: 'Employee', sortValue: (r) => empName(db, r.review.employeeId), render: (r) => <span style={{ fontWeight: 600 }}>{empName(db, r.review.employeeId)}</span> },
    { key: 'd', label: 'Department', render: (r) => deptName(db, r.departmentId) },
    { key: 'mg', label: 'Manager rating', align: 'right', nowrap: true, sortValue: (r) => r.review.manager.overall ?? 0, render: (r) => isSubmitted(r.review.manager) ? <span style={mono}>{r.review.manager.overall}</span> : <span style={{ color: T.mute }}>Not submitted</span> },
    { key: 'sf', label: 'Self rating', align: 'right', nowrap: true, render: (r) => isSubmitted(r.review.self) ? <span style={mono}>{r.review.self.overall}</span> : <span style={{ color: T.mute }}>—</span> },
    { key: 'f', label: 'Rating that stands', align: 'right', nowrap: true, sortValue: (r) => finalRating(r.review) ?? 0, render: (r) => { const f = finalRating(r.review); return f == null ? <span style={{ color: T.mute }}>—</span> : <span style={{ ...mono, fontWeight: 700 }}>{f}{r.review.moves.length > 0 && <span style={{ color: T.warn }}> (moved)</span>}</span>; } },
    { key: 'a', label: '', align: 'right', render: (r) => <Button size="sm" disabled={finalRating(r.review) == null} title={finalRating(r.review) == null ? 'The manager has not submitted a rating' : undefined} aria-label={`Move the rating of ${empName(db, r.review.employeeId)}`} onClick={() => setMoving(r.review)}>Move rating</Button> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="calibration" data-viewer={viewer}>
      <Note tone="info"><b>No forced distribution is applied.</b> There is no target curve, no quota and no cap on any rating. Calibration only checks that managers applied the scale consistently. It does not change anyone&apos;s pay.</Note>
      <Row>
        <div style={{ width: 240 }}><Select aria-label="Group" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">Everyone in the cycle</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: T.dim }}>Viewing as</span>
        <Segmented value={viewer} onChange={setViewer} options={[{ value: 'hr', label: 'HR' }, { value: 'manager', label: 'Manager' }]} />
      </Row>

      <Card padding={16}>
        <CardTitle right={<Badge>{size} people in this group</Badge>}>Rating distribution</CardTitle>
        {visible ? (
          <>
            <Lead>How many people have each rating that stands, out of {ratings.length} rated of {size}. Counts only: no names appear in this chart.</Lead>
            <ColumnChart testId="dist-chart" ariaLabel="Number of people at each rating" height={200} labels={[1, 2, 3, 4, 5].map((n) => `${n} ${RATING_LABEL[n]!.split(' ')[0]}`)}
              stacks={[{ id: 'n', label: 'people', color: 'var(--hv-1)', values: dist }]} />
            <div data-testid="dist-text" style={{ ...subtle, marginTop: 6 }}>{dist.map((c, i) => `${i + 1}: ${c}`).join(' · ')}. {size - ratings.length} not yet rated.</div>
          </>
        ) : (
          <div data-testid="dist-hidden" style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, padding: 16, fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
            Not shown: fewer than {MIN_TEAM} people in this group. With so few people a chart would point at individuals. Choose a larger group, or use the calibration table below as HR.
          </div>
        )}
      </Card>

      <Card padding={16}>
        <CardTitle>Calibration table</CardTitle>
        {viewer === 'hr' ? (
          <>
            <Lead>HR only. Individual ratings are shown here and in no other view. To change a rating you must write the reason. Every move is logged below, with who and when.</Lead>
            <div data-testid="calibration-table"><DataTable columns={cols} rows={inScope.map((p) => ({ ...p, id: p.review.id }))} minWidth={760} empty="No one in this group." /></div>
          </>
        ) : (
          <div data-testid="table-hidden" style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, padding: 16, fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
            Individual ratings are visible only to HR, inside the calibration table. A manager sees their own team&apos;s reviews in the Reviews tab, and the group chart only when the group has at least {MIN_TEAM} people.
          </div>
        )}
      </Card>

      <Card padding={16}>
        <CardTitle>Calibration log</CardTitle>
        {viewer !== 'hr' ? <div style={subtle}>The log names individuals, so it is shown to HR only.</div>
          : moves.length === 0 ? <div data-testid="move-log-empty" style={subtle}>No ratings have been moved. A move needs a written reason and appears here.</div>
          : (
            <ol data-testid="move-log" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {moves.map((m) => (
                <li key={m.id} style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
                  <span style={{ ...mono, color: T.mute }}>{fmtDate(m.on)}</span> <b>{empName(db, m.employeeId)}</b>: {m.from} to {m.to} by {m.by}.
                  <div style={{ color: T.dim }}>Reason: {m.reason}</div>
                </li>
              ))}
            </ol>
          )}
      </Card>
      {moving && <MoveDialog db={db} review={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

function MoveDialog({ db, review, onClose }: { db: HrmsDb; review: Review; onClose: () => void }) {
  const current = finalRating(review)!;
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const problem = to ? validateMove(review, Number(to), reason) : 'Choose the new rating.';
  return (
    <Modal title={`Move the rating of ${empName(db, review.employeeId)}`} width={500} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!problem} title={problem ?? undefined} onClick={() => {
        const r = moveRating(review.id, Number(to), reason);
        if (r.ok) { toast.success('Rating moved and logged.'); onClose(); } else setErr(r.error);
      }}>Move and log</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>The manager rated {review.manager.overall}. The rating that stands is <b style={{ color: T.text }}>{current}</b> ({RATING_LABEL[current]}). A change is a decision by people, with a reason anyone can read later. It does not change pay.</div>
      <Field label="New rating" required htmlFor="mv-to"><Select id="mv-to" value={to} onChange={(e) => { setTo(e.target.value); setErr(null); }}><option value="">Choose</option>{[1, 2, 3, 4, 5].filter((n) => n !== current).map((n) => <option key={n} value={n}>{n} · {RATING_LABEL[n]}</option>)}</Select></Field>
      <Field label="Reason" required htmlFor="mv-reason" hint="At least 10 characters. Say what evidence moved it."><Textarea id="mv-reason" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} /></Field>
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
