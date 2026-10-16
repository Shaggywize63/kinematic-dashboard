'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { toast } from 'sonner';
import api, { API_BASE_URL } from '../../../../lib/api';
import { Modal, input, primaryBtn, ghostBtn, miniBtn, codeStyle, th, td } from './ui';

const BASE = '/api/v1/distribution/integrations';

export interface TallyIntegrationLite { id: string; label: string; config: Record<string, unknown> }

interface HealthCheck { key: string; label: string; status: 'ok' | 'warn' | 'fail'; detail?: string; fix?: 'create_ledgers' }
interface Health {
  ready: boolean;
  checks: HealthCheck[];
  agent_version: string | null;
  last_seen_at: string | null;
  profile: { companies: string[]; current_company: string | null; party_count: number | null } | null;
  master_counts: Record<string, Record<string, number>>;
  last_master_sync_at: string | null;
  master_sync_pending: boolean;
  pending_commands: number;
  last_command_result: { ok: boolean; error?: string | null; label?: string | null; type?: string | null } | null;
}
interface Master {
  id: string; kind: 'stock_item' | 'party'; tally_guid: string; name: string; data: Record<string, unknown>;
  status: 'new' | 'matched' | 'imported' | 'ignored'; match_method: string | null;
}

const ICON = { ok: '✅', warn: '⚠️', fail: '❌' } as const;
const DOWNLOAD_URL = `${API_BASE_URL}/api/v1/integrations/tally/agent/download`;

// ── Pairing ─────────────────────────────────────────────────────────────────
export function PairingPanel({ integrationId, autoGenerate }: { integrationId: string; autoGenerate?: boolean }) {
  const [code, setCode] = useState<{ code: string; expires_at: string; server_url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.post<{ data: { code: string; expires_at: string; server_url: string } }>(`${BASE}/${integrationId}/pairing-code`, {});
      setCode(r.data);
    } catch (e: any) { toast.error(e.message || 'Could not create a pairing code'); }
    finally { setBusy(false); }
  }, [integrationId]);

  useEffect(() => { if (autoGenerate) generate(); }, [autoGenerate, generate]);

  const cmd = code ? `kinematic-tally-agent.exe pair ${code.code}` : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 12, color: 'var(--text)' }}>
        <li>On the PC where Tally runs, <a href={DOWNLOAD_URL} style={{ color: 'var(--primary)', fontWeight: 700 }}>download the Kinematic connector</a>.</li>
        <li>Open Command Prompt <strong>as Administrator</strong> in the download folder and run the command below.</li>
        <li>In Tally: <strong>F1 → Settings → Connectivity → Client/Server</strong>, set <em>TallyPrime acts as</em> = Both, port 9000. Keep the company open.</li>
      </ol>
      {code ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, letterSpacing: 4, color: 'var(--text)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px' }}>{code.code}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Single use · expires {new Date(code.expires_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input readOnly value={cmd} style={{ ...input, fontFamily: 'monospace', fontSize: 12 }} />
            <button style={ghostBtn} onClick={() => navigator.clipboard.writeText(cmd).then(() => toast.success('Command copied'), () => toast.error('Copy failed'))}>Copy</button>
          </div>
        </>
      ) : (
        <div><button onClick={generate} disabled={busy} style={primaryBtn}>{busy ? 'Generating…' : 'Generate pairing code'}</button></div>
      )}
      {code && <div><button onClick={generate} disabled={busy} style={miniBtn}>New code</button></div>}
    </div>
  );
}

// ── Setup & sync ────────────────────────────────────────────────────────────
export function SetupModal({ integration, onClose, onChanged }: { integration: TallyIntegrationLite; onClose: () => void; onChanged: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [showPair, setShowPair] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ data: Health }>(`${BASE}/${integration.id}/health`);
      setHealth(r.data);
    } catch { /* keep the last good state; the next tick retries */ }
  }, [integration.id]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const act = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    try { await fn(); toast.success(okMsg); await refresh(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy(null); }
  };

  const saveCompany = () => act('company', async () => {
    await api.patch(`${BASE}/${integration.id}`, { config: { ...integration.config, company_name: company } });
    integration.config = { ...integration.config, company_name: company };
    onChanged();
  }, 'Company saved');

  const agentFailing = health ? health.checks.find(c => c.key === 'agent')?.status === 'fail' : false;
  const companyCheck = health?.checks.find(c => c.key === 'company');
  const counts = health?.master_counts ?? {};
  const n = (k: string, s: string) => counts[k]?.[s] ?? 0;
  const total = (k: string) => Object.values(counts[k] ?? {}).reduce((a, b) => a + b, 0);
  const syncing = !!health?.master_sync_pending;

  return (
    <Modal onClose={onClose} title={`Set up & sync — ${integration.label}`} subtitle="This page updates by itself. Fix anything marked ❌, then pull your products and dealers from Tally.">
      {!health ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>Checking…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <div style={sectionTitle}>Readiness {health.ready ? '— all set ✅' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {health.checks.map(c => (
                <div key={c.key} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                  <span>{ICON[c.status]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{c.label}</div>
                    {c.detail && <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>{c.detail}</div>}
                    {c.fix === 'create_ledgers' && (
                      <button style={{ ...miniBtn, marginTop: 6 }} disabled={busy === 'ledgers'}
                        onClick={() => act('ledgers', () => api.post(`${BASE}/${integration.id}/create-ledgers`, {}), 'Ledgers queued — they appear in Tally within ~30 seconds')}>
                        {busy === 'ledgers' ? 'Queuing…' : 'Create missing ledgers in Tally'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {health.last_command_result && health.last_command_result.ok === false && (
              <div style={errBox}>Last Tally action failed: {health.last_command_result.error}</div>
            )}
            {health.agent_version && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>Connector v{health.agent_version}</div>}
          </section>

          {companyCheck && companyCheck.status === 'fail' && (health.profile?.companies?.length ?? 0) > 0 && (
            <section>
              <div style={sectionTitle}>Which Tally company?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={company} onChange={e => setCompany(e.target.value)} style={input}>
                  <option value="">Choose the company open in Tally…</option>
                  {health.profile!.companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button style={primaryBtn} disabled={!company || busy === 'company'} onClick={saveCompany}>Save</button>
              </div>
            </section>
          )}

          <section>
            <div style={sectionTitle}>Products & dealers from Tally</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([['stock_item', 'Products'], ['party', 'Dealers / parties']] as const).map(([k, label]) => (
                <div key={k} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{total(k)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {n(k, 'matched')} matched · {n(k, 'imported')} imported · <strong style={{ color: n(k, 'new') ? 'rgb(251, 146, 60)' : 'inherit' }}>{n(k, 'new')} to review</strong>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={primaryBtn} disabled={!health.ready || syncing || busy === 'pull'}
                onClick={() => act('pull', () => api.post(`${BASE}/${integration.id}/pull-masters`, {}), 'Pull requested — usually done within a minute')}>
                {syncing ? 'Pulling from Tally…' : 'Pull from Tally'}
              </button>
              <button style={ghostBtn} disabled={total('stock_item') + total('party') === 0} onClick={() => setReviewing(true)}>Review & import</button>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {health.last_master_sync_at ? `Last pulled ${new Date(health.last_master_sync_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}` : 'Not pulled yet'}
                {!health.ready && ' · fix the checklist first'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              Dealers already in Kinematic are matched by GSTIN (or an exact name) automatically; nothing is created until you click Import.
            </div>
          </section>

          <section>
            <button style={miniBtn} onClick={() => setShowPair(s => !s)}>{showPair || agentFailing ? 'Hide' : 'Connect / re-connect a Tally PC'}</button>
            {(showPair || agentFailing) && <div style={{ marginTop: 12 }}><PairingPanel integrationId={integration.id} autoGenerate={agentFailing && !health.last_seen_at} /></div>}
          </section>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button onClick={onClose} style={ghostBtn}>Close</button></div>
      {reviewing && <MastersModal integrationId={integration.id} onClose={() => { setReviewing(false); refresh(); }} />}
    </Modal>
  );
}

// ── Review & import ─────────────────────────────────────────────────────────
function MastersModal({ integrationId, onClose }: { integrationId: string; onClose: () => void }) {
  const [kind, setKind] = useState<'stock_item' | 'party'>('stock_item');
  const [status, setStatus] = useState<'new' | 'matched' | 'imported' | 'ignored'>('new');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Master[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ kind, status, limit: '200' });
      if (q.trim()) qs.set('q', q.trim());
      const r = await api.get<{ data: { items: Master[]; total: number } }>(`${BASE}/${integrationId}/masters?${qs}`);
      setItems(r.data.items); setTotal(r.data.total); setSel(new Set());
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [integrationId, kind, status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const run = async (action: 'import' | 'ignore', body: Record<string, unknown>) => {
    setWorking(true);
    try {
      const r = await api.post<{ data: { created?: number; updated?: number; failed?: Array<{ name: string; error: string }> } }>(
        `${BASE}/${integrationId}/masters/act`, { kind, action, ...body });
      const d = r.data;
      if (d.failed?.length) toast.error(`${d.failed.length} failed: ${d.failed[0].name} — ${d.failed[0].error}`);
      toast.success(action === 'import' ? `${d.created ?? 0} created` : `${d.updated ?? 0} ignored`);
      await load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setWorking(false); }
  };

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canAct = status === 'new' || status === 'ignored';

  return (
    <Modal onClose={onClose} title="Review Tally data" subtitle="Import creates the product / dealer in Kinematic and links it to its Tally record, so vouchers use the exact Tally name.">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([['stock_item', 'Products'], ['party', 'Dealers']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} style={k === kind ? primaryBtn : ghostBtn}>{l}</button>
        ))}
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ ...input, width: 'auto' }}>
          <option value="new">To review</option><option value="matched">Matched</option>
          <option value="imported">Imported</option><option value="ignored">Ignored</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…" style={{ ...input, flex: 1, minWidth: 140 }} />
      </div>
      {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        : items.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>Nothing here.</div>
        : (
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--s3)' }}>
                <th style={th}>{canAct && <input type="checkbox" checked={sel.size === items.length} onChange={e => setSel(e.target.checked ? new Set(items.map(i => i.id)) : new Set())} />}</th>
                <th style={th}>Name</th>
                <th style={th}>{kind === 'party' ? 'GSTIN' : 'HSN / GST'}</th>
                <th style={th}>{kind === 'party' ? 'Credit limit' : 'Unit'}</th>
                <th style={th}>{status === 'matched' ? 'Matched by' : ''}</th>
              </tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>{canAct && <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />}</td>
                    <td style={td}>{i.name}</td>
                    <td style={td}>{kind === 'party' ? String(i.data.gstin || '—') : `${i.data.hsn_code || '—'} / ${i.data.gst_rate ?? 0}%`}</td>
                    <td style={td}>{kind === 'party' ? String(i.data.credit_limit || '—') : String(i.data.unit || '—')}</td>
                    <td style={td}><code style={codeStyle}>{i.match_method ?? ''}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > items.length && <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 8 }}>Showing {items.length} of {total}. Use search to narrow.</div>}
          </div>
        )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
        {canAct && <>
          <button style={ghostBtn} disabled={working || sel.size === 0} onClick={() => run('ignore', { ids: [...sel] })}>Ignore selected</button>
          <button style={primaryBtn} disabled={working || sel.size === 0} onClick={() => run('import', { ids: [...sel] })}>Import selected ({sel.size})</button>
          {status === 'new' && <button style={primaryBtn} disabled={working || total === 0}
            onClick={() => { if (confirm(`Create all ${total} unmatched ${kind === 'party' ? 'dealers' : 'products'} in Kinematic?`)) run('import', { all_new: true }); }}>Import all new ({total})</button>}
        </>}
        <button style={ghostBtn} onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 };
const errBox: React.CSSProperties = { marginTop: 8, fontSize: 11, color: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '6px 8px' };
