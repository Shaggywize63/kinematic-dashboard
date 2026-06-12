'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { crmTargets } from '../../../../../lib/crmApi';
import { useAuth } from '../../../../../hooks/useAuth';
import { isConsumerChampion } from '../../../../../lib/clientFeatures';

interface U {
  id: string; name: string; role: string;
  city: string | null;
  org_role_id: string | null;
}
interface Level { id: string; name: string; order: number; }

export default function TargetsSettingsPage() {
  const { user } = useAuth();
  const champion = isConsumerChampion(user as any);
  const [users, setUsers] = useState<U[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [levelTargets, setLevelTargets] = useState<Record<string, number>>({}); // level_id -> value
  const [overrides, setOverrides] = useState<Record<string, number>>({});       // user_id -> value
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Champion-only: their own weekly target, fetched from /targets/me.
  const [myTarget, setMyTarget] = useState<{ target: number; achieved: number } | null>(null);

  // Per-user override panel: which level + optional city to populate.
  const [pickLevel, setPickLevel] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');

  // Narrow-viewport flag so the rows/filters reflow on phones (inline styles
  // can't use CSS media queries).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 640);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Consumer Champion: skip the manager-only payloads and just fetch
      // their own target for read-only display.
      if (champion) {
        try {
          const r = await api.get<any>('/api/v1/crm/targets/me');
          const target = Number(r?.target ?? 0);
          const achieved = Number(r?.achieved ?? 0);
          setMyTarget({ target, achieved });
        } catch { setMyTarget({ target: 0, achieved: 0 }); }
        setLoading(false);
        return;
      }
      const [uRes, lRes, tRes] = await Promise.allSettled([
        api.get<any>('/api/v1/users?limit=500'),
        api.get<any>('/api/v1/crm/targets/levels'),
        crmTargets.get(),
      ]);
      if (uRes.status === 'fulfilled') {
        const list: any[] = uRes.value?.data || uRes.value || [];
        setUsers(list.map((u) => ({
          id: u.id,
          name: u.name || u.full_name || u.email || 'User',
          role: u.role || 'user',
          city: u.city ?? null,
          org_role_id: u.org_role_id ?? null,
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
    (!pickLevel || u.org_role_id === pickLevel) &&
    (!cityFilter || u.city === cityFilter)
  ), [users, pickLevel, cityFilter]);

  const countAtLevel = (id: string) => users.filter((u) => u.org_role_id === id).length;

  const saveLevel = async (levelId: string) => {
    const v = Math.max(0, Math.floor(levelTargets[levelId] ?? 0));
    setSavingLevel(levelId);
    try {
      await crmTargets.set({ hierarchy_level_id: levelId, target_value: v });
      setLevelTargets((m) => ({ ...m, [levelId]: v }));
      toast.success(`Target set: ${v}/week for this level`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingLevel(null); }
  };

  const saveDefault = async () => {
    const v = Math.max(0, Math.floor(defaultTarget ?? 0));
    setSavingLevel('__default__');
    try { await crmTargets.set({ all: true, target_value: v }); toast.success(`Fallback set to ${v}/week`); }
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
      toast.success(`${u.name}: ${v}/week`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingId(null); }
  };

  const inputStyle: React.CSSProperties = { width: 72, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'center' };
  const selStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%' };
  const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
  // A row that wraps its controls below the name on narrow screens.
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' };
  const controlsStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: narrow ? 0 : 'auto' };

  // Consumer Champion: view-only screen showing their own weekly target.
  // No hierarchy levels, no individual overrides, no fallback default —
  // those are manager-tier controls they cannot touch.
  if (champion) {
    return (
      <div style={{ maxWidth: 760, width: '100%' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>My weekly target</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px' }}>
          Your weekly lead target is set by your manager. Track progress here and on the home dashboard.
        </p>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
          ) : !myTarget || myTarget.target === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              No target set yet. Ask your manager to assign one.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)' }}>{myTarget.achieved}</div>
              <div style={{ fontSize: 18, color: 'var(--text-dim)' }}>/ {myTarget.target}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginLeft: 6 }}>leads this week</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, width: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Targets</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px' }}>
        Set the weekly lead target for each hierarchy level (e.g. Consumer Champion, Area Sales Officer). Everyone at that level inherits it. You can override individuals below. FEs see their target as a dashboard ticker.
      </p>

      {/* Per-hierarchy-level targets — the primary control */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Targets by hierarchy level</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>The weekly lead target for every user at each level.</p>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : levels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>
            No hierarchy levels defined for this client yet. Set them up in <a href="/dashboard/crm/settings/hierarchy" style={{ color: 'var(--primary)' }}>Org Hierarchy</a>, then set per-level targets here. You can still set individual targets below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {levels.map((l) => (
              <div key={l.id} style={rowStyle}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{countAtLevel(l.id)} {countAtLevel(l.id) === 1 ? 'person' : 'people'}</div>
                </div>
                <div style={controlsStyle}>
                  <input type="number" min={0}
                    value={levelTargets[l.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setLevelTargets((m) => ({ ...m, [l.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                    style={inputStyle} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/week</span>
                  <button onClick={() => saveLevel(l.id)} disabled={savingLevel === l.id} style={{ ...btnStyle, opacity: savingLevel === l.id ? 0.6 : 1 }}>
                    {savingLevel === l.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
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
          <select value={pickLevel} onChange={(e) => setPickLevel(e.target.value)} style={{ ...selStyle, flex: '1 1 200px', minWidth: 0 }}>
            <option value="">{levels.length ? 'Choose a level…' : 'All users'}</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={{ ...selStyle, flex: '1 1 200px', minWidth: 0 }}>
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
                const lvlVal = u.org_role_id ? levelTargets[u.org_role_id] : undefined;
                return (
                  <div key={u.id} style={rowStyle}>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.city || '—'}</div>
                    </div>
                    <div style={controlsStyle}>
                      <input type="number" min={0}
                        value={overrides[u.id] ?? ''}
                        placeholder={lvlVal != null ? String(lvlVal) : '—'}
                        onChange={(e) => setOverrides((m) => ({ ...m, [u.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                        style={inputStyle} />
                      <button onClick={() => saveOne(u)} disabled={savingId === u.id} style={{ ...btnStyle, background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', opacity: savingId === u.id ? 0.6 : 1 }}>
                        {savingId === u.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input type="number" min={0} value={defaultTarget} onChange={(e) => setDefaultTarget(parseInt(e.target.value || '0', 10) || 0)} style={inputStyle} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>leads / week</span>
          <button onClick={saveDefault} disabled={savingLevel === '__default__'} style={{ ...btnStyle, opacity: savingLevel === '__default__' ? 0.6 : 1 }}>{savingLevel === '__default__' ? 'Saving…' : 'Save fallback'}</button>
        </div>
      </div>
    </div>
  );
}
