'use client';
/**
 * Assignment Rulebook — a visual, priority-ordered view of lead-routing rules.
 *
 * Replaces the old flat form. Leads are matched TOP-TO-BOTTOM: the first rule
 * whose criteria fit wins (this mirrors assignOwner(), which walks
 * crm_lead_assignment_rules ordered by `priority` ascending and takes the first
 * match). So the vertical order of the cards IS the priority order — dragging a
 * rule up with the ▲ button makes it match sooner.
 *
 * Persistence contract (unchanged — the same shape the engine reads):
 *   { name, priority, criteria{}, is_active, and EITHER assign_to_user_id
 *     (a specific person) OR round_robin_pool[] (rotate across reps),
 *     pipeline_id? }
 * Reordering renumbers `priority` to (index+1)*10 and PATCHes only the rows
 * whose number actually changed; the inspector never edits priority directly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAssignmentRules, crmPipelines } from '../../../lib/crmApi';
import api from '../../../lib/api';
import type { AssignmentRule, Pipeline } from '../../../types/crm';
import UserSearchSelect, { type UserOption } from '../shared/UserSearchSelect';

const CRITERIA_FIELDS = [
  { value: 'source', label: 'Lead source' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'industry', label: 'Industry' },
  { value: 'status', label: 'Status' },
  { value: 'score_gte', label: 'Score is at least' },
];
const fieldLabel = (f: string) => CRITERIA_FIELDS.find((x) => x.value === f)?.label ?? f;

type CritRow = { field: string; value: string };
type Mode = 'user' | 'round_robin';
type Draft = {
  id: string | null;
  name: string;
  crit: CritRow[];
  mode: Mode;
  assign_to_user_id: string;
  round_robin_pool: string[];
  pipeline_id: string;
  is_active: boolean;
};
const emptyDraft = (): Draft => ({
  id: null, name: '', crit: [{ field: 'source', value: '' }],
  mode: 'user', assign_to_user_id: '', round_robin_pool: [], pipeline_id: '', is_active: true,
});

const buildCriteria = (rows: CritRow[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.field || !String(r.value).trim()) continue;
    out[r.field] = r.field === 'score_gte' ? Number(r.value) : r.value.trim();
  }
  return out;
};

// ── tiny inline icons (white stroke on a coloured tile) ──
function Glyph({ name, size = 16 }: { name: string; size?: number }) {
  const p: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'user': return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>;
    case 'users': return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M15 21a6 6 0 0 0-12 0" /><path d="M16 4a3.2 3.2 0 0 1 0 8" /><path d="M21 21a6 6 0 0 0-5-5.9" /></svg>;
    case 'funnel': return <svg {...p}><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>;
    case 'chevronUp': return <svg {...p}><path d="m6 15 6-6 6 6" /></svg>;
    case 'chevronDown': return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

const USER_COLOR = '#8A5CD1';   // "assign to a person" (matches routing colour on the canvas)
const POOL_COLOR = '#0E9C8A';   // "round-robin across a team"

export default function AssignmentRulebook() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);

  const reload = async () => {
    setLoading(true);
    try { setRules((await crmAssignmentRules.list()).data || []); }
    catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    reload();
    (async () => {
      const [u, p] = await Promise.allSettled([api.getUsers({ limit: '500' }) as Promise<any>, crmPipelines.list()]);
      if (u.status === 'fulfilled') setUsers(((u.value.data || u.value || []) as any[]).map((x) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' })));
      if (p.status === 'fulfilled') setPipelines((p.value as any).data || []);
    })();
  }, []);

  const sorted = useMemo(() => [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)), [rules]);
  const userName = (id?: string | null) => id ? (users.find((u) => u.id === id)?.name || 'User') : null;

  const critSummary = (criteria?: Record<string, unknown> | null) => {
    const parts = Object.entries(criteria || {}).map(([k, v]) => k === 'score_gte' ? `score ≥ ${v}` : `${fieldLabel(k)} = ${v}`);
    return parts.length ? parts.join(' · ') : 'any lead';
  };
  const whoSummary = (r: AssignmentRule) => r.round_robin_pool?.length
    ? `round-robin across ${r.round_robin_pool.length} rep${r.round_robin_pool.length > 1 ? 's' : ''}`
    : (userName(r.assign_to_user_id) || 'someone');

  // ── reorder = priority (first-match order) ──
  const persistOrder = async (ordered: AssignmentRule[]) => {
    const renum = ordered.map((r, i) => ({ r, p: (i + 1) * 10 }));
    setRules(renum.map(({ r, p }) => ({ ...r, priority: p })));      // optimistic
    const changed = renum.filter(({ r, p }) => (r.priority ?? 0) !== p);
    if (!changed.length) return;
    setReordering(true);
    try {
      await Promise.all(changed.map(({ r, p }) => crmAssignmentRules.update(r.id, { priority: p } as any)));
    } catch (e: any) { toast.error(e.message || 'Reorder failed'); }
    finally { setReordering(false); reload(); }
  };
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (reordering || j < 0 || j >= sorted.length) return;
    const arr = [...sorted];
    [arr[index], arr[j]] = [arr[j], arr[index]];
    persistOrder(arr);
  };

  // ── inspector draft ──
  const fromRule = (r: AssignmentRule): Draft => {
    const crit: CritRow[] = Object.entries(r.criteria || {}).map(([field, value]) => ({ field, value: String(value) }));
    return {
      id: r.id, name: r.name,
      crit: crit.length ? crit : [{ field: 'source', value: '' }],
      mode: r.round_robin_pool?.length ? 'round_robin' : 'user',
      assign_to_user_id: r.assign_to_user_id || '',
      round_robin_pool: r.round_robin_pool || [],
      pipeline_id: r.pipeline_id || '',
      is_active: r.is_active,
    };
  };
  const patchDraft = (p: Partial<Draft>) => setDraft((d) => d ? { ...d, ...p } : d);
  const setCrit = (i: number, patch: Partial<CritRow>) => setDraft((d) => d ? { ...d, crit: d.crit.map((c, idx) => idx === i ? { ...c, ...patch } : c) } : d);

  const summary = useMemo(() => {
    if (!draft) return '';
    const where = critSummary(buildCriteria(draft.crit));
    const who = draft.mode === 'round_robin'
      ? `round-robin across ${draft.round_robin_pool.length || 0} rep(s)`
      : (userName(draft.assign_to_user_id) ? `assign to ${userName(draft.assign_to_user_id)}` : 'assign to …');
    return `When ${where} → ${who}.`;
  }, [draft, users]);

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error('Give the rule a name');
    if (draft.mode === 'user' && !draft.assign_to_user_id) return toast.error('Pick a person to assign to');
    if (draft.mode === 'round_robin' && draft.round_robin_pool.length === 0) return toast.error('Add at least one rep to the round-robin pool');
    setSaving(true);
    const base = {
      name: draft.name.trim(),
      criteria: buildCriteria(draft.crit),
      assign_to_user_id: draft.mode === 'user' ? draft.assign_to_user_id : null,
      round_robin_pool: draft.mode === 'round_robin' ? draft.round_robin_pool : null,
      pipeline_id: draft.pipeline_id || null,
      is_active: draft.is_active,
    };
    try {
      if (draft.id) await crmAssignmentRules.update(draft.id, base as any);
      else await crmAssignmentRules.create({ ...base, priority: (sorted.length + 1) * 10 } as any);
      toast.success(draft.id ? 'Rule updated' : 'Rule added');
      setDraft(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (r: AssignmentRule) => {
    setBusy((b) => ({ ...b, [r.id + 't']: true }));
    try { await crmAssignmentRules.update(r.id, { is_active: !r.is_active } as any); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [r.id + 't']: false })); }
  };
  const remove = async (r: AssignmentRule) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return;
    setBusy((b) => ({ ...b, [r.id + 'd']: true }));
    try {
      await crmAssignmentRules.remove(r.id);
      toast.success('Deleted');
      setDraft((d) => d?.id === r.id ? null : d);
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [r.id + 'd']: false })); }
  };

  const poolToAdd = draft ? users.filter((u) => !draft.round_robin_pool.includes(u.id)) : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14, alignItems: 'start' }}>
      {/* ── left: the ordered rulebook ── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text)' }}>Assignment rulebook</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
              New leads are matched <b>top to bottom</b> — the first rule that fits wins. Use ▲▼ to change the order.
            </div>
          </div>
          <button onClick={() => setDraft(emptyDraft())} style={btnPrimary}>＋ New rule</button>
        </div>

        {loading ? (
          <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13 }}>Loading rules…</div>
        ) : sorted.length === 0 ? (
          <div style={{ ...card, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 28 }}>
            No routing rules yet. Every new lead stays with whoever created it.<br />
            <button onClick={() => setDraft(emptyDraft())} style={{ ...btnPrimary, marginTop: 12 }}>＋ Add your first rule</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((r, i) => {
              const selected = draft?.id === r.id;
              const pool = !!r.round_robin_pool?.length;
              const tile = pool ? POOL_COLOR : USER_COLOR;
              return (
                <div key={r.id} onClick={() => setDraft(fromRule(r))} style={ruleCard(selected, r.is_active)}>
                  {/* reorder rail */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => move(i, -1)} disabled={i === 0 || reordering} style={arrowBtn(i === 0)} title="Match sooner"><Glyph name="chevronUp" size={14} /></button>
                    <span style={rankNum}>{i + 1}</span>
                    <button onClick={() => move(i, 1)} disabled={i === sorted.length - 1 || reordering} style={arrowBtn(i === sorted.length - 1)} title="Match later"><Glyph name="chevronDown" size={14} /></button>
                  </div>

                  <span style={{ ...iconTile, background: tile }}><Glyph name={pool ? 'users' : 'user'} /></span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      {!r.is_active && <span style={pausedPill}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
                      <span style={{ color: 'var(--text)' }}>When</span> {critSummary(r.criteria)} <span style={{ color: 'var(--text)' }}>→</span> {whoSummary(r)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setDraft(fromRule(r))} style={btnSmallGhost}>Edit</button>
                    <button onClick={() => toggleActive(r)} disabled={!!busy[r.id + 't']} style={btnSmallGhost}>{r.is_active ? 'Pause' : 'Activate'}</button>
                    <button onClick={() => remove(r)} disabled={!!busy[r.id + 'd']} style={btnSmallDanger}>{busy[r.id + 'd'] ? '…' : 'Delete'}</button>
                  </div>
                </div>
              );
            })}

            {/* pinned fallback — communicates fall-through behaviour */}
            <div style={fallbackCard}>
              <span style={{ ...iconTile, background: 'var(--s2)', color: 'var(--text-dim)' }}><Glyph name="user" /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-dim)' }}>If nothing above matches</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>The lead stays with whoever created it (no auto-assignment).</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── right: inspector ── */}
      <aside style={{ ...card, padding: 0, position: 'sticky', top: 12, overflow: 'hidden' }}>
        {!draft ? (
          <div style={{ padding: 22, color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6 }}>
            Select a rule to edit it, or <b style={{ color: 'var(--text)' }}>＋ New rule</b> to add one.
            <div style={{ marginTop: 12, fontSize: 12 }}>A rule says <b style={{ color: 'var(--text)' }}>“when a lead looks like this → give it to this person / team.”</b></div>
          </div>
        ) : (
          <div>
            <div style={inspectorHead}>
              <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color: USER_COLOR }}>{draft.id ? 'Edit rule' : 'New rule'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} placeholder="Rule name (e.g. Mumbai → Priya)" style={{ ...input, flex: 1, fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <button onClick={() => patchDraft({ is_active: !draft.is_active })} style={sw(draft.is_active)}><span style={swKnob(draft.is_active)} /></button>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{draft.is_active ? 'Active' : 'Paused'}</span>
              </div>
            </div>

            <div style={{ padding: 16 }}>
              <Label><Glyph name="funnel" size={12} /> Match when <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· all must match; blank = every lead</span></Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {draft.crit.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={c.field} onChange={(e) => setCrit(i, { field: e.target.value })} style={{ ...input, width: 130, minWidth: 0 }}>
                      {CRITERIA_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <input value={c.value} onChange={(e) => setCrit(i, { value: e.target.value })} placeholder={c.field === 'score_gte' ? 'e.g. 70' : 'value'} style={{ ...input, flex: 1, minWidth: 0 }} />
                    <button onClick={() => patchDraft({ crit: draft.crit.filter((_, idx) => idx !== i) })} style={btnSmallGhost}>✕</button>
                  </div>
                ))}
                <button onClick={() => patchDraft({ crit: [...draft.crit, { field: 'city', value: '' }] })} style={{ ...btnDashed, alignSelf: 'flex-start' }}>＋ Add criterion</button>
              </div>

              <Label><Glyph name="user" size={12} /> Assign to</Label>
              <select value={draft.mode} onChange={(e) => patchDraft({ mode: e.target.value as Mode })} style={{ ...input, width: '100%', marginBottom: 8 }}>
                <option value="user">A specific person</option>
                <option value="round_robin">Round-robin across a team</option>
              </select>
              {draft.mode === 'user' ? (
                <UserSearchSelect options={users} value={draft.assign_to_user_id} onChange={(id) => patchDraft({ assign_to_user_id: id })} placeholder="Pick a person…" emptyLabel="—" />
              ) : (
                <>
                  <UserSearchSelect options={poolToAdd} value="" onChange={(id) => { if (id) patchDraft({ round_robin_pool: [...draft.round_robin_pool, id] }); }} placeholder="Add a rep to the pool…" emptyLabel="—" />
                  {draft.round_robin_pool.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {draft.round_robin_pool.map((id) => (
                        <span key={id} style={chip}>
                          {userName(id)}
                          <button onClick={() => patchDraft({ round_robin_pool: draft.round_robin_pool.filter((x) => x !== id) })} style={chipX}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}

              <Label style={{ marginTop: 14 }}>Pipeline <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· optional</span></Label>
              <select value={draft.pipeline_id} onChange={(e) => patchDraft({ pipeline_id: e.target.value })} style={{ ...input, width: '100%' }}>
                <option value="">Any pipeline</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div style={summaryBox}>{summary}</div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>{saving ? 'Saving…' : draft.id ? 'Update rule' : '＋ Add rule'}</button>
                <button onClick={() => setDraft(null)} style={btnGhost}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

const Label = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, margin: '4px 0 6px', ...style }}>{children}</div>
);

// ── styles ──
const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 11px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
const iconTile: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: '#fff' };
const ruleCard = (sel: boolean, active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer',
  background: 'var(--s2)', borderRadius: 12,
  border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
  boxShadow: sel ? '0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)' : 'none',
  opacity: active ? 1 : 0.72,
});
const fallbackCard: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: '1.5px dashed var(--border)', background: 'transparent', marginTop: 2 };
const rankNum: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-dim)' };
const arrowBtn = (disabled: boolean): React.CSSProperties => ({ display: 'grid', placeItems: 'center', width: 22, height: 18, border: 'none', background: 'transparent', color: disabled ? 'var(--border)' : 'var(--text-dim)', cursor: disabled ? 'default' : 'pointer', padding: 0, borderRadius: 4 });
const inspectorHead: React.CSSProperties = { padding: '15px 16px', borderBottom: '1px solid var(--border)', background: 'var(--s2)' };
const summaryBox: React.CSSProperties = { background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--text)', margin: '14px 0 12px', lineHeight: 1.5 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '9px 15px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnDashed: React.CSSProperties = { background: 'transparent', border: '1.5px dashed var(--border)', color: 'var(--text-dim)', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 650 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const pausedPill: React.CSSProperties = { fontSize: 10, background: 'var(--s3)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700, flex: '0 0 auto' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: 'var(--text)' };
const chipX: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 0 };
const sw = (on: boolean): React.CSSProperties => ({ width: 38, height: 22, borderRadius: 12, background: on ? '#16a34a' : 'var(--border)', position: 'relative', border: 'none', padding: 0, cursor: 'pointer', flex: '0 0 auto' });
const swKnob = (on: boolean): React.CSSProperties => ({ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(16px)' : 'none', transition: 'transform .16s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' });
