'use client';
/**
 * No-code automation builder. Writes the live `crm_automations` shape the
 * engine actually executes: { trigger_type, trigger_config.conditions[],
 * action_type, action_config }. When <trigger> happens and all <conditions>
 * pass, the engine runs <action>.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  crmAutomations, crmPipelines, crmEmailTemplates, crmWhatsappTemplates,
} from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { Automation, AutomationCondition, Pipeline, EmailTemplate, WhatsappTemplate } from '../../../../../types/crm';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';

// ── Trigger / action catalogues (must match automations.service.ts) ──
const TRIGGER_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string; entity: 'lead' | 'deal' | 'activity'; timed?: boolean }> }> = [
  { group: 'Lead', items: [
    { value: 'lead_created', label: 'Lead is created', entity: 'lead' },
    { value: 'lead_status_changed', label: 'Lead status changes', entity: 'lead' },
    { value: 'lead_lifecycle_stage_changed', label: 'Lead lifecycle stage changes', entity: 'lead' },
    { value: 'lead_owner_changed', label: 'Lead owner changes', entity: 'lead' },
    { value: 'lead_disqualified', label: 'Lead is disqualified', entity: 'lead' },
    { value: 'lead_converted', label: 'Lead is converted', entity: 'lead' },
  ] },
  { group: 'Deal', items: [
    { value: 'deal_created', label: 'Deal is created', entity: 'deal' },
    { value: 'deal_stage_changed', label: 'Deal stage changes', entity: 'deal' },
    { value: 'deal_won', label: 'Deal is won', entity: 'deal' },
    { value: 'deal_lost', label: 'Deal is lost', entity: 'deal' },
  ] },
  { group: 'Activity', items: [
    { value: 'activity_created', label: 'Activity is logged', entity: 'activity' },
    { value: 'activity_completed', label: 'Activity is completed', entity: 'activity' },
  ] },
  { group: 'Time-based', items: [
    { value: 'lead_idle', label: 'Lead goes untouched for N days', entity: 'lead', timed: true },
    { value: 'deal_stalled', label: 'Deal stalls for N days', entity: 'deal', timed: true },
    { value: 'task_overdue', label: 'Task is overdue by N days', entity: 'lead', timed: true },
  ] },
];

const ACTION_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [
  { group: 'Tasks & activities', items: [
    { value: 'create_task', label: 'Create a follow-up task' },
    { value: 'create_activity', label: 'Log an activity / note' },
  ] },
  { group: 'Messaging', items: [
    { value: 'send_email', label: 'Send an email' },
    { value: 'send_whatsapp', label: 'Send a WhatsApp message' },
    { value: 'send_notification', label: 'Notify a teammate (in-app)' },
  ] },
  { group: 'Update record', items: [
    { value: 'update_lead', label: 'Update the lead' },
    { value: 'update_deal', label: 'Update the deal' },
  ] },
  { group: 'Routing & conversion', items: [
    { value: 'assign_owner', label: 'Assign / route the owner' },
    { value: 'convert_lead', label: 'Convert lead to a deal' },
  ] },
];

const OPS = [
  { value: '=', label: 'is' }, { value: '!=', label: 'is not' },
  { value: '>', label: '>' }, { value: '>=', label: '≥' },
  { value: '<', label: '<' }, { value: '<=', label: '≤' },
  { value: 'in', label: 'is one of' }, { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'is set' },
];

const FIELD_SUGGESTIONS: Record<string, string[]> = {
  lead: ['lead.status', 'lead.score', 'lead.source', 'lead.city', 'lead.state', 'lead.priority', 'lead.lifecycle_stage', 'new_status', 'old_status'],
  deal: ['deal.amount', 'deal.status', 'deal.stage_id', 'deal.owner_id', 'new_stage_id'],
  activity: ['activity.type', 'activity.subject', 'activity.direction'],
};

const LEAD_STATUSES = ['new', 'working', 'nurturing', 'qualified', 'unqualified', 'lost', 'converted'];

type Draft = {
  id: string | null;
  name: string;
  trigger_type: string;
  days: number;
  conditions: AutomationCondition[];
  action_type: string;
  action_config: Record<string, any>;
};

const emptyDraft = (): Draft => ({
  id: null, name: '', trigger_type: 'lead_created', days: 3,
  conditions: [], action_type: 'create_task', action_config: {},
});

function triggerMeta(value: string) {
  for (const g of TRIGGER_GROUPS) { const it = g.items.find((i) => i.value === value); if (it) return it; }
  return TRIGGER_GROUPS[0].items[0];
}
const triggerLabel = (v: string) => { for (const g of TRIGGER_GROUPS) { const it = g.items.find((i) => i.value === v); if (it) return it.label; } return v; };
const actionLabel = (v: string) => { for (const g of ACTION_GROUPS) { const it = g.items.find((i) => i.value === v); if (it) return it.label; } return v; };

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  // Option sources so the builder uses pickers, not raw UUIDs.
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [waTemplates, setWaTemplates] = useState<WhatsappTemplate[]>([]);

  const reload = async () => {
    setLoading(true);
    try { setItems((await crmAutomations.list()).data || []); }
    catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    reload();
    (async () => {
      const [u, p, et, wt] = await Promise.allSettled([
        api.getUsers({ limit: '500' }) as Promise<any>,
        crmPipelines.list(), crmEmailTemplates.list(), crmWhatsappTemplates.list(),
      ]);
      if (u.status === 'fulfilled') setUsers(((u.value.data || u.value || []) as any[]).map((x) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' })));
      if (p.status === 'fulfilled') setPipelines(p.value.data || []);
      if (et.status === 'fulfilled') setEmailTemplates(et.value.data || []);
      if (wt.status === 'fulfilled') setWaTemplates(wt.value.data || []);
    })();
  }, []);

  const meta = triggerMeta(draft.trigger_type);
  const setCfg = (patch: Record<string, any>) => setDraft((d) => ({ ...d, action_config: { ...d.action_config, ...patch } }));
  const setCond = (i: number, patch: Partial<AutomationCondition>) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));

  const stagesForPipeline = (pid?: string) =>
    (pipelines.find((p) => p.id === pid)?.stages || []) as Array<{ id: string; name: string }>;

  const summary = useMemo(() => buildSummary(draft, users), [draft, users]);

  const startEdit = (a: Automation) => {
    setDraft({
      id: a.id, name: a.name, trigger_type: a.trigger_type,
      days: Number(a.trigger_config?.days ?? 3),
      conditions: (a.trigger_config?.conditions || []).map((c) => ({ field: c.field, op: c.op, value: c.value })),
      action_type: a.action_type, action_config: { ...(a.action_config || {}) },
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error('Give the automation a name');
    setSaving(true);
    const trigger_config: Record<string, unknown> = { conditions: draft.conditions.filter((c) => c.field.trim()) };
    if (meta.timed) trigger_config.days = Number(draft.days) || 1;
    const payload = {
      name: draft.name.trim(),
      trigger_type: draft.trigger_type,
      trigger_config,
      action_type: draft.action_type,
      action_config: draft.action_config,
      is_active: true,
    };
    try {
      if (draft.id) await crmAutomations.update(draft.id, payload as any);
      else await crmAutomations.create(payload as any);
      toast.success(draft.id ? 'Automation updated' : 'Automation created');
      setDraft(emptyDraft());
      reload();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (a: Automation) => {
    setBusy((b) => ({ ...b, [a.id + 't']: true }));
    try { await crmAutomations.update(a.id, { is_active: !a.is_active } as any); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [a.id + 't']: false })); }
  };
  const remove = async (a: Automation) => {
    if (!window.confirm(`Delete automation "${a.name}"?`)) return;
    setBusy((b) => ({ ...b, [a.id + 'd']: true }));
    try { await crmAutomations.remove(a.id); toast.success('Deleted'); reload(); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [a.id + 'd']: false })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Builder ── */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{draft.id ? 'Edit automation' : 'New automation'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', margin: '4px 0 12px' }}>
          When something happens and your conditions match, KINI runs the action automatically.
        </div>

        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name (e.g. Qualified lead → assign & WhatsApp)" style={{ ...input, width: '100%', marginBottom: 10 }} />

        {/* WHEN */}
        <Label>When</Label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={draft.trigger_type} onChange={(e) => setDraft({ ...draft, trigger_type: e.target.value })} style={{ ...input, minWidth: 280 }}>
            {TRIGGER_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
          {meta.timed && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min={1} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })} style={{ ...input, width: 72 }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>days</span>
            </span>
          )}
        </div>

        {/* IF (conditions) */}
        <Label>Only if <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — all must match)</span></Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {draft.conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input list={`fields-${meta.entity}`} value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} placeholder="field" style={{ ...input, flex: 1 }} />
              <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} style={{ ...input, width: 120 }}>
                {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {c.op !== 'exists' && (
                <input value={String(c.value ?? '')} onChange={(e) => setCond(i, { value: e.target.value })} placeholder="value" style={{ ...input, width: 160 }} />
              )}
              <button onClick={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }))} style={btnSmallGhost}>✕</button>
            </div>
          ))}
          <datalist id={`fields-${meta.entity}`}>
            {(FIELD_SUGGESTIONS[meta.entity] || []).map((f) => <option key={f} value={f} />)}
          </datalist>
          <button onClick={() => setDraft((d) => ({ ...d, conditions: [...d.conditions, { field: '', op: '=', value: '' }] }))} style={{ ...btnSmallGhost, alignSelf: 'flex-start' }}>+ Add condition</button>
        </div>

        {/* THEN (action) */}
        <Label>Then</Label>
        <select value={draft.action_type} onChange={(e) => setDraft({ ...draft, action_type: e.target.value, action_config: {} })} style={{ ...input, minWidth: 280, marginBottom: 10 }}>
          {ACTION_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </optgroup>
          ))}
        </select>

        <ActionConfig
          action={draft.action_type} cfg={draft.action_config} setCfg={setCfg}
          users={users} pipelines={pipelines} emailTemplates={emailTemplates} waTemplates={waTemplates}
          stagesForPipeline={stagesForPipeline}
        />

        {/* Plain-English summary */}
        <div style={{ background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--text)', margin: '12px 0' }}>
          {summary}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : draft.id ? 'Update automation' : '+ Create automation'}</button>
          {draft.id && <button onClick={() => setDraft(emptyDraft())} style={btnGhost}>Cancel</button>}
        </div>
      </div>

      {/* ── List ── */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Automations ({items.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
          : items.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No automations yet. Build your first one above.</div>
          : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((a) => (
              <div key={a.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    {a.name}
                    {!a.is_active && <span style={pausedPill}>PAUSED</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    When <strong>{triggerLabel(a.trigger_type)}</strong> → <strong>{actionLabel(a.action_type)}</strong>
                    {!!a.trigger_config?.conditions?.length && ` · ${a.trigger_config!.conditions!.length} condition(s)`}
                    {a.run_count != null && a.run_count > 0 && ` · fired ${a.run_count}×`}
                  </div>
                </div>
                <button onClick={() => startEdit(a)} style={btnSmallGhost}>Edit</button>
                <button onClick={() => toggleActive(a)} disabled={!!busy[a.id + 't']} style={btnSmallGhost}>{a.is_active ? 'Pause' : 'Activate'}</button>
                <button onClick={() => remove(a)} disabled={!!busy[a.id + 'd']} style={btnSmallDanger}>{busy[a.id + 'd'] ? '…' : 'Delete'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-action config fields ──
function ActionConfig({ action, cfg, setCfg, users, pipelines, emailTemplates, waTemplates, stagesForPipeline }: {
  action: string; cfg: Record<string, any>; setCfg: (p: Record<string, any>) => void;
  users: UserOption[]; pipelines: Pipeline[]; emailTemplates: EmailTemplate[]; waTemplates: WhatsappTemplate[];
  stagesForPipeline: (pid?: string) => Array<{ id: string; name: string }>;
}) {
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  switch (action) {
    case 'create_task':
      return (
        <div style={grid}>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Task subject (supports {{lead.first_name}})" style={input} />
          <input type="number" min={0} value={cfg.due_in_days ?? ''} onChange={(e) => setCfg({ due_in_days: e.target.value })} placeholder="Due in N days" style={input} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Notes (optional)" style={{ ...input, gridColumn: '1 / -1' }} />
          <div style={{ gridColumn: '1 / -1' }}><UserSearchSelect options={users} value={cfg.assign_to ?? ''} onChange={(id) => setCfg({ assign_to: id })} placeholder="Assign to… (default: record owner)" emptyLabel="Record owner" /></div>
        </div>
      );
    case 'create_activity':
      return (
        <div style={grid}>
          <select value={cfg.activity_type ?? 'note'} onChange={(e) => setCfg({ activity_type: e.target.value })} style={input}>
            {['note', 'call', 'meeting', 'email', 'whatsapp', 'task'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Subject" style={input} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Body" style={{ ...input, gridColumn: '1 / -1' }} />
        </div>
      );
    case 'send_email':
      return (
        <div style={grid}>
          <input value={cfg.to ?? ''} onChange={(e) => setCfg({ to: e.target.value })} placeholder="To (blank = the lead's email)" style={input} />
          <select value={cfg.template_id ?? ''} onChange={(e) => setCfg({ template_id: e.target.value || null })} style={input}>
            <option value="">No template (write below)</option>
            {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Subject" style={{ ...input, gridColumn: '1 / -1' }} />
          <textarea value={cfg.body_html ?? ''} onChange={(e) => setCfg({ body_html: e.target.value })} placeholder="Body (HTML; supports {{lead.first_name}})" style={{ ...input, gridColumn: '1 / -1', minHeight: 70 }} />
        </div>
      );
    case 'send_whatsapp':
      return (
        <div style={grid}>
          <input value={cfg.to ?? ''} onChange={(e) => setCfg({ to: e.target.value })} placeholder="To (blank = the lead's phone)" style={input} />
          <select value={cfg.template_id ?? ''} onChange={(e) => setCfg({ template_id: e.target.value || null })} style={input}>
            <option value="">No template (write below)</option>
            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.meta_template_name}</option>)}
          </select>
          <input value={cfg.body_text ?? ''} onChange={(e) => setCfg({ body_text: e.target.value })} placeholder="Message text" style={{ ...input, gridColumn: '1 / -1' }} />
          <Hint>WhatsApp sends are inert until a Business API provider is connected.</Hint>
        </div>
      );
    case 'send_notification':
      return (
        <div style={grid}>
          <div style={{ gridColumn: '1 / -1' }}><UserSearchSelect options={users} value={cfg.recipient ?? ''} onChange={(id) => setCfg({ recipient: id })} placeholder="Notify… (default: record owner)" emptyLabel="Record owner" /></div>
          <input value={cfg.title ?? ''} onChange={(e) => setCfg({ title: e.target.value })} placeholder="Title" style={input} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Message" style={input} />
        </div>
      );
    case 'update_lead':
      return (
        <div style={grid}>
          <select value={cfg.set_status ?? ''} onChange={(e) => setCfg({ set_status: e.target.value || undefined })} style={input}>
            <option value="">— set status —</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" value={cfg.set_score_delta ?? ''} onChange={(e) => setCfg({ set_score_delta: e.target.value })} placeholder="Score change (+/-)" style={input} />
          <input value={cfg.add_tags ?? ''} onChange={(e) => setCfg({ add_tags: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="Add tags (comma-separated)" style={{ ...input, gridColumn: '1 / -1' }} />
        </div>
      );
    case 'update_deal':
      return (
        <div style={grid}>
          <select value={cfg.pipeline_id ?? ''} onChange={(e) => setCfg({ pipeline_id: e.target.value || undefined })} style={input}>
            <option value="">— pipeline (for stage) —</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={cfg.set_stage_id ?? ''} onChange={(e) => setCfg({ set_stage_id: e.target.value || undefined })} style={input}>
            <option value="">— set stage —</option>
            {stagesForPipeline(cfg.pipeline_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      );
    case 'assign_owner':
      return (
        <div style={grid}>
          <select value={cfg.user_id ? 'user' : 'rules'} onChange={(e) => setCfg(e.target.value === 'rules' ? { user_id: undefined } : { user_id: cfg.user_id ?? '' })} style={input}>
            <option value="rules">Re-run assignment rules (round-robin / territory)</option>
            <option value="user">Assign a specific person</option>
          </select>
          {cfg.user_id !== undefined && (
            <div><UserSearchSelect options={users} value={cfg.user_id ?? ''} onChange={(id) => setCfg({ user_id: id })} placeholder="Pick a person…" emptyLabel="—" /></div>
          )}
        </div>
      );
    case 'convert_lead':
      return (
        <div style={grid}>
          <select value={cfg.pipeline_id ?? ''} onChange={(e) => setCfg({ pipeline_id: e.target.value || undefined, stage_id: undefined })} style={input}>
            <option value="">Default pipeline</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={cfg.stage_id ?? ''} onChange={(e) => setCfg({ stage_id: e.target.value || undefined })} style={input}>
            <option value="">First open stage</option>
            {stagesForPipeline(cfg.pipeline_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={cfg.deal_name ?? ''} onChange={(e) => setCfg({ deal_name: e.target.value })} placeholder="Deal name (supports {{lead.company}})" style={{ ...input, gridColumn: '1 / -1' }} />
        </div>
      );
    default:
      return null;
  }
}

function buildSummary(d: Draft, users: UserOption[]): string {
  const t = triggerLabel(d.trigger_type).toLowerCase();
  const conds = d.conditions.filter((c) => c.field.trim());
  const condText = conds.length
    ? ' and ' + conds.map((c) => `${c.field} ${OPS.find((o) => o.value === c.op)?.label ?? c.op}${c.op === 'exists' ? '' : ' ' + String(c.value ?? '')}`).join(' and ')
    : '';
  const cfg = d.action_config;
  const uname = (id?: string) => users.find((u) => u.id === id)?.name;
  let act = actionLabel(d.action_type).toLowerCase();
  if (d.action_type === 'assign_owner') act = cfg.user_id ? `assign to ${uname(cfg.user_id) ?? 'a person'}` : 'route via assignment rules';
  if (d.action_type === 'send_email') act = `send an email${cfg.template_id ? ' (template)' : ''}`;
  if (d.action_type === 'send_whatsapp') act = `send a WhatsApp${cfg.template_id ? ' (template)' : ''}`;
  if (d.action_type === 'convert_lead') act = 'convert the lead to a deal';
  return `When ${t}${condText}, ${act}.`;
}

// ── tiny presentational helpers ──
const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, margin: '4px 0' }}>{children}</div>
);
const Hint = ({ children }: { children: React.ReactNode }) => (
  <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-dim)' }}>{children}</div>
);

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const pausedPill: React.CSSProperties = { marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 };
