'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmFlows, crmFlowSteps, type Flow, type FlowStep } from '../../lib/crmApi';

// The engine executes steps in `position` order and falls through by position
// when edges are null — so a linear cadence is just ordered steps with no edges.
// (Branches remain available via the API/step model; this page authors the
//  common linear sequence: email → wait → WhatsApp → task.)

const TRIGGERS: Array<{ v: string; l: string }> = [
  { v: 'lead_created', l: 'Lead created' },
  { v: 'lead_status_changed', l: 'Lead status changed' },
  { v: 'lead_lifecycle_stage_changed', l: 'Lead lifecycle stage changed' },
  { v: 'lead_owner_changed', l: 'Lead owner changed' },
  { v: 'lead_disqualified', l: 'Lead disqualified' },
  { v: 'lead_converted', l: 'Lead converted' },
  { v: 'deal_created', l: 'Deal created' },
  { v: 'deal_stage_changed', l: 'Deal stage changed' },
  { v: 'deal_won', l: 'Deal won' },
  { v: 'deal_lost', l: 'Deal lost' },
  { v: 'activity_created', l: 'Activity created' },
  { v: 'activity_completed', l: 'Activity completed' },
  { v: 'lead_idle', l: 'Lead idle (time-based)' },
  { v: 'deal_stalled', l: 'Deal stalled (time-based)' },
  { v: 'task_overdue', l: 'Task overdue (time-based)' },
];
const triggerLabel = (v: string) => TRIGGERS.find((t) => t.v === v)?.l || v;

const STEP_TYPES = [
  { key: 'delay', label: '⏱ Wait / delay' },
  { key: 'create_task', label: '✅ Create task' },
  { key: 'send_notification', label: '🔔 Notify owner' },
  { key: 'send_email', label: '✉️ Send email (advanced)' },
  { key: 'send_whatsapp', label: '💬 Send WhatsApp (advanced)' },
  { key: 'custom', label: '⚙️ Custom action (JSON)' },
] as const;

// Per-step icon + accent, keyed by delay-kind or action_type. Drives the
// timeline dots so a cadence reads as a sequence at a glance.
const STEP_META: Record<string, { icon: string; color: string }> = {
  delay:             { icon: '⏱', color: '#f59e0b' },
  create_task:       { icon: '✅', color: '#3b82f6' },
  send_notification: { icon: '🔔', color: '#8b5cf6' },
  send_email:        { icon: '✉️', color: '#14b8a6' },
  send_whatsapp:     { icon: '💬', color: '#22c55e' },
};
const stepMeta = (s: FlowStep) =>
  s.kind === 'delay' ? STEP_META.delay : (STEP_META[s.action_type || ''] || { icon: '⚙️', color: 'var(--text-dim)' });

// One-tap starter cadences. Each expands into a flow + ordered steps using the
// same payload shapes the manual editor produces, so nothing new to validate.
type TplStep =
  | { kind: 'delay'; amount: number; unit: string }
  | { kind: 'action'; action_type: string; action_config: Record<string, unknown> };
const TEMPLATES: Array<{ id: string; icon: string; name: string; trigger: string; blurb: string; steps: TplStep[] }> = [
  {
    id: 'new-lead-5day', icon: '🌱', name: 'New-lead 5-day follow-up', trigger: 'lead_created',
    blurb: 'Task → wait 2d → notify → wait 3d → proposal task',
    steps: [
      { kind: 'action', action_type: 'create_task', action_config: { subject: 'Intro call with {{lead.first_name}}', due_in_days: 0 } },
      { kind: 'delay', amount: 2, unit: 'days' },
      { kind: 'action', action_type: 'send_notification', action_config: { title: 'Follow up with {{lead.first_name}}' } },
      { kind: 'delay', amount: 3, unit: 'days' },
      { kind: 'action', action_type: 'create_task', action_config: { subject: 'Send proposal to {{lead.first_name}}' } },
    ],
  },
  {
    id: 're-engage', icon: '🔁', name: 'Re-engage cold leads', trigger: 'lead_idle',
    blurb: 'Notify owner → wait 2d → re-engagement call task',
    steps: [
      { kind: 'action', action_type: 'send_notification', action_config: { title: '{{lead.first_name}} has gone quiet — reach out' } },
      { kind: 'delay', amount: 2, unit: 'days' },
      { kind: 'action', action_type: 'create_task', action_config: { subject: 'Re-engagement call: {{lead.first_name}}' } },
    ],
  },
  {
    id: 'deal-won', icon: '🎉', name: 'Deal won → kickoff', trigger: 'deal_won',
    blurb: 'Onboarding task → wait 1d → notify owner',
    steps: [
      { kind: 'action', action_type: 'create_task', action_config: { subject: 'Kick off onboarding for {{deal.name}}', due_in_days: 1 } },
      { kind: 'delay', amount: 1, unit: 'days' },
      { kind: 'action', action_type: 'send_notification', action_config: { title: 'Onboarding started for {{deal.name}}' } },
    ],
  },
];

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%' };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };

export default function CadencesManager() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('lead_created');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await crmFlows.list();
      setFlows((r.data || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (e: any) { toast.error(e.message || 'Failed to load cadences'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createFlow = async () => {
    if (!newName.trim()) return toast.error('Name your cadence');
    setCreating(true);
    try {
      const r = await crmFlows.create({ name: newName.trim(), trigger_type: newTrigger, is_active: false } as any);
      toast.success('Cadence created — add steps, then activate');
      setNewName('');
      await load();
      setExpandedId((r.data as Flow)?.id ?? null);
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const [applyingTpl, setApplyingTpl] = useState<string | null>(null);
  const createFromTemplate = async (tpl: typeof TEMPLATES[number]) => {
    setApplyingTpl(tpl.id);
    try {
      const r = await crmFlows.create({ name: tpl.name, trigger_type: tpl.trigger, is_active: false } as any);
      const flowId = (r.data as Flow)?.id;
      if (!flowId) throw new Error('Could not create cadence');
      // Steps are created in order; position = index so the engine runs them
      // top-to-bottom (delays park the run until due).
      for (let i = 0; i < tpl.steps.length; i++) {
        const st = tpl.steps[i];
        const payload = st.kind === 'delay'
          ? { flow_id: flowId, kind: 'delay', position: i, delay: { amount: st.amount, unit: st.unit } }
          : { flow_id: flowId, kind: 'action', position: i, action_type: st.action_type, action_config: st.action_config };
        await crmFlowSteps.create(payload as any);
      }
      toast.success(`“${tpl.name}” created — review the steps, then activate`);
      await load();
      setExpandedId(flowId);
    } catch (e: any) { toast.error(e.message || 'Could not create from template'); }
    finally { setApplyingTpl(null); }
  };

  const toggleActive = async (f: Flow) => {
    try {
      await crmFlows.update(f.id, { is_active: !f.is_active } as any);
      setFlows((fs) => fs.map((x) => (x.id === f.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  const removeFlow = async (f: Flow) => {
    if (!window.confirm(`Delete cadence “${f.name}”?`)) return;
    try { await crmFlows.remove(f.id); toast.success('Deleted'); if (expandedId === f.id) setExpandedId(null); load(); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Cadences &amp; Drips</h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '4px 0 0', maxWidth: 640 }}>
          Multi-step follow-up sequences that fire on a trigger and run in order, with waits between touches
          (e.g. <em>on Lead created: create a task → wait 2 days → notify the owner</em>). Steps run top-to-bottom;
          delays park the run until due. Activate a cadence to make it live.
        </p>
      </div>

      {/* New cadence */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={label}>Cadence name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} style={input} placeholder="e.g. New lead 5-day follow-up" />
        </div>
        <div style={{ minWidth: 200 }}>
          <label style={label}>Trigger</label>
          <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} style={input as any}>
            {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <button style={{ ...btnPrimary, opacity: creating ? 0.6 : 1 }} disabled={creating} onClick={createFlow}>
          {creating ? 'Creating…' : '+ New Cadence'}
        </button>
      </div>

      {/* Start-from-a-template shortcuts */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Or start from a template
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              className="sf-chip"
              disabled={!!applyingTpl}
              onClick={() => createFromTemplate(tpl)}
              style={{ ...card, textAlign: 'left', cursor: applyingTpl ? 'default' : 'pointer', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, opacity: applyingTpl && applyingTpl !== tpl.id ? 0.5 : 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{tpl.icon}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{tpl.name}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.4 }}>{tpl.blurb}</div>
              <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, marginTop: 2 }}>
                {applyingTpl === tpl.id ? 'Creating…' : `+ Use template · ${tpl.steps.length} steps`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {loading && flows.length === 0 ? (
        <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      ) : flows.length === 0 ? (
        <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>No cadences yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {flows.map((f) => (
            <div key={f.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {expandedId === f.id ? '▾ ' : '▸ '}{f.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>
                    Trigger: {triggerLabel(f.trigger_type)}{f.run_count ? ` · ${f.run_count} runs` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.5,
                  background: f.is_active ? 'rgba(34,197,94,0.14)' : 'var(--s3)', color: f.is_active ? '#22c55e' : 'var(--text-dim)' }}>
                  {f.is_active ? 'Active' : 'Draft'}
                </span>
                <button style={btnGhost} onClick={() => toggleActive(f)}>{f.is_active ? 'Deactivate' : 'Activate'}</button>
                <button style={{ ...btnGhost, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => removeFlow(f)}>Delete</button>
              </div>
              {expandedId === f.id && <StepEditor flowId={f.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepEditor({ flowId }: { flowId: string }) {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // draft
  const [type, setType] = useState<string>('create_task');
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState('days');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueInDays, setDueInDays] = useState('');
  const [title, setTitle] = useState('');
  const [actionType, setActionType] = useState('send_email');
  const [configJson, setConfigJson] = useState('{}');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await crmFlowSteps.list({ flow_id: flowId });
      setSteps((r.data || []).slice().sort((a, b) => a.position - b.position));
    } catch (e: any) { toast.error(e.message || 'Failed to load steps'); }
    finally { setLoading(false); }
  }, [flowId]);
  useEffect(() => { load(); }, [load]);

  const resetDraft = () => { setSubject(''); setBody(''); setDueInDays(''); setTitle(''); setAmount('2'); setUnit('days'); setConfigJson('{}'); };

  const addStep = async () => {
    const position = steps.length;
    let payload: any;
    try {
      if (type === 'delay') {
        const n = Number(amount);
        if (!(n > 0)) return toast.error('Enter a positive wait amount');
        payload = { flow_id: flowId, kind: 'delay', position, delay: { amount: n, unit } };
      } else if (type === 'create_task') {
        if (!subject.trim()) return toast.error('Task subject is required');
        const cfg: Record<string, unknown> = { subject: subject.trim() };
        if (body.trim()) cfg.body = body.trim();
        if (dueInDays.trim()) cfg.due_in_days = Number(dueInDays);
        payload = { flow_id: flowId, kind: 'action', position, action_type: 'create_task', action_config: cfg };
      } else if (type === 'send_notification') {
        if (!title.trim()) return toast.error('Notification title is required');
        payload = { flow_id: flowId, kind: 'action', position, action_type: 'send_notification', action_config: { title: title.trim(), body: body.trim() || undefined } };
      } else {
        // send_email / send_whatsapp / custom → JSON config
        let cfg: Record<string, unknown> = {};
        try { cfg = configJson.trim() ? JSON.parse(configJson) : {}; }
        catch { return toast.error('Config must be valid JSON'); }
        const at = type === 'custom' ? actionType : type;
        payload = { flow_id: flowId, kind: 'action', position, action_type: at, action_config: cfg };
      }
      setSaving(true);
      await crmFlowSteps.create(payload);
      resetDraft();
      await load();
    } catch (e: any) { toast.error(e.message || 'Add step failed'); }
    finally { setSaving(false); }
  };

  const removeStep = async (s: FlowStep) => {
    try { await crmFlowSteps.remove(s.id); await load(); }
    catch (e: any) { toast.error(e.message || 'Remove failed'); }
  };

  const stepTitle = (s: FlowStep): string => {
    if (s.kind === 'delay') return `Wait ${s.delay?.amount ?? '?'} ${s.delay?.unit ?? 'days'}`;
    if (s.kind === 'action') {
      const cfg = (s.action_config || {}) as any;
      if (s.action_type === 'create_task') return `Create task`;
      if (s.action_type === 'send_notification') return `Notify owner`;
      if (s.action_type === 'send_email') return `Send email`;
      if (s.action_type === 'send_whatsapp') return `Send WhatsApp`;
      return String(s.action_type || 'Action');
    }
    return s.kind;
  };
  const stepDetail = (s: FlowStep): string => {
    if (s.kind === 'delay') return 'then continue to the next step';
    const cfg = (s.action_config || {}) as any;
    if (s.action_type === 'create_task') return [cfg.subject, cfg.due_in_days != null ? `due in ${cfg.due_in_days}d` : ''].filter(Boolean).join(' · ');
    if (s.action_type === 'send_notification') return [cfg.title, cfg.body].filter(Boolean).join(' · ');
    return cfg.template_id ? `template ${cfg.template_id}` : '';
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      {/* Steps list */}
      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading steps…</div>
      ) : steps.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 10 }}>No steps yet — add the first touch below.</div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {steps.map((s, i) => {
            const m = stepMeta(s);
            const detail = stepDetail(s);
            const isLast = i === steps.length - 1;
            return (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                {/* Timeline rail: icon dot + connector line to the next step */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    background: `color-mix(in srgb, ${m.color} 16%, transparent)`, border: `1.5px solid ${m.color}` }}>{m.icon}</div>
                  {!isLast && <div style={{ flex: 1, width: 2, minHeight: 14, background: 'var(--border)', margin: '2px 0' }} />}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, paddingBottom: isLast ? 0 : 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 700, marginRight: 6 }}>{i + 1}</span>{stepTitle(s)}
                    </div>
                    {detail && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>}
                  </div>
                  <button onClick={() => removeStep(s)} style={{ background: 'transparent', border: '1px solid var(--border)', color: '#ef4444', padding: '2px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add step */}
      <div style={{ background: 'var(--s3)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <label style={label}>Add a step</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={input as any}>
              {STEP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={addStep}>{saving ? 'Adding…' : 'Add step'}</button>
        </div>

        {type === 'delay' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 120 }}><label style={label}>Wait</label><input value={amount} onChange={(e) => setAmount(e.target.value)} style={input} inputMode="numeric" /></div>
            <div style={{ width: 140 }}><label style={label}>Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={input as any}>
                <option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option>
              </select>
            </div>
          </div>
        )}
        {type === 'create_task' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><label style={label}>Task subject *</label><input value={subject} onChange={(e) => setSubject(e.target.value)} style={input} placeholder="e.g. Call {{lead.first_name}}" /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><label style={label}>Description</label><input value={body} onChange={(e) => setBody(e.target.value)} style={input} placeholder="Optional. Supports {{lead.field}}" /></div>
              <div style={{ width: 130 }}><label style={label}>Due in (days)</label><input value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} style={input} inputMode="numeric" placeholder="e.g. 1" /></div>
            </div>
          </div>
        )}
        {type === 'send_notification' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><label style={label}>Title *</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="e.g. Follow up with {{lead.first_name}}" /></div>
            <div><label style={label}>Body</label><input value={body} onChange={(e) => setBody(e.target.value)} style={input} placeholder="Optional" /></div>
          </div>
        )}
        {(type === 'send_email' || type === 'send_whatsapp' || type === 'custom') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {type === 'custom' && (
              <div><label style={label}>Action type</label>
                <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={input as any}>
                  {['send_email', 'send_whatsapp', 'update_lead', 'update_deal', 'assign_owner', 'convert_lead', 'create_activity'].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={label}>Action config (JSON)</label>
              <textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={3} style={{ ...input, fontFamily: 'monospace', resize: 'vertical' }} placeholder='{"template_id":"…"}' />
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 4 }}>Advanced — the raw action_config passed to the executor. Values support {'{{lead.field}}'} interpolation.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
