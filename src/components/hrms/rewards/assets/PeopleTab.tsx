'use client';
// People: who holds what, and one person's full history of issues, returns and transfers.

import { useMemo, useState } from 'react';
import { Badge, DataTable, EmployeeCell, Modal, SearchBox, StatusBadge, T, Toolbar, type Col } from '../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import { EVENT_LABEL, bookValue, everHeldIds, heldBy, typeLabel } from '../../../../lib/hrms/rewards/engines';
import type { RewardsState } from '../../../../lib/hrms/rewards/types';
import { Muted } from '../common';
import { AssetDetailModal } from './AssetModals';
import { ConditionPill, deptNameOf, nameOf } from './shared';

interface Row { id: string; e: Employee; held: number; book: number; events: number }

function PersonModal({ db, st, personId, onClose }: { db: HrmsDb; st: RewardsState; personId: string; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const e = db.employees.find((x) => x.id === personId);
  if (!e) return null;
  const held = heldBy(st.assets.items, personId);
  const events = st.assets.events.filter((v) => v.fromId === personId || v.toId === personId);
  const tag = (id: string) => st.assets.items.find((a) => a.id === id);
  return (
    <>
      <Modal title={`Assets: ${fullName(e)}`} onClose={onClose} width={680}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
          <StatusBadge status={e.status} /><span style={{ color: T.dim }}>{e.code} · {deptNameOf(db, e.id)}</span>
        </div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 13.5, fontFamily: T.heading }}>Holding now ({held.length})</h3>
          {held.length === 0 ? <Muted>Nothing issued to this person right now.</Muted> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {held.map((a, i) => (
                <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13.5 }}>
                  <button type="button" onClick={() => setOpenId(a.id)} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.info, cursor: 'pointer' }}>{a.tag}</button>
                  <span style={{ flex: 1, minWidth: 140 }}>{a.make} {a.model}</span>
                  <ConditionPill c={a.condition} /><span style={{ color: T.dim }}>{inr(bookValue(a, PREVIEW_TODAY))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 13.5, fontFamily: T.heading }}>History for this person</h3>
          <Muted style={{ marginBottom: 6 }}>Kept for ever. Nothing here can be edited or deleted.</Muted>
          {events.length === 0 ? <Muted>No history yet.</Muted> : (
            <ol data-testid="person-history" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...events].reverse().map((v, i) => {
                const a = tag(v.assetId);
                return (
                  <li key={v.id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13 }}>
                    <span style={{ color: T.dim, flex: '0 0 92px' }}>{fmtDate(v.on)}</span>
                    <span style={{ flex: '1 1 0', minWidth: 0, overflowWrap: 'anywhere' }}>
                      <b>{v.toId === personId ? (v.kind === 'transferred' ? 'Received by transfer' : 'Received') : v.kind === 'returned' ? 'Returned' : v.kind === 'transferred' ? 'Handed over' : EVENT_LABEL[v.kind]}</b> {a ? `${a.tag} ${a.make} ${a.model}` : ''}
                      {v.condition && <span style={{ color: T.dim }}> · {v.condition}</span>}{v.ack && v.toId === personId && <span style={{ color: T.ok }}> · receipt acknowledged</span>}
                      {v.kind === 'transferred' && <span style={{ color: T.dim }}> · {v.toId === personId ? `from ${nameOf(db, v.fromId)}` : `to ${nameOf(db, v.toId)}`}</span>}
                      {v.note && <div style={{ color: T.dim }}>{v.note}</div>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Modal>
      {openId && <AssetDetailModal db={db} st={st} assetId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

export default function PeopleTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => db.employees
    .map((e) => {
      const held = heldBy(st.assets.items, e.id);
      return { id: e.id, e, held: held.length, book: held.reduce((s, a) => s + bookValue(a, PREVIEW_TODAY), 0), events: everHeldIds(st.assets.events, e.id).length };
    })
    .filter((r) => r.held > 0 || r.events > 0)
    .filter((r) => !q.trim() || `${fullName(r.e)} ${r.e.code}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.held - a.held || a.e.code.localeCompare(b.e.code)), [db.employees, st.assets, q]);

  const cols: Col<Row>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => fullName(r.e).toLowerCase(), render: (r) => <EmployeeCell e={r.e} href={false} /> },
    { key: 'dept', label: 'Department', sortValue: (r) => deptNameOf(db, r.id) ?? '', render: (r) => deptNameOf(db, r.id) ?? '—' },
    { key: 'status', label: 'Status', nowrap: true, sortValue: (r) => r.e.status, render: (r) => <StatusBadge status={r.e.status} /> },
    {
      key: 'held', label: 'Holding now', sortValue: (r) => r.held,
      render: (r) => r.held === 0 ? <span style={{ color: T.mute }}>Nothing</span> : (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{heldBy(st.assets.items, r.id).map((a) => <span key={a.id} title={`${a.tag} ${a.make} ${a.model}`}><Badge>{typeLabel(a.type)}</Badge></span>)}</span>
      ),
    },
    { key: 'book', label: 'Book value', align: 'right', nowrap: true, sortValue: (r) => r.book, render: (r) => inr(r.book) },
    { key: 'open', label: 'History', align: 'right', render: (r) => <button type="button" aria-label={`Open assets of ${fullName(r.e)}`} onClick={() => setOpenId(r.id)} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.sm, background: T.card, color: T.text, height: 32, padding: '0 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>View</button> },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search by name or code" width={280} /></Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={760} onRowClick={(r) => setOpenId(r.id)} empty="No one holds an asset yet." />
      {openId && <PersonModal db={db} st={st} personId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
