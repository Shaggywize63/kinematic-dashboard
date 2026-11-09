'use client';
// Saved scenarios: open, rename, download and delete. Only the inputs are saved; the numbers are worked out again from the current data.

import { useMemo, useState } from 'react';
import { Field, Input } from '../../ui';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, Modal, T, downloadText, type Col } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, inrShort } from '../../../lib/hrms/format';
import { SCENARIO_TYPES, describeInput, runScenario, summaryText, type SimResult } from '../../../lib/hrms/control/simulate';
import type { SavedScenario } from '../../../lib/hrms/control/types';
import { ConfirmModal, Muted, Row, signedInr } from './parts';
import { slugOf } from './SimResult';

export function safeRun(db: HrmsDb, s: SavedScenario): SimResult | null {
  try { return runScenario(db, s.input); } catch { return null; }
}

export default function SimSaved({ db, scenarios, onOpen, onRename, onDelete }: {
  db: HrmsDb; scenarios: SavedScenario[]; onOpen: (s: SavedScenario) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<SavedScenario | null>(null);
  const [deleting, setDeleting] = useState<SavedScenario | null>(null);
  const [draft, setDraft] = useState('');
  const results = useMemo(() => new Map(scenarios.map((s) => [s.id, safeRun(db, s)])), [db, scenarios]);

  const cols: Col<SavedScenario>[] = [
    { key: 'name', label: 'Name', render: (s) => (<div style={{ minWidth: 160 }}><div style={{ fontWeight: 600 }}>{s.name}</div>{s.note && <Muted>{s.note}</Muted>}</div>) },
    { key: 'type', label: 'Kind', render: (s) => <Badge>{SCENARIO_TYPES.find((t) => t.type === s.input.type)?.label}</Badge> },
    { key: 'change', label: 'The change', render: (s) => <span style={{ fontSize: 13 }}>{describeInput(db, s.input)}</span> },
    { key: 'impact', label: '12-month cost', align: 'right', nowrap: true, render: (s) => { const r = results.get(s.id); return r ? signedInr(Math.round(r.twelveDelta), inrShort) : 'Cannot run'; } },
    { key: 'saved', label: 'Saved', nowrap: true, render: (s) => <span style={{ fontSize: 13, color: T.dim }}>{fmtDate(s.savedAt.slice(0, 10))}<br />{s.savedBy}</span> },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        <Row gap={6} style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <Button size="sm" onClick={() => onOpen(s)} aria-label={`Open ${s.name}`}>Open</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(s.name); setRenaming(s); }} aria-label={`Rename ${s.name}`}>Rename</Button>
          <Button size="sm" variant="ghost" disabled={!results.get(s.id)} title={results.get(s.id) ? undefined : 'This scenario no longer matches the data, so it cannot be worked out'} onClick={() => { const r = results.get(s.id); if (r) downloadText(`${slugOf(s.name)}.txt`, summaryText(r, s.name)); }} aria-label={`Download ${s.name}`}>Download</Button>
          <Button size="sm" variant="danger" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>Delete</Button>
        </Row>
      ),
    },
  ];

  return (
    <Card>
      <CardTitle>Saved scenarios</CardTitle>
      {scenarios.length === 0 ? (
        <EmptyState title="No saved scenarios yet" description="Run a simulation on the first tab and press Save scenario. It will be listed here, and you can compare two of them." />
      ) : (
        <div data-testid="saved-list"><DataTable columns={cols} rows={scenarios} minWidth={900} /></div>
      )}
      <Muted style={{ marginTop: 10 }}>Only your inputs are saved. Opening a scenario works the numbers out again from the current sample data.</Muted>

      {renaming && (
        <Modal title="Rename scenario" onClose={() => setRenaming(null)} width={440}
          footer={(<><Button onClick={() => setRenaming(null)}>Cancel</Button><Button variant="primary" disabled={draft.trim().length < 3} onClick={() => { onRename(renaming.id, draft); setRenaming(null); }}>Save name</Button></>)}>
          <Field label="Name" htmlFor="rename-scenario" error={draft.trim().length < 3 ? 'Use at least 3 characters.' : undefined}>
            <Input id="rename-scenario" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} />
          </Field>
        </Modal>
      )}
      {deleting && (
        <ConfirmModal title="Delete this scenario?" confirmLabel="Delete" danger onClose={() => setDeleting(null)} onConfirm={() => { onDelete(deleting.id); setDeleting(null); }}>
          “{deleting.name}” will be removed from the saved list. This cannot be undone.
        </ConfirmModal>
      )}
    </Card>
  );
}
