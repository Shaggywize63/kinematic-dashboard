'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../lib/api';

interface Integration {
  id: string;
  org_id: string;
  provider: 'tally' | 'quickbooks' | 'zoho_books' | 'busy' | 'marg';
  label: string;
  status: 'pending' | 'active' | 'error' | 'disabled';
  config: Record<string, unknown>;
  last_seen_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  last_event_count: number;
  created_at: string;
  updated_at: string;
  agent_secret?: string;
  agent_config?: {
    integration_id: string;
    agent_secret: string;
    polling_endpoint: string;
    report_endpoint: string;
    tally_url: string;
    poll_interval_seconds: number;
  };
}

interface IntegrationEvent {
  id: string;
  kind: string;
  ref_table: string;
  ref_id: string;
  status: 'pending' | 'in_flight' | 'synced' | 'failed' | 'retry_scheduled';
  attempts: number;
  last_attempt_at: string | null;
  tally_voucher_id: string | null;
  error: string | null;
  created_at: string;
  synced_at: string | null;
}

const PROVIDERS = [
  { id: 'tally',      label: 'Tally',      desc: 'Tally Prime / Tally ERP 9 on-premise. Bridge agent runs alongside Tally on the distributor PC.', available: true,  icon: '📒' },
  { id: 'quickbooks', label: 'QuickBooks', desc: 'Coming soon.', available: false, icon: '📗' },
  { id: 'zoho_books', label: 'Zoho Books', desc: 'Coming soon.', available: false, icon: '📘' },
  { id: 'busy',       label: 'Busy ERP',   desc: 'Coming soon.', available: false, icon: '📕' },
  { id: 'marg',       label: 'Marg ERP',   desc: 'Coming soon.', available: false, icon: '📙' },
] as const;

const STATUS_STYLES: Record<Integration['status'], { bg: string; color: string; label: string }> = {
  active:   { bg: 'rgba(34, 197, 94, 0.12)',   color: 'rgb(34, 197, 94)',   label: 'Active'   },
  pending:  { bg: 'rgba(251, 146, 60, 0.12)',  color: 'rgb(251, 146, 60)',  label: 'Pending'  },
  error:    { bg: 'rgba(239, 68, 68, 0.12)',   color: 'rgb(239, 68, 68)',   label: 'Error'    },
  disabled: { bg: 'rgba(156, 163, 175, 0.12)', color: 'rgb(156, 163, 175)', label: 'Disabled' },
};

const EVENT_STATUS_STYLES: Record<IntegrationEvent['status'], { color: string; label: string }> = {
  pending:          { color: 'var(--text-dim)',  label: 'Pending'   },
  in_flight:        { color: 'rgb(251, 146, 60)', label: 'In flight' },
  synced:           { color: 'rgb(34, 197, 94)',  label: 'Synced'    },
  failed:           { color: 'rgb(239, 68, 68)',  label: 'Failed'    },
  retry_scheduled:  { color: 'rgb(251, 146, 60)', label: 'Retrying'  },
};

function formatLastSeen(when: string | null): string {
  if (!when) return 'Never';
  const ms = Date.now() - new Date(when).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

const BASE = '/api/v1/distribution/integrations';

export default function DistributionIntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loaded, setLoaded]             = useState(false);
  const [pickingProvider, setPickingProvider] = useState(false);
  const [connectFor, setConnectFor]     = useState<Integration['provider'] | null>(null);
  const [success, setSuccess]           = useState<Integration | null>(null);
  const [eventsFor, setEventsFor]       = useState<Integration | null>(null);

  const load = async () => {
    try {
      const r = await api.get<{ data: Integration[] }>(BASE);
      setIntegrations(r.data ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load integrations');
    } finally { setLoaded(true); }
  };

  useEffect(() => { load(); }, []);

  const disconnect = async (i: Integration) => {
    if (!confirm(`Disconnect "${i.label}"? Pending sync jobs will be discarded. Tally vouchers already pushed remain in Tally.`)) return;
    try {
      await api.delete(`${BASE}/${i.id}`);
      toast.success(`${i.label} disconnected`);
      setIntegrations((l) => l.filter((x) => x.id !== i.id));
    } catch (e: any) { toast.error(e.message || 'Disconnect failed'); }
  };

  return (
    <div>
      <Link href="/dashboard/distribution" style={{ fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none', marginBottom: 14, display: 'inline-block' }}>
        ← Back to Distribution
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text)', fontWeight: 800 }}>Accounting Integrations</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 660 }}>
            Push invoices, payments, and returns from Kinematic into the distributor's accounting software in real time.
            Tally connects via a small Windows bridge agent that runs alongside Tally on the distributor's PC.
          </p>
        </div>
        <button onClick={() => setPickingProvider(true)} style={primaryBtn}>+ Add integration</button>
      </div>

      {!loaded ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      ) : integrations.length === 0 ? (
        <div style={{
          background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 14,
          padding: 48, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📒</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>No accounting integrations yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 420, margin: '0 auto 18px' }}>
            Connect Tally to skip the daily re-keying of vouchers. Every Kinematic invoice / payment / return flows into Tally within 30 seconds.
          </div>
          <button onClick={() => setPickingProvider(true)} style={primaryBtn}>Connect Tally</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {integrations.map((i) => {
            const style = STATUS_STYLES[i.status] ?? STATUS_STYLES.disabled;
            const meta = PROVIDERS.find((p) => p.id === i.provider);
            return (
              <div key={i.id} style={{
                background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14,
                padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 26, lineHeight: 1 }}>{meta?.icon ?? '🔌'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {i.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{meta?.label ?? i.provider}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 20,
                    background: style.bg, color: style.color,
                  }}>{style.label}</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span>Agent seen {formatLastSeen(i.last_seen_at)}</span>
                  <span>{i.last_event_count} jobs pushed</span>
                </div>

                {i.last_error && (
                  <div style={{
                    fontSize: 11, color: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6, padding: '6px 8px',
                  }}>
                    {i.last_error.slice(0, 200)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button onClick={() => setEventsFor(i)} style={ghostBtn}>View events</button>
                  <button onClick={() => disconnect(i)} style={ghostBtnDanger}>Disconnect</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pickingProvider && (
        <Modal onClose={() => setPickingProvider(false)} title="Connect an accounting system" subtitle="Pick the accounting software the distributor uses.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => { setPickingProvider(false); setConnectFor(p.id as Integration['provider']); }}
                style={{
                  textAlign: 'left',
                  background: p.available ? 'var(--s3)' : 'var(--s2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: 14, cursor: p.available ? 'pointer' : 'not-allowed',
                  color: 'var(--text)', opacity: p.available ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{p.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{p.label}</span>
                  {!p.available && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', padding: '2px 6px',
                      background: 'var(--s4)', borderRadius: 4,
                    }}>SOON</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {connectFor === 'tally' && (
        <ConnectTallyModal
          onClose={() => setConnectFor(null)}
          onCreated={(i) => { setConnectFor(null); setSuccess(i); load(); }}
        />
      )}

      {success && <SuccessModal integration={success} onClose={() => setSuccess(null)} />}

      {eventsFor && <EventsModal integration={eventsFor} onClose={() => setEventsFor(null)} />}
    </div>
  );
}

// ── Connect Tally ──────────────────────────────────────────────────────────────
function ConnectTallyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (i: Integration) => void }) {
  const [label, setLabel]               = useState('');
  const [companyName, setCompanyName]   = useState('');
  const [salesLedger, setSalesLedger]   = useState('Sales Account');
  const [cashLedger, setCashLedger]     = useState('Cash');
  const [bankLedger, setBankLedger]     = useState('Bank');
  const [cgstLedger, setCgstLedger]     = useState('CGST');
  const [sgstLedger, setSgstLedger]     = useState('SGST');
  const [igstLedger, setIgstLedger]     = useState('IGST');
  const [creditLedger, setCreditLedger] = useState('Sales Returns');
  const [submitting, setSubmitting]     = useState(false);

  const submit = async () => {
    if (!label.trim()) { toast.error('Give this connection a name'); return; }
    if (!companyName.trim()) { toast.error("Tally company name is required — it's the SVCURRENTCOMPANY value in voucher XML"); return; }

    setSubmitting(true);
    try {
      const r = await api.post<{ data: Integration }>(BASE, {
        provider: 'tally',
        label: label.trim(),
        config: {
          company_name:            companyName.trim(),
          sales_ledger_name:       salesLedger.trim(),
          cash_ledger_name:        cashLedger.trim(),
          bank_ledger_name:        bankLedger.trim(),
          cgst_ledger_name:        cgstLedger.trim(),
          sgst_ledger_name:        sgstLedger.trim(),
          igst_ledger_name:        igstLedger.trim(),
          credit_note_ledger_name: creditLedger.trim(),
        },
      });
      onCreated(r.data);
    } catch (e: any) {
      toast.error(e.message || 'Connection failed');
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Connect Tally" subtitle="Configure how Kinematic vouchers map to ledgers in this distributor's Tally company.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Connection name" hint="Helps you identify it if a distributor has multiple Tally companies.">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mahalakshmi Trading — Mumbai Tally" autoFocus style={input} />
        </Field>

        <Field label="Tally company name" hint="Must match the company name in Tally exactly. The bridge agent uses this in SVCURRENTCOMPANY on every voucher.">
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Mahalakshmi Trading Company Pvt Ltd" style={input} />
        </Field>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 }}>
          Ledger mapping (the names must already exist in Tally)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Sales ledger">
            <input value={salesLedger} onChange={(e) => setSalesLedger(e.target.value)} style={input} />
          </Field>
          <Field label="Cash ledger">
            <input value={cashLedger} onChange={(e) => setCashLedger(e.target.value)} style={input} />
          </Field>
          <Field label="Bank ledger">
            <input value={bankLedger} onChange={(e) => setBankLedger(e.target.value)} style={input} />
          </Field>
          <Field label="CGST ledger">
            <input value={cgstLedger} onChange={(e) => setCgstLedger(e.target.value)} style={input} />
          </Field>
          <Field label="SGST ledger">
            <input value={sgstLedger} onChange={(e) => setSgstLedger(e.target.value)} style={input} />
          </Field>
          <Field label="IGST ledger">
            <input value={igstLedger} onChange={(e) => setIgstLedger(e.target.value)} style={input} />
          </Field>
          <Field label="Sales returns ledger (Credit Notes)">
            <input value={creditLedger} onChange={(e) => setCreditLedger(e.target.value)} style={input} />
          </Field>
        </div>

        <div style={{
          background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--text)',
        }}>
          💡 We&rsquo;ll generate a bridge-agent setup file on the next screen. Download it and run the Kinematic Tally Connector on the same Windows PC where Tally is open. Within 30 seconds the first invoices will land.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn} disabled={submitting}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={submitting}>{submitting ? 'Connecting…' : 'Connect'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────
function SuccessModal({ integration, onClose }: { integration: Integration; onClose: () => void }) {
  const cfg = integration.agent_config;

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error('Copy failed — select and copy manually'),
    );

  const downloadConfig = () => {
    if (!cfg) return;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kinematic-tally-config.json';
    a.click(); URL.revokeObjectURL(url);
    toast.success('Config downloaded');
  };

  return (
    <Modal onClose={onClose} title="✅ Tally connected" subtitle="Save the bridge-agent config now — the agent secret is only shown once.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Next: install the bridge agent on the Tally PC</div>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Download <code style={codeStyle}>kinematic-tally-config.json</code> below and save it to the same Windows PC where Tally runs.</li>
            <li>Install <strong>kinematic-tally-connector</strong> (instructions in its README) and place the config file next to it.</li>
            <li>Open Tally and load the company &ldquo;{(integration.config?.company_name as string) ?? '...'}&rdquo;.</li>
            <li>Start the connector. Within 30 seconds, any new Kinematic invoice / payment / return appears as a Tally voucher.</li>
          </ol>
        </div>

        <Field label="Bridge agent config (download)">
          <button onClick={downloadConfig} style={primaryBtn}>⬇ Download kinematic-tally-config.json</button>
        </Field>

        <Field label="Polling endpoint">
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={cfg?.polling_endpoint ?? ''} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
            <button onClick={() => copy(cfg?.polling_endpoint ?? '', 'Polling URL')} style={ghostBtn}>Copy</button>
          </div>
        </Field>

        <Field label="Agent secret (also embedded in the URL)">
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={integration.agent_secret ?? ''} readOnly style={{ ...input, fontFamily: 'monospace', fontSize: 11 }} />
            <button onClick={() => copy(integration.agent_secret ?? '', 'Agent secret')} style={ghostBtn}>Copy</button>
          </div>
        </Field>

        <div style={{
          background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)',
          borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--text)',
        }}>
          ⚠️ Anyone with this URL can submit fake voucher results to Kinematic. Keep the config file on the Tally PC only — don&rsquo;t share over email.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={primaryBtn}>I&rsquo;ve saved it</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Events log ────────────────────────────────────────────────────────────────
function EventsModal({ integration, onClose }: { integration: Integration; onClose: () => void }) {
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: IntegrationEvent[] }>(`${BASE}/${integration.id}/events?limit=100`);
        setEvents(r.data ?? []);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load events');
      } finally { setLoading(false); }
    })();
  }, [integration.id]);

  const downloadXml = (eventId: string) => {
    // GET with auth header — open in a new tab won't carry the JWT, so build a one-shot blob.
    api.get<string>(`${BASE}/events/${eventId}/xml`, { responseType: 'text' as any }).then(
      (xml) => {
        const blob = new Blob([xml as unknown as string], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${eventId}.tally.xml`;
        a.click(); URL.revokeObjectURL(url);
      },
      (e) => toast.error(e.message || 'XML download failed'),
    );
  };

  return (
    <Modal onClose={onClose} title={`Events — ${integration.label}`} subtitle="Last 100 sync jobs. Use Download XML for manual import into Tally when the bridge agent is offline.">
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>No events yet. The poller will pick up your next invoice / payment / return within 30 seconds.</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--s3)' }}>
                <th style={th}>When</th>
                <th style={th}>Kind</th>
                <th style={th}>Status</th>
                <th style={th}>Attempts</th>
                <th style={th}>Tally voucher</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const s = EVENT_STATUS_STYLES[e.status] ?? EVENT_STATUS_STYLES.pending;
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={td}>{e.kind}</td>
                    <td style={td}>
                      <span style={{ color: s.color, fontWeight: 700 }}>{s.label}</span>
                      {e.error && <div style={{ fontSize: 10, color: 'rgb(239, 68, 68)', marginTop: 2 }}>{e.error.slice(0, 120)}</div>}
                    </td>
                    <td style={td}>{e.attempts}</td>
                    <td style={td}>{e.tally_voucher_id ?? '—'}</td>
                    <td style={td}>
                      <button onClick={() => downloadXml(e.id)} style={miniBtn}>XML</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn}>Close</button>
      </div>
    </Modal>
  );
}

// ── Modal + tokens ────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Modal({ children, onClose, title, subtitle }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string;
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 14,
        maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto',
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: '100%', background: 'var(--s3)', border: '1px solid var(--border)',
  color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff',
  padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '9px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600,
};
const ghostBtnDanger: React.CSSProperties = {
  ...ghostBtn, color: 'rgb(239, 68, 68)', borderColor: 'rgba(239, 68, 68, 0.4)',
};
const miniBtn: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
};
const codeStyle: React.CSSProperties = {
  background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 10, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
const td: React.CSSProperties = {
  padding: '8px 10px', color: 'var(--text)',
};
