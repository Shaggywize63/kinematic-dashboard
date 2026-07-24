'use client';
/**
 * Automation Canvas — a visual, canvas-style builder for CRM automations.
 *
 * Replaces the old flat form. A "flow" reads left-to-right as a plain-language
 * sentence: WHEN (trigger) → ONLY IF (conditions) → THEN (one or more actions).
 *
 * Data model (Phase 1, no backend change):
 *   The engine table `crm_automations` stores ONE action per row. A visual flow
 *   with N actions = N rows that share the same `trigger_type`, conditions, and
 *   a `flow_id` we stash inside `trigger_config` (the backend validator is
 *   `.passthrough()` and the engine ignores unknown keys). Legacy rows created
 *   by the old form have no `flow_id`, so each is shown as its own 1-action flow
 *   and transparently upgraded (gets a flow_id) the next time it's saved.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAutomations, crmPipelines, crmEmailTemplates, crmWhatsappTemplates } from '../../../lib/crmApi';
import api from '../../../lib/api';
import type { Automation, AutomationCondition, Pipeline, EmailTemplate, WhatsappTemplate } from '../../../types/crm';
import UserSearchSelect, { type UserOption } from '../shared/UserSearchSelect';

// ── Trigger / action catalogues (must match automations.service.ts) ──
const TRIGGER_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string; entity: 'lead' | 'deal' | 'activity'; timed?: boolean }> }> = [
  { group: 'Lead', items: [
    { value: 'lead_created', label: 'a lead is created', entity: 'lead' },
    { value: 'lead_status_changed', label: 'a lead status changes', entity: 'lead' },
    { value: 'lead_lifecycle_stage_changed', label: 'a lead lifecycle stage changes', entity: 'lead' },
    { value: 'lead_owner_changed', label: 'a lead owner changes', entity: 'lead' },
    { value: 'lead_disqualified', label: 'a lead is disqualified', entity: 'lead' },
    { value: 'lead_converted', label: 'a lead is converted', entity: 'lead' },
  ] },
  { group: 'Deal', items: [
    { value: 'deal_created', label: 'a deal is created', entity: 'deal' },
    { value: 'deal_stage_changed', label: 'a deal stage changes', entity: 'deal' },
    { value: 'deal_won', label: 'a deal is won', entity: 'deal' },
    { value: 'deal_lost', label: 'a deal is lost', entity: 'deal' },
  ] },
  { group: 'Activity', items: [
    { value: 'activity_created', label: 'an activity is logged', entity: 'activity' },
    { value: 'activity_completed', label: 'an activity is completed', entity: 'activity' },
  ] },
  { group: 'Time-based', items: [
    { value: 'lead_idle', label: 'a lead is untouched for N days', entity: 'lead', timed: true },
    { value: 'deal_stalled', label: 'a deal stalls for N days', entity: 'deal', timed: true },
    { value: 'task_overdue', label: 'a task is overdue by N days', entity: 'lead', timed: true },
  ] },
];

const ACTION_GROUPS: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [
  { group: 'Tasks & activities', items: [
    { value: 'create_task', label: 'Create a follow-up task' },
    { value: 'create_activity', label: 'Log an activity / note' },
  ] },
  { group: 'Messaging', items: [
    { value: 'send_whatsapp', label: 'Send a WhatsApp message' },
    { value: 'send_email', label: 'Send an email' },
    { value: 'send_notification', label: 'Notify a teammate (in-app)' },
  ] },
  { group: 'Routing & conversion', items: [
    { value: 'assign_owner', label: 'Assign / route the owner' },
    { value: 'convert_lead', label: 'Convert lead to a deal' },
  ] },
  { group: 'Update record', items: [
    { value: 'update_lead', label: 'Update the lead' },
    { value: 'update_deal', label: 'Update the deal' },
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

type ActionRole = 'task' | 'messaging' | 'routing' | 'update';
const ACTION_ROLE: Record<string, ActionRole> = {
  create_task: 'task', create_activity: 'task',
  send_email: 'messaging', send_whatsapp: 'messaging', send_notification: 'messaging',
  assign_owner: 'routing', convert_lead: 'routing',
  update_lead: 'update', update_deal: 'update',
};
const ROLE_COLOR: Record<string, string> = {
  trigger: 'var(--primary)', cond: '#D98A0A',
  task: '#4C6FE0', messaging: '#0E9C8A', routing: '#8A5CD1', update: '#5A7290',
};
// Per-action line icon (white stroke on the role-coloured tile).
const ACTION_ICON: Record<string, string> = {
  create_task: 'clipboard', create_activity: 'note',
  send_whatsapp: 'chat', send_email: 'mail', send_notification: 'bell',
  assign_owner: 'user', convert_lead: 'swap',
  update_lead: 'edit', update_deal: 'edit',
};
function Glyph({ name, size = 17 }: { name: string; size?: number }) {
  const p: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'bolt': return <svg {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
    case 'funnel': return <svg {...p}><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>;
    case 'clipboard': return <svg {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H5v16h14V5h-3" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'note': return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case 'chat': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>;
    case 'mail': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case 'bell': return <svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case 'user': return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>;
    case 'swap': return <svg {...p}><path d="m17 3 4 4-4 4" /><path d="M21 7H7" /><path d="m7 21-4-4 4-4" /><path d="M3 17h14" /></svg>;
    case 'edit': return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function triggerMeta(value: string) {
  for (const g of TRIGGER_GROUPS) { const it = g.items.find((i) => i.value === value); if (it) return it; }
  return TRIGGER_GROUPS[0].items[0];
}
const triggerLabel = (v: string) => triggerMeta(v).label;
const actionLabel = (v: string) => { for (const g of ACTION_GROUPS) { const it = g.items.find((i) => i.value === v); if (it) return it.label; } return v; };
const opLabel = (v: string) => OPS.find((o) => o.value === v)?.label ?? v;
const uuid = () => (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
  ? (crypto as any).randomUUID()
  : 'flow_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── Working (client-side) flow model ──
type FlowAction = { row_id: string | null; action_type: string; action_config: Record<string, any> };
type Flow = {
  flow_id: string;
  name: string;
  active: boolean;
  trigger_type: string;
  days: number;
  conditions: AutomationCondition[];
  actions: FlowAction[];
  run_count: number;
  _rowIds: string[]; // ids that existed on the server for diff-on-save
};
type NodeSel = { kind: 'trigger' | 'cond' | 'action'; i?: number };

const newFlow = (): Flow => ({
  flow_id: uuid(), name: 'Untitled flow', active: false,
  trigger_type: 'lead_created', days: 3, conditions: [],
  actions: [{ row_id: null, action_type: 'create_task', action_config: {} }],
  run_count: 0, _rowIds: [],
});

// ── Canvas layout constants (deterministic → wires computed, no DOM measuring) ──
const NW = 250, NH = 90, GAPY = 108;
const CX = { trig: 8, cond: 300, act: 592 };
const BASEY = 8;
const anchorR = (x: number, y: number) => ({ x: x + NW, y: y + NH / 2 });
const anchorL = (x: number, y: number) => ({ x, y: y + NH / 2 });
const bez = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = Math.max(34, (b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};

export default function AutomationCanvas() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [curIdx, setCurIdx] = useState(0);
  const [node, setNode] = useState<NodeSel>({ kind: 'trigger' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [palette, setPalette] = useState(false);

  // option sources so pickers show names, not UUIDs
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [waTemplates, setWaTemplates] = useState<WhatsappTemplate[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = ((await crmAutomations.list()).data || []) as Automation[];
      const groups = new Map<string, Automation[]>();
      for (const r of rows) {
        const fid = (r.trigger_config as any)?.flow_id as string | undefined;
        const key = fid || `__single__${r.id}`;
        const arr = groups.get(key); if (arr) arr.push(r); else groups.set(key, [r]);
      }
      const built: Flow[] = [...groups.values()].map((rs) => {
        const first = rs[0];
        const tc = (first.trigger_config || {}) as any;
        const sorted = [...rs].sort((a, b) =>
          (((a.trigger_config as any)?.position ?? 0) - ((b.trigger_config as any)?.position ?? 0))
          || String(a.created_at).localeCompare(String(b.created_at)));
        return {
          flow_id: tc.flow_id || uuid(),
          name: tc.flow_name || first.name,
          active: rs.every((r) => r.is_active),
          trigger_type: first.trigger_type,
          days: Number(tc.days ?? 3),
          conditions: (tc.conditions || []).map((c: any) => ({ field: c.field, op: c.op, value: c.value })),
          actions: sorted.map((r) => ({ row_id: r.id, action_type: r.action_type, action_config: { ...(r.action_config || {}) } })),
          run_count: rs.reduce((s, r) => s + (r.run_count || 0), 0),
          _rowIds: rs.map((r) => r.id),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setFlows(built);
      setCurIdx((i) => Math.min(i, Math.max(0, built.length - 1)));
    } catch (e: any) { toast.error(e.message || 'Failed to load automations'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
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

  const cur: Flow | undefined = flows[curIdx];
  const patch = (p: Partial<Flow>) => setFlows((fs) => fs.map((f, i) => i === curIdx ? { ...f, ...p } : f));
  const stagesFor = (pid?: string) => (pipelines.find((p) => p.id === pid)?.stages || []) as Array<{ id: string; name: string }>;

  const selectFlow = (i: number) => { setCurIdx(i); setNode({ kind: 'trigger' }); };
  const addFlow = () => { setFlows((fs) => [...fs, newFlow()]); setCurIdx(flows.length); setNode({ kind: 'trigger' }); };

  const addAction = (action_type: string) => {
    if (!cur) return;
    patch({ actions: [...cur.actions, { row_id: null, action_type, action_config: {} }] });
    setNode({ kind: 'action', i: cur.actions.length });
    setPalette(false);
  };
  const removeAction = (i: number) => {
    if (!cur || cur.actions.length <= 1) { toast.error('A flow needs at least one action'); return; }
    patch({ actions: cur.actions.filter((_, idx) => idx !== i) });
    setNode({ kind: 'cond' });
  };

  const saveFlow = async () => {
    if (!cur) return;
    if (!cur.name.trim()) return toast.error('Give the flow a name');
    if (!cur.actions.length) return toast.error('Add at least one action');
    setSaving(true);
    const timed = !!triggerMeta(cur.trigger_type).timed;
    const baseTC: Record<string, any> = {
      conditions: cur.conditions.filter((c) => c.field.trim()),
      flow_id: cur.flow_id,
      flow_name: cur.name.trim(),
    };
    if (timed) baseTC.days = Number(cur.days) || 1;
    const kept = new Set<string>();
    try {
      for (let i = 0; i < cur.actions.length; i++) {
        const a = cur.actions[i];
        const payload: any = {
          name: cur.name.trim(),
          trigger_type: cur.trigger_type,
          trigger_config: { ...baseTC, position: i },
          action_type: a.action_type,
          action_config: a.action_config,
          is_active: cur.active,
        };
        if (a.row_id) { await crmAutomations.update(a.row_id, payload); kept.add(a.row_id); }
        else { await crmAutomations.create(payload); }
      }
      // delete rows that were on the server but are no longer part of the flow
      for (const rid of cur._rowIds) if (!kept.has(rid)) await crmAutomations.remove(rid);
      toast.success('Flow saved');
      await load();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggleActive = async () => {
    if (!cur) return;
    const next = !cur.active;
    patch({ active: next });
    if (!cur._rowIds.length) return; // unsaved flow — persists on Save
    setBusy(true);
    try { for (const rid of cur._rowIds) await crmAutomations.update(rid, { is_active: next } as any); toast.success(next ? 'Flow turned on' : 'Flow paused'); await load(); }
    catch (e: any) { toast.error(e.message || 'Failed'); patch({ active: !next }); }
    finally { setBusy(false); }
  };

  const deleteFlow = async () => {
    if (!cur) return;
    if (!window.confirm(`Delete flow "${cur.name}"? This removes its ${cur.actions.length} action(s).`)) return;
    setBusy(true);
    try {
      for (const rid of cur._rowIds) await crmAutomations.remove(rid);
      // drop locally whether or not it had server rows
      setFlows((fs) => fs.filter((_, i) => i !== curIdx));
      setCurIdx(0); setNode({ kind: 'trigger' });
      if (cur._rowIds.length) { toast.success('Flow deleted'); await load(); }
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy(false); }
  };

  // ── wire paths (computed from layout constants) ──
  const wires = useMemo(() => {
    if (!cur) return [] as Array<{ d: string; dash?: boolean }>;
    const out: Array<{ d: string; dash?: boolean }> = [];
    out.push({ d: bez(anchorR(CX.trig, BASEY), anchorL(CX.cond, BASEY)) });
    cur.actions.forEach((_, i) => out.push({ d: bez(anchorR(CX.cond, BASEY), anchorL(CX.act, BASEY + i * GAPY)) }));
    out.push({ d: bez(anchorR(CX.cond, BASEY), { x: CX.act, y: BASEY + cur.actions.length * GAPY + 22 }), dash: true });
    return out;
  }, [cur]);

  const canvasW = CX.act + NW + 24;
  const canvasH = BASEY + ((cur?.actions.length || 1) + 1) * GAPY + 20;

  if (loading) return <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>Loading automations…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 328px', gap: 12, height: 'calc(100vh - 160px)', minHeight: 520 }}>
      {/* ── left: flow list ── */}
      <aside style={{ ...card, padding: 12, overflowY: 'auto' }}>
        <button onClick={addFlow} style={{ ...btnDashed, width: '100%', marginBottom: 12 }}>＋ New flow</button>
        <div style={railLabel}>Your flows</div>
        {flows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 6px' }}>No flows yet. Create your first one.</div>}
        {flows.map((f, i) => (
          <button key={f.flow_id} onClick={() => selectFlow(i)} style={flowItem(i === curIdx)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 650, fontSize: 12.5, color: 'var(--text)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', background: f.active ? '#16a34a' : 'var(--text-dim)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingLeft: 15, marginTop: 2 }}>
              When {triggerLabel(f.trigger_type).replace('N days', `${f.days} days`)} · {f.actions.length} action{f.actions.length > 1 ? 's' : ''}
            </div>
          </button>
        ))}
      </aside>

      {/* ── center: toolbar + canvas ── */}
      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {cur ? (
            <>
              <input value={cur.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Flow name"
                style={{ ...input, fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0 }} />
              <button onClick={toggleActive} disabled={busy} title="Turn the flow on/off" style={sw(cur.active)}>
                <span style={swKnob(cur.active)} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{cur.active ? 'Active' : 'Paused'}</span>
              <button onClick={saveFlow} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save flow'}</button>
              <button onClick={deleteFlow} disabled={busy} style={btnDanger}>Delete</button>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Select a flow, or create a new one.</div>}
        </div>

        <div style={{ ...card, padding: 0, flex: 1, overflow: 'auto', position: 'relative',
          backgroundImage: 'radial-gradient(circle at 1px 1px, var(--border) 1.3px, transparent 0)', backgroundSize: '22px 22px' }}>
          {!cur ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Nothing selected.</div>
          ) : (
            <div style={{ position: 'relative', width: canvasW, height: canvasH, padding: 18 }}>
              <svg width={canvasW} height={canvasH} style={{ position: 'absolute', inset: 18, pointerEvents: 'none', overflow: 'visible' }}>
                {wires.map((w, i) => (
                  <path key={i} d={w.d} fill="none" stroke="var(--border)" strokeWidth={2.2} strokeDasharray={w.dash ? '5 6' : undefined} />
                ))}
              </svg>

              <FlowNode cap="When" title={`When ${triggerLabel(cur.trigger_type).replace('N days', `${cur.days} days`)}`}
                sub={triggerMeta(cur.trigger_type).timed ? 'Checked daily' : 'Fires instantly'} role="trigger" icon="bolt"
                x={CX.trig} y={BASEY} selected={node.kind === 'trigger'} onClick={() => setNode({ kind: 'trigger' })} />

              <FlowNode cap="Only if" title={cur.conditions.length ? `${cur.conditions.length} condition${cur.conditions.length > 1 ? 's' : ''} must pass` : 'Runs every time'}
                sub={cur.conditions.length ? prettyCond(cur.conditions[0]) : 'No filter'} role="cond" icon="funnel"
                x={CX.cond} y={BASEY} selected={node.kind === 'cond'} onClick={() => setNode({ kind: 'cond' })} />

              {cur.actions.map((a, i) => (
                <FlowNode key={i} cap={`Then · ${i + 1}`} title={actionLabel(a.action_type)} sub={cfgSummary(a)}
                  role={ACTION_ROLE[a.action_type]} icon={ACTION_ICON[a.action_type] || 'clipboard'} x={CX.act} y={BASEY + i * GAPY}
                  selected={node.kind === 'action' && node.i === i} onClick={() => setNode({ kind: 'action', i })} />
              ))}

              <button onClick={() => setPalette(true)}
                style={{ ...btnDashed, position: 'absolute', left: CX.act + 18, top: BASEY + 18 + cur.actions.length * GAPY, width: NW }}>
                ＋ Add an action
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── right: inspector ── */}
      <aside style={{ ...card, padding: 0, overflowY: 'auto' }}>
        {!cur ? <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>—</div>
          : node.kind === 'trigger' ? (
          <Inspector cap="Trigger" title="When this happens" color="var(--primary)">
            <Field label="Run this flow when…">
              <select value={cur.trigger_type} onChange={(e) => patch({ trigger_type: e.target.value })} style={{ ...input, width: '100%' }}>
                {TRIGGER_GROUPS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>)}
              </select>
            </Field>
            {triggerMeta(cur.trigger_type).timed && (
              <Field label="Number of days"><input type="number" min={1} value={cur.days} onChange={(e) => patch({ days: Number(e.target.value) })} style={{ ...input, width: '100%' }} /></Field>
            )}
            <Note>This is the <b>spark</b>. Everything to the right runs when this event fires.</Note>
          </Inspector>
        ) : node.kind === 'cond' ? (
          <Inspector cap="Filter" title="Only if…" color={ROLE_COLOR.cond}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>Runs only when <b>all</b> of these match. Leave empty to always run.</div>
            {cur.conditions.map((c, i) => (
              <div key={i}>
                {i > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}><span style={andPill}>AND</span><span style={{ flex: 1, height: 1, background: 'var(--border)' }} /></div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 1fr auto', gap: 6, marginBottom: 6 }}>
                  <input list={`fields-${triggerMeta(cur.trigger_type).entity}`} value={c.field}
                    onChange={(e) => patchCond(i, { field: e.target.value })} placeholder="field" style={{ ...input, minWidth: 0 }} />
                  <select value={c.op} onChange={(e) => patchCond(i, { op: e.target.value })} style={{ ...input, minWidth: 0 }}>
                    {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {c.op !== 'exists'
                    ? <input value={String(c.value ?? '')} onChange={(e) => patchCond(i, { value: e.target.value })} placeholder="value" style={{ ...input, minWidth: 0 }} />
                    : <span />}
                  <button onClick={() => patch({ conditions: cur.conditions.filter((_, idx) => idx !== i) })} style={btnGhostSm}>✕</button>
                </div>
              </div>
            ))}
            <datalist id={`fields-${triggerMeta(cur.trigger_type).entity}`}>
              {(FIELD_SUGGESTIONS[triggerMeta(cur.trigger_type).entity] || []).map((f) => <option key={f} value={f} />)}
            </datalist>
            <button onClick={() => patch({ conditions: [...cur.conditions, { field: '', op: '=', value: '' }] })} style={{ ...btnDashed, width: '100%', marginTop: 4 }}>＋ Add condition</button>
          </Inspector>
        ) : (() => {
          const i = node.i ?? 0; const a = cur.actions[i]; if (!a) return null;
          const role = ACTION_ROLE[a.action_type];
          return (
            <Inspector cap="Action" title={`Then · action ${i + 1}`} color={ROLE_COLOR[role]}>
              <Field label="Do this">
                <select value={a.action_type} onChange={(e) => patchAction(i, { action_type: e.target.value, action_config: {} })} style={{ ...input, width: '100%' }}>
                  {ACTION_GROUPS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>)}
                </select>
              </Field>
              <ActionConfig action={a.action_type} cfg={a.action_config}
                setCfg={(p) => patchAction(i, { action_config: { ...a.action_config, ...p } })}
                users={users} pipelines={pipelines} emailTemplates={emailTemplates} waTemplates={waTemplates} stagesForPipeline={stagesFor} />
              <button onClick={() => removeAction(i)} style={{ ...btnGhostSm, color: '#ef4444', border: 'none', marginTop: 12, padding: 0 }}>✕ Remove this action</button>
            </Inspector>
          );
        })()}
      </aside>

      {/* ── action palette ── */}
      {palette && (
        <div onClick={() => setPalette(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,24,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 360, maxHeight: '72vh', overflowY: 'auto', padding: 10 }}>
            <div style={{ ...railLabel, margin: '4px 6px 8px' }}>Add an action</div>
            {ACTION_GROUPS.map((g) => (
              <div key={g.group}>
                <div style={{ ...railLabel, margin: '10px 6px 4px' }}>{g.group}</div>
                {g.items.map((x) => (
                  <button key={x.value} onClick={() => addAction(x.value)} style={paletteItem}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', background: ROLE_COLOR[ACTION_ROLE[x.value]], display: 'grid', placeItems: 'center' }}><Glyph name={ACTION_ICON[x.value] || 'clipboard'} size={15} /></span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{x.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // helpers that close over state
  function patchCond(i: number, p: Partial<AutomationCondition>) {
    if (!cur) return;
    patch({ conditions: cur.conditions.map((c, idx) => idx === i ? { ...c, ...p } : c) });
  }
  function patchAction(i: number, p: Partial<FlowAction>) {
    if (!cur) return;
    patch({ actions: cur.actions.map((a, idx) => idx === i ? { ...a, ...p } : a) });
  }
}

// ── canvas node ──
function FlowNode({ cap, title, sub, role, icon, x, y, selected, onClick }: {
  cap: string; title: string; sub: string; role: string; icon: string; x: number; y: number; selected: boolean; onClick: () => void;
}) {
  const color = ROLE_COLOR[role] || 'var(--text-dim)';
  return (
    <div onClick={onClick} style={{
      position: 'absolute', left: x + 18, top: y + 18, width: NW, minHeight: NH, cursor: 'pointer',
      background: 'var(--s2)', border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
      borderRadius: 13, boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent)' : '0 6px 18px -10px rgba(0,0,0,.35)',
      overflow: 'hidden', zIndex: 1,
    }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: '9px 13px 12px' }}>
        <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, color }}>{cap}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 5 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', background: color, display: 'grid', placeItems: 'center' }}><Glyph name={icon} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.2 }}>{title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── inspector shell + helpers ──
function Inspector({ cap, title, color, children }: { cap: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '15px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--s2)', zIndex: 2 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color }}>{cap}</span>
        <span style={{ fontWeight: 750, fontSize: 15, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', lineHeight: 1.5 }}>{children}</div>
);

function prettyCond(c: AutomationCondition): string {
  return `${c.field} ${opLabel(c.op)}${c.op === 'exists' ? '' : ` ${String(c.value ?? '')}`}`.trim();
}
function cfgSummary(a: FlowAction): string {
  const c = a.action_config || {};
  return c.subject || c.body_text || c.template_id && 'Template' || c.title || (c.user_id ? 'Assign a person' : a.action_type === 'assign_owner' ? 'Route by rules' : '')
    || c.set_status || c.activity_type || 'Click to configure';
}

// ── Per-action config fields (ported from the original builder) ──
function ActionConfig({ action, cfg, setCfg, users, pipelines, emailTemplates, waTemplates, stagesForPipeline }: {
  action: string; cfg: Record<string, any>; setCfg: (p: Record<string, any>) => void;
  users: UserOption[]; pipelines: Pipeline[]; emailTemplates: EmailTemplate[]; waTemplates: WhatsappTemplate[];
  stagesForPipeline: (pid?: string) => Array<{ id: string; name: string }>;
}) {
  const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
  const full = { ...input, width: '100%' };
  switch (action) {
    case 'create_task':
      return (
        <div style={col}>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Task subject (supports {{lead.first_name}})" style={full} />
          <input type="number" min={0} value={cfg.due_in_days ?? ''} onChange={(e) => setCfg({ due_in_days: e.target.value })} placeholder="Due in N days" style={full} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Notes (optional)" style={full} />
          <UserSearchSelect options={users} value={cfg.assign_to ?? ''} onChange={(id) => setCfg({ assign_to: id })} placeholder="Assign to… (default: record owner)" emptyLabel="Record owner" />
        </div>
      );
    case 'create_activity':
      return (
        <div style={col}>
          <select value={cfg.activity_type ?? 'note'} onChange={(e) => setCfg({ activity_type: e.target.value })} style={full}>
            {['note', 'call', 'meeting', 'email', 'whatsapp', 'task'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Subject" style={full} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Body" style={full} />
        </div>
      );
    case 'send_email':
      return (
        <div style={col}>
          <input value={cfg.to ?? ''} onChange={(e) => setCfg({ to: e.target.value })} placeholder="To (blank = the lead's email)" style={full} />
          <select value={cfg.template_id ?? ''} onChange={(e) => setCfg({ template_id: e.target.value || null })} style={full}>
            <option value="">No template (write below)</option>
            {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={cfg.subject ?? ''} onChange={(e) => setCfg({ subject: e.target.value })} placeholder="Subject" style={full} />
          <textarea value={cfg.body_html ?? ''} onChange={(e) => setCfg({ body_html: e.target.value })} placeholder="Body (HTML; supports {{lead.first_name}})" style={{ ...full, minHeight: 70 }} />
        </div>
      );
    case 'send_whatsapp':
      return (
        <div style={col}>
          <input value={cfg.to ?? ''} onChange={(e) => setCfg({ to: e.target.value })} placeholder="To (blank = the lead's phone)" style={full} />
          <select value={cfg.template_id ?? ''} onChange={(e) => setCfg({ template_id: e.target.value || null })} style={full}>
            <option value="">No template (write below)</option>
            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.meta_template_name}</option>)}
          </select>
          <input value={cfg.body_text ?? ''} onChange={(e) => setCfg({ body_text: e.target.value })} placeholder="Message text" style={full} />
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>WhatsApp sends are inert until a Business API provider is connected.</div>
        </div>
      );
    case 'send_notification':
      return (
        <div style={col}>
          <UserSearchSelect options={users} value={cfg.recipient ?? ''} onChange={(id) => setCfg({ recipient: id })} placeholder="Notify… (default: record owner)" emptyLabel="Record owner" />
          <input value={cfg.title ?? ''} onChange={(e) => setCfg({ title: e.target.value })} placeholder="Title" style={full} />
          <input value={cfg.body ?? ''} onChange={(e) => setCfg({ body: e.target.value })} placeholder="Message" style={full} />
        </div>
      );
    case 'update_lead':
      return (
        <div style={col}>
          <select value={cfg.set_status ?? ''} onChange={(e) => setCfg({ set_status: e.target.value || undefined })} style={full}>
            <option value="">— set status —</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" value={cfg.set_score_delta ?? ''} onChange={(e) => setCfg({ set_score_delta: e.target.value })} placeholder="Score change (+/-)" style={full} />
          <input value={Array.isArray(cfg.add_tags) ? cfg.add_tags.join(', ') : (cfg.add_tags ?? '')} onChange={(e) => setCfg({ add_tags: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="Add tags (comma-separated)" style={full} />
        </div>
      );
    case 'update_deal':
      return (
        <div style={col}>
          <select value={cfg.pipeline_id ?? ''} onChange={(e) => setCfg({ pipeline_id: e.target.value || undefined })} style={full}>
            <option value="">— pipeline (for stage) —</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={cfg.set_stage_id ?? ''} onChange={(e) => setCfg({ set_stage_id: e.target.value || undefined })} style={full}>
            <option value="">— set stage —</option>
            {stagesForPipeline(cfg.pipeline_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      );
    case 'assign_owner':
      return (
        <div style={col}>
          <select value={cfg.user_id !== undefined ? 'user' : 'rules'} onChange={(e) => setCfg(e.target.value === 'rules' ? { user_id: undefined } : { user_id: cfg.user_id ?? '' })} style={full}>
            <option value="rules">Re-run assignment rules (round-robin / territory)</option>
            <option value="user">Assign a specific person</option>
          </select>
          {cfg.user_id !== undefined && (
            <UserSearchSelect options={users} value={cfg.user_id ?? ''} onChange={(id) => setCfg({ user_id: id })} placeholder="Pick a person…" emptyLabel="—" />
          )}
        </div>
      );
    case 'convert_lead':
      return (
        <div style={col}>
          <select value={cfg.pipeline_id ?? ''} onChange={(e) => setCfg({ pipeline_id: e.target.value || undefined, stage_id: undefined })} style={full}>
            <option value="">Default pipeline</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={cfg.stage_id ?? ''} onChange={(e) => setCfg({ stage_id: e.target.value || undefined })} style={full}>
            <option value="">First open stage</option>
            {stagesForPipeline(cfg.pipeline_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={cfg.deal_name ?? ''} onChange={(e) => setCfg({ deal_name: e.target.value })} placeholder="Deal name (supports {{lead.company}})" style={full} />
        </div>
      );
    default:
      return null;
  }
}

// ── styles ──
const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 11px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
const railLabel: React.CSSProperties = { fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-dim)', margin: '2px 6px 8px' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 15px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnDanger: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: '#ef4444', padding: '8px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnGhostSm: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 12 };
const btnDashed: React.CSSProperties = { background: 'transparent', border: '1.5px dashed var(--border)', color: 'var(--text-dim)', padding: '10px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 650 };
const paletteItem: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', border: 'none', background: 'transparent', borderRadius: 8, padding: '8px 10px', textAlign: 'left', cursor: 'pointer' };
const andPill: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#D98A0A', background: 'color-mix(in srgb, #D98A0A 16%, transparent)', padding: '2px 7px', borderRadius: 5 };
const flowItem = (sel: boolean): React.CSSProperties => ({
  width: '100%', textAlign: 'left', border: `1px solid ${sel ? 'color-mix(in srgb, var(--primary) 32%, transparent)' : 'transparent'}`,
  background: sel ? 'color-mix(in srgb, var(--primary) 9%, transparent)' : 'transparent',
  borderRadius: 10, padding: '9px 10px', marginBottom: 4, cursor: 'pointer', display: 'block',
});
const sw = (on: boolean): React.CSSProperties => ({ width: 38, height: 22, borderRadius: 12, background: on ? '#16a34a' : 'var(--border)', position: 'relative', border: 'none', padding: 0, cursor: 'pointer', flex: '0 0 auto' });
const swKnob = (on: boolean): React.CSSProperties => ({ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(16px)' : 'none', transition: 'transform .16s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' });
