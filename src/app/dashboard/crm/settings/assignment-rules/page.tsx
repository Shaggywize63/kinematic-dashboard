'use client';
/**
 * Lead assignment / routing rules. Writes the real crm_lead_assignment_rules
 * shape that assignOwner() reads: { name, priority, criteria{}, and either
 * assign_to_user_id (specific person) or round_robin_pool[] (rotate) }.
 * On lead create the engine walks active rules by priority; the first whose
 * criteria match assigns the owner.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAssignmentRules, crmPipelines } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { AssignmentRule, Pipeline } from '../../../../../types/crm';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';

const CRITERIA_FIELDS = [
  { value: 'source', label: 'Lead source' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'industry', label: 'Industry' },
  { value: 'status', label: 'Status' },
  { value: 'score_gte', label: 'Score is at least' },
];

type CritRow = { field: string; value: string };
type Mode = 'user' | 'round_robin';

type Draft = {
  id: string | null;
  name: string;
  priority: number;
  crit: CritRow[];
  mode: Mode;
  assign_to_user_id: string;
  round_robin_pool: string[];
  pipeline_id: string;
};
const emptyDraft = (): Draft => ({
  id: null, name: '', priority: 100, crit: [{ field: 'source', value: '' }],
  mode: 'user', assign_to_user_id: '', round_robin_pool: [], pipeline_id: '',
});

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft());

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
      if (p.status === 'fulfilled') setPipelines(p.value.data || []);
    })();
  }, []);

  const userName = (id?: string | null) => id ? (users.find((u) => u.id === id)?.name || 'User') : null;
  const setCrit = (i: number, patch: Partial<CritRow>) => setDraft((d) => ({ ...d, crit: d.crit.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));

  const buildCriteria = (rows: CritRow[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      if (!r.field || !String(r.value).trim()) continue;
      out[r.field] = r.field === 'score_gte' ? Number(r.value) : r.value.trim();
    }
    return out;
  };

  const summary = useMemo(() => {
    const c = buildCriteria(draft.crit);
    const parts = Object.entries(c).map(([k, v]) => k === 'score_gte' ? `score ≥ ${v}` : `${k} = ${v}`);
    const where = parts.length ? parts.join(' and ') : 'any lead';
    const who = draft.mode === 'round_robin'
      ? `round-robin across ${draft.round_robin_pool.length || 0} rep(s)`
      : (userName(draft.assign_to_user_id) ? `assign to ${userName(draft.assign_to_user_id)}` : 'assign to …');
    return `When ${where} → ${who}.`;
  }, [draft, users]);

  const save = async () => {
    if (!draft.name.trim()) return toast.error('Give the rule a name');
    if (draft.mode === 'user' && !draft.assign_to_user_id) return toast.error('Pick a person to assign to');
    if (draft.mode === 'round_robin' && draft.round_robin_pool.length === 0) return toast.error('Add at least one rep to the round-robin pool');
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      priority: Number(draft.priority) || 100,
      criteria: buildCriteria(draft.crit),
      assign_to_user_id: draft.mode === 'user' ? draft.assign_to_user_id : null,
      round_robin_pool: draft.mode === 'round_robin' ? draft.round_robin_pool : null,
      pipeline_id: draft.pipeline_id || null,
      is_active: true,
    };
    try {
      if (draft.id) await crmAssignmentRules.update(draft.id, payload as any);
      else await crmAssignmentRules.create(payload as any);
      toast.success(draft.id ? 'Rule updated' : 'Rule added');
      setDraft(emptyDraft());
      reload();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const startEdit = (r: AssignmentRule) => {
    const crit: CritRow[] = Object.entries(r.criteria || {}).map(([field, value]) => ({ field, value: String(value) }));
    setDraft({
      id: r.id, name: r.name, priority: r.priority ?? 100,
      crit: crit.length ? crit : [{ field: 'source', value: '' }],
      mode: r.round_robin_pool && r.round_robin_pool.length ? 'round_robin' : 'user',
      assign_to_user_id: r.assign_to_user_id || '',
      round_robin_pool: r.round_robin_pool || [],
      pipeline_id: r.pipeline_id || '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
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
    try { await crmAssignmentRules.remove(r.id); toast.success('Deleted'); reload(); }
    catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [r.id + 'd']: false })); }
  };

  const poolToAdd = users.filter((u) => !draft.round_robin_pool.includes(u.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{draft.id ? 'Edit rule' : 'New assignment rule'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', margin: '4px 0 12px' }}>
          New leads are auto-routed. Rules run in priority order (lowest number first); the first match wins.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr', gap: 8, marginBottom: 10 }}>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Rule name (e.g. Mumbai leads → Priya)" style={input} />
          <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} placeholder="Priority" style={input} title="Lower runs first" />
        </div>

        <Label>Match when <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(all must match; leave blank to match every lead)</span></Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {draft.crit.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={c.field} onChange={(e) => setCrit(i, { field: e.target.value })} style={{ ...input, width: 180 }}>
                {CRITERIA_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input value={c.value} onChange={(e) => setCrit(i, { value: e.target.value })} placeholder={c.field === 'score_gte' ? 'e.g. 70' : 'value'} style={{ ...input, flex: 1 }} />
              <button onClick={() => setDraft((d) => ({ ...d, crit: d.crit.filter((_, idx) => idx !== i) }))} style={btnSmallGhost}>✕</button>
            </div>
          ))}
          <button onClick={() => setDraft((d) => ({ ...d, crit: [...d.crit, { field: 'city', value: '' }] }))} style={{ ...btnSmallGhost, alignSelf: 'flex-start' }}>+ Add criterion</button>
        </div>

        <Label>Assign to</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as Mode })} style={{ ...input, width: 220 }}>
            <option value="user">A specific person</option>
            <option value="round_robin">Round-robin across a team</option>
          </select>
          {draft.mode === 'user'
            ? <div style={{ flex: 1 }}><UserSearchSelect options={users} value={draft.assign_to_user_id} onChange={(id) => setDraft({ ...draft, assign_to_user_id: id })} placeholder="Pick a person…" emptyLabel="—" /></div>
            : <div style={{ flex: 1 }}><UserSearchSelect options={poolToAdd} value="" onChange={(id) => { if (id) setDraft((d) => ({ ...d, round_robin_pool: [...d.round_robin_pool, id] })); }} placeholder="Add a rep to the pool…" emptyLabel="—" /></div>}
        </div>
        {draft.mode === 'round_robin' && draft.round_robin_pool.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {draft.round_robin_pool.map((id) => (
              <span key={id} style={chip}>
                {userName(id)}
                <button onClick={() => setDraft((d) => ({ ...d, round_robin_pool: d.round_robin_pool.filter((x) => x !== id) }))} style={chipX}>✕</button>
              </span>
            ))}
          </div>
        )}

        <Label>Pipeline <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></Label>
        <select value={draft.pipeline_id} onChange={(e) => setDraft({ ...draft, pipeline_id: e.target.value })} style={{ ...input, minWidth: 220, marginBottom: 10 }}>
          <option value="">Any pipeline</option>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div style={{ background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--text)', margin: '4px 0 12px' }}>{summary}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : draft.id ? 'Update rule' : '+ Add rule'}</button>
          {draft.id && <button onClick={() => setDraft(emptyDraft())} style={btnGhost}>Cancel</button>}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Rules ({rules.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
          : rules.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No assignment rules yet.</div>
          : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map((r) => {
              const parts = Object.entries(r.criteria || {}).map(([k, v]) => k === 'score_gte' ? `score ≥ ${v}` : `${k} = ${v}`);
              const where = parts.length ? parts.join(' and ') : 'any lead';
              const who = r.round_robin_pool && r.round_robin_pool.length
                ? `round-robin (${r.round_robin_pool.length})`
                : (userName(r.assign_to_user_id) || '?');
              return (
                <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={prio}>{r.priority}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {r.name}{!r.is_active && <span style={pausedPill}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>If <strong>{where}</strong> → <strong>{who}</strong></div>
                  </div>
                  <button onClick={() => startEdit(r)} style={btnSmallGhost}>Edit</button>
                  <button onClick={() => toggleActive(r)} disabled={!!busy[r.id + 't']} style={btnSmallGhost}>{r.is_active ? 'Pause' : 'Activate'}</button>
                  <button onClick={() => remove(r)} disabled={!!busy[r.id + 'd']} style={btnSmallDanger}>{busy[r.id + 'd'] ? '…' : 'Delete'}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, margin: '4px 0' }}>{children}</div>
);
const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const pausedPill: React.CSSProperties = { marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: 'var(--text)' };
const chipX: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 0 };
const prio: React.CSSProperties = { minWidth: 26, textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 0' };
