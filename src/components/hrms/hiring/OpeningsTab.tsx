'use client';
// Openings (requisitions): create, edit, send for approval, HR decision, hold and resume. The one hard rule is enforced
// in the store and explained here: an opening cannot go live for more seats than the workforce plan approves.

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, DataTable, Modal, Note, T, Toolbar, type Col } from '../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../ui';
import { fmtDate, inrShort } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import { OPENING_STATUS_LABEL, type HiringState, type Opening, type OpeningStatus } from '../../../lib/hrms/hiring/types';
import { openingAge, pipelineCounts, validateOpening } from '../../../lib/hrms/hiring/engines';
import { decideOpening, deleteOpening, holdOpening, openingRoom, resumeOpening, saveOpening, submitOpening } from '../../../lib/hrms/hiring/store';
import { OPENING_TONE, ReasonDialog, Row, deptName, empName, locName, report, subtle, toast } from './shared';

const FILTERS: { value: 'all' | OpeningStatus; label: string }[] = [
  { value: 'all', label: 'All openings' }, { value: 'draft', label: 'Draft' }, { value: 'pending_approval', label: 'Pending approval' },
  { value: 'open', label: 'Open' }, { value: 'on_hold', label: 'On hold' }, { value: 'filled', label: 'Filled' },
];

export default function OpeningsTab({ db, st, openId, setOpenId }: { db: HrmsDb; st: HiringState; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [filter, setFilter] = useState<'all' | OpeningStatus>('all');
  const rows = st.openings.filter((o) => filter === 'all' || o.status === filter);
  const flagged = (o: Opening) => o.status !== 'filled' && !openingRoom(st, db, o).ok;

  const cols: Col<Opening>[] = [
    { key: 'title', label: 'Opening', sortValue: (o) => o.title, render: (o) => (
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{o.title}</div><div style={{ fontSize: 12, color: T.mute }}>{deptName(db, o.departmentId)} · {locName(db, o.locationId)}</div></div>
    ) },
    { key: 'seats', label: 'Seats', align: 'right', nowrap: true, sortValue: (o) => o.headcount, render: (o) => <span>{o.filled}/{o.headcount} filled</span> },
    { key: 'band', label: 'CTC band', nowrap: true, render: (o) => `${inrShort(o.bandMin)} to ${inrShort(o.bandMax)}` },
    { key: 'mgr', label: 'Hiring manager', render: (o) => empName(db, o.hiringManagerId), sortValue: (o) => empName(db, o.hiringManagerId) },
    { key: 'status', label: 'Status', nowrap: true, sortValue: (o) => o.status, render: (o) => (
      <Row gap={6} wrap><Badge tone={OPENING_TONE[o.status]} dot>{OPENING_STATUS_LABEL[o.status]}</Badge>{flagged(o) && <Badge tone="red" dot>Over plan</Badge>}</Row>
    ) },
    { key: 'age', label: 'Age', align: 'right', nowrap: true, sortValue: (o) => openingAge(o, PREVIEW_TODAY), render: (o) => (
      <span title={o.openedOn ? `Live since ${fmtDate(o.openedOn)}` : `Created ${fmtDate(o.createdOn)}, not live yet`}>{openingAge(o, PREVIEW_TODAY)} days{!o.openedOn && <span style={{ color: T.mute }}> waiting</span>}</span>
    ) },
    { key: 'pipe', label: 'In pipeline', align: 'right', nowrap: true, render: (o) => { const p = pipelineCounts(st.candidates, o.id); return <span>{p.applied + p.screen + p.interview + p.offer} active</span>; } },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <div style={{ width: 200 }}><Select aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | OpeningStatus)}>{FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => setOpenId('new')}>New opening</Button>
      </Toolbar>
      <DataTable columns={cols} rows={rows} onRowClick={(o) => setOpenId(o.id)} minWidth={820} empty="No openings match this filter." />
      <div style={subtle}>Click a row to edit, send for approval, decide or put on hold. An opening marked Over plan asks for more seats than the <Link href="/dashboard/hrms/workforce-planning" style={{ color: T.info }}>workforce plan</Link> approves.</div>
      {openId && <OpeningModal db={db} st={st} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

interface Form { title: string; departmentId: string; locationId: string; designationId: string; headcount: string; bandMin: string; bandMax: string; hiringManagerId: string }
const toForm = (o?: Opening): Form => ({
  title: o?.title ?? '', departmentId: o?.departmentId ?? '', locationId: o?.locationId ?? '', designationId: o?.designationId ?? '', headcount: String(o?.headcount ?? 1),
  bandMin: o ? String(o.bandMin) : '', bandMax: o ? String(o.bandMax) : '', hiringManagerId: o?.hiringManagerId ?? '',
});
const num = (s: string) => Number(s.replace(/,/g, ''));

function OpeningModal({ db, st, id, onClose }: { db: HrmsDb; st: HiringState; id: string; onClose: () => void }) {
  const isNew = id === 'new';
  const o = isNew ? undefined : st.openings.find((x) => x.id === id);
  const [f, setF] = useState<Form>(toForm(o));
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState<null | 'reject' | 'hold'>(null);
  if (!isNew && !o) return null;
  const set = <K extends keyof Form>(k: K, v: string) => { setF((x) => ({ ...x, [k]: v })); setErr(null); };
  const readOnly = o?.status === 'filled';
  const people = db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice');

  const draftOpening: Opening = {
    id: o?.id ?? 'new', title: f.title, departmentId: f.departmentId, locationId: f.locationId, designationId: f.designationId, headcount: num(f.headcount), filled: o?.filled ?? 0,
    bandMin: num(f.bandMin), bandMax: num(f.bandMax), hiringManagerId: f.hiringManagerId, status: o?.status ?? 'draft', createdOn: o?.createdOn ?? PREVIEW_TODAY, approvals: o?.approvals ?? [],
  };
  const problems = validateOpening(draftOpening).errors;
  const room = f.departmentId && f.locationId ? openingRoom(st, db, draftOpening) : null;
  const dirty = !o || JSON.stringify(toForm(o)) !== JSON.stringify(f);
  const input = { id: o?.id, title: f.title, departmentId: f.departmentId, locationId: f.locationId, designationId: f.designationId, headcount: num(f.headcount), bandMin: num(f.bandMin), bandMax: num(f.bandMax), hiringManagerId: f.hiringManagerId };

  const save = (andSend: boolean) => {
    const r = saveOpening(input);
    if (!r.ok) { setErr(r.error); return; }
    if (andSend) { const s = submitOpening(r.value, undefined); if (!s.ok) { setErr(s.error); return; } toast.success('Saved and sent for approval.'); }
    else toast.success(isNew ? 'Draft created.' : 'Opening saved.');
    onClose();
  };

  return (
    <Modal title={isNew ? 'New opening' : o!.title} width={820} onClose={onClose}>
      <div data-testid="opening-modal" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {o && <Row gap={8}><Badge tone={OPENING_TONE[o.status]} dot>{OPENING_STATUS_LABEL[o.status]}</Badge>
          <span style={subtle}>{o.openedOn ? `Live since ${fmtDate(o.openedOn)} · ${openingAge(o, PREVIEW_TODAY)} days` : `Created ${fmtDate(o.createdOn)}, not live yet`} · {o.filled} of {o.headcount} filled</span></Row>}
        {o?.status === 'on_hold' && o.holdReason && <Note tone="info">On hold: {o.holdReason}</Note>}

        <FormGrid narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="Title" required htmlFor="op-title"><Input id="op-title" value={f.title} disabled={readOnly} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Department" required htmlFor="op-dept"><Select id="op-dept" value={f.departmentId} disabled={readOnly} onChange={(e) => set('departmentId', e.target.value)}><option value="">Select</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Location" required htmlFor="op-loc"><Select id="op-loc" value={f.locationId} disabled={readOnly} onChange={(e) => set('locationId', e.target.value)}><option value="">Select</option>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Designation" required htmlFor="op-des"><Select id="op-des" value={f.designationId} disabled={readOnly} onChange={(e) => set('designationId', e.target.value)}><option value="">Select</option>{db.designations.map((d) => <option key={d.id} value={d.id}>{d.name}{d.grade ? ` (${d.grade})` : ''}</option>)}</Select></Field>
          <Field label="Headcount (seats)" required htmlFor="op-hc" hint={o && o.filled ? `${o.filled} already filled` : undefined}><Input id="op-hc" inputMode="numeric" value={f.headcount} disabled={readOnly} onChange={(e) => set('headcount', e.target.value)} /></Field>
          <Field label="Hiring manager" required htmlFor="op-mgr"><Select id="op-mgr" value={f.hiringManagerId} disabled={readOnly} onChange={(e) => set('hiringManagerId', e.target.value)}><option value="">Select</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</Select></Field>
          <Field label="CTC band, bottom (₹ a year)" required htmlFor="op-bmin"><Input id="op-bmin" inputMode="numeric" value={f.bandMin} disabled={readOnly} onChange={(e) => set('bandMin', e.target.value)} /></Field>
          <Field label="CTC band, top (₹ a year)" required htmlFor="op-bmax"><Input id="op-bmax" inputMode="numeric" value={f.bandMax} disabled={readOnly} onChange={(e) => set('bandMax', e.target.value)} /></Field>
        </FormGrid>

        {room && o?.status !== 'filled' && (
          <div data-testid="room-check" style={{ border: `1px solid ${room.ok ? T.border : T.red}`, borderRadius: T.radius.md, padding: 12, background: room.ok ? T.card : T.redWash, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row gap={8}><Badge tone={room.ok ? 'ok' : 'red'} dot>{room.ok ? 'Within the approved plan' : 'Above the approved plan'}</Badge><b style={{ fontSize: 13, color: T.text }}>Approved headcount check</b></Row>
            <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.55 }}>{room.message}</div>
            <div><Link href="/dashboard/hrms/workforce-planning" style={{ fontSize: 12.5, color: T.info }}>Open the workforce plan</Link></div>
          </div>
        )}
        {err && <Note tone="red">{err}</Note>}
        {dirty && problems.length > 0 && !isNew && <div style={subtle}>{problems[0]}</div>}

        {o?.status === 'pending_approval' && (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b style={{ fontSize: 14, color: T.text }}>HR decision</b>
            <div style={subtle}>Approving takes the opening live with the stated seats. Rejecting sends it back to a draft with your note.</div>
            <Field label="Note for the hiring manager" htmlFor="op-note"><Textarea id="op-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {room && !room.ok && <Note tone="red"><span data-testid="approve-blocked">Approve is blocked until the plan allows these seats. See the headcount check above.</span></Note>}
            <Row>
              <Button variant="primary" disabled={dirty || (room ? !room.ok : false)} onClick={() => { if (report(decideOpening(o.id, 'approve', note), 'Approved. The opening is live.')) onClose(); }}>Approve and open</Button>
              <Button variant="danger" disabled={dirty || note.trim().length < 5} onClick={() => { if (report(decideOpening(o.id, 'reject', note), 'Rejected. Back to draft with your note.')) onClose(); }}>Reject with note</Button>
              {dirty && <span style={subtle}>Save your edits first.</span>}
              {!dirty && note.trim().length < 5 && <span style={subtle}>Rejecting needs a note of a few words.</span>}
            </Row>
          </div>
        )}

        {o && o.approvals.length > 0 && (
          <div>
            <b style={{ fontSize: 13.5, color: T.text }}>Approval history</b>
            <ol data-testid="approval-history" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...o.approvals].reverse().map((a) => (
                <li key={a.id} style={{ fontSize: 13, color: T.text, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: T.mute, minWidth: 92, fontFamily: T.mono }}>{fmtDate(a.on)}</span>
                  <b style={{ textTransform: 'capitalize' }}>{a.decision}</b><span style={{ color: T.dim }}>by {a.by}{a.note ? `: ${a.note}` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <Row style={{ justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <Row>
            {o?.status === 'draft' && <Button variant="danger" onClick={() => { if (report(deleteOpening(o.id), 'Draft deleted.')) onClose(); }}>Delete draft</Button>}
            {o?.status === 'open' && <Button onClick={() => setDialog('hold')}>Put on hold</Button>}
            {o?.status === 'on_hold' && <Button onClick={() => { if (report(resumeOpening(o.id), 'Resumed. The opening is open again.')) onClose(); }}>Resume</Button>}
          </Row>
          <Row>
            <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
            {isNew && <><Button disabled={problems.length > 0} onClick={() => save(false)} title={problems[0]}>Create draft</Button><Button variant="primary" disabled={problems.length > 0} onClick={() => save(true)} title={problems[0]}>Create and send for approval</Button></>}
            {o && !readOnly && <Button disabled={!dirty || problems.length > 0} onClick={() => save(false)} title={problems[0]}>Save changes</Button>}
            {o?.status === 'draft' && <Button variant="primary" disabled={dirty || problems.length > 0} title={dirty ? 'Save your changes first' : undefined} onClick={() => { if (report(submitOpening(o.id), 'Sent for approval.')) onClose(); }}>Send for approval</Button>}
          </Row>
        </Row>
        {o?.status === 'draft' && dirty && <div style={subtle}>Save your changes before sending for approval.</div>}
      </div>
      {dialog === 'hold' && o && <ReasonDialog title="Put the opening on hold" label="Why is it on hold?" confirmLabel="Put on hold" intro="The seats stay reserved in the plan. New candidates cannot be added until you resume."
        onConfirm={(t) => { const r = holdOpening(o.id, t); if (!r.ok) return r.error; toast.success('Opening on hold.'); onClose(); }} onClose={() => setDialog(null)} />}
    </Modal>
  );
}

