'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr } from '../../../../components/distribution/Atoms';
import { INDIA_STATES, parseGstinClient, stateName } from '../../../../lib/india';
import PrefetchLink from '../../../../components/PrefetchLink';

interface DistForm {
  name: string;
  code: string;
  legal_name: string;
  gstin: string;
  state_code: string;
  pan: string;
  region: string;
  customer_class: string;
  credit_limit: string;
  payment_terms_days: string;
}

const INIT: DistForm = { name: '', code: '', legal_name: '', gstin: '', state_code: '', pan: '', region: '', customer_class: 'distributor', credit_limit: '0', payment_terms_days: '0' };

export default function DistributorsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DistForm>(INIT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const load = async () => {
    try { const r: any = await api.getDistributors(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onGstinChange = (raw: string) => {
    const g = raw.toUpperCase();
    setForm((f) => ({ ...f, gstin: g }));
    setVerifyMsg(null);
    const parsed = parseGstinClient(g);
    if (parsed.valid && parsed.state_code) {
      setForm((f) => ({ ...f, gstin: g, state_code: parsed.state_code!, pan: g.slice(2, 12) }));
    }
  };

  const verify = async () => {
    if (!form.gstin) return;
    setVerifying(true); setVerifyMsg(null);
    try {
      const r: any = await api.verifyGstin(form.gstin);
      const d = r?.data || r;
      if (!d?.valid) {
        setVerifyMsg({ kind: 'err', text: d?.reason === 'checksum' ? 'GSTIN checksum invalid' : d?.reason === 'unknown_state' ? `Unknown state code: ${d?.state_code}` : 'GSTIN format invalid' });
      } else {
        setForm((f) => ({
          ...f,
          state_code: d.state_code || f.state_code,
          pan: d.pan || f.pan,
          legal_name: f.legal_name || d.legal_name || d.business_name || '',
          name: f.name || d.trade_name || d.business_name || '',
        }));
        const detail = d.source === 'live' ? (d.business_name ? ` · ${d.business_name}` : '') : ' · format & state OK (no live provider configured)';
        setVerifyMsg({ kind: 'ok', text: `Valid${detail}${d.status ? ` · ${d.status}` : ''}` });
      }
    } catch (e: any) { setVerifyMsg({ kind: 'err', text: e?.message || 'Verify failed' }); }
    setVerifying(false);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: any = {
        name: form.name, code: form.code,
        customer_class: form.customer_class,
        credit_limit: Number(form.credit_limit) || 0,
        payment_terms_days: parseInt(form.payment_terms_days) || 0,
      };
      if (form.legal_name) body.legal_name = form.legal_name;
      if (form.gstin) body.gstin = form.gstin;
      if (form.pan) body.pan = form.pan;
      if (form.state_code) {
        body.state_code = form.state_code;
        body.place_of_supply = form.state_code; // default place_of_supply = own state
      }
      if (form.region) body.region = form.region;
      await api.createDistributor(body);
      setShowForm(false); setForm(INIT); setVerifyMsg(null);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  // Soft-delete via PATCH is_active=false; preserves outlets, orders, ledger entries
  // that already reference this distributor. Hard-delete intentionally not exposed.
  const remove = async (id: string, name: string) => {
    if (!confirm(`Deactivate distributor "${name}"?\n\nOpen orders and ledger history are preserved. New orders cannot be placed against this distributor.`)) return;
    try {
      await api.updateDistributor(id, { is_active: false });
      await load();
    } catch (e: any) { alert(`Could not deactivate: ${e.message}`); }
  };

  const reactivate = async (id: string, name: string) => {
    if (!confirm(`Reactivate "${name}"?`)) return;
    try {
      await api.updateDistributor(id, { is_active: true });
      await load();
    } catch (e: any) { alert(`Could not reactivate: ${e.message}`); }
  };

  return (
    <div>
      <PageHeader title="Distributors" subtitle="Stockists, distributors, wholesalers" right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Distributor'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Field label="Name *"          value={form.name}        onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Code *"          value={form.code}        onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <div style={{ gridColumn: 'span 2' }}>
              <Field label="Legal Name"    value={form.legal_name}  onChange={(v) => setForm({ ...form, legal_name: v })} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>GSTIN</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.gstin}
                  onChange={(e) => onGstinChange(e.target.value)}
                  placeholder="27AABCM1234M1ZQ"
                  style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}
                />
                <Btn variant="ghost" onClick={verify} disabled={verifying || form.gstin.length < 15}>{verifying ? 'Verifying…' : 'Verify'}</Btn>
              </div>
              {verifyMsg && (
                <div style={{ marginTop: 6, fontSize: 12, color: verifyMsg.kind === 'ok' ? 'var(--green)' : verifyMsg.kind === 'warn' ? '#F59E0B' : 'var(--primary)' }}>
                  {verifyMsg.kind === 'ok' ? '✓ ' : verifyMsg.kind === 'warn' ? '⚠ ' : '✗ '}{verifyMsg.text}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                State {form.state_code && <span style={{ color: 'var(--green)', textTransform: 'none', letterSpacing: 0 }}>· {stateName(form.state_code)}</span>}
              </div>
              <select value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value })} style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
                <option value="">— Select state —</option>
                {INDIA_STATES.filter((s) => s.is_active).map((s) => (<option key={s.code} value={s.code}>{s.code} · {s.name}</option>))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>PAN</div>
              <input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }} />
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer Class</div>
              <select value={form.customer_class} onChange={(e) => setForm({ ...form, customer_class: e.target.value })}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
                <option value="super_stockist">super_stockist</option>
                <option value="distributor">distributor</option>
                <option value="wholesaler">wholesaler</option>
              </select>
            </div>

            <Field label="Region"          value={form.region}             onChange={(v) => setForm({ ...form, region: v })} />
            <Field label="Credit Limit (₹)"     value={form.credit_limit}        onChange={(v) => setForm({ ...form, credit_limit: v })} />
            <Field label="Payment Terms (days)" value={form.payment_terms_days}  onChange={(v) => setForm({ ...form, payment_terms_days: v })} />
          </div>

          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}

          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setVerifyMsg(null); }}>Cancel</Btn>
            <Btn disabled={busy || !form.name || !form.code} onClick={submit}>{busy ? 'Saving…' : 'Create Distributor'}</Btn>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Distributor</Th><Th>Code</Th><Th>GSTIN</Th><Th>State</Th><Th>Class</Th><Th style={{ textAlign: 'right' }}>Credit Limit</Th><Th>Status</Th><Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((d) => (
                <tr key={d.id}>
                  <Td style={{ fontWeight: 700 }}><PrefetchLink
                        href={`/dashboard/distribution/distributors/${d.id}`}
                        prefetch={() => api.getDistributor(d.id)}
                        style={{ color: 'var(--text)' }}>{d.name}</PrefetchLink></Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{d.code}</Td>
                  <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{d.gstin || '—'}</Td>
                  <Td>{d.state_code ? `${d.state_code} · ${stateName(d.state_code) || ''}` : '—'}</Td>
                  <Td>{d.customer_class || '—'}</Td>
                  <Td style={{ textAlign: 'right' }}>{inr(d.credit_limit)}</Td>
                  <Td><Pill color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'active' : 'inactive'}</Pill></Td>
                  <Td style={{ textAlign: 'right' }}>
                    {d.is_active
                      ? <Btn variant="danger" onClick={() => remove(d.id, d.name)}>Delete</Btn>
                      : <Btn variant="ghost"  onClick={() => reactivate(d.id, d.name)}>Reactivate</Btn>}
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
      />
    </div>
  );
}
