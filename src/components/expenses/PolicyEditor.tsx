'use client';
// Create or edit one expense policy. Built to be quick: start from a template,
// pick who it applies to, adjust a handful of numbers, save. Everything beyond
// the essentials (priority, effective dates) is tucked under "Advanced".

import { useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, FormGrid, Input, Section, Select, Textarea, T, useIsCompact } from '../ui';
import { useConfirm, useDebounced } from '../finance/ui';
import {
  CATEGORIES, CATEGORY_LABELS, ExpensePolicy, ItemCategory, PolicyInput, PolicyPerson, PolicyPreset, PolicyRoles, PolicyRules, expensesApi,
} from '../../lib/expensesApi';
import { ExpensesShell, Field, errText } from './kit';
import { usePageTitle } from '../../lib/pageTitle';

// ── form model ──────────────────────────────────────────────────────────────
interface CatForm { enabled: boolean; per_day_limit: string; per_claim_limit: string; per_month_limit: string; receipt_required_over: string }
interface Form {
  name: string; description: string; is_active: boolean; priority: string; currency: string;
  everyone: boolean; roles: string[]; org_role_ids: string[]; user_ids: string[];
  effective_from: string; effective_to: string;
  mileage_rate: string; receipt_required_over: string; max_claim_amount: string; submit_within_days: string;
  auto_approve_under: string; escalate_over: string; enforcement: 'flag' | 'block';
  categories: Record<ItemCategory, CatForm>;
}

const s = (v: number | null | undefined) => (v == null ? '' : String(v));
const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function catForms(c?: Partial<Record<ItemCategory, Partial<{ enabled: boolean; per_day_limit: number | null; per_claim_limit: number | null; per_month_limit: number | null; receipt_required_over: number | null }>>>): Record<ItemCategory, CatForm> {
  const out = {} as Record<ItemCategory, CatForm>;
  for (const k of CATEGORIES) {
    const r = c?.[k] ?? {};
    out[k] = { enabled: r.enabled !== false, per_day_limit: s(r.per_day_limit), per_claim_limit: s(r.per_claim_limit), per_month_limit: s(r.per_month_limit), receipt_required_over: s(r.receipt_required_over) };
  }
  return out;
}

const withRules = (f: Form, r: PolicyRules): Form => ({
  ...f,
  mileage_rate: s(r.mileage_rate), receipt_required_over: s(r.receipt_required_over), max_claim_amount: s(r.max_claim_amount),
  submit_within_days: s(r.submit_within_days), auto_approve_under: s(r.auto_approve_under), escalate_over: s(r.escalate_over),
  enforcement: r.enforcement, categories: catForms(r.categories),
});

const EMPTY: Form = {
  name: '', description: '', is_active: true, priority: '100', currency: 'INR',
  everyone: true, roles: [], org_role_ids: [], user_ids: [], effective_from: '', effective_to: '',
  mileage_rate: '12', receipt_required_over: '500', max_claim_amount: '', submit_within_days: '', auto_approve_under: '0', escalate_over: '',
  enforcement: 'flag', categories: catForms(),
};

function fromPolicy(p: ExpensePolicy): Form {
  return withRules({
    ...EMPTY, name: p.name, description: p.description ?? '', is_active: p.is_active, priority: String(p.priority), currency: p.currency || 'INR',
    everyone: p.applies_to.everyone, roles: p.applies_to.roles, org_role_ids: p.applies_to.org_role_ids, user_ids: p.applies_to.user_ids,
    effective_from: p.effective_from ?? '', effective_to: p.effective_to ?? '',
  }, p.rules);
}

function toInput(f: Form): PolicyInput {
  const categories: Record<string, Partial<Record<keyof CatForm, number | boolean | null>>> = {};
  for (const k of CATEGORIES) {
    const c = f.categories[k];
    categories[k] = {
      enabled: c.enabled, per_day_limit: num(c.per_day_limit), per_claim_limit: num(c.per_claim_limit),
      per_month_limit: num(c.per_month_limit), receipt_required_over: num(c.receipt_required_over),
    };
  }
  return {
    name: f.name.trim(), description: f.description.trim() || null, is_active: f.is_active,
    priority: Math.min(1000, Math.max(1, Math.round(num(f.priority) ?? 100))), currency: f.currency || 'INR',
    applies_to: { everyone: f.everyone, roles: f.everyone ? [] : f.roles, org_role_ids: f.everyone ? [] : f.org_role_ids, user_ids: f.everyone ? [] : f.user_ids },
    effective_from: f.effective_from || null, effective_to: f.effective_to || null,
    rules: {
      mileage_rate: num(f.mileage_rate) ?? 0, receipt_required_over: num(f.receipt_required_over) ?? 0, max_claim_amount: num(f.max_claim_amount),
      submit_within_days: num(f.submit_within_days) != null ? Math.round(num(f.submit_within_days)!) : null,
      auto_approve_under: num(f.auto_approve_under) ?? 0, escalate_over: num(f.escalate_over), enforcement: f.enforcement, categories: categories as NonNullable<PolicyInput['rules']>['categories'],
    },
  };
}

// ── small controls ──────────────────────────────────────────────────────────
const digits = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

function Amount({ value, onChange, placeholder, label, prefix, suffix, disabled, id }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; prefix?: string; suffix?: string; disabled?: boolean; id?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      {prefix && <span style={{ position: 'absolute', left: 11, top: 0, height: 36, display: 'flex', alignItems: 'center', color: T.mute, fontSize: 14, pointerEvents: 'none' }}>{prefix}</span>}
      <Input id={id} inputMode="decimal" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(digits(e.target.value))}
        disabled={disabled} style={{ paddingLeft: prefix ? 26 : undefined, paddingRight: suffix ? 44 : undefined }} />
      {suffix && <span style={{ position: 'absolute', right: 11, top: 0, height: 36, display: 'flex', alignItems: 'center', color: T.mute, fontSize: 13, pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ width: 38, height: 22, borderRadius: 999, border: 0, padding: 2, cursor: 'pointer', background: checked ? T.ok : 'var(--s4)', transition: 'background .12s ease', display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
    </button>
  );
}

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? T.red : T.border}`, background: on ? T.redWash : T.card, color: on ? T.red : T.dim, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      {children}
    </button>
  );
}

function Choice({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      style={{ flex: '1 1 240px', textAlign: 'left', padding: '12px 14px', borderRadius: T.radius.md, border: `1px solid ${on ? T.red : T.border}`, background: on ? T.redWash : T.card, cursor: 'pointer', fontFamily: 'inherit' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: on ? T.red : T.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: T.dim, marginTop: 3, lineHeight: 1.45 }}>{children}</div>
    </button>
  );
}

// ── the editor ──────────────────────────────────────────────────────────────
export default function PolicyEditor({ policyId }: { policyId?: string }) {
  const router = useRouter();
  const wide = !useIsCompact(760);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!!policyId);
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<PolicyPreset[]>([]);
  const [preset, setPreset] = useState<string>('');
  const [roles, setRoles] = useState<PolicyRoles>({ legacy: [], org_roles: [] });
  const [names, setNames] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [ask, dialog] = useConfirm();
  const dirty = useRef(false);

  const set = (p: Partial<Form>) => { dirty.current = true; setForm((f) => ({ ...f, ...p })); };
  const setCat = (k: ItemCategory, p: Partial<CatForm>) => { dirty.current = true; setForm((f) => ({ ...f, categories: { ...f.categories, [k]: { ...f.categories[k], ...p } } })); };

  useEffect(() => {
    expensesApi.policyRoles().then((r) => setRoles(r.data)).catch(() => undefined);
    if (!policyId) expensesApi.policyPresets().then((r) => setPresets(r.data ?? [])).catch(() => undefined);
  }, [policyId]);

  useEffect(() => {
    if (!policyId) return;
    let off = false;
    expensesApi.getPolicy(policyId).then((r) => {
      if (off) return;
      setForm(fromPolicy(r.data));
      setNames(Object.fromEntries((r.data.people ?? []).map((p) => [p.id, p.name])));
      if (r.data.effective_from || r.data.effective_to || r.data.priority !== 100) setAdvanced(true);
    }).catch((e) => { toast.error(errText(e, 'Could not load the policy')); router.replace('/dashboard/expenses/policies'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [policyId, router]);

  usePageTitle(policyId ? form.name || 'Policy' : 'New policy');

  const applyPreset = (p: PolicyPreset) => {
    setPreset(p.key);
    dirty.current = true;
    setForm((f) => {
      // Fill the name and description from the template unless the admin has typed their own.
      const untouched = (cur: string, pick: (x: PolicyPreset) => string) => !cur.trim() || presets.some((x) => pick(x) === cur);
      const base = p.key === 'blank' ? f : {
        ...f,
        name: untouched(f.name, (x) => x.name) ? p.name : f.name,
        description: untouched(f.description, (x) => x.description) ? p.description : f.description,
      };
      return withRules(base, p.rules);
    });
  };

  const toggleRole = (role: string) => set({ roles: form.roles.includes(role) ? form.roles.filter((r) => r !== role) : [...form.roles, role] });
  const toggleOrgRole = (id: string) => set({ org_role_ids: form.org_role_ids.includes(id) ? form.org_role_ids.filter((r) => r !== id) : [...form.org_role_ids, id] });

  const problem = useMemo(() => {
    if (!form.name.trim()) return 'Give the policy a name';
    if (!form.everyone && !form.roles.length && !form.org_role_ids.length && !form.user_ids.length) return 'Choose who this policy applies to';
    if (form.effective_from && form.effective_to && form.effective_to < form.effective_from) return 'The end date is before the start date';
    return null;
  }, [form]);

  const save = async () => {
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const body = toInput(form);
      if (policyId) await expensesApi.updatePolicy(policyId, body); else await expensesApi.createPolicy(body);
      toast.success(policyId ? 'Policy saved' : 'Policy created');
      dirty.current = false;
      router.push('/dashboard/expenses/policies');
    } catch (e) { toast.error(errText(e, 'Could not save the policy')); }
    finally { setSaving(false); }
  };

  const duplicate = async () => {
    try { const r = await expensesApi.duplicatePolicy(policyId!); toast.success('Copy created — it starts inactive'); router.push(`/dashboard/expenses/policies/${r.data.id}`); }
    catch (e) { toast.error(errText(e, 'Could not duplicate the policy')); }
  };
  const remove = async () => {
    if (!(await ask({ title: `Delete “${form.name}”?`, danger: true, confirmLabel: 'Delete policy', message: 'People it covers move to the next policy that applies to them. Claims already submitted keep the rules they were checked against.' }))) return;
    try { await expensesApi.deletePolicy(policyId!); toast.success('Policy deleted'); router.push('/dashboard/expenses/policies'); }
    catch (e) { toast.error(errText(e, 'Could not delete the policy')); }
  };
  const cancel = async () => {
    if (dirty.current && !(await ask({ title: 'Discard your changes?', confirmLabel: 'Discard', danger: true, message: 'The changes you made to this policy have not been saved.' }))) return;
    router.push('/dashboard/expenses/policies');
  };

  const heading = policyId ? 'Edit policy' : 'New policy';
  if (loading) return <ExpensesShell tab="policies" title={heading}><Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card></ExpensesShell>;

  return (
    <ExpensesShell tab="policies" title={heading} maxWidth={940}
      description="Changes apply to new claims and to claims that are edited or resubmitted. Claims already submitted keep the rules they were checked against."
      actions={policyId ? <><Button icon={<Copy size={14} strokeWidth={1.7} />} onClick={duplicate}>Duplicate</Button><Button variant="danger" icon={<Trash2 size={14} strokeWidth={1.7} />} onClick={remove}>Delete</Button></> : undefined}>

      {!policyId && presets.length > 0 && (
        <Card padding={20}>
          <Section first eyebrow="Start from a template" hint="Pick one to fill in sensible numbers, then change anything you like.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {presets.map((p) => {
                const on = preset === p.key;
                return (
                  <button key={p.key} type="button" aria-pressed={on} onClick={() => applyPreset(p)}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: T.radius.md, border: `1px solid ${on ? T.red : T.border}`, background: on ? T.redWash : T.card, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: on ? T.red : T.text }}>{p.name}</div>
                    <div style={{ fontSize: 12.5, color: T.dim, marginTop: 3, lineHeight: 1.4 }}>{p.description}</div>
                  </button>
                );
              })}
            </div>
          </Section>
        </Card>
      )}

      <Card padding={20}>
        <Section first eyebrow="Basics">
          <FormGrid narrow={!wide}>
            <Field label="Policy name" required><Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Field sales team" autoFocus={!policyId} /></Field>
            <Field label="Status" hint={form.is_active ? 'Active — applies to claims from now on.' : 'Off — nobody is checked against it.'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}><Switch checked={form.is_active} onChange={(v) => set({ is_active: v })} label="Policy active" /><span style={{ fontSize: 13.5, color: T.text }}>{form.is_active ? 'Active' : 'Inactive'}</span></div>
            </Field>
          </FormGrid>
          <Field label="Description" hint="Shown to admins only. Optional."><Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={500} style={{ minHeight: 60 }} /></Field>
        </Section>
      </Card>

      <Card padding={20}>
        <Section first eyebrow="Who it applies to" hint="Anyone not covered by a more specific policy follows the one marked Everyone.">
          <div role="radiogroup" aria-label="Audience" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Choice on={form.everyone} onClick={() => set({ everyone: true })} title="Everyone">All people in this workspace.</Choice>
            <Choice on={!form.everyone} onClick={() => set({ everyone: false })} title="Specific roles or people">Pick roles, individuals, or both.</Choice>
          </div>
          {!form.everyone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {(roles.legacy.length > 0 || roles.org_roles.length > 0) && (
                <Field label="Roles">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {roles.org_roles.map((r) => <ToggleChip key={r.id} on={form.org_role_ids.includes(r.id)} onClick={() => toggleOrgRole(r.id)}>{r.name}</ToggleChip>)}
                    {roles.legacy.map((r) => <ToggleChip key={r.role} on={form.roles.includes(r.role)} onClick={() => toggleRole(r.role)}>{r.role.replace(/_/g, ' ')} · {r.people}</ToggleChip>)}
                  </div>
                </Field>
              )}
              <PeoplePicker ids={form.user_ids} names={names} onAdd={(p) => { setNames((n) => ({ ...n, [p.id]: p.name })); set({ user_ids: [...form.user_ids, p.id] }); }}
                onRemove={(id) => set({ user_ids: form.user_ids.filter((x) => x !== id) })} />
            </div>
          )}
        </Section>
      </Card>

      <Card padding={20}>
        <Section first eyebrow="Rules" hint="The essentials. Leave a box empty for no limit.">
          <FormGrid narrow={!wide} columns={3}>
            <Field label="Mileage rate" hint="Paid per km on mileage lines."><Amount value={form.mileage_rate} onChange={(v) => set({ mileage_rate: v })} prefix="₹" suffix="/ km" label="Mileage rate" /></Field>
            <Field label="Receipt needed over" hint="Any expense above this needs a receipt."><Amount value={form.receipt_required_over} onChange={(v) => set({ receipt_required_over: v })} prefix="₹" label="Receipt needed over" /></Field>
            <Field label="Largest single claim" hint="Whole-claim cap."><Amount value={form.max_claim_amount} onChange={(v) => set({ max_claim_amount: v })} prefix="₹" placeholder="No limit" label="Largest single claim" /></Field>
            <Field label="Auto-approve up to" hint="Clean claims at or under this skip the queue. 0 turns it off."><Amount value={form.auto_approve_under} onChange={(v) => set({ auto_approve_under: v })} prefix="₹" label="Auto-approve up to" /></Field>
            <Field label="Second approver over" hint="Bigger claims also need the next manager up."><Amount value={form.escalate_over} onChange={(v) => set({ escalate_over: v })} prefix="₹" placeholder="Never" label="Second approver over" /></Field>
            <Field label="Submit within" hint="Older expenses are flagged as late."><Amount value={form.submit_within_days} onChange={(v) => set({ submit_within_days: v.replace(/\./g, '') })} placeholder="No limit" suffix="days" label="Submit within days" /></Field>
          </FormGrid>
        </Section>
      </Card>

      <Card padding={20}>
        <Section first eyebrow="Limits by category" hint="Switch a category off if it isn’t reimbursed. Daily, per-claim and monthly caps are optional.">
          {wide && (
            <div style={{ display: 'grid', gridTemplateColumns: '120px 90px repeat(4, minmax(0, 1fr))', gap: 10, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute }}>
              <span>Category</span><span>Allowed</span><span>Per day</span><span>Per claim</span><span>Per month</span><span>Receipt over</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: wide ? 8 : 12 }}>
            {CATEGORIES.map((k) => {
              const c = form.categories[k];
              const off = !c.enabled;
              const cell = (key: keyof CatForm, label: string, ph = 'No limit') => (
                <div key={key} style={{ opacity: off ? 0.45 : 1 }}>
                  {!wide && <div style={{ fontSize: 12, color: T.mute, marginBottom: 4 }}>{label}</div>}
                  <Amount value={c[key] as string} onChange={(v) => setCat(k, { [key]: v } as Partial<CatForm>)} prefix="₹" placeholder={ph} label={`${CATEGORY_LABELS[k]} ${label}`} disabled={off} />
                </div>
              );
              return wide ? (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 90px repeat(4, minmax(0, 1fr))', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{CATEGORY_LABELS[k]}</span>
                  <Switch checked={c.enabled} onChange={(v) => setCat(k, { enabled: v })} label={`${CATEGORY_LABELS[k]} allowed`} />
                  {cell('per_day_limit', 'Per day')}{cell('per_claim_limit', 'Per claim')}{cell('per_month_limit', 'Per month')}{cell('receipt_required_over', 'Receipt over', 'Policy default')}
                </div>
              ) : (
                <div key={k} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{CATEGORY_LABELS[k]}</span>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: T.dim }}>{c.enabled ? 'Allowed' : 'Not allowed'}<Switch checked={c.enabled} onChange={(v) => setCat(k, { enabled: v })} label={`${CATEGORY_LABELS[k]} allowed`} /></span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {cell('per_day_limit', 'Per day')}{cell('per_claim_limit', 'Per claim')}{cell('per_month_limit', 'Per month')}{cell('receipt_required_over', 'Receipt over', 'Default')}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </Card>

      <Card padding={20}>
        <Section first eyebrow="When a claim breaks a rule">
          <div role="radiogroup" aria-label="Enforcement" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Choice on={form.enforcement === 'flag'} onClick={() => set({ enforcement: 'flag' })} title="Flag it for the approver">The claim goes through, with the problem highlighted. The approver decides.</Choice>
            <Choice on={form.enforcement === 'block'} onClick={() => set({ enforcement: 'block' })} title="Stop it from being submitted">The claimant must fix the problem first. Use for hard rules.</Choice>
          </div>
        </Section>
      </Card>

      <Card padding={20}>
        <button type="button" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}
          style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}>
          Advanced <span style={{ fontSize: 12.5, fontWeight: 400, color: T.mute }}>priority, start and end dates, currency</span>
        </button>
        {advanced && (
          <div style={{ marginTop: 16 }}>
            <FormGrid narrow={!wide} columns={3}>
              <Field label="Priority" hint="When two policies are equally specific, the lower number wins."><Input inputMode="numeric" value={form.priority} onChange={(e) => set({ priority: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Starts on" hint="Empty = already in force."><Input type="date" value={form.effective_from} onChange={(e) => set({ effective_from: e.target.value })} /></Field>
              <Field label="Ends on" hint="Empty = no end date."><Input type="date" value={form.effective_to} min={form.effective_from || undefined} onChange={(e) => set({ effective_to: e.target.value })} /></Field>
              <Field label="Currency"><Select value={form.currency} onChange={(e) => set({ currency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </FormGrid>
          </div>
        )}
      </Card>

      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', background: 'var(--canvas)', borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, color: problem ? T.warn : T.mute }}>{problem ?? 'Ready to save.'}</span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Button onClick={cancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || !!problem}>{saving ? 'Saving…' : policyId ? 'Save policy' : 'Create policy'}</Button>
        </span>
      </div>
      {dialog}
    </ExpensesShell>
  );
}

// ── pick named people ───────────────────────────────────────────────────────
function PeoplePicker({ ids, names, onAdd, onRemove }: { ids: string[]; names: Record<string, string>; onAdd: (p: PolicyPerson) => void; onRemove: (id: string) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [results, setResults] = useState<PolicyPerson[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let off = false;
    expensesApi.policyPeople(dq).then((r) => { if (!off) setResults(r.data ?? []); }).catch(() => { if (!off) setResults([]); });
    return () => { off = true; };
  }, [dq, open]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const free = results.filter((r) => !ids.includes(r.id));
  return (
    <Field label="People" hint="Add anyone who should follow this policy regardless of role.">
      <div ref={box} style={{ position: 'relative' }}>
        <Input value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} placeholder="Search by name, employee ID or email" aria-label="Find a person" />
        {open && (
          <div style={{ position: 'absolute', zIndex: 20, top: 40, left: 0, right: 0, background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: T.radius.md, boxShadow: 'var(--shadow-pop)', maxHeight: 260, overflowY: 'auto' }}>
            {free.length === 0 && <div style={{ padding: 12, fontSize: 13, color: T.mute }}>{results.length ? 'Everyone found is already added.' : 'No one found.'}</div>}
            {free.map((p) => (
              <button key={p.id} type="button" className="km-navrow" onClick={() => { onAdd(p); setQ(''); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, background: 'transparent', cursor: 'pointer', color: T.text, fontFamily: 'inherit' }}>
                <span><span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span><span style={{ fontSize: 12, color: T.mute }}> · {[p.employee_id, p.role?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</span></span>
                <Plus size={15} strokeWidth={1.7} style={{ color: T.mute }} />
              </button>
            ))}
          </div>
        )}
      </div>
      {ids.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {ids.map((id) => (
            <Badge key={id} style={{ height: 28, paddingRight: 4 }}>
              {names[id] ?? 'Person'}
              <button type="button" aria-label={`Remove ${names[id] ?? 'person'}`} onClick={() => onRemove(id)}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'inline-flex', padding: 4 }}><X size={13} strokeWidth={2} /></button>
            </Badge>
          ))}
        </div>
      )}
    </Field>
  );
}
