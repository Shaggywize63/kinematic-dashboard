'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Th, Td, Btn, StatCard, Note, inr } from '../../../../components/distribution/Atoms';
import { downloadCsv } from '../../../../lib/exportCsv';

// Current month as YYYY-MM for the <input type="month"> default.
const curMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Achievement band → colour. exceeded green, on_track blue, behind amber, none grey.
function bandColor(band: string): string {
  switch ((band || '').toLowerCase()) {
    case 'exceeded': return 'var(--green)';
    case 'on_track': return 'var(--accent)';
    case 'behind': return 'var(--warn)';
    default: return 'var(--text-dim)';
  }
}
const bandLabel = (band: string) => {
  switch ((band || '').toLowerCase()) {
    case 'exceeded': return 'Exceeded';
    case 'on_track': return 'On track';
    case 'behind': return 'Behind';
    default: return '—';
  }
};

interface TargetRow {
  user_id: string; name: string; employee_id: string | null; role: string | null;
  target_id: string | null; target_amount: number | null; note: string | null;
  actual: number; balance: number; achievement_pct: number | null; band: string;
}
interface TargetSummary { users: number; with_target: number; total_target: number; total_actual: number }

export default function CollectionTargetsPage() {
  const [month, setMonth] = useState(curMonth());
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [summary, setSummary] = useState<TargetSummary>({ users: 0, with_target: 0, total_target: 0, total_actual: 0 });
  const [loading, setLoading] = useState(true);

  // Target inputs, keyed by user_id, pre-filled from the saved target. `dirty`
  // tracks which rows the admin changed so "Save all changed" posts only those.
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const r: any = await api.getCollectionTargets(month);
      const d = r?.data || r || {};
      const list: TargetRow[] = d.rows || [];
      setRows(list);
      setSummary(d.summary || { users: 0, with_target: 0, total_target: 0, total_actual: 0 });
      const init: Record<string, string> = {};
      for (const row of list) init[row.user_id] = row.target_amount != null ? String(row.target_amount) : '';
      setTargets(init);
      setDirty(new Set());
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Failed to load targets' }); }
    setLoading(false);
  }, [month]);

  // Refetch on month change.
  useEffect(() => { load(); }, [load]);

  const onTargetChange = (userId: string, value: string) => {
    setTargets((t) => ({ ...t, [userId]: value }));
    setDirty((d) => { const next = new Set(d); next.add(userId); return next; });
  };

  const saveAll = async () => {
    const changed = rows.filter((r) => dirty.has(r.user_id));
    if (!changed.length) { setMsg({ kind: 'err', text: 'No changes to save.' }); return; }
    setSaving(true); setMsg(null);
    try {
      let saved = 0, removed = 0;
      for (const r of changed) {
        const raw = targets[r.user_id];
        const num = raw === '' || raw == null ? 0 : Number(raw);
        if (Number.isNaN(num)) continue;
        if (num <= 0) {
          // Clearing an existing target removes it; a blank with no target is a no-op.
          if (r.target_id) { await api.deleteCollectionTarget(r.target_id); removed++; }
          continue;
        }
        await api.saveCollectionTarget({ user_id: r.user_id, month, target_amount: num });
        saved++;
      }
      const parts: string[] = [];
      if (saved) parts.push(`${saved} target(s) saved`);
      if (removed) parts.push(`${removed} cleared`);
      setMsg({ kind: 'ok', text: parts.length ? parts.join(' · ') : 'Nothing to change.' });
      await load();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Save failed' }); }
    setSaving(false);
  };

  const exportCsv = () => {
    const out = rows.map((r) => ({
      Employee: r.name, 'Employee ID': r.employee_id || '', Role: r.role || '',
      Target: r.target_amount == null ? '' : r.target_amount,
      Collected: r.actual, 'Achievement %': r.achievement_pct == null ? '' : r.achievement_pct,
      Balance: r.balance,
    }));
    downloadCsv(`collection-targets-${month}`, out, ['Employee', 'Employee ID', 'Role', 'Target', 'Collected', 'Achievement %', 'Balance']);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontWeight: 700 };
  const inputStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--text)', fontSize: 13, outline: 'none', width: 130, textAlign: 'right' };

  return (
    <div>
      <PageHeader
        title="Collection Targets"
        subtitle="Monthly ₹ collection target per employee, against payments actually collected — with achievement % and balance to go."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={selStyle} />
            <Btn variant="ghost" onClick={exportCsv} disabled={!rows.length}>Export CSV</Btn>
            <Btn disabled={saving || !dirty.size} onClick={saveAll}>{saving ? 'Saving…' : 'Save all changed'}</Btn>
          </div>
        }
      />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <StatCard label="Users" value={summary.users || 0} />
        <StatCard label="With target" value={summary.with_target || 0} accent={summary.with_target ? 'var(--accent)' : undefined} />
        <StatCard label="Total target" value={inr(Number(summary.total_target || 0))} />
        <StatCard label="Total collected" value={inr(Number(summary.total_actual || 0))} accent="var(--green)" />
      </div>

      {msg && <Note tone={msg.kind === 'ok' ? 'ok' : 'red'} style={{ marginBottom: 14 }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</Note>}

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <Th>Employee</Th>
              <Th>Role</Th>
              <Th style={{ textAlign: 'right' }}>Target ₹</Th>
              <Th style={{ textAlign: 'right' }}>Collected ₹</Th>
              <Th style={{ minWidth: 180 }}>Achievement</Th>
              <Th style={{ textAlign: 'right' }}>Balance</Th>
            </tr></thead>
            <tbody>
              {loading ? <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr> :
                rows.map((r) => {
                  const pct = r.achievement_pct == null ? null : Number(r.achievement_pct);
                  const barW = pct == null ? 0 : Math.max(0, Math.min(100, pct));
                  const col = bandColor(r.band);
                  return (
                    <tr key={r.user_id}>
                      <Td style={{ fontWeight: 700 }}>{r.name}{r.employee_id ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}> · {r.employee_id}</span> : null}</Td>
                      <Td style={{ color: 'var(--text-dim)' }}>{r.role || '—'}</Td>
                      <Td style={{ textAlign: 'right' }}>
                        <input type="number" min={0} value={targets[r.user_id] ?? ''} placeholder="—" onChange={(e) => onTargetChange(r.user_id, e.target.value)} style={inputStyle} />
                      </Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(Number(r.actual || 0))}</Td>
                      <Td>
                        {pct == null ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>No target</span> : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 8, background: 'var(--s2)', borderRadius: 999, overflow: 'hidden', minWidth: 90 }}>
                              <div style={{ width: `${barW}%`, height: '100%', background: col, borderRadius: 999 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 64, textAlign: 'right' }}>{pct}% · {bandLabel(r.band)}</span>
                          </div>
                        )}
                      </Td>
                      <Td style={{ textAlign: 'right', fontSize: 12, color: Number(r.balance || 0) > 0 ? 'var(--text)' : 'var(--green)' }}>{inr(Number(r.balance || 0))}</Td>
                    </tr>
                  );
                })}
              {!loading && !rows.length && <tr><Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No employees for this month.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
        Edit a target and press <strong>Save all changed</strong>. Clearing a target (0 or blank) removes it. Collected is the sum of cleared payments credited to each employee in the selected month.
      </div>
    </div>
  );
}
