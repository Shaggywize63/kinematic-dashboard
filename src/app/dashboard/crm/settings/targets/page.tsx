'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { crmTargets } from '../../../../../lib/crmApi';

interface FE { id: string; name: string; role: string; }

export default function TargetsSettingsPage() {
  const [fes, setFes] = useState<FE[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<number>(0);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [allInput, setAllInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, tRes] = await Promise.allSettled([
        api.get<any>('/api/v1/users?limit=500'),
        crmTargets.get(),
      ]);
      if (uRes.status === 'fulfilled') {
        const list: any[] = uRes.value?.data || uRes.value || [];
        setFes(list
          .filter((u) => u.role === 'executive' || u.role === 'field_executive')
          .map((u) => ({ id: u.id, name: u.name || u.full_name || u.email || 'Field Executive', role: u.role })));
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

  const saveAll = async () => {
    const v = Math.max(0, parseInt(allInput || '0', 10) || 0);
    setSavingAll(true);
    try {
      await crmTargets.set({ all: true, target_value: v });
      setDefaultTarget(v);
      toast.success(`Daily target set to ${v} for all field executives`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingAll(false); }
  };

  const saveOne = async (fe: FE) => {
    const raw = overrides[fe.id];
    const v = Math.max(0, Number.isFinite(raw) ? raw : defaultTarget);
    setSavingId(fe.id);
    try {
      await crmTargets.set({ user_id: fe.id, target_value: v });
      setOverrides((m) => ({ ...m, [fe.id]: v }));
      toast.success(`Target for ${fe.name} set to ${v}/day`);
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSavingId(null); }
  };

  const inputStyle: React.CSSProperties = { width: 84, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'center' };
  const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Targets</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px' }}>
        Set how many leads each field executive should add per day. FEs see their target as a ticker on the home dashboard and a progress badge (e.g. 1/5) while adding a lead.
      </p>

      {/* Set for everyone */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Same target for all FEs</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>The default daily lead target applied to every field executive who doesn&rsquo;t have a custom one below.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="number" min={0} value={allInput} onChange={(e) => setAllInput(e.target.value)} style={inputStyle} placeholder="0" />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>leads / day</span>
          <button onClick={saveAll} disabled={savingAll} style={{ ...btnStyle, opacity: savingAll ? 0.6 : 1 }}>{savingAll ? 'Saving…' : 'Apply to all'}</button>
        </div>
      </div>

      {/* Per-FE overrides */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Per field executive</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>Override the default for individuals. Blank uses the all-FE default ({defaultTarget}/day).</p>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : fes.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>No field executives found for the active scope.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fes.map((fe) => (
              <div key={fe.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fe.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fe.role.replace('_', ' ')}</div>
                </div>
                <input
                  type="number" min={0}
                  value={overrides[fe.id] ?? ''}
                  placeholder={String(defaultTarget)}
                  onChange={(e) => setOverrides((m) => ({ ...m, [fe.id]: parseInt(e.target.value || '0', 10) || 0 }))}
                  style={inputStyle}
                />
                <button onClick={() => saveOne(fe)} disabled={savingId === fe.id} style={{ ...btnStyle, background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', opacity: savingId === fe.id ? 0.6 : 1 }}>
                  {savingId === fe.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
