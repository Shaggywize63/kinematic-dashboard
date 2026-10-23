'use client';
/**
 * Settings → Targets, the telecaller CALLS target.
 *
 * Same layout as the weekly lead target next door — a target per hierarchy
 * level, optional per-person overrides, a fallback default — but a DAILY
 * call-count goal ("N calls / day") rather than a weekly lead figure. Everything
 * goes through the dedicated calls endpoints (`/targets/calls`), so the lead and
 * rupee target UIs are untouched. A telecaller sees their own progress on the
 * Android My-Targets screen (and the admin on the Telecaller Performance report).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmTargets } from '../../lib/crmApi';

export interface TargetUser { id: string; name: string; role: string; city: string | null; org_role_id: string | null }
export interface TargetLevel { id: string; name: string }

const MAX_CALLS = 100000;

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 };
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' };
const inputStyle: React.CSSProperties = { width: 72, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'center' };
const selStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%' };
const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };

/** Clamp a box value to a whole number of calls in [0, MAX_CALLS]. */
const clampCalls = (raw: unknown): number => {
  const n = Math.floor(Number(raw) || 0);
  return Math.max(0, Math.min(MAX_CALLS, n));
};

export default function CallsTargets({ users, levels, baseLoading, narrow }: {
  users: TargetUser[]; levels: TargetLevel[]; baseLoading: boolean; narrow: boolean;
}) {
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [levelTargets, setLevelTargets] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pickLevel, setPickLevel] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await crmTargets.callsGet();
        if (cancelled) return;
        const d = res?.data;
        setDefaultTarget(d?.default_target ?? 0);
        const lvl: Record<string, number> = {};
        (d?.per_level || []).forEach((r: any) => { lvl[r.hierarchy_level_id] = r.target_value; });
        setLevelTargets(lvl);
        const usr: Record<string, number> = {};
        (d?.per_user || []).forEach((r: any) => { usr[r.user_id] = r.target_value; });
        setOverrides(usr);
      } catch (e: any) {
        if (!cancelled) toast.error(e.message || 'Failed to load calls targets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cities = useMemo(() =>
    Array.from(new Set(users.map((u) => u.city).filter((c): c is string => !!c))).sort(),
  [users]);
  const usersInPicked = useMemo(() => users.filter((u) =>
    (!pickLevel || u.org_role_id === pickLevel) && (!cityFilter || u.city === cityFilter)
  ), [users, pickLevel, cityFilter]);
  const countAtLevel = (id: string) => users.filter((u) => u.org_role_id === id).length;

  const saveLevel = async (levelId: string) => {
    const v = clampCalls(levelTargets[levelId]);
    setSavingLevel(levelId);
    try {
      // The level picker lists org_roles, which the backend accepts as org_role_id.
      await crmTargets.callsSet({ org_role_id: levelId, target_value: v });
      setLevelTargets((m) => ({ ...m, [levelId]: v }));
      toast.success(`Target set: ${v} calls/day for this level`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingLevel(null); }
  };
  const saveDefault = async () => {
    const v = clampCalls(defaultTarget);
    setSavingLevel('__default__');
    try { await crmTargets.callsSet({ all: true, target_value: v }); toast.success(`Fallback set to ${v} calls/day`); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingLevel(null); }
  };
  const saveOne = async (u: TargetUser) => {
    const v = clampCalls(overrides[u.id]);
    setSavingId(u.id);
    try {
      await crmTargets.callsSet({ user_id: u.id, target_value: v });
      setOverrides((m) => ({ ...m, [u.id]: v }));
      toast.success(`${u.name}: ${v} calls/day`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingId(null); }
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' };
  const controlsStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: narrow ? 0 : 'auto' };
  const busy = baseLoading || loading;

  return (
    <>
      {/* Per-hierarchy-level calls targets */}
      <div style={card}>
        <div style={h2}>Calls target by hierarchy level</div>
        <p style={hint}>The number of calls each person at a level should log per day. Telecallers see this against today&apos;s logged calls.</p>
        {busy ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : levels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>
            No hierarchy levels defined for this client yet. Set them up in <a href="/dashboard/crm/settings/hierarchy" style={{ color: 'var(--primary)' }}>Org Hierarchy</a>, then set per-level calls targets here. You can still set individual targets below.
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
                  <input type="number" min={0} max={MAX_CALLS}
                    value={levelTargets[l.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setLevelTargets((m) => ({ ...m, [l.id]: clampCalls(e.target.value) }))}
                    style={inputStyle} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/day</span>
                  <button onClick={() => saveLevel(l.id)} disabled={savingLevel === l.id} style={{ ...btnStyle, opacity: savingLevel === l.id ? 0.6 : 1 }}>
                    {savingLevel === l.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual overrides */}
      <div style={card}>
        <div style={h2}>Individual overrides <span style={{ fontWeight: 500, color: 'var(--text-dim)' }}>(optional)</span></div>
        <p style={hint}>Pick a level (and optional city) to list its people and override specific individuals. Blank uses their level target.</p>
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
                      <input type="number" min={0} max={MAX_CALLS}
                        value={overrides[u.id] ?? ''}
                        placeholder={lvlVal != null ? String(lvlVal) : '—'}
                        onChange={(e) => setOverrides((m) => ({ ...m, [u.id]: clampCalls(e.target.value) }))}
                        style={inputStyle} />
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/day</span>
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

      {/* Fallback default */}
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={h2}>Fallback default</div>
        <p style={hint}>Used only for people with no hierarchy level and no individual calls target.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input type="number" min={0} max={MAX_CALLS} value={defaultTarget} onChange={(e) => setDefaultTarget(clampCalls(e.target.value))} style={inputStyle} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>calls / day</span>
          <button onClick={saveDefault} disabled={savingLevel === '__default__'} style={{ ...btnStyle, opacity: savingLevel === '__default__' ? 0.6 : 1 }}>{savingLevel === '__default__' ? 'Saving…' : 'Save fallback'}</button>
        </div>
      </div>
    </>
  );
}
