'use client';
// Leave rules: one row per leave type with a plain-English summary, and a full policy editor whose preview sentence
// updates as the fields change. A leave type that still has balances cannot be deleted.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, ConfidenceBadge, DataTable, Modal, Note, SearchBox, Toolbar, T, useIsCompact, type Col } from '../ui';
import { Field, FormGrid, Section, Textarea } from '../../ui';
import type { HrmsDb, LeaveType } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { remove, upsert } from '../../../lib/hrms/actions';
import { BlockedDialog, ConfirmDialog } from '../org/Confirm';
import { CheckField, SelectField, TextField, focusFirstInvalid, primaryStyle } from '../org/formKit';
import {
  MATERNITY_DAYS, compOffExpiryDays, describeLeavePolicy, emptyLeaveForm, formToLeave, isCompOff, isMaternity, leaveToForm, validateLeave, withCompOffExpiry, type LeaveForm,
} from './timeLogic';

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const;
const AUDIENCE: Record<LeaveType['audience'], string> = { all: 'Everyone', female: 'Women', male: 'Men' };

function MaternityNote() {
  return (
    <Note tone="info">
      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span><b>Maternity Benefit Act.</b> {MATERNITY_DAYS / 7} weeks of paid leave ({MATERNITY_DAYS} days) for the first two children, 12 weeks from the third, for someone who has worked at least 80 days in the 12 months before delivery. A company policy may be better than this, never worse.</span>
        <ConfidenceBadge level="reported" />
      </span>
    </Note>
  );
}

export function LeaveTab({ db }: { db: HrmsDb }) {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ edit?: LeaveType } | null>(null);
  const [confirm, setConfirm] = useState<LeaveType | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const holders = (id: string) => new Set(db.leaveBalances.filter((b) => b.leaveTypeId === id).map((b) => b.employeeId)).size;
  const rows = db.leaveTypes.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(q.trim().toLowerCase()));

  const askRemove = (l: LeaveType) => {
    const n = holders(l.id);
    if (n > 0) setBlocked({ title: `Cannot delete ${l.name}`, body: `${n} employee${n === 1 ? ' holds a balance' : 's hold balances'} in ${l.name}. Deleting the type would orphan ${n === 1 ? 'it' : 'them'}. Change the policy instead, for example stop accrual.` });
    else setConfirm(l);
  };

  const cols: Col<LeaveType>[] = [
    {
      key: 'name', label: 'Leave type', sortValue: (l) => l.name.toLowerCase(), render: (l) => (
        <div>
          <div style={{ fontWeight: 600 }}>{l.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute }}>{l.code}</span>
            <Badge tone={l.paid ? 'ok' : 'neutral'}>{l.paid ? 'Paid' : 'Unpaid'}</Badge>
          </div>
        </div>
      ),
    },
    { key: 'audience', label: 'For', sortValue: (l) => l.audience, render: (l) => AUDIENCE[l.audience] },
    {
      key: 'policy', label: 'Policy', render: (l) => {
        const exp = compOffExpiryDays(l.description);
        return (
          <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span data-testid={`policy-${l.code}`} style={{ lineHeight: 1.5 }}>{describeLeavePolicy(l)}</span>
            {isCompOff(l) && <span><Badge tone={exp ? 'info' : 'warn'}>{exp ? `Lapses after ${exp} days` : 'No expiry set'}</Badge></span>}
            {isMaternity(l) && <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>Maternity Benefit Act applies: {MATERNITY_DAYS / 7} weeks minimum <ConfidenceBadge level="reported" /></span>}
          </div>
        );
      },
    },
    { key: 'balances', label: 'Balances held', align: 'right', sortValue: (l) => holders(l.id), render: (l) => { const n = holders(l.id); return n ? `${n} ${n === 1 ? 'person' : 'people'}` : <span style={{ color: T.mute }}>None</span>; } },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (l) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setModal({ edit: l })} aria-label={`Edit ${l.name}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => askRemove(l)} aria-label={`Delete ${l.name}`}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search leave types" />
        <div style={{ flex: 1 }} />
        <Button variant="primary" style={primaryStyle} onClick={() => setModal({})}>Add leave type</Button>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={860} empty={db.leaveTypes.length === 0 ? 'No leave types yet.' : 'No leave type matches this search.'} />
      <div style={{ fontSize: 12.5, color: T.mute }}>The policy column is generated from the fields, so what you read here is what the rules do. Accrual and balances are not recalculated in the preview.</div>

      {modal && <LeaveModal db={db} edit={modal.edit} onClose={() => setModal(null)} />}
      {confirm && (
        <ConfirmDialog title="Delete leave type" confirmLabel="Delete leave type" onCancel={() => setConfirm(null)}
          onConfirm={() => { remove('leaveTypes', confirm.id); toast.success(`${confirm.name} deleted`); setConfirm(null); }}>
          Delete <b>{confirm.name}</b> ({confirm.code})? Nobody holds a balance in it.
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

function LeaveModal({ db, edit, onClose }: { db: HrmsDb; edit?: LeaveType; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [f, setF] = useState<LeaveForm>(edit ? leaveToForm(edit) : emptyLeaveForm());
  const [tried, setTried] = useState(false);
  const formId = 'leave-form';
  const { errors, warnings } = validateLeave(f, db.leaveTypes.filter((l) => l.id !== edit?.id));
  const shown = (k: keyof LeaveForm) => (tried ? errors[k] : undefined);
  const set = <K extends keyof LeaveForm>(k: K, v: LeaveForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const comp = isCompOff({ code: f.code, name: f.name });
  const maternity = isMaternity({ code: f.code, name: f.name });
  const preview = describeLeavePolicy(formToLeave(f, edit?.id ?? 'preview'));
  const noAccrual = f.accrualMode === 'none';

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const saved = formToLeave(f, edit?.id ?? uid('lv'));
    upsert('leaveTypes', saved);
    toast.success(edit ? `${saved.name} updated` : `${saved.name} added`);
    onClose();
  };

  return (
    <Modal title={edit ? `Edit ${edit.name}` : 'Add leave type'} onClose={onClose} width={760}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : 'Add leave type'}</Button></>}>
      <div data-testid="leave-preview" aria-live="polite" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '10px 14px', borderRadius: T.radius.md, background: T.raised, border: `1px solid ${T.border}`, fontSize: 13.5, lineHeight: 1.55, maxHeight: '28vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>What this policy says</div>
        {preview}
      </div>
      {maternity && <MaternityNote />}
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
        <Section eyebrow="Basics" first>
          <FormGrid narrow={narrow}>
            <TextField label="Leave type name" required value={f.name} onChange={(v) => set('name', v)} error={shown('name')} autoComplete="off" />
            <TextField label="Code" required value={f.code} onChange={(v) => set('code', v.toUpperCase())} error={shown('code')} maxLength={6} hint="Short, like EL or CL" autoComplete="off" />
            <SelectField label="Who can take it" value={f.audience} onChange={(v) => set('audience', v as LeaveType['audience'])}>
              <option value="all">Everyone</option><option value="female">Women only</option><option value="male">Men only</option>
            </SelectField>
            <CheckField label="Paid leave" checked={f.paid} onChange={(v) => set('paid', v)} hint="Unpaid leave reduces pay for each day taken" />
          </FormGrid>
        </Section>
        <Section eyebrow="Accrual" hint="How days are credited to a balance.">
          <FormGrid narrow={narrow} columns={3}>
            <SelectField label="Accrual" value={f.accrualMode} onChange={(v) => set('accrualMode', v as LeaveForm['accrualMode'])}>
              <option value="none">None, credited when approved</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="on_joining">Once, at the start</option>
            </SelectField>
            <TextField label={f.accrualMode === 'monthly' ? 'Days a month' : f.accrualMode === 'yearly' ? 'Days a year' : 'Days credited'} type="number" step={0.25} min={0} value={f.accrualDays} onChange={(v) => set('accrualDays', v)} error={shown('accrualDays')} disabled={noAccrual} />
            <TextField label="Starts after (months of service)" type="number" min={0} max={60} value={f.afterMonths} onChange={(v) => set('afterMonths', v)} error={shown('afterMonths')} disabled={noAccrual} hint="0 means from the join date" />
          </FormGrid>
        </Section>
        <Section eyebrow="Carry forward" hint="What happens to unused days at the end of the leave year.">
          <FormGrid narrow={narrow} columns={3}>
            <CheckField label="Allow carry forward" checked={f.cfAllowed} onChange={(v) => set('cfAllowed', v)} />
            <TextField label="Most days carried" type="number" min={0} step={0.5} value={f.cfMax} onChange={(v) => set('cfMax', v)} error={shown('cfMax')} disabled={!f.cfAllowed} hint="0 means no limit" />
            <TextField label="Expires after (months)" type="number" min={0} max={120} value={f.cfExpiry} onChange={(v) => set('cfExpiry', v)} error={shown('cfExpiry')} disabled={!f.cfAllowed} hint="0 means never" />
          </FormGrid>
        </Section>
        <Section eyebrow="Encashment" hint="Paying out unused days instead of letting them lapse.">
          <FormGrid narrow={narrow} columns={3}>
            <CheckField label="Encash while employed" checked={f.encAllowed} onChange={(v) => set('encAllowed', v)} />
            <CheckField label="Pay out on exit" checked={f.encOnExit} onChange={(v) => set('encOnExit', v)} />
            <TextField label="Most days encashed" type="number" min={0} step={0.5} value={f.encMax} onChange={(v) => set('encMax', v)} error={shown('encMax')} disabled={!f.encAllowed && !f.encOnExit} />
          </FormGrid>
        </Section>
        <Section eyebrow="Conditions">
          <FormGrid narrow={narrow}>
            <TextField label="Document needed after (days)" type="number" min={1} value={f.docAfter} onChange={(v) => set('docAfter', v)} error={shown('docAfter')} hint="Leave empty if never. Sick leave usually asks for a certificate." />
            <TextField label="Most days at a stretch" type="number" min={1} value={f.maxConsecutive} onChange={(v) => set('maxConsecutive', v)} error={shown('maxConsecutive')} hint="Leave empty for no limit" />
            <CheckField label="Available during probation" checked={f.probationEligible} onChange={(v) => set('probationEligible', v)} />
            <CheckField label="Weekly offs and holidays inside the leave count as leave" checked={f.includeWeeklyOffs} onChange={(v) => set('includeWeeklyOffs', v)} />
            {comp && <TextField label="Comp-off lapses after (days)" type="number" min={1} max={365} value={f.compOffDays} onChange={(v) => setF((p) => ({ ...p, compOffDays: v, description: withCompOffExpiry(p.description, Number(v) > 0 ? Number(v) : undefined) }))} error={shown('compOffDays')} hint="Saved into the description, as the leave model has no expiry field" />}
          </FormGrid>
        </Section>
        <Section eyebrow="Description">
          <Field label="Note shown to employees" htmlFor="leave-desc">
            <Textarea id="leave-desc" value={f.description} rows={3}
              onChange={(e) => { const text = e.target.value; setF((p) => ({ ...p, description: text, compOffDays: comp ? String(compOffExpiryDays(text) ?? '') : p.compOffDays })); }} />
          </Field>
        </Section>
        {warnings.map((w) => <div key={w} style={{ marginBottom: 8 }}><Note tone="warn">{w}</Note></div>)}
        {tried && Object.keys(errors).length > 0 && <div role="alert" style={{ fontSize: 13, color: T.red }}>Fix the {Object.keys(errors).length} highlighted field{Object.keys(errors).length === 1 ? '' : 's'} to save.</div>}
      </form>
    </Modal>
  );
}
