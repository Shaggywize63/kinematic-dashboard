'use client';
/**
 * Settings → WhatsApp — connect this tenant's WhatsApp Business account so
 * Kinematic can send (automations, templates, and the upcoming broadcasts) from
 * the client's own number. Supports all three connection paths: Cloud API,
 * a BSP, or an existing WABA (same fields as whichever it's on).
 * Wired to /api/v1/crm/whatsapp/connection (+ /test, /templates/sync).
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../../../../lib/api';

type ConnType = 'cloud_api' | 'bsp';
type Conn = {
  connection_type: ConnType;
  bsp_name: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  from_phone: string | null;
  display_name: string | null;
  bsp_base_url: string | null;
  opt_in_purposes: string[];
  is_active: boolean;
  verify_status: string | null;
  last_verified_at: string | null;
  has_access_token: boolean;
  has_bsp_api_key: boolean;
};

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 };
const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '9px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 };
const BSPS = ['360dialog', 'Gupshup', 'Interakt', 'WATI', 'AiSensy', 'Other'];

export default function WhatsappSettingsPage() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [f, setF] = useState({
    connection_type: 'cloud_api' as ConnType,
    bsp_name: '360dialog',
    phone_number_id: '', waba_id: '', from_phone: '', display_name: '', bsp_base_url: '',
    access_token: '', bsp_api_key: '',
    opt_in_purposes: 'whatsapp, marketing',
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/api/v1/crm/whatsapp/connection');
      const c: Conn | null = r?.data ?? r ?? null;
      setConn(c);
      if (c) setF((prev) => ({
        ...prev,
        connection_type: c.connection_type,
        bsp_name: c.bsp_name || '360dialog',
        phone_number_id: c.phone_number_id || '',
        waba_id: c.waba_id || '',
        from_phone: c.from_phone || '',
        display_name: c.display_name || '',
        bsp_base_url: c.bsp_base_url || '',
        opt_in_purposes: (c.opt_in_purposes || ['whatsapp', 'marketing']).join(', '),
        is_active: c.is_active,
        access_token: '', bsp_api_key: '',
      }));
    } catch { /* not configured yet, or no access */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        connection_type: f.connection_type,
        from_phone: f.from_phone || null,
        display_name: f.display_name || null,
        opt_in_purposes: f.opt_in_purposes.split(',').map((s) => s.trim()).filter(Boolean),
        is_active: f.is_active,
      };
      if (f.connection_type === 'cloud_api') {
        payload.phone_number_id = f.phone_number_id || null;
        payload.waba_id = f.waba_id || null;
        if (f.access_token) payload.access_token = f.access_token; // omit → keep stored
      } else {
        payload.bsp_name = f.bsp_name || null;
        payload.bsp_base_url = f.bsp_base_url || null;
        payload.phone_number_id = f.phone_number_id || null; // some BSPs use it too
        if (f.bsp_api_key) payload.bsp_api_key = f.bsp_api_key;
      }
      await api.put('/api/v1/crm/whatsapp/connection', payload);
      setMsg({ ok: true, text: 'Saved. Run a connection test to verify.' });
      setF((p) => ({ ...p, access_token: '', bsp_api_key: '' }));
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const r: any = await api.post('/api/v1/crm/whatsapp/connection/test', {});
      const d = r?.data ?? r;
      setMsg({ ok: !!d?.ok, text: d?.detail || (d?.ok ? 'Connected.' : 'Test failed.') });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Test failed' }); }
    finally { setTesting(false); }
  };

  const sync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const r: any = await api.post('/api/v1/crm/whatsapp/templates/sync', {});
      const d = r?.data ?? r;
      setMsg({ ok: true, text: `Synced ${d?.synced ?? 0} template(s) from Meta.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Template sync failed' }); }
    finally { setSyncing(false); }
  };

  const cloud = f.connection_type === 'cloud_api';

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 40, maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/dashboard/settings" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Settings</a>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '6px 0 4px' }}>WhatsApp Business</h1>
        <p style={{ color: C.gray, fontSize: 13, margin: 0, maxWidth: 640 }}>
          Connect this organisation&apos;s WhatsApp number so Kinematic can send messages, templates, and broadcasts from it. Connect via a <b style={{ color: C.white }}>BSP</b>, the <b style={{ color: C.white }}>Direct Cloud API</b>, or your <b style={{ color: C.white }}>existing WhatsApp Business account</b> — enter whichever credentials you have.
        </p>
      </div>

      {conn && (
        <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: C.gray }}>Status:</span>
          <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 6,
            color: conn.verify_status === 'ok' ? C.green : conn.verify_status === 'failed' ? C.red : C.gray,
            background: conn.verify_status === 'ok' ? 'rgba(0,217,126,0.12)' : conn.verify_status === 'failed' ? 'rgba(224,30,44,0.12)' : 'var(--s4)',
            border: `1px solid ${C.border}` }}>
            {conn.verify_status === 'ok' ? 'VERIFIED' : conn.verify_status === 'failed' ? 'FAILED' : conn.verify_status ? conn.verify_status.toUpperCase() : 'NOT TESTED'}
          </span>
          {!conn.is_active && <span style={{ fontSize: 11, color: C.grayd }}>· inactive</span>}
          {conn.last_verified_at && <span style={{ fontSize: 11, color: C.grayd }}>· last checked {new Date(conn.last_verified_at).toLocaleString()}</span>}
        </div>
      )}

      <div style={card}>
        {loading ? <div style={{ color: C.gray, fontSize: 13 }}>Loading…</div> : (
          <>
            <span style={label}>Connection type</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {(['cloud_api', 'bsp'] as ConnType[]).map((t) => (
                <button key={t} onClick={() => setF({ ...f, connection_type: t })}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: f.connection_type === t ? C.s4 : 'transparent', color: f.connection_type === t ? C.white : C.gray,
                    border: `1px solid ${f.connection_type === t ? C.blue : C.border}` }}>
                  {t === 'cloud_api' ? 'Direct Cloud API / existing WABA' : 'BSP (Gupshup, Interakt…)'}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {cloud ? (
                <>
                  <div><span style={label}>Phone Number ID</span><input value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })} style={input} /></div>
                  <div><span style={label}>WABA ID</span><input value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} style={input} /></div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={label}>Permanent access token {conn?.has_access_token && <span style={{ color: C.green, textTransform: 'none' }}>· saved</span>}</span>
                    <input type="password" value={f.access_token} onChange={(e) => setF({ ...f, access_token: e.target.value })} placeholder={conn?.has_access_token ? '•••••••• (leave blank to keep)' : 'System-user token'} style={{ ...input, fontFamily: 'monospace' }} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span style={label}>BSP</span>
                    <select value={f.bsp_name} onChange={(e) => setF({ ...f, bsp_name: e.target.value })} style={input}>
                      {BSPS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div><span style={label}>Sender / Phone Number ID <span style={{ color: C.grayd, textTransform: 'none' }}>(optional)</span></span><input value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })} style={input} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={label}>BSP API base URL</span><input value={f.bsp_base_url} onChange={(e) => setF({ ...f, bsp_base_url: e.target.value })} placeholder="https://waba-v2.360dialog.io" style={input} /></div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={label}>BSP API key {conn?.has_bsp_api_key && <span style={{ color: C.green, textTransform: 'none' }}>· saved</span>}</span>
                    <input type="password" value={f.bsp_api_key} onChange={(e) => setF({ ...f, bsp_api_key: e.target.value })} placeholder={conn?.has_bsp_api_key ? '•••••••• (leave blank to keep)' : 'API key'} style={{ ...input, fontFamily: 'monospace' }} />
                  </div>
                </>
              )}
              <div><span style={label}>From number <span style={{ color: C.grayd, textTransform: 'none' }}>(E.164)</span></span><input value={f.from_phone} onChange={(e) => setF({ ...f, from_phone: e.target.value })} placeholder="+919876543210" style={input} /></div>
              <div><span style={label}>Display name</span><input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} style={input} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={label}>Opt-in consent purposes <span style={{ color: C.grayd, textTransform: 'none' }}>(comma-separated — only leads consenting to these get broadcasts)</span></span>
                <input value={f.opt_in_purposes} onChange={(e) => setF({ ...f, opt_in_purposes: e.target.value })} placeholder="whatsapp, marketing" style={input} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.gray, cursor: 'pointer', marginTop: 16 }}>
              <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} style={{ accentColor: C.green }} />
              Active (uncheck to pause all WhatsApp sending for this org)
            </label>

            {msg && <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, fontSize: 13, background: msg.ok ? 'rgba(0,217,126,0.10)' : 'rgba(224,30,44,0.10)', border: `1px solid ${msg.ok ? 'rgba(0,217,126,0.3)' : 'rgba(224,30,44,0.3)'}`, color: msg.ok ? C.green : C.red }}>{msg.text}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <button onClick={save} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save connection'}</button>
              <button onClick={test} disabled={testing || !conn} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: testing || !conn ? 'not-allowed' : 'pointer' }}>{testing ? 'Testing…' : 'Test connection'}</button>
              {cloud && <button onClick={sync} disabled={syncing || !conn} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: syncing || !conn ? 'not-allowed' : 'pointer' }}>{syncing ? 'Syncing…' : 'Sync templates from Meta'}</button>}
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 12, color: C.gray, marginTop: 14, lineHeight: 1.6 }}>
        Secrets are encrypted at rest and never shown again — leave a token field blank to keep the saved value. Message sending stays inert until a connection is saved and active.
      </div>
    </div>
  );
}
