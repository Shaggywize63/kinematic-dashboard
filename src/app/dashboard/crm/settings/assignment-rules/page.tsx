'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAssignmentRules, crmTerritories } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import type { AssignmentRule, Territory } from '../../../../../types/crm';
import UserSearchSelect, { type UserOption as UserOpt } from '../../../../../components/crm/shared/UserSearchSelect';

const MATCH_FIELDS = [
  { value: 'source', label: 'Lead Source' },
  { value: 'state', label: 'State' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'industry', label: 'Industry' },
  { value: 'company', label: 'Company' },
  { value: 'score_grade', label: 'Score Grade' },
];
const MATCH_OPS = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
];

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [name, setName] = useState('');
  const [matchField, setMatchField] = useState('source');
  const [matchOp, setMatchOp] = useState('equals');
  const [matchValue, setMatchValue] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [territoryId, setTerritoryId] = useState('');

  const reload = async () => {
    setLoading(true);
    const [r, t, u] = await Promise.allSettled([
      crmAssignmentRules.list(),
      crmTerritories.list(),
      api.getUsers({ limit: '500' }) as Promise<any>,
    ]);
    if (r.status === 'fulfilled') setRules(r.value.data || []);
    if (t.status === 'fulfilled') setTerritories(t.value.data || []);
    if (u.status === 'fulfilled') {
      const list: UserOpt[] = (u.value.data || u.value || []).map((x: any) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' }));
      setUsers(list);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (!matchValue.trim()) return toast.error('Match value is required');
    if (!assigneeUserId && !territoryId) return toast.error('Choose an assignee user or territory');
    setCreating(true);
    try {
      await crmAssignmentRules.create({
        name: name.trim(),
        match_field: matchField,
        match_op: matchOp,
        match_value: matchValue.trim(),
        assignee_user_id: assigneeUserId || null,
        territory_id: territoryId || null,
        is_active: true,
        position: rules.length + 1,
      } as any);
      toast.success('Rule added');
      setName(''); setMatchValue(''); setAssigneeUserId(''); setTerritoryId('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (r: AssignmentRule) => {
    setBusy((b) => ({ ...b, [r.id + '_t']: true }));
    try {
      await crmAssignmentRules.update(r.id, { is_active: !r.is_active } as any);
      toast.success(r.is_active ? 'Paused' : 'Activated');
      reload();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [r.id + '_t']: false })); }
  };

  const remove = async (r: AssignmentRule) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return;
    setBusy((b) => ({ ...b, [r.id + '_d']: true }));
    try {
      await crmAssignmentRules.remove(r.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [r.id + '_d']: false })); }
  };

  const userName = (id?: string | null) => id ? (users.find((u) => u.id === id)?.name || 'User') : null;
  const territoryName = (id?: string | null) => id ? (territories.find((t) => t.id === id)?.name || 'Territory') : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>New Rule</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Auto-routes incoming leads. First matching active rule wins. Rules are evaluated in the order they were created.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name (e.g. Website leads → Sarah)" style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={matchField} onChange={(e) => setMatchField(e.target.value)} style={input}>
            {MATCH_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={matchOp} onChange={(e) => setMatchOp(e.target.value)} style={input}>
            {MATCH_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={matchValue} onChange={(e) => setMatchValue(e.target.value)} placeholder="Value (e.g. Website)" style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Assign to User</div>
            <UserSearchSelect
              options={users}
              value={assigneeUserId}
              onChange={(id) => { setAssigneeUserId(id); if (id) setTerritoryId(''); }}
              placeholder="Search team member…"
              emptyLabel="No user (use territory)"
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Or Assign to Territory</div>
            <select value={territoryId} onChange={(e) => { setTerritoryId(e.target.value); if (e.target.value) setAssigneeUserId(''); }} style={input}>
              <option value="">— No territory —</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Adding...' : '+ Add Rule'}</button>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Active Rules ({rules.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : rules.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No assignment rules yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((r) => {
              const fieldLabel = MATCH_FIELDS.find((f) => f.value === r.match_field)?.label || r.match_field;
              const opLabel = MATCH_OPS.find((o) => o.value === r.match_op)?.label || r.match_op;
              const target = userName(r.assignee_user_id) || territoryName(r.territory_id) || '?';
              return (
                <div key={r.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>
                      {r.name}
                      {!r.is_active && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      If <strong>{fieldLabel}</strong> {opLabel} <strong>{r.match_value}</strong> → assign to <strong>{target}</strong>
                    </div>
                  </div>
                  <button onClick={() => toggleActive(r)} disabled={!!busy[r.id + '_t']} style={btnSmallGhost}>{r.is_active ? 'Pause' : 'Activate'}</button>
                  <button onClick={() => remove(r)} disabled={!!busy[r.id + '_d']} style={{ ...btnSmallDanger, opacity: busy[r.id + '_d'] ? 0.5 : 1 }}>{busy[r.id + '_d'] ? '...' : 'Delete'}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
