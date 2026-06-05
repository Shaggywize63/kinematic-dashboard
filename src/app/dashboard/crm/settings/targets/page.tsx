'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { crmTargets } from '../../../../../lib/crmApi';

interface U {
  id: string; name: string; role: string;
  city: string | null;
  supervisor_id: string | null;
  hierarchy_level_id: string | null;
}
interface Level { id: string; name: string; }

export default function TargetsSettingsPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [allInput, setAllInput] = useState<string>('');
  const [bulkInput, setBulkInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Filters
  const [levelFilter, setLevelFilter] = useState<string>('');     // hierarchy level id
  const [managerFilter, setManagerFilter] = useState<string>(''); // supervisor user id
  const [cityFilter, setCityFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, lRes, tRes] = await Promise.allSettled([
        api.get<any>('/api/v1/users?limit=500'),
        api.get<any>('/api/v1/crm/hierarchy/levels'),
        crmTargets.get(),
      ]);
      if (uRes.status === 'fulfilled') {
        const list: any[] = uRes.value?.data || uRes.value || [];
        setUsers(list.map((u) => ({
          id: u.id,
          name: u.name || u.full_name || u.email || 'User',
          role: u.role || 'user',
          city: u.city ?? null,
          supervisor_id: u.supervisor_id ?? null,
          hierarchy_level_id: u.hierarchy_level_id ?? null,
        })));
      }
      if (lRes.status === 'fulfilled') {
        const list: any[] = lRes.value?.data || lRes.value || [];
        setLevels(list.map((l) => ({ id: l.id, name: l.name || l.title || 'Level' })));
      }
      if (tRes.status === 'fulfilled') {
        const d = tRes.value?.data;
        setDefaultTarget(d?.default_target ?? 0);
        setAllInput(String(d?.default_target ?? ''));
        const map: Record<string, number> = {};
        (d?.per_user || []).forEach((r: any) => { map[r.user_id] = r.target_value; });
        setOverrides(map);
      }
    } catch (e: any) { toast.error(e.message || 'Failed to load targets'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Managers = anyone who supervises someone, or holds a managerial role.
  const managers = useMemo(() => {
    const supIds = new Set(users.map((u) => u.supervisor_id).filter(Boolean) as string[]);
    const byId = new Map(users.map((u) => [u.id, u] as const));
    const set = new Map<string, string>();
    supIds.forEach((id) => { const u = byId.get(id); if (u) set.set(id, u.name); });
    users.filter((u) => ['supervisor', 'city_manager', 'sub_admin', 'admin'].includes(u.role)).forEach((u) => set.set(u.id, u.name));
    return Array.from(set, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const cities = useMemo(() =>
    Array.from(new Set(users.map((u) => u.city).filter((c): c is string => !!c))).sort(),
  [users]);

  const filtered = useMemo(() => users.filter((u) =>
    (!levelFilter || u.hierarchy_level_id === levelFilter) &&
    (!managerFilter || u.supervisor_id === managerFilter) &&
    (!cityFilter || u.city === cityFilter)
  ), [users, levelFilter, managerFilter, cityFilter]);

  const saveAll = async () => {
    const v = Math.max(0, parseInt(allInput || '0', 10) || 0);
    setSavingAll(true);
    try {
      await crmTargets.set({ all: true, target_value: v });
      setDefaultTarget(v);
      toast.success(`Org-wide default set to ${v} leads/day`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingAll(false); }
  };

  const saveOne = async (u: U) => {
    const raw = overrides[u.id];
    const v = Math.max(0, Number.isFinite(raw) ? raw : defaultTarget);
    setSavingId(u.id);
    try {
      await crmTargets.set({ user_id: u.id, target_value: v });
      setOverrides((m) => ({ ...m, [u.id]: v }));
      toast.success(`${u.name}: ${v}/day`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingId(null); }
  };

  // Apply the same target to every user in the current filtered view.
  const applyToListed = async () => {
    const v = Math.max(0, parseInt(bulkInput || '0', 10) || 0);
    if (filtered.length === 0) { toast.error('No users in the current view'); return; }
    setBulkBusy(true);
    let ok = 0;
    for (const u of filtered) {
      try { await crmTargets.set({ user_id: u.id, target_value: v }); ok++; setOverrides((m) => ({ ...m, [u.id]: v })); }
      catch { /* count failures below */ }
    }
    setBulkBusy(false);
    toast[ok === filtered.length ? 'success' : 'warning'](`Set ${v}/day for ${ok}/${filtered.length} listed`);
  };

  const inputStyle: React.CSSProperties = { width: 84, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'center' };
  const selStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, minWidth: 150 };
  const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Targets</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px' }}>
        Set how many leads each person should add per day. Filter the team by hierarchy and city, then set targets individually or for the whole filtered list. FEs see their target as a ticker on the dashboard and a 1/5 badge while adding a lead.
      </p>

      {/* Org-wide default */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Org-wide default</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>The fallback daily target for anyone without a specific one set below.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="number" min={0} value={allInput} onChange={(e) => setAllInput(e.target.value)} style={inputStyle} placeholder="0" />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>leads / day</span>
          <button onClick={saveAll} disabled={savingAll} style={{ ...btnStyle, opacity: savingAll ? 0.6 : 1 }}>{savingAll ? 'Saving…' : 'Save default'}</button>
        </div>
      </div>

      {/* Team — hierarchy + city filters */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Team targets</div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {levels.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
              HIERARCHY LEVEL
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={selStyle}>
                <option value="">All levels</option>
                {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
            REPORTS TO (MANAGER)
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} style={selStyle}>
              <option value="">All managers</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
            CITY
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={selStyle}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {(levelFilter || managerFilter || cityFilter) && (
            <button onClick={() => { setLevelFilter(''); setManagerFilter(''); setCityFilter(''); }}
              style={{ alignSelf: 'flex-end', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Bulk apply to the filtered list */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--s3)', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Set the same target for all <b style={{ color: 'var(--text)' }}>{filtered.length}</b> listed:</span>
          <input type="number" min={0} value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} style={inputStyle} placeholder="0" />
          <button onClick={applyToListed} disabled={bulkBusy || filtered.length === 0} style={{ ...btnStyle, opacity: bulkBusy ? 0.6 : 1 }}>{bulkBusy ? 'Applying…' : 'Apply to listed'}</button>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>No users match the current filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.role.replace('_', ' ')}{u.city ? ` · ${u.city}` : ''}</div>
                </div>
                <input
                  type="number" min={0}
                  value={overrides[u.id] ?? ''}
                  placeholder={String(defaultTarget)}
                  onChange={(e) => setOverrides((m) => ({ ...m, [u.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                  style={inputStyle}
                />
                <button onClick={() => saveOne(u)} disabled={savingId === u.id} style={{ ...btnStyle, background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', opacity: savingId === u.id ? 0.6 : 1 }}>
                  {savingId === u.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
