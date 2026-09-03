'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, StatCard, Row, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { waLink } from '../../../../lib/whatsapp';

/**
 * Consumer Capture — per-outlet QR / link generator.
 *
 * Automates the previously-manual secondary/consumer capture: mint a token per
 * outlet, print its QR (or share its wa.me link), and consumers self-register at
 * the public /s/[token] page (→ tertiary sale + CRM lead). This page manages the
 * tokens and shows a live feed of QR-sourced registrations.
 */

interface OutletRow {
  outlet_id: string;
  outlet_name: string;
  capture_token: string | null;
  capture_active: boolean;
}
interface QrReg {
  id: string; consumer_phone: string; consumer_name: string | null;
  registered_via: string; lead_id: string | null; registered_at: string;
}
interface CaptureField {
  key: string; label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'select' | 'product';
  enabled: boolean; required: boolean; builtin: boolean; options?: string[];
}
const FIELD_TYPES: Array<{ v: CaptureField['type']; l: string }> = [
  { v: 'text', l: 'Text' }, { v: 'number', l: 'Number' }, { v: 'email', l: 'Email' },
  { v: 'tel', l: 'Phone' }, { v: 'select', l: 'Dropdown' },
];
// Canonical built-ins (map to registration columns). Always present so an admin
// can re-enable one they previously turned off.
const BUILTIN_DEFS: CaptureField[] = [
  { key: 'consumer_name', label: 'Your name', type: 'text', enabled: true, required: false, builtin: true },
  { key: 'sku_id', label: 'Which product did you buy?', type: 'product', enabled: true, required: false, builtin: true },
  { key: 'vehicle_reg', label: 'Vehicle / serial', type: 'text', enabled: true, required: false, builtin: true },
  { key: 'consumer_email', label: 'Email', type: 'email', enabled: false, required: false, builtin: true },
];
function normalizeFields(loaded: CaptureField[]): CaptureField[] {
  const have = new Set(loaded.map((f) => f.key));
  const missing = BUILTIN_DEFS.filter((b) => !have.has(b.key)).map((b) => ({ ...b, enabled: false }));
  return [...loaded, ...missing];
}

const outletVal = (r: OutletRow, key: string): unknown => {
  switch (key) {
    case 'outlet': return r.outlet_name;
    case 'status': return r.capture_active ? 2 : (r.capture_token ? 1 : 0);
    default: return (r as unknown as Record<string, unknown>)[key];
  }
};

export default function ConsumerCapturePage() {
  const [rows, setRows] = useState<OutletRow[]>([]);
  const [regs, setRegs] = useState<QrReg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  const [modal, setModal] = useState<OutletRow | null>(null);
  const modalCanvasRef = useRef<HTMLDivElement | null>(null);
  const [fields, setFields] = useState<CaptureField[]>([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgBusy, setCfgBusy] = useState(false);

  const { sorted, sort, toggle } = useTableSort<OutletRow>(rows, outletVal, { key: 'outlet', dir: 'asc' });

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const captureUrl = (token: string | null) => (token && origin ? `${origin}/s/${token}` : '');

  const load = async () => {
    setLoading(true);
    try {
      const [o, r, c] = await Promise.all([
        api.getCaptureOutlets(),
        api.getConsumerRegistrations({ registered_via: 'qr' }),
        api.getCaptureConfig(),
      ]);
      setRows(((o as any)?.data || o || []) as OutletRow[]);
      setRegs((((r as any)?.data || r || []) as QrReg[]).slice(0, 25));
      setFields(normalizeFields(((c as any)?.data?.fields || (c as any)?.fields || []) as CaptureField[]));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load outlets');
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.capture_active).length;
    const noLink = rows.filter((r) => !r.capture_token).length;
    return { total, active, noLink };
  }, [rows]);

  const activeRows = useMemo(() => rows.filter((r) => r.capture_token && r.capture_active), [rows]);

  const mint = async (r: OutletRow, rotate = false) => {
    setBusyId(r.outlet_id);
    try {
      await api.mintCaptureToken(r.outlet_id, rotate);
      toast.success(rotate ? 'New QR generated (old one stops working).' : 'Capture link is live.');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    setBusyId(null);
  };
  const disable = async (r: OutletRow) => {
    setBusyId(r.outlet_id);
    try {
      await api.deactivateCaptureToken(r.outlet_id);
      toast.success('Capture link disabled.');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    setBusyId(null);
  };
  const mintAll = async () => {
    setBulkBusy(true);
    try {
      const res: any = await api.mintAllCaptureTokens();
      const d = res?.data || res;
      toast.success(d?.minted ? `Generated ${d.minted} new link(s).` : 'Every outlet already has a link.');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    setBulkBusy(false);
  };

  // ── form-builder helpers ──
  const updateField = (i: number, patch: Partial<CaptureField>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const moveField = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const c = fs.slice(); [c[i], c[j]] = [c[j], c[i]]; return c;
    });
  const removeField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i));
  const addCustomField = () =>
    setFields((fs) => [...fs, {
      key: `cf_${Date.now().toString(36)}`, label: 'New field', type: 'text',
      enabled: true, required: false, builtin: false, options: [],
    }]);
  const saveConfig = async () => {
    for (const f of fields) {
      if (!f.label.trim()) { toast.error('Every field needs a label.'); return; }
      if (f.type === 'select' && !(f.options && f.options.filter((o) => o.trim()).length)) {
        toast.error(`Dropdown "${f.label}" needs at least one option.`); return;
      }
    }
    setCfgBusy(true);
    try {
      const clean = fields.map((f) => ({
        ...f,
        label: f.label.trim(),
        options: f.type === 'select' ? (f.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
      }));
      await api.saveCaptureConfig(clean);
      toast.success('Capture form saved. Every outlet QR uses it.');
    } catch (e: any) { toast.error(e?.message || 'Failed to save form'); }
    setCfgBusy(false);
  };

  const copyLink = (token: string | null) => {
    const url = captureUrl(token);
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => toast.success('Link copied.'), () => toast.error('Copy failed'));
  };
  const shareWa = (r: OutletRow) => {
    const url = captureUrl(r.capture_token);
    if (!url) return;
    const msg = `Register your purchase from ${r.outlet_name} for offers & support: ${url}`;
    window.open(waLink('', msg), '_blank');
  };
  const downloadPng = () => {
    const canvas = modalCanvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas || !modal) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-${modal.outlet_name.replace(/[^a-z0-9]+/gi, '-')}.png`;
    a.click();
  };

  return (
    <div>
      <PageHeader
        title="Consumer Capture"
        subtitle="Give each outlet a QR / link. Customers scan and self-register their purchase — each becomes a tertiary sale + a CRM lead automatically."
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard/distribution/last-mile" style={btnLink}>Last-mile ↗</Link>
            <Btn variant="ghost" onClick={() => window.print()}>Print QR pack</Btn>
            <Btn disabled={bulkBusy} onClick={mintAll}>{bulkBusy ? 'Generating…' : 'Generate for all outlets'}</Btn>
          </div>
        }
      />

      <Row style={{ marginBottom: 18 }}>
        <StatCard label="Outlets" value={stats.total} />
        <StatCard label="Active links" value={stats.active} accent="var(--green)" />
        <StatCard label="No link yet" value={stats.noLink} hint="Generate to activate" />
        <StatCard label="QR registrations" value={regs.length} hint="most recent shown below" />
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Capture form</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Choose which fields the QR page asks for, relabel them, or add your own. Phone is always asked. Applies to every outlet.
            </div>
          </div>
          <Btn variant="ghost" onClick={() => setCfgOpen((o) => !o)}>{cfgOpen ? 'Close' : 'Customize fields'}</Btn>
        </div>

        {cfgOpen && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', border: '1px dashed var(--border)', borderRadius: 8, opacity: 0.75 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Mobile number</span>
                <Pill color="blue">always asked</Pill>
                <Pill color="amber">required</Pill>
              </div>
              {fields.map((f, i) => (
                <div key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--s2)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} style={arrowBtn}>▲</button>
                    <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} style={arrowBtn}>▼</button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <input type="checkbox" checked={f.enabled} onChange={(e) => updateField(i, { enabled: e.target.checked })} /> Show
                  </label>
                  <input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="Field label"
                    style={{ ...cfgInput, flex: 1, minWidth: 140 }} />
                  {f.builtin ? (
                    <Pill color="gray">{f.type === 'product' ? 'product' : 'built-in'}</Pill>
                  ) : (
                    <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as CaptureField['type'] })} style={{ ...cfgInput, width: 110 }}>
                      {FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                  )}
                  {f.type === 'select' && (
                    <input
                      value={(f.options || []).join(', ')}
                      onChange={(e) => updateField(i, { options: e.target.value.split(',').map((s) => s.replace(/^\s+|\s+$/g, '')) })}
                      placeholder="Option A, Option B, …"
                      style={{ ...cfgInput, flex: 1, minWidth: 160 }} />
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} /> Required
                  </label>
                  {!f.builtin && (
                    <button onClick={() => removeField(i)} title="Remove field" style={{ ...arrowBtn, color: 'var(--primary)', height: 'auto', padding: '4px 8px' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn variant="ghost" onClick={addCustomField}>+ Add custom field</Btn>
              <Btn disabled={cfgBusy} onClick={saveConfig}>{cfgBusy ? 'Saving…' : 'Save form'}</Btn>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead><tr>
              <Th><SortLabel label="Outlet" sortKey="outlet" sort={sort} onToggle={toggle} /></Th>
              <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
              <Th style={{ textAlign: 'right' }}>Actions</Th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={3 as any}>Loading…</Td></tr>
              ) : sorted.length === 0 ? (
                <tr><Td colSpan={3 as any} style={{ padding: 0, borderBottom: 'none' }}>
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🏪</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>No outlets yet</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 440, margin: '0 auto' }}>
                      Add your retail outlets (Distributors &rarr; Outlets), then generate a QR / link for each so customers can self-register their purchase &mdash; every scan becomes a tertiary sale and a CRM lead.
                    </div>
                  </div>
                </Td></tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.outlet_id}>
                    <Td>{r.outlet_name}</Td>
                    <Td>
                      {r.capture_active
                        ? <Pill color="green">Active</Pill>
                        : r.capture_token ? <Pill color="amber">Disabled</Pill> : <Pill color="gray">No link</Pill>}
                    </Td>
                    <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.capture_token ? (
                        <>
                          <MiniBtn onClick={() => setModal(r)} disabled={busyId === r.outlet_id}>QR &amp; link</MiniBtn>
                          {r.capture_active
                            ? <MiniBtn onClick={() => disable(r)} disabled={busyId === r.outlet_id}>Disable</MiniBtn>
                            : <MiniBtn onClick={() => mint(r)} disabled={busyId === r.outlet_id}>Enable</MiniBtn>}
                        </>
                      ) : (
                        <MiniBtn primary onClick={() => mint(r)} disabled={busyId === r.outlet_id}>
                          {busyId === r.outlet_id ? 'Generating…' : 'Generate link'}
                        </MiniBtn>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Recent QR registrations</div>
        {regs.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0 }}>
            None yet. Print an outlet&rsquo;s QR (or share its link) and registrations will appear here.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr><Th>Consumer</Th><Th>Phone</Th><Th>Lead</Th><Th>When</Th></tr></thead>
              <tbody>
                {regs.map((g) => (
                  <tr key={g.id}>
                    <Td>{g.consumer_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}</Td>
                    <Td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{g.consumer_phone}</Td>
                    <Td>{g.lead_id
                      ? <Link href={`/dashboard/crm/leads/${g.lead_id}`} style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>View lead ↗</Link>
                      : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(g.registered_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Per-outlet QR modal */}
      {modal && modal.capture_token && (
        <div onClick={() => setModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(6,14,11,0.55)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16,
            padding: 24, width: '100%', maxWidth: 380, textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{modal.outlet_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Scan to register a purchase</div>
            <div ref={modalCanvasRef} style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block' }}>
              <QRCodeCanvas value={captureUrl(modal.capture_token)} size={220} level="M" includeMargin={false} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', wordBreak: 'break-all', margin: '14px 0 16px' }}>
              {captureUrl(modal.capture_token)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <MiniBtn onClick={() => copyLink(modal.capture_token)}>Copy link</MiniBtn>
              <MiniBtn onClick={() => shareWa(modal)}>Share on WhatsApp</MiniBtn>
              <MiniBtn onClick={downloadPng}>Download PNG</MiniBtn>
              <MiniBtn onClick={() => mint(modal, true)}>Rotate</MiniBtn>
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Printable QR pack — hidden on screen, shown on print. */}
      <style>{`
        .qr-pack { display: none; }
        @media print {
          body * { visibility: hidden; }
          .qr-pack, .qr-pack * { visibility: visible; }
          .qr-pack { display: block; position: absolute; inset: 0; padding: 12px; }
        }
      `}</style>
      <div className="qr-pack">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {activeRows.map((r) => (
            <div key={r.outlet_id} style={{ width: 200, border: '1px solid #ddd', borderRadius: 10, padding: 12, textAlign: 'center', color: '#000', pageBreakInside: 'avoid' }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>{r.outlet_name}</div>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>Scan to register your purchase</div>
              <QRCodeCanvas value={captureUrl(r.capture_token)} size={150} level="M" includeMargin={false} />
              <div style={{ fontSize: 9, color: '#0E7C66', fontWeight: 700, marginTop: 8 }}>Kinematic</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? 'var(--primary)' : 'var(--s3)',
      color: primary ? '#fff' : 'var(--text)',
      border: primary ? 'none' : '1px solid var(--border)',
      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
      marginLeft: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

const btnLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
};

const arrowBtn: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  fontSize: 9, lineHeight: 1, height: 15, padding: '0 5px', borderRadius: 4, cursor: 'pointer',
};

const cfgInput: React.CSSProperties = {
  background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
};
