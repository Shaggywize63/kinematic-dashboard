'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { crmTargets } from '../../../../../lib/crmApi';

interface U {
  id: string; name: string; role: string;
  city: string | null;
  hierarchy_level_id: string | null;
}
interface Level { id: string; name: string; order: number; }

export default function TargetsSettingsPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [levelTargets, setLevelTargets] = useState<Record<string, number>>({}); // level_id -> value
  const [overrides, setOverrides] = useState<Record<string, number>>({});       // user_id -> value
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Per-user override panel: which level + optional city to populate.
  const [pickLevel, setPickLevel] = useState<string>('');
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
          hierarchy_level_id: u.hierarchy_level_id ?? null,
        })));
      }
      if (lRes.status === 'fulfilled') {
        const list: any[] = lRes.value?.data || lRes.value || [];
        setLevels(list.map((l, i) => ({ id: l.id, name: l.name || l.title || 'Level', order: l.level_order ?? i })));
      }
      if (tRes.status === 'fulfilled') {
        const d = tRes.value?.data;
        setDefaultTarget(d?.default_target ?? 0);
        const lvl: Record<string, number> = {};
        (d?.per_level || []).forEach((r: any) => { lvl[r.hierarchy_level_id] = r.target_value; });
        setLevelTargets(lvl);
        const usr: Record<string, number> = {};
        (d?.per_user || []).forEach((r: any) => { usr[r.user_id] = r.target_value; });
        setOverrides(usr);
      }
    } catch (e: any) { toast.error(e.message || 'Failed to load targets'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cities = useMemo(() =>
    Array.from(new Set(users.map((u) => u.city).filter((c): c is string => !!c))).sort(),
  [users]);

  const usersInPicked = useMemo(() => users.filter((u) =>
    (!pickLevel || u.hierarchy_level_id === pickLevel) &&
    (!cityFilter || u.city === cityFilter)
  ), [users, pickLevel, cityFilter]);

  const countAtLevel = (id: string) => users.filter((u) => u.hierarchy_level_id === id).length;

  const saveLevel = async (levelId: string) => {
    const v = Math.max(0, Math.floor(levelTargets[levelId] ?? 0));
    setSavingLevel(levelId);
    try {
      await crmTargets.set({ hierarchy_level_id: levelId, target_value: v });
      setLevelTargets((m) => ({ ...m, [levelId]: v }));
      toast.success(`Target set: ${v}/day for this level`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingLevel(null); }
  };

  const saveDefault = async () => {
    const v = Math.max(0, Math.floor(defaultTarget ?? 0));
    setSavingLevel('__default__');
    try { await crmTargets.set({ all: true, target_value: v }); toast.success(`Fallback set to ${v}/day`); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingLevel(null); }
  };

  const saveOne = async (u: U) => {
    const raw = overrides[u.id];
    const v = Math.max(0, Number.isFinite(raw) ? raw : 0);
    setSavingId(u.id);
    try {
      await crmTargets.set({ user_id: u.id, target_value: v });
      setOverrides((m) => ({ ...m, [u.id]: v }));
      toast.success(`${u.name}: ${v}/day`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingId(null); }
  };

  const inputStyle: React.CSSProperties = { width: 84, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'center' };
  const selStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, minWidth: 160 };
  const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Targets</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px' }}>
        Set the daily lead target for each hierarchy level (e.g. Consumer Champion, Area Sales Officer). Everyone at that level inherits it. You can override individuals below. FEs see their target as a dashboard ticker and a 1/5 badge when adding a lead.
      </p>

      {/* Per-hierarchy-level targets — the primary control */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Targets by hierarchy level</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>The daily lead target for every user at each level.</p>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : levels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>
            No hierarchy levels defined for this client yet. Set them up in <a href="/dashboard/crm/settings/hierarchy" style={{ color: 'var(--primary)' }}>Org Hierarchy</a>, then set per-level targets here. You can still set individual targets below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {levels.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{countAtLevel(l.id)} {countAtLevel(l.id) === 1 ? 'person' : 'people'}</div>
                </div>
                <input type="number" min={0}
                  value={levelTargets[l.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => setLevelTargets((m) => ({ ...m, [l.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                  style={inputStyle} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/day</span>
                <button onClick={() => saveLevel(l.id)} disabled={savingLevel === l.id} style={{ ...btnStyle, opacity: savingLevel === l.id ? 0.6 : 1 }}>
                  {savingLevel === l.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual overrides — optional fine-tuning */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Individual overrides <span style={{ fontWeight: 500, color: 'var(--text-dim)' }}>(optional)</span></div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>Pick a level (and optional city) to list its people and override specific individuals. Blank uses their level target.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={pickLevel} onChange={(e) => setPickLevel(e.target.value)} style={selStyle}>
            <option value="">{levels.length ? 'Choose a level…' : 'All users'}</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={selStyle}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(pickLevel || cityFilter) ? (
          usersInPicked.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>No users match.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {usersInPicked.map((u) => {
                const lvlVal = u.hierarchy_level_id ? levelTargets[u.hierarchy_level_id] : undefined;
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.city || '—'}</div>
                    </div>
                    <input type="number" min={0}
                      value={overrides[u.id] ?? ''}
                      placeholder={lvlVal != null ? String(lvlVal) : '—'}
                      onChange={(e) => setOverrides((m) => ({ ...m, [u.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                      style={inputStyle} />
                    <button onClick={() => saveOne(u)} disabled={savingId === u.id} style={{ ...btnStyle, background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', opacity: savingId === u.id ? 0.6 : 1 }}>
                      {savingId === u.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>Choose a level above to list its people.</div>
        )}
      </div>

      {/* Fallback default — for anyone with no level + no individual target */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Fallback default</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>Used only for people with no hierarchy level and no individual target.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="number" min={0} value={defaultTarget} onChange={(e) => setDefaultTarget(parseInt(e.target.value || '0', 10) || 0)} style={inputStyle} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>leads / day</span>
          <button onClick={saveDefault} disabled={savingLevel === '__default__'} style={{ ...btnStyle, opacity: savingLevel === '__default__' ? 0.6 : 1 }}>{savingLevel === '__default__' ? 'Saving…' : 'Save fallback'}</button>
        </div>
      </div>
    </div>
  );
}
