'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';
import { INDIA_STATES, parseGstinClient, stateName } from '../../../../lib/india';

interface BrandForm {
  name: string;
  code: string;
  legal_name: string;
  gstin: string;
  state_code: string;
  pan: string;
}

export default function BrandsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<BrandForm>({ name: '', code: '', legal_name: '', gstin: '', state_code: '', pan: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // GSTIN verify state
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const load = async () => {
    try { const r: any = await api.getBrands(); setItems(r?.data || r || []); } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ── Auto-derive state code on every GSTIN keystroke (client-side, instant)
  const onGstinChange = (raw: string) => {
    const g = raw.toUpperCase();
    setForm((f) => ({ ...f, gstin: g }));
    setVerifyMsg(null);
    const parsed = parseGstinClient(g);
    if (parsed.valid && parsed.state_code) {
      setForm((f) => ({ ...f, gstin: g, state_code: parsed.state_code!, pan: g.slice(2, 12) }));
    }
  };

  // ── Server-side verify (checksum + optional live business-name lookup)
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
        const detail =
          d.source === 'live'
            ? d.business_name ? ` · ${d.business_name}` : ''
            : ' · format & state OK (no live provider configured)';
        setVerifyMsg({ kind: 'ok', text: `Valid${detail}${d.status ? ` · ${d.status}` : ''}` });
      }
    } catch (e: any) {
      setVerifyMsg({ kind: 'err', text: e?.message || 'Verify failed' });
    }
    setVerifying(false);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body: any = { name: form.name, code: form.code };
      if (form.legal_name) body.legal_name = form.legal_name;
      if (form.gstin) body.gstin = form.gstin;
      if (form.state_code) body.state_code = form.state_code;
      if (form.pan) body.pan = form.pan;
      await api.createBrand(body);
      setShowForm(false);
      setForm({ name: '', code: '', legal_name: '', gstin: '', state_code: '', pan: '' });
      setVerifyMsg(null);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Brands" subtitle="Brand identities with GSTIN and place-of-supply" right={<Btn onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Brand'}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Field label="Brand Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Brand Code *" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
            <div style={{ gridColumn: 'span 2' }}>
              <Field label="Legal Name" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} />
            </div>

            {/* GSTIN with inline verify */}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>GSTIN</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.gstin}
                  onChange={(e) => onGstinChange(e.target.value)}
                  placeholder="27AAACA1234A1Z5"
                  style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}
                />
                <Btn variant="ghost" onClick={verify} disabled={verifying || form.gstin.length < 15}>
                  {verifying ? 'Verifying…' : 'Verify'}
                </Btn>
              </div>
              {verifyMsg && (
                <div style={{
                  marginTop: 6, fontSize: 12,
                  color: verifyMsg.kind === 'ok' ? 'var(--green)' : verifyMsg.kind === 'warn' ? '#F59E0B' : 'var(--primary)',
                }}>
                  {verifyMsg.kind === 'ok' ? '✓ ' : verifyMsg.kind === 'warn' ? '⚠ ' : '✗ '}{verifyMsg.text}
                </div>
              )}
            </div>

            {/* State dropdown — auto-filled from GSTIN[0..2] when entered */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                State {form.state_code && <span style={{ color: 'var(--green)', textTransform: 'none', letterSpacing: 0 }}>· {stateName(form.state_code)}</span>}
              </div>
              <select
                value={form.state_code}
                onChange={(e) => setForm({ ...form, state_code: e.target.value })}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}
              >
                <option value="">— Select state —</option>
                {INDIA_STATES.filter((s) => s.is_active).map((s) => (
                  <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>PAN</div>
              <input
                value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}
              />
            </div>
          </div>

          {err && <div style={{ marginTop: 10, color: 'var(--primary)', fontSize: 12 }}>{err}</div>}

          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setVerifyMsg(null); }}>Cancel</Btn>
            <Btn disabled={busy || !form.name || !form.code} onClick={submit}>{busy ? 'Saving…' : 'Create Brand'}</Btn>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Brand</Th><Th>Code</Th><Th>GSTIN</Th><Th>State</Th><Th>Status</Th><Th>Created</Th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr>
            ) : items.map((b) => (
              <tr key={b.id}>
                <Td style={{ fontWeight: 700 }}>{b.name}</Td>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{b.code}</Td>
                <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{b.gstin || '—'}</Td>
                <Td>{b.state_code ? `${b.state_code} · ${stateName(b.state_code) || ''}` : '—'}</Td>
                <Td><Pill color={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'active' : 'inactive'}</Pill></Td>
                <Td>{fmtDate(b.created_at)}</Td>
              </tr>
            ))}
            {!loading && !items.length && <tr><Td colSpan={6 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No brands yet.</Td></tr>}
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
