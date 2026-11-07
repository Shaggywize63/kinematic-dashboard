'use client';
// Retention: how long each dataset is kept, what happens after, and an illustration of the next purge worked out from dates.

import { useState } from 'react';
import type { HrmsDb, RetentionRule } from '../../../../lib/hrms/types';
import { fmtDate } from '../../../../lib/hrms/format';
import { updateRetentionRule } from '../../../../lib/hrms/statutoryActions';
import { Field, Input, Select } from '../../../ui';
import { Badge, Button, Card, Modal, Note, T } from '../../ui';
import { Muted, Stack } from '../parts';
import { durationText, purgeIllustration, retentionSentence } from './model';

export default function RetentionTab({ db }: { db: HrmsDb }) {
  const [editing, setEditing] = useState<RetentionRule | null>(null);
  return (
    <Stack>
      <Note>
        Each rule says how long a dataset is kept and what then happens to it. The preview only shows the rule and when the next purge would fall: nothing is deleted or anonymised here.
        Keep periods set by tax and labour record rules should be confirmed with counsel before they are shortened.
      </Note>
      {db.retention.length === 0 && <Card><Muted>No retention rules are defined.</Muted></Card>}
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
              <Button aria-label={`Edit retention rule: ${r.dataset}`} onClick={() => setEditing(r)} style={{ minHeight: 40 }}>Edit</Button>
            </div>
          </Card>
        );
      })}
      {editing && <EditModal rule={editing} onClose={() => setEditing(null)} />}
    </Stack>
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
