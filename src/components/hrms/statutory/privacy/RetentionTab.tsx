'use client';
// Retention: how long each dataset is kept, what happens after, and an illustration of the next purge worked out from dates.

import { useState } from 'react';
import { toast } from 'sonner';
import type { HrmsDb, RetentionRule } from '../../../../lib/hrms/types';
import { fmtDate } from '../../../../lib/hrms/format';
import { addRetentionRule, addStandardRetentionRules, removeRetentionRule, updateRetentionRule } from '../../../../lib/hrms/statutoryActions';
import { useLiveStatus, whenSynced } from '../../../../lib/hrms/live/store';
import { Field, Input, Select } from '../../../ui';
import { Badge, Button, Card, EmptyState, Modal, Note, T } from '../../ui';
import { ConfirmModal, Muted, Stack } from '../parts';
import { durationText, purgeIllustration, retentionSentence } from './model';

export default function RetentionTab({ db }: { db: HrmsDb }) {
  const live = useLiveStatus();
  const liveMode = live.source === 'live';
  const [editing, setEditing] = useState<RetentionRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<RetentionRule | null>(null);

  const addStandard = () => {
    const r = addStandardRetentionRules();
    if (!r.ok) { toast.error(r.error); return; }
    whenSynced((ok) => { if (ok) toast.success('Standard retention rules added'); });
  };

  return (
    <Stack>
      <Note>
        Each rule says how long a dataset is kept and what then happens to it. The preview only shows the rule and when the next purge would fall: nothing is deleted or anonymised here.
        Keep periods set by tax and labour record rules should be confirmed with counsel before they are shortened.
      </Note>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" data-testid="new-retention-rule" style={{ minHeight: 40 }} onClick={() => setCreating(true)}>New retention rule</Button>
      </div>
      {db.retention.length === 0 && (
        liveMode ? (
          <Card>
            <div data-testid="retention-live-empty">
              <EmptyState title="No retention rules yet"
                description="Retention rules are saved on the server. Start with the standard set — salary registers, attendance, location trail, face templates and candidate data — and edit each keep period and action, or add your own."
                action={<Button variant="primary" data-testid="add-standard-retention-rules" style={{ minHeight: 40 }} onClick={addStandard}>Add the standard retention rules</Button>} />
            </div>
          </Card>
        ) : <Card><Muted>No retention rules are defined.</Muted></Card>
      )}
      {db.retention.map((r) => {
        const ill = purgeIllustration(db, r);
        const overdue = ill.daysTo < 0;
        return (
          <Card key={r.id} padding={18}>
            <div data-testid={`retention-${r.id}`} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{r.dataset}</h2>
                  <Badge tone="neutral">Keep {durationText(r.keepYears)}</Badge>
                  <Badge tone={r.action === 'delete' ? 'red' : 'info'}>{r.action === 'delete' ? 'Delete' : 'Anonymise'}</Badge>
                </div>
                <p data-testid={`retention-sentence-${r.id}`} style={{ margin: 0, fontSize: 14, color: T.text }}>{retentionSentence(r)}</p>
                <Muted>Basis: {r.basis}</Muted>
                <div style={{ fontSize: 13, color: T.dim, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                  <b style={{ color: T.text }}>Next purge, as an illustration:</b> counting from {ill.anchorLabel}, the purge would fall on <b style={{ color: overdue ? T.red : T.text }}>{fmtDate(ill.purgeOn)}</b>
                  {' '}({overdue ? `${-ill.daysTo} ${ill.daysTo === -1 ? 'day' : 'days'} ago: a real run would already have done it` : ill.daysTo === 0 ? 'today' : `in ${ill.daysTo.toLocaleString('en-IN')} days`}).
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button aria-label={`Edit retention rule: ${r.dataset}`} onClick={() => setEditing(r)} style={{ minHeight: 40 }}>Edit</Button>
                <Button variant="danger" aria-label={`Delete retention rule: ${r.dataset}`} onClick={() => setRemoving(r)} style={{ minHeight: 40 }}>Delete</Button>
              </div>
            </div>
          </Card>
        );
      })}
      {editing && <EditModal rule={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
      {removing && (
        <ConfirmModal title="Delete this retention rule?" confirmLabel="Delete rule" danger onClose={() => setRemoving(null)}
          onConfirm={() => { removeRetentionRule(removing.id); setRemoving(null); }}>
          <p style={{ margin: 0 }}>The rule for <b>{removing.dataset}</b> will be removed. This is a policy record only; nothing stored is deleted on its basis.</p>
        </ConfirmModal>
      )}
    </Stack>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [dataset, setDataset] = useState('');
  const [years, setYears] = useState('');
  const [basis, setBasis] = useState('');
  const [action, setAction] = useState<RetentionRule['action']>('delete');
  const [submitted, setSubmitted] = useState(false);
  const n = Number(years);
  const datasetError = !dataset.trim() ? 'Name the dataset this rule covers.' : '';
  const yearError = years.trim() === '' ? 'Enter how long to keep it.' : !Number.isFinite(n) ? 'Enter a number.' : n <= 0 ? 'It must be more than zero.' : n > 50 ? 'Fifty years is the most the preview accepts.' : '';
  const basisError = !basis.trim() ? 'Enter the basis for keeping it.' : '';
  const error = datasetError || yearError || basisError;
  const preview = !yearError && dataset.trim() ? retentionSentence({ dataset: dataset.trim(), keepYears: n, action }) : '';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (error) return;
    addRetentionRule({ dataset: dataset.trim(), keepYears: Math.round(n * 1000) / 1000, basis: basis.trim(), action });
    whenSynced((ok) => { if (ok) toast.success('Retention rule added'); });
    onClose();
  };

  return (
    <Modal title="New retention rule" onClose={onClose} width={520}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="retention-create-form" style={{ minHeight: 40 }}>Add rule</Button>
        </>
      )}>
      <form id="retention-create-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Dataset" required htmlFor="ret-dataset" hint="What the rule covers, e.g. Salary registers and payslips." error={submitted ? datasetError : ''}>
          <Input id="ret-dataset" value={dataset} onChange={(e) => setDataset(e.target.value)} invalid={submitted && !!datasetError} autoFocus />
        </Field>
        <Field label="Keep for (years)" required htmlFor="ret-create-years" hint="Use a fraction for less than a year: 0.25 is 90 days." error={submitted ? yearError : ''}>
          <Input id="ret-create-years" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} invalid={submitted && !!yearError} />
        </Field>
        <Field label="Then" htmlFor="ret-create-action">
          <Select id="ret-create-action" value={action} onChange={(e) => setAction(e.target.value as RetentionRule['action'])}>
            <option value="delete">Delete it</option>
            <option value="anonymise">Anonymise it</option>
          </Select>
        </Field>
        <Field label="Basis" required htmlFor="ret-basis" hint="Why it is kept this long, e.g. the record rule or consent." error={submitted ? basisError : ''}>
          <Input id="ret-basis" value={basis} onChange={(e) => setBasis(e.target.value)} invalid={submitted && !!basisError} />
        </Field>
        <div role="status" aria-live="polite" style={{ padding: '10px 12px', borderRadius: T.radius.md, background: T.infoWash, color: T.text, fontSize: 13.5, minHeight: 42 }}>
          {preview || 'The rule reads here once the dataset and years are valid.'}
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ rule, onClose }: { rule: RetentionRule; onClose: () => void }) {
  const [years, setYears] = useState(String(rule.keepYears));
  const [action, setAction] = useState<RetentionRule['action']>(rule.action);
  const [submitted, setSubmitted] = useState(false);
  const n = Number(years);
  const error = years.trim() === '' ? 'Enter how long to keep it.' : !Number.isFinite(n) ? 'Enter a number.' : n <= 0 ? 'It must be more than zero.' : n > 50 ? 'Fifty years is the most the preview accepts.' : '';
  const preview = !error ? retentionSentence({ dataset: rule.dataset, keepYears: n, action }) : '';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (error) return;
    updateRetentionRule(rule.id, { keepYears: Math.round(n * 1000) / 1000, action });
    onClose();
  };

  return (
    <Modal title={`Edit retention: ${rule.dataset}`} onClose={onClose} width={500}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="retention-form" style={{ minHeight: 40 }}>Save rule</Button>
        </>
      )}>
      <form id="retention-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Keep for (years)" required htmlFor="ret-years" hint="Use a fraction for less than a year: 0.25 is 90 days." error={submitted ? error : ''}>
          <Input id="ret-years" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} invalid={submitted && !!error} aria-invalid={submitted && !!error} autoFocus />
        </Field>
        <Field label="Then" htmlFor="ret-action">
          <Select id="ret-action" value={action} onChange={(e) => setAction(e.target.value as RetentionRule['action'])}>
            <option value="delete">Delete it</option>
            <option value="anonymise">Anonymise it</option>
          </Select>
        </Field>
        <div role="status" aria-live="polite" style={{ padding: '10px 12px', borderRadius: T.radius.md, background: T.infoWash, color: T.text, fontSize: 13.5, minHeight: 42 }}>
          {preview || 'The rule reads here once the years are valid.'}
        </div>
        <Muted>Basis on file: {rule.basis}</Muted>
      </form>
    </Modal>
  );
}
