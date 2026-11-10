'use client';
// Legal entities: details, statutory registrations with expiry badges, and a per-state coverage check that tells
// HR which registrations each state needs and whether they are on file.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmptyState, KeyValue, Modal, Note, T, useIsCompact, type Col, type Tone } from '../ui';
import { Field, FormGrid, Section } from '../../ui';
import type { HrmsDb, LegalEntity, Registration, RegistrationType } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { newId } from '../../../lib/hrms/db';
import { whenSynced } from '../../../lib/hrms/live/store';
import { fmtDate } from '../../../lib/hrms/format';
import { remove, upsert } from '../../../lib/hrms/actions';
import { removeRegistration, saveRegistration } from '../../../lib/hrms/orgActions';
import {
  REGISTRATION_TYPES, emptyEntityForm, emptyRegistrationForm, entityGaps, entityHeadcount, entityToForm, expiryStatus, formToEntity, formToRegistration,
  registrationLabel, registrationMeta, registrationToForm, stateCoverage, usageOf, usageText, validateEntity, validateRegistration,
  type CoverageStatus, type EntityForm, type RegistrationForm, EXPIRY_WINDOW_DAYS,
} from './orgLogic';
import { INDIAN_STATES } from './states';
import { BlockedDialog, ConfirmDialog } from './Confirm';
import { SelectField, TextField, focusFirstInvalid, primaryStyle, srOnly } from './formKit';

const EXPIRY_TONE: Record<string, Tone> = { none: 'neutral', valid: 'ok', expiring: 'warn', expired: 'red' };
const COVERAGE_TONE: Record<CoverageStatus, Tone> = { on_file: 'ok', expiring: 'warn', expired: 'red', missing: 'red' };
const COVERAGE_LABEL: Record<CoverageStatus, string> = { on_file: 'On file', expiring: 'On file, expiring', expired: 'On file, expired', missing: 'Missing' };

export function EntitiesTab({ db }: { db: HrmsDb }) {
  const [selectedId, setSelectedId] = useState<string>(db.entities[0]?.id ?? '');
  const [entityModal, setEntityModal] = useState<{ edit?: LegalEntity } | null>(null);
  const [regModal, setRegModal] = useState<{ entity: LegalEntity; edit?: Registration; preset?: { type: RegistrationType; state?: string } } | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'entity'; entity: LegalEntity } | { kind: 'reg'; entity: LegalEntity; reg: Registration }>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const entity = db.entities.find((e) => e.id === selectedId) ?? db.entities[0];
  const coverage = useMemo(() => (entity ? stateCoverage(db, entity) : []), [db, entity]);

  const askRemoveEntity = (e: LegalEntity) => {
    const staff = usageOf(db.employees, 'entityId', e.id);
    const locs = db.locations.filter((l) => l.entityId === e.id).length;
    const runs = db.payRuns.filter((r) => r.entityId === e.id).length;
    if (staff.total || locs || runs) {
      const parts = [staff.total ? usageText(staff) : '', locs ? `${locs} location${locs === 1 ? '' : 's'}` : '', runs ? `${runs} pay run${runs === 1 ? '' : 's'}` : ''].filter(Boolean);
      setBlocked({ title: `Cannot remove ${e.name}`, body: `${e.name} is still used by ${parts.join(', ')}. Move or close those first, then remove the entity.` });
    } else setConfirm({ kind: 'entity', entity: e });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, color: T.dim }}>
          {db.entities.length} legal entit{db.entities.length === 1 ? 'y' : 'ies'}. Registrations are matched to the states where each entity has people.
        </div>
        <Button variant="primary" style={primaryStyle} onClick={() => setEntityModal({})}>Add legal entity</Button>
      </div>

      {db.entities.length === 0 && (
        <Card><EmptyState title="No legal entities yet" description="Add the company or LLP that employs people. Payroll, registrations and letters are issued per entity." action={<Button variant="primary" style={primaryStyle} onClick={() => setEntityModal({})}>Add legal entity</Button>} /></Card>
      )}

      {db.entities.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
          {db.entities.map((e) => {
            const gaps = entityGaps(db, e);
            const expired = e.registrations.filter((r) => expiryStatus(r).kind === 'expired').length;
            const expiring = e.registrations.filter((r) => expiryStatus(r).kind === 'expiring').length;
            const on = e.id === entity?.id;
            return (
              <button key={e.id} type="button" aria-pressed={on} data-testid={`entity-card-${e.id}`} onClick={() => setSelectedId(e.id)}
                style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: 16, borderRadius: T.radius.lg, background: T.card, color: T.text, border: `1px solid ${on ? T.red : T.border}`, boxShadow: on ? `0 0 0 1px ${T.red}` : 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700 }}>{e.name}</span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim }}>PAN {e.pan} · TAN {e.tan}</span>
                <span style={{ fontSize: 13, color: T.dim }}>{e.address.city}, {e.address.state} · {entityHeadcount(db, e.id)} people · {e.registrations.length} registrations</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {gaps > 0 ? <Badge tone="red">{gaps} registration gap{gaps === 1 ? '' : 's'}</Badge> : <Badge tone="ok">No gaps</Badge>}
                  {expired > 0 && <Badge tone="red">{expired} expired</Badge>}
                  {expiring > 0 && <Badge tone="warn">{expiring} expiring soon</Badge>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {entity && (
        <>
          <Card>
            <CardTitle right={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => setEntityModal({ edit: entity })} aria-label={`Edit ${entity.name}`}>Edit entity</Button>
                <Button variant="danger" onClick={() => askRemoveEntity(entity)} aria-label={`Remove ${entity.name}`}>Remove</Button>
              </div>
            }>{entity.name}</CardTitle>
            <KeyValue rows={[
              { label: 'PAN', value: <span style={{ fontFamily: T.mono }}>{entity.pan}</span> },
              { label: 'TAN', value: <span style={{ fontFamily: T.mono }}>{entity.tan}</span> },
              { label: 'CIN', value: entity.cin ? <span style={{ fontFamily: T.mono }}>{entity.cin}</span> : '' },
              { label: 'GSTIN', value: entity.gstin ? <span style={{ fontFamily: T.mono }}>{entity.gstin}</span> : '' },
              { label: 'Registered address', value: [entity.address.line1, entity.address.line2, entity.address.city, entity.address.state, entity.address.pincode].filter(Boolean).join(', ') },
              { label: 'Authorised signatory', value: entity.signatory ? `${entity.signatory.name}, ${entity.signatory.designation}` : '' },
              { label: 'People', value: entityHeadcount(db, entity.id) },
              { label: 'Locations', value: db.locations.filter((l) => l.entityId === entity.id).map((l) => l.name).join(', ') },
            ]} />
          </Card>

          <Card>
            <CardTitle right={<Button variant="primary" style={primaryStyle} onClick={() => setRegModal({ entity })}>Add registration</Button>}>Registrations</CardTitle>
            <RegistrationsTable entity={entity}
              onEdit={(reg) => setRegModal({ entity, edit: reg })}
              onRemove={(reg) => setConfirm({ kind: 'reg', entity, reg })} />
          </Card>

          <Card>
            <CardTitle right={<span style={{ fontSize: 12.5, color: T.mute }}>Expiring means within {EXPIRY_WINDOW_DAYS} days</span>}>State coverage</CardTitle>
            <CoveragePanel coverage={coverage} onAdd={(type, state) => setRegModal({ entity, preset: { type, state } })} />
          </Card>
        </>
      )}

      {entityModal && (
        <EntityModal db={db} edit={entityModal.edit} onClose={() => setEntityModal(null)} onSaved={(id) => { setSelectedId(id); setEntityModal(null); }} />
      )}
      {regModal && <RegistrationModal entity={regModal.entity} edit={regModal.edit} preset={regModal.preset} onClose={() => setRegModal(null)} />}

      {confirm?.kind === 'entity' && (
        <ConfirmDialog title="Remove legal entity" confirmLabel="Remove entity" onCancel={() => setConfirm(null)}
          onConfirm={() => { const gone = confirm.entity.name; remove('entities', confirm.entity.id); whenSynced((ok) => { if (ok) toast.success(`${gone} removed`); }); setConfirm(null); setSelectedId(''); }}>
          Remove <b>{confirm.entity.name}</b> and its {confirm.entity.registrations.length} registration{confirm.entity.registrations.length === 1 ? '' : 's'}? This cannot be undone in the preview.
        </ConfirmDialog>
      )}
      {confirm?.kind === 'reg' && (
        <ConfirmDialog title="Remove registration" confirmLabel="Remove registration" onCancel={() => setConfirm(null)}
          onConfirm={() => { removeRegistration(confirm.entity.id, confirm.reg.id); whenSynced((ok) => { if (ok) toast.success('Registration removed'); }); setConfirm(null); }}>
          Remove the {registrationLabel(confirm.reg.type)}{confirm.reg.state ? ` for ${confirm.reg.state}` : ''} registration <b>{confirm.reg.number}</b> from {confirm.entity.name}?
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

// ───────────────────────────── registrations table ─────────────────────────────
function RegistrationsTable({ entity, onEdit, onRemove }: { entity: LegalEntity; onEdit: (r: Registration) => void; onRemove: (r: Registration) => void }) {
  const cols: Col<Registration>[] = [
    { key: 'type', label: 'Registration', sortValue: (r) => registrationLabel(r.type), render: (r) => <span style={{ fontWeight: 600 }}>{registrationLabel(r.type)}</span> },
    { key: 'state', label: 'State', sortValue: (r) => r.state ?? '', render: (r) => r.state ?? <span style={{ color: T.mute }}>All states</span> },
    { key: 'number', label: 'Number', render: (r) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.number}</span> },
    { key: 'validity', label: 'Validity', sortValue: (r) => r.validTo ?? '9999', render: (r) => (r.validFrom || r.validTo ? `${fmtDate(r.validFrom)} to ${r.validTo ? fmtDate(r.validTo) : 'open'}` : '—') },
    {
      key: 'status', label: 'Status', nowrap: true, render: (r) => {
        const x = expiryStatus(r);
        return <Badge tone={EXPIRY_TONE[x.kind]} dot>{x.label}</Badge>;
      },
    },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => onEdit(r)} aria-label={`Edit ${registrationLabel(r.type)} ${r.number}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => onRemove(r)} aria-label={`Remove ${registrationLabel(r.type)} ${r.number}`}>Remove</Button>
        </span>
      ),
    },
  ];
  return <DataTable columns={cols} rows={entity.registrations} minWidth={760} empty="No registrations on file for this entity yet. Add the PF, ESI, PT and Shops numbers it holds." />;
}

// ───────────────────────────── coverage ─────────────────────────────
function CoveragePanel({ coverage, onAdd }: { coverage: ReturnType<typeof stateCoverage>; onAdd: (type: RegistrationType, state: string) => void }) {
  if (coverage.length === 0) {
    return <EmptyState title="No people in any state yet" description="Coverage appears once employees are assigned to a location of this entity." />;
  }
  const gaps = coverage.reduce((t, s) => t + s.gaps, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Note tone={gaps ? 'warn' : 'ok'}>
        {gaps
          ? <><b data-testid="coverage-gap-count">{gaps}</b> gap{gaps === 1 ? '' : 's'} across {coverage.filter((s) => s.gaps).length} state{coverage.filter((s) => s.gaps).length === 1 ? '' : 's'}. A gap is a registration the state needs that is missing or past its end date.</>
          : <>Every registration the preview rules ask for is on file. State tables here are samples and still need confirming.</>}
      </Note>
      {coverage.map((s) => (
        <section key={s.state} aria-label={`${s.state} coverage`} data-testid={`coverage-${s.state}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'hidden' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: T.panel }}>
            <div>
              <span style={{ fontWeight: 700, fontFamily: T.heading }}>{s.state}</span>
              <span style={{ color: T.dim, fontSize: 13 }}> · {s.headcount} {s.headcount === 1 ? 'person' : 'people'} · {s.locations.join(', ')}</span>
            </div>
            {s.gaps ? <Badge tone="red">{s.gaps} gap{s.gaps === 1 ? '' : 's'}</Badge> : <Badge tone="ok">Complete</Badge>}
          </header>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {s.items.map((it) => (
              <li key={it.type} data-testid={`coverage-${s.state}-${it.type}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(56px, 0.4fr) minmax(0, 3fr) auto', gap: '6px 14px', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{registrationMeta(it.type).short}</span>
                <span style={{ fontSize: 13, color: T.dim, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {it.registration ? <><span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.text }}>{it.registration.number}</span> <span>{it.reason}</span></> : <span>{it.reason}</span>}
                  {it.confidence && <ConfidenceBadge level={it.confidence} />}
                </span>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Badge tone={COVERAGE_TONE[it.status]} dot>{COVERAGE_LABEL[it.status]}</Badge>
                  {(it.status === 'missing') && <Button size="sm" onClick={() => onAdd(it.type, s.state)} aria-label={`Add ${registrationMeta(it.type).short} registration for ${s.state}`}>Add</Button>}
                </span>
              </li>
            ))}
          </ul>
          {s.notNeeded.length > 0 && (
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}`, fontSize: 12.5, color: T.mute }}>
              Not needed here: {s.notNeeded.map((n) => `${n.label} (${n.reason})`).join('; ')}.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────── entity modal ─────────────────────────────
function EntityModal({ db, edit, onClose, onSaved }: { db: HrmsDb; edit?: LegalEntity; onClose: () => void; onSaved: (id: string) => void }) {
  const narrow = useIsCompact(700);
  const [f, setF] = useState<EntityForm>(edit ? entityToForm(edit) : emptyEntityForm());
  const [tried, setTried] = useState(false);
  const others = db.entities.filter((e) => e.id !== edit?.id);
  const errors = validateEntity(f, others);
  const shown = (k: keyof EntityForm) => (tried ? errors[k] : undefined);
  const set = (k: keyof EntityForm) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const formId = 'entity-form';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const saved = formToEntity(f, { id: edit?.id ?? newId('ent'), registrations: edit?.registrations ?? [] });
    upsert('entities', saved);
    whenSynced((ok) => { if (ok) toast.success(edit ? `${saved.name} updated` : `${saved.name} added`); });
    onSaved(saved.id);
  };

  return (
    <Modal title={edit ? `Edit ${edit.name}` : 'Add legal entity'} onClose={onClose} width={720}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : 'Add entity'}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Section eyebrow="Identity" first>
          <FormGrid narrow={narrow}>
            <TextField label="Legal name" required value={f.name} onChange={set('name')} error={shown('name')} autoComplete="off" />
            <TextField label="PAN" required value={f.pan} onChange={(v) => set('pan')(v.toUpperCase())} error={shown('pan')} placeholder="AABCM4821K" maxLength={10} autoComplete="off" />
            <TextField label="TAN" required value={f.tan} onChange={(v) => set('tan')(v.toUpperCase())} error={shown('tan')} placeholder="DELM12345B" maxLength={10} autoComplete="off" />
            <TextField label="CIN" value={f.cin} onChange={(v) => set('cin')(v.toUpperCase())} error={shown('cin')} hint="Companies only. Leave empty for an LLP or firm." maxLength={21} autoComplete="off" />
            <TextField label="GSTIN" value={f.gstin} onChange={(v) => set('gstin')(v.toUpperCase())} error={shown('gstin')} hint="Optional. Its PAN part must match the PAN above." maxLength={15} autoComplete="off" />
          </FormGrid>
        </Section>
        <Section eyebrow="Registered address">
          <FormGrid narrow={narrow}>
            <TextField label="Address line 1" required value={f.line1} onChange={set('line1')} error={shown('line1')} />
            <TextField label="Address line 2" value={f.line2} onChange={set('line2')} />
            <TextField label="City" required value={f.city} onChange={set('city')} error={shown('city')} />
            <SelectField label="State" required value={f.state} onChange={set('state')} error={shown('state')}>
              <option value="">Choose a state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectField>
            <TextField label="Pincode" required value={f.pincode} onChange={set('pincode')} error={shown('pincode')} inputMode="numeric" maxLength={6} />
          </FormGrid>
        </Section>
        <Section eyebrow="Authorised signatory" hint="Printed on letters and statutory forms.">
          <FormGrid narrow={narrow}>
            <TextField label="Name" value={f.signName} onChange={set('signName')} error={shown('signName')} />
            <TextField label="Designation" value={f.signDesignation} onChange={set('signDesignation')} error={shown('signDesignation')} />
          </FormGrid>
        </Section>
        {tried && Object.keys(errors).length > 0 && <div role="alert" style={{ fontSize: 13, color: T.red }}>Fix the {Object.keys(errors).length} highlighted field{Object.keys(errors).length === 1 ? '' : 's'} to save.</div>}
      </form>
    </Modal>
  );
}

// ───────────────────────────── registration modal ─────────────────────────────
function RegistrationModal({ entity, edit, preset, onClose }: { entity: LegalEntity; edit?: Registration; preset?: { type: RegistrationType; state?: string }; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [f, setF] = useState<RegistrationForm>(edit ? registrationToForm(edit) : { ...emptyRegistrationForm(), ...(preset ? { type: preset.type, state: preset.state ?? '' } : {}) });
  const [tried, setTried] = useState(false);
  const errors = validateRegistration(f, entity, edit?.id);
  const shown = (k: keyof RegistrationForm) => (tried ? errors[k] : undefined);
  const set = (k: keyof RegistrationForm) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const meta = registrationMeta(f.type);
  const formId = 'registration-form';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    saveRegistration(entity.id, formToRegistration(f, edit?.id ?? uid('reg')));
    whenSynced((ok) => { if (ok) toast.success(edit ? 'Registration updated' : 'Registration added'); });
    onClose();
  };

  return (
    <Modal title={edit ? 'Edit registration' : `Add registration to ${entity.name}`} onClose={onClose} width={620}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : 'Add registration'}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate>
        <FormGrid narrow={narrow}>
          <SelectField label="Registration" required value={f.type} onChange={(v) => setF((p) => ({ ...p, type: v as RegistrationType }))}>
            {REGISTRATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectField>
          {meta.state !== 'none' ? (
            <SelectField label="State" required={meta.state === 'required'} value={f.state} onChange={set('state')} error={shown('state')}
              hint={meta.state === 'optional' ? 'Optional for this registration' : undefined}>
              <option value="">{meta.state === 'required' ? 'Choose a state' : 'Not state specific'}</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectField>
          ) : <Field label="State"><div style={{ minHeight: 36, display: 'flex', alignItems: 'center', fontSize: 13.5, color: T.mute }}>{meta.short} is not registered per state</div></Field>}
          <TextField label="Number" required value={f.number} onChange={set('number')} error={shown('number')} hint={meta.hint} autoComplete="off" />
          <div />
          <TextField label="Valid from" type="date" value={f.validFrom} onChange={set('validFrom')} error={shown('validFrom')} />
          <TextField label="Valid to" type="date" value={f.validTo} onChange={set('validTo')} error={shown('validTo')} hint="Leave empty if it does not expire." />
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <TextField label="Notes" value={f.notes} onChange={set('notes')} placeholder="Renewal owner, portal login holder, anything useful" />
        </div>
      </form>
    </Modal>
  );
}
