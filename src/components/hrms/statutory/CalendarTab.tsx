'use client';
// Statutory calendar: due dates grouped Overdue, Due soon, Upcoming and Filed, by legal entity. The status is derived
// from the due date against the preview's today; "filed" is the only stored fact that is trusted.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ComplianceTask, HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { diffDays, fmtDate, fmtMonthLong } from '../../../lib/hrms/format';
import { addComplianceTask, addStandardComplianceCalendar, fileCompliance, reopenCompliance } from '../../../lib/hrms/statutoryActions';
import { useLiveStatus, whenSynced } from '../../../lib/hrms/live/store';
import { Field, Input, Select } from '../../ui';
import { Badge, Button, Card, CardTitle, EmptyState, Modal, Note, StatGrid, Stat, StatusBadge, T, Toolbar, useIsCompact } from '../ui';
import { derivedStatus, entityName, suggestedDues, type DerivedStatus } from './builders';
import { ConfirmModal, Muted, Stack } from './parts';

const GROUPS: { key: DerivedStatus; title: string; empty: string }[] = [
  { key: 'overdue', title: 'Overdue', empty: 'Nothing is overdue.' },
  { key: 'due_soon', title: 'Due soon', empty: 'Nothing falls due in the next 7 days.' },
  { key: 'upcoming', title: 'Upcoming', empty: 'No later due dates.' },
  { key: 'filed', title: 'Filed', empty: 'Nothing has been filed yet.' },
];

function whenText(t: ComplianceTask, s: DerivedStatus): string {
  if (s === 'filed') {
    const late = t.filedOn ? diffDays(t.dueOn, t.filedOn) : 0;
    return `Filed ${fmtDate(t.filedOn)}${late > 0 ? `, ${late} ${late === 1 ? 'day' : 'days'} late` : ''}`;
  }
  const d = diffDays(PREVIEW_TODAY, t.dueOn);
  if (d < 0) return `${-d} ${d === -1 ? 'day' : 'days'} late`;
  if (d === 0) return 'Due today';
  return `In ${d} ${d === 1 ? 'day' : 'days'}`;
}

export default function CalendarTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const live = useLiveStatus();
  const liveMode = live.source === 'live';
  const [entity, setEntity] = useState('all');
  const [law, setLaw] = useState('all');
  const [filing, setFiling] = useState<ComplianceTask | null>(null);
  const [reopening, setReopening] = useState<ComplianceTask | null>(null);

  const addStandard = () => {
    const r = addStandardComplianceCalendar();
    if (!r.ok) { toast.error(r.error); return; }
    whenSynced((ok) => { if (ok) toast.success('Standard compliance calendar added'); });
  };

  const laws = useMemo(() => [...new Set(db.compliance.map((c) => c.law))].sort(), [db.compliance]);
  const tasks = useMemo(
    () => db.compliance
      .filter((c) => (entity === 'all' || c.entityId === entity) && (law === 'all' || c.law === law))
      .map((t) => ({ t, s: derivedStatus(t) }))
      .sort((a, b) => a.t.dueOn.localeCompare(b.t.dueOn) || a.t.name.localeCompare(b.t.name)),
    [db.compliance, entity, law],
  );
  const count = (s: DerivedStatus) => tasks.filter((x) => x.s === s).length;

  const sug = useMemo(() => suggestedDues(db), [db]);
  const sugShown = sug.items.filter((x) => (entity === 'all' || x.entity.id === entity) && (law === 'all' || x.rule.law === law));
  const addable = sugShown.filter((x) => !x.exists);

  return (
    <Stack>
      <Toolbar>
        <Field label="Legal entity" style={{ width: narrow ? '100%' : 260 }}>
          <Select aria-label="Legal entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="all">All entities</option>
            {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Law" style={{ width: narrow ? '100%' : 180 }}>
          <Select aria-label="Law" value={law} onChange={(e) => setLaw(e.target.value)}>
            <option value="all">All laws</option>
            {laws.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
        <Muted style={{ alignSelf: 'flex-end', paddingBottom: 9 }}>Today in the preview is {fmtDate(PREVIEW_TODAY)}. Status is worked out from the due date.</Muted>
      </Toolbar>

      <StatGrid min={150}>
        <Stat label="Overdue" value={count('overdue')} tone={count('overdue') ? 'red' : undefined} hint="Past the due date, not filed" />
        <Stat label="Due soon" value={count('due_soon')} tone={count('due_soon') ? 'warn' : undefined} hint="Within 7 days" />
        <Stat label="Upcoming" value={count('upcoming')} hint="More than 7 days away" />
        <Stat label="Filed" value={count('filed')} tone="ok" hint="With a reference on record" />
      </StatGrid>

      {liveMode && db.compliance.length === 0 && (
        <Card>
          <div data-testid="compliance-live-empty">
            <EmptyState title="No compliance tasks yet"
              description="The compliance calendar is saved on the server. Start with the standard set of due dates for your legal entities — TDS, PF, ESI, professional tax, LWF and the annual filings — then mark each as filed when it is done, or add your own from the suggestions below."
              action={<Button variant="primary" data-testid="add-standard-compliance" style={{ minHeight: 40 }} onClick={addStandard}>Add the standard compliance calendar</Button>} />
          </div>
        </Card>
      )}

      {GROUPS.map((g) => {
        const here = tasks.filter((x) => x.s === g.key);
        const entityIds = [...new Set(here.map((x) => x.t.entityId))];
        return (
          <Card key={g.key} padding={0} className="hrms-cal-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
              <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{g.title}</h2>
              <Badge tone={g.key === 'overdue' ? 'red' : g.key === 'due_soon' ? 'warn' : g.key === 'filed' ? 'ok' : 'neutral'}>{here.length}</Badge>
            </div>
            {here.length === 0 ? (
              <div style={{ padding: '18px', color: T.mute, fontSize: 13.5 }}>{g.empty}</div>
            ) : entityIds.map((eid) => (
              <section key={eid} aria-label={`${g.title}: ${entityName(db, eid)}`}>
                <div style={{ padding: '8px 18px', background: T.panel, fontSize: 12, fontWeight: 600, color: T.dim, letterSpacing: '0.02em' }}>{entityName(db, eid)}</div>
                {here.filter((x) => x.t.entityId === eid).map(({ t, s }) => (
                  <div key={t.id} data-testid={`task-${t.id}`} style={{ display: 'flex', alignItems: narrow ? 'flex-start' : 'center', flexDirection: narrow ? 'column' : 'row', gap: narrow ? 8 : 16, padding: '12px 18px', borderTop: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{t.name}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <Badge mono>{t.law}</Badge>
                        {t.state && <span style={{ fontSize: 12.5, color: T.mute }}>{t.state}</span>}
                        {s === 'filed' && t.reference && <span style={{ fontSize: 12.5, color: T.mute }}>Reference <span style={{ fontFamily: T.mono, color: T.dim }}>{t.reference}</span></span>}
                      </div>
                    </div>
                    <div style={{ minWidth: 170 }}>
                      <div style={{ fontSize: 13.5, color: T.text, fontVariantNumeric: 'tabular-nums' }}>Due {fmtDate(t.dueOn)}</div>
                      <div style={{ fontSize: 12.5, color: s === 'overdue' ? T.red : s === 'due_soon' ? T.warn : T.mute, fontWeight: s === 'overdue' || s === 'due_soon' ? 600 : 400 }}>{whenText(t, s)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 150, justifyContent: narrow ? 'flex-start' : 'flex-end' }}>
                      <StatusBadge status={s} />
                      {s === 'filed'
                        ? <Button size="sm" variant="ghost" aria-label={`Reopen ${t.name}, ${entityName(db, t.entityId)}`} onClick={() => setReopening(t)}>Reopen</Button>
                        : <Button size="sm" aria-label={`Mark filed: ${t.name}, ${entityName(db, t.entityId)}`} style={{ minHeight: 40 }} onClick={() => setFiling(t)}>Mark filed</Button>}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </Card>
        );
      })}

      <Card>
        <CardTitle right={
          <Button size="sm" disabled={addable.length === 0} onClick={() => addable.forEach((x) => addComplianceTask({ name: x.name, law: x.rule.law, dueOn: x.dueOn, entityId: x.entity.id, state: x.state }))}>
            Add all to calendar{addable.length ? ` (${addable.length})` : ''}
          </Button>
        }>
          Suggested for {fmtMonthLong(sug.month)}
        </CardTitle>
        <Muted style={{ marginTop: -6, marginBottom: 12 }}>
          Worked out from the calendar rules in rules.ts for each entity with the matching registration. Due dates differ by state for professional tax, so confirm each before relying on it.
        </Muted>
        {sugShown.length === 0 ? (
          <div style={{ color: T.mute, fontSize: 13.5 }}>No suggestions for this filter.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {sugShown.map((x, i) => (
              <li key={x.key} data-testid={`suggestion-${x.key}`} style={{ display: 'flex', alignItems: narrow ? 'flex-start' : 'center', flexDirection: narrow ? 'column' : 'row', gap: narrow ? 6 : 16, padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{x.name}</div>
                  <div style={{ fontSize: 12.5, color: T.mute }}>{x.entity.name} · {x.rule.note}</div>
                </div>
                <div style={{ fontSize: 13.5, color: T.text, minWidth: 130, fontVariantNumeric: 'tabular-nums' }}>Due {fmtDate(x.dueOn)}</div>
                {x.exists
                  ? <Badge tone="ok">On the calendar</Badge>
                  : <Button size="sm" aria-label={`Add to calendar: ${x.name}, ${x.entity.name}`} onClick={() => addComplianceTask({ name: x.name, law: x.rule.law, dueOn: x.dueOn, entityId: x.entity.id, state: x.state })}>Add to calendar</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {filing && <FileModal task={filing} onClose={() => setFiling(null)} />}
      {reopening && (
        <ConfirmModal title="Reopen this filing?" confirmLabel="Reopen" danger
          onClose={() => setReopening(null)}
          onConfirm={() => { reopenCompliance(reopening.id); setReopening(null); }}>
          The filing reference <b>{reopening.reference ?? '—'}</b> for “{reopening.name}” will be removed and the due date is checked again.
        </ConfirmModal>
      )}
    </Stack>
  );
}

function FileModal({ task, onClose }: { task: ComplianceTask; onClose: () => void }) {
  const [reference, setReference] = useState('');
  const [filedOn, setFiledOn] = useState(PREVIEW_TODAY);
  const [submitted, setSubmitted] = useState(false);

  const refError = !reference.trim() ? 'Enter the challan or acknowledgement number.'
    : reference.trim().length < 4 ? 'A reference is at least 4 characters.'
    : !/^[A-Za-z0-9][A-Za-z0-9/._-]{3,39}$/.test(reference.trim()) ? 'Use letters, digits and - / . _ only (up to 40 characters).' : '';
  const dateError = !filedOn ? 'Choose the date it was filed.' : filedOn > PREVIEW_TODAY ? 'The filing date cannot be after today.' : '';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (refError || dateError) return;
    fileCompliance(task.id, reference.trim(), filedOn);
    onClose();
  };

  return (
    <Modal title="Mark as filed" onClose={onClose} width={480}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="file-form" style={{ minHeight: 40 }}>Save filing</Button>
        </>
      )}>
      <form id="file-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{task.name}</div>
          <div style={{ fontSize: 12.5, color: T.mute }}>Due {fmtDate(task.dueOn)}</div>
        </div>
        <Field label="Reference" required htmlFor="file-ref" hint="Challan, acknowledgement or token number from the portal." error={submitted ? refError : ''}>
          <Input id="file-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. CHL-48213" invalid={submitted && !!refError} aria-invalid={submitted && !!refError} autoFocus />
        </Field>
        <Field label="Filed on" required htmlFor="file-date" error={submitted ? dateError : ''}>
          <Input id="file-date" type="date" value={filedOn} max={PREVIEW_TODAY} onChange={(e) => setFiledOn(e.target.value)} invalid={submitted && !!dateError} aria-invalid={submitted && !!dateError} />
        </Field>
        <Note>This records the filing in the preview only. Nothing is sent to a government portal.</Note>
      </form>
    </Modal>
  );
}
