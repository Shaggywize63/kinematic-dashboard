'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, Note, fmtDate } from '../../../../components/distribution/Atoms';
import { downloadCsv } from '../../../../lib/exportCsv';

// Today in YYYY-MM-DD (local), for the date inputs' defaults.
const todayStr = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

// Worksheet / report status → pill colour. `approved` is green (reviewed);
// `recorded` is amber (a saved count awaiting review); `adjusted` is grey
// (system was moved to match the count — done); `uncounted` is grey.
function stStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'approved': return 'green';
    case 'recorded': return 'amber';
    case 'adjusted': return 'gray';
    default: return 'gray';
  }
}

interface WorksheetRow {
  sku_id: string; sku_name: string; sku_code: string; unit: string;
  system_qty: number; physical_qty: number | null; variance: number;
  status: string; id: string | null; note: string | null;
}
interface ReportRow {
  sku_id: string; sku_name: string; sku_code: string; unit: string;
  opening_qty: number; received_qty: number; issued_qty: number;
  closing_system_qty: number; physical_qty: number | null; physical_date: string | null;
  variance: number; status: string;
}

export default function ClosingStockPage() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [distributorId, setDistributorId] = useState('');
  const [date, setDate] = useState(todayStr());

  const [rows, setRows] = useState<WorksheetRow[]>([]);
  const [summary, setSummary] = useState<{ counted: number; matched: number; over: number; short: number; adjusted: number }>({ counted: 0, matched: 0, over: 0, short: 0, adjusted: 0 });
  const [loading, setLoading] = useState(false);

  // Physical-count inputs, keyed by sku_id. Pre-filled from the saved count;
  // `dirty` tracks the rows the admin actually touched, so Save posts only those.
  const [physical, setPhysical] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [varOnly, setVarOnly] = useState(false);

  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Optional report (date range) — collapsible, loaded on demand.
  const [showReport, setShowReport] = useState(false);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayStr());
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    api.getDistributors().then((r: any) => setDistributors(r?.data || r || [])).catch(() => {});
  }, []);

  const loadWorksheet = useCallback(async () => {
    if (!distributorId) { setRows([]); setSummary({ counted: 0, matched: 0, over: 0, short: 0, adjusted: 0 }); return; }
    setLoading(true); setMsg(null);
    try {
      const r: any = await api.getClosingStockWorksheet(distributorId, date);
      const d = r?.data || r || {};
      const list: WorksheetRow[] = d.rows || [];
      setRows(list);
      setSummary(d.summary || { counted: 0, matched: 0, over: 0, short: 0, adjusted: 0 });
      const init: Record<string, string> = {};
      for (const row of list) init[row.sku_id] = row.physical_qty != null ? String(row.physical_qty) : '';
      setPhysical(init);
      setDirty(new Set());
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Failed to load worksheet' }); }
    setLoading(false);
  }, [distributorId, date]);

  // Refetch whenever the distributor or date changes.
  useEffect(() => { loadWorksheet(); }, [loadWorksheet]);

  const liveVariance = (r: WorksheetRow): number | null => {
    const raw = physical[r.sku_id];
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n - Number(r.system_qty || 0);
  };

  const onPhysicalChange = (skuId: string, value: string) => {
    setPhysical((p) => ({ ...p, [skuId]: value }));
    setDirty((d) => { const next = new Set(d); next.add(skuId); return next; });
  };

  const saveCounts = async () => {
    if (!distributorId) { setMsg({ kind: 'err', text: 'Pick a distributor first.' }); return; }
    const counts = rows
      .filter((r) => dirty.has(r.sku_id) && physical[r.sku_id] !== '' && physical[r.sku_id] != null)
      .map((r) => ({ sku_id: r.sku_id, physical_qty: Number(physical[r.sku_id]) }))
      .filter((c) => !Number.isNaN(c.physical_qty));
    if (!counts.length) { setMsg({ kind: 'err', text: 'Enter at least one physical count before saving.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r: any = await api.saveClosingStock({ distributor_id: distributorId, stock_date: date, counts });
      const d = r?.data || r || {};
      const parts = [`${d.saved ?? counts.length} count(s) saved`];
      if (d.skipped_adjusted) parts.push(`${d.skipped_adjusted} skipped (already adjusted)`);
      setMsg({ kind: 'ok', text: parts.join(' · ') });
      await loadWorksheet();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Save failed' }); }
    setSaving(false);
  };

  const approve = async (id: string) => {
    setApprovingId(id); setMsg(null);
    try {
      await api.approveClosingStock(id);
      setMsg({ kind: 'ok', text: 'Stock adjusted to match the count.' });
      await loadWorksheet();
    } catch (e: any) { setMsg({ kind: 'err', text: e?.message || 'Approve failed' }); }
    setApprovingId(null);
  };

  const loadReport = useCallback(async () => {
    if (!distributorId) { setReportRows([]); return; }
    setReportLoading(true);
    try {
      const r: any = await api.getClosingStockReport(distributorId, from, to);
      const d = r?.data || r || {};
      setReportRows(d.rows || []);
    } catch { /* ignore */ }
    setReportLoading(false);
  }, [distributorId, from, to]);
  useEffect(() => { if (showReport) loadReport(); }, [showReport, loadReport]);

  const visibleRows = useMemo(
    () => varOnly ? rows.filter((r) => Number(r.variance || 0) !== 0 || liveVariance(r) !== null && liveVariance(r) !== 0) : rows,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, varOnly, physical],
  );

  const distName = distributors.find((d) => d.id === distributorId)?.name || 'distributor';

  const exportWorksheet = () => {
    const out = visibleRows.map((r) => {
      const lv = liveVariance(r);
      return {
        SKU: r.sku_name, Code: r.sku_code, Unit: r.unit,
        System: r.system_qty,
        Physical: physical[r.sku_id] === '' || physical[r.sku_id] == null ? '' : Number(physical[r.sku_id]),
        Variance: lv == null ? '' : lv,
        Status: r.status,
      };
    });
    downloadCsv(`closing-stock-${distName}-${date}`, out, ['SKU', 'Code', 'Unit', 'System', 'Physical', 'Variance', 'Status']);
  };

  const exportReport = () => {
    const out = reportRows.map((r) => ({
      SKU: r.sku_name, Code: r.sku_code, Unit: r.unit,
      Opening: r.opening_qty, Received: r.received_qty, Issued: r.issued_qty,
      Closing: r.closing_system_qty,
      Physical: r.physical_qty == null ? '' : r.physical_qty,
      Variance: r.variance, Status: r.status,
    }));
    downloadCsv(`closing-stock-report-${distName}-${from}_${to}`, out, ['SKU', 'Code', 'Unit', 'Opening', 'Received', 'Issued', 'Closing', 'Physical', 'Variance', 'Status']);
  };

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };
  const inputStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
  const qtyInputStyle: React.CSSProperties = { ...inputStyle, width: 110, textAlign: 'right', padding: '6px 8px' };

  const varColor = (v: number | null) => v == null ? 'var(--text-dim)' : v > 0 ? 'var(--green)' : v < 0 ? 'var(--primary)' : 'var(--text-dim)';
  const varText = (v: number | null) => v == null ? '—' : v > 0 ? `+${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN');

  return (
    <div>
      <PageHeader
        title="Closing Stock"
        subtitle="Daily physical stock count per distributor — record the count, see the variance against the system, and approve discrepancies to adjust stock to the count."
        right={<Btn variant="ghost" onClick={exportWorksheet} disabled={!rows.length}>Export CSV</Btn>}
      />

      {/* Distributor + date picker */}
      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: 260 }}>
            <div style={labelStyle}>Distributor</div>
            <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)} style={{ ...selStyle, minWidth: 260 }}>
              <option value="">— Select distributor —</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` · ${d.code}` : ''}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Date</div>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} style={selStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={varOnly} onChange={(e) => setVarOnly(e.target.checked)} />
            Show only variances (discrepancies)
          </label>
        </div>
      </Card>

      {!distributorId ? (
        <Card><div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Select a distributor to start a stock count.</div></Card>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
            <StatCard label="Counted" value={summary.counted || 0} />
            <StatCard label="Matches" value={summary.matched || 0} accent="var(--green)" />
            <StatCard label="Over" value={summary.over || 0} accent={summary.over ? 'var(--green)' : undefined} />
            <StatCard label="Short" value={summary.short || 0} accent={summary.short ? 'var(--primary)' : undefined} />
            <StatCard label="Adjusted" value={summary.adjusted || 0} />
          </div>

          {msg && <Note tone={msg.kind === 'ok' ? 'ok' : 'red'} style={{ marginBottom: 14 }}>{msg.kind === 'ok' ? '✓ ' : '✗ '}{msg.text}</Note>}

          {/* Worksheet */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead><tr>
                  <Th>SKU</Th>
                  <Th>Unit</Th>
                  <Th style={{ textAlign: 'right' }}>System</Th>
                  <Th style={{ textAlign: 'right' }}>Physical</Th>
                  <Th style={{ textAlign: 'right' }}>Variance</Th>
                  <Th>Status</Th>
                  <Th>Action</Th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><Td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr> :
                    visibleRows.map((r) => {
                      const lv = liveVariance(r);
                      const canApprove = r.status === 'recorded' && Number(r.variance || 0) !== 0 && !!r.id;
                      return (
                        <tr key={r.sku_id}>
                          <Td style={{ fontWeight: 700 }}>{r.sku_name || '—'}{r.sku_code ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}> · {r.sku_code}</span> : null}</Td>
                          <Td style={{ color: 'var(--text-dim)' }}>{r.unit || '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>{Number(r.system_qty ?? 0).toLocaleString('en-IN')}</Td>
                          <Td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={physical[r.sku_id] ?? ''}
                              placeholder="—"
                              disabled={r.status === 'adjusted'}
                              onChange={(e) => onPhysicalChange(r.sku_id, e.target.value)}
                              style={{ ...qtyInputStyle, opacity: r.status === 'adjusted' ? 0.5 : 1 }}
                            />
                          </Td>
                          <Td style={{ textAlign: 'right', fontWeight: 700, color: varColor(lv) }}>{varText(lv)}</Td>
                          <Td><Pill color={stStatusColor(r.status)}>{r.status || 'uncounted'}</Pill></Td>
                          <Td>
                            {canApprove
                              ? <Btn size="sm" disabled={approvingId === r.id} onClick={() => approve(r.id as string)}>{approvingId === r.id ? 'Adjusting…' : 'Approve & adjust'}</Btn>
                              : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                          </Td>
                        </tr>
                      );
                    })}
                  {!loading && !visibleRows.length && <tr><Td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{varOnly ? 'No discrepancies — every counted SKU matches the system.' : 'No stock to count for this distributor.'}</Td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ marginBottom: 22 }}>
            <Btn disabled={saving || !dirty.size} onClick={saveCounts}>{saving ? 'Saving…' : 'Save counts'}</Btn>
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-dim)' }}>Only rows you fill or change are saved. Recorded discrepancies can then be approved to adjust the system to the count.</span>
          </div>

          {/* Optional report (date range) */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Closing-stock report (date range)</div>
              <Btn variant="ghost" onClick={() => setShowReport((v) => !v)}>{showReport ? 'Hide' : 'Show'}</Btn>
            </div>
            {showReport && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
                  <div>
                    <div style={labelStyle}>From</div>
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={selStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>To</div>
                    <input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} style={selStyle} />
                  </div>
                  <Btn variant="secondary" onClick={loadReport}>Load report</Btn>
                  <Btn variant="ghost" onClick={exportReport} disabled={!reportRows.length}>Export CSV</Btn>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                    <thead><tr>
                      <Th>SKU</Th>
                      <Th>Unit</Th>
                      <Th style={{ textAlign: 'right' }}>Opening</Th>
                      <Th style={{ textAlign: 'right' }}>Received</Th>
                      <Th style={{ textAlign: 'right' }}>Issued</Th>
                      <Th style={{ textAlign: 'right' }}>Closing (sys)</Th>
                      <Th style={{ textAlign: 'right' }}>Physical</Th>
                      <Th style={{ textAlign: 'right' }}>Variance</Th>
                      <Th>Status</Th>
                    </tr></thead>
                    <tbody>
                      {reportLoading ? <tr><Td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</Td></tr> :
                        reportRows.map((r) => {
                          const v = r.variance == null ? null : Number(r.variance);
                          return (
                            <tr key={`${r.sku_id}-${r.physical_date ?? 'na'}`}>
                              <Td style={{ fontWeight: 700 }}>{r.sku_name || '—'}{r.sku_code ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}> · {r.sku_code}</span> : null}{r.physical_date ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 11, display: 'block' }}>{fmtDate(r.physical_date)}</span> : null}</Td>
                              <Td style={{ color: 'var(--text-dim)' }}>{r.unit || '—'}</Td>
                              <Td style={{ textAlign: 'right' }}>{Number(r.opening_qty ?? 0).toLocaleString('en-IN')}</Td>
                              <Td style={{ textAlign: 'right', color: 'var(--green)' }}>{Number(r.received_qty ?? 0).toLocaleString('en-IN')}</Td>
                              <Td style={{ textAlign: 'right' }}>{Number(r.issued_qty ?? 0).toLocaleString('en-IN')}</Td>
                              <Td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(r.closing_system_qty ?? 0).toLocaleString('en-IN')}</Td>
                              <Td style={{ textAlign: 'right' }}>{r.physical_qty == null ? '—' : Number(r.physical_qty).toLocaleString('en-IN')}</Td>
                              <Td style={{ textAlign: 'right', fontWeight: 700, color: varColor(v) }}>{varText(v)}</Td>
                              <Td><Pill color={stStatusColor(r.status)}>{r.status || 'uncounted'}</Pill></Td>
                            </tr>
                          );
                        })}
                      {!reportLoading && !reportRows.length && <tr><Td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No movements or counts in this range.</Td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
