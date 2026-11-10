'use client';
// Payroll hub, Structures tab: every salary structure, how many people are on it, and a way to create or remove one.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, DataTable, EmptyState, Modal, Note, SearchBox, Toolbar, T, type Col } from '../ui';
import { Field, Input, Select } from '../../ui';
import type { HrmsDb, SalaryStructure } from '../../../lib/hrms/types';
import { buildBreakup } from '../../../lib/hrms/engine';
import { monthEnd } from '../../../lib/hrms/rules';
import { fmtDate } from '../../../lib/hrms/format';
import { addStandardStructures, createStructure, deleteStructure } from '../../../lib/hrms/payrollActions';
import { useLiveStatus } from '../../../lib/hrms/live/store';
import { PREVIEW_MONTH } from './logic';
import { ConfirmModal, LinkButton, report } from './shared';

const SAMPLE_CTC = 1_200_000;
type Row = SalaryStructure & { people: number; wagePct: number; passes: boolean };

export default function StructuresTab({ db }: { db: HrmsDb }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const isLive = useLiveStatus().source === 'live';

  const rows: Row[] = useMemo(() => db.structures
    .map((s) => {
      const b = buildBreakup(s, SAMPLE_CTC, { asOn: monthEnd(PREVIEW_MONTH) });
      return { ...s, people: db.employees.filter((e) => e.structureId === s.id).length, wagePct: b.wageTest.wagePct, passes: b.wageTest.passes };
    })
    .filter((s) => !q.trim() || `${s.name} ${s.description ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [db, q]);

  const cols: Col<Row>[] = [
    { key: 'name', label: 'Structure', sortValue: (r) => r.name, render: (r) => (
      <div style={{ minWidth: 0 }}>
        <Link href={`/dashboard/hrms/payroll/structures/${r.id}`} style={{ fontWeight: 600, color: T.text, textDecoration: 'none' }}>{r.name}</Link>
        {r.description && <div style={{ fontSize: 12, color: T.mute, maxWidth: 420, whiteSpace: 'normal' }}>{r.description}</div>}
      </div>
    ) },
    { key: 'eff', label: 'Effective from', render: (r) => fmtDate(r.effectiveFrom), sortValue: (r) => r.effectiveFrom, nowrap: true },
    { key: 'comps', label: 'Components', align: 'right', render: (r) => r.components.length, sortValue: (r) => r.components.length },
    { key: 'people', label: 'Employees', align: 'right', render: (r) => r.people, sortValue: (r) => r.people },
    { key: 'wage', label: `50% test at ₹12,00,000`, render: (r) => <Badge tone={r.passes ? 'ok' : 'warn'} dot>{r.passes ? 'Pass' : 'Add-back'} · wages {r.wagePct.toFixed(1)}%</Badge>, sortValue: (r) => r.wagePct, nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (r) => (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <LinkButton href={`/dashboard/hrms/payroll/structures/${r.id}`} label={`Open ${r.name}`}>Open</LinkButton>
        <Button size="sm" variant="danger" aria-label={`Delete ${r.name}`} disabled={r.people > 0} title={r.people > 0 ? `${r.people} employees are on this structure` : undefined} onClick={() => setRemoving(r)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isLive && db.structures.length === 0 && (
        <div data-testid="structures-empty">
          <Card>
            <EmptyState title="No salary structures yet"
              description="Pay is worked out from a salary structure. Start with the three standard ones (office staff, field sales, warehouse and contract) and edit them to suit your company, or create your own."
              action={<Button variant="primary" data-testid="add-standard-structures" style={{ height: 40 }} onClick={() => { report(addStandardStructures(), 'Standard structures added'); }}>Add the standard structures</Button>} />
          </Card>
        </div>
      )}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search structures" />
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" style={{ height: 40 }} onClick={() => setCreating(true)}>New structure</Button></div>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={860} onRowClick={(r) => router.push(`/dashboard/hrms/payroll/structures/${r.id}`)}
        empty={db.structures.length ? 'No structure matches this search.' : 'No salary structure yet. Create one to set up pay for your employees.'} />
      <Note>The wage test column splits a sample CTC of ₹12,00,000 through the payroll engine. Open a structure to try any CTC and see the full breakup.</Note>
      {creating && <NewStructure db={db} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/dashboard/hrms/payroll/structures/${id}`)} />}
      {removing && (
        <ConfirmModal title="Delete structure" danger confirmLabel="Delete structure" onClose={() => setRemoving(null)}
          onConfirm={() => { if (report(deleteStructure(removing.id), `${removing.name} deleted`)) setRemoving(null); }}>
          Delete <b>{removing.name}</b>? It has {removing.components.length} components and no employees. This cannot be undone.
        </ConfirmModal>
      )}
    </div>
  );
}

function NewStructure({ db, onClose, onCreated }: { db: HrmsDb; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const error = !trimmed ? 'Give the structure a name' : trimmed.length < 3 ? 'Use at least 3 characters' : trimmed.length > 60 ? 'Keep it under 60 characters'
    : db.structures.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()) ? 'A structure with this name already exists' : '';
  const submit = () => {
    setTouched(true);
    if (error) return;
    const s = createStructure(trimmed, from || undefined);
    onCreated(s.id);
  };
  return (
    <Modal title="New salary structure" onClose={onClose} width={480}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>Create structure</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Structure name" required htmlFor="ns-name" error={touched ? error : undefined}>
          <Input id="ns-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} invalid={touched && !!error} placeholder="For example, Sales managers" />
        </Field>
        <Field label="Start from" htmlFor="ns-from" hint="Copying keeps every component; you can edit them on the next screen.">
          <Select id="ns-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">A blank structure (basic, balancing allowance, employer PF and ESI)</option>
            {db.structures.map((s) => <option key={s.id} value={s.id}>Copy of {s.name}</option>)}
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
