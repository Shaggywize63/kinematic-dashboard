'use client';
/**
 * CRM → Campaigns → Settings — compliance + cost controls for WhatsApp
 * broadcasts (Phase 2). Frequency cap, quiet-hours send window, opt-out
 * keywords, and per-message cost rates. Wired to /api/v1/crm/broadcasts/settings.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { crmBroadcasts, type BroadcastSettings, type BroadcastSuppression } from '../../../../../lib/crmApi';
import { getStoredUser } from '../../../../../lib/auth';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 16 };
const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '9px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 };

const numOrNull = (s: string): number | null => { const n = Number(s.replace(/[^0-9]/g, '')); return s.trim() === '' ? null : (Number.isFinite(n) ? n : null); };

export default function CampaignSettingsPage() {
  const [f, setF] = useState({
    frequency_cap_max: '', frequency_cap_window_days: '7',
    quiet_hours_start: '', quiet_hours_end: '', quiet_hours_tz: 'Asia/Kolkata',
    opt_out_keywords: '', reply_creates_task: true,
    rate_marketing_in: '', rate_utility_in: '', rate_auth_in: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [supp, setSupp] = useState<BroadcastSuppression[]>([]);
  const [newNumbers, setNewNumbers] = useState('');

  const user = typeof window !== 'undefined' ? getStoredUser() : null;
  const role = (user?.role || '').toLowerCase();
  const isSuper = role === 'super_admin';

  const load = useCallback(async () => {
    try {
      const r = await crmBroadcasts.getSettings();
      const s = r.data;
      if (s) setF((p) => ({
        ...p,
        frequency_cap_max: s.frequency_cap_max != null ? String(s.frequency_cap_max) : '',
        frequency_cap_window_days: String(s.frequency_cap_window_days ?? 7),
        quiet_hours_start: s.quiet_hours_start != null ? String(s.quiet_hours_start) : '',
        quiet_hours_end: s.quiet_hours_end != null ? String(s.quiet_hours_end) : '',
        quiet_hours_tz: s.quiet_hours_tz || 'Asia/Kolkata',
        opt_out_keywords: (s.opt_out_keywords || []).join(', '),
        reply_creates_task: s.reply_creates_task !== false,
        rate_marketing_in: s.cost_rates?.marketing?.IN != null ? String(s.cost_rates.marketing.IN) : '',
        rate_utility_in: s.cost_rates?.utility?.IN != null ? String(s.cost_rates.utility.IN) : '',
        rate_auth_in: s.cost_rates?.authentication?.IN != null ? String(s.cost_rates.authentication.IN) : '',
      }));
    } catch { /* none yet / no access */ }
    finally { setLoading(false); }
  }, []);
  const loadSupp = useCallback(async () => {
    try { const r = await crmBroadcasts.listSuppressions({ limit: 500 }); setSupp(r.data ?? []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); loadSupp(); }, [load, loadSupp]);

  const addNumbers = async () => {
    const phones = newNumbers.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!phones.length) return;
    try { await crmBroadcasts.addSuppressions({ phones }); setNewNumbers(''); loadSupp(); setMsg({ ok: true, text: `Added ${phones.length} number(s) to the suppression list.` }); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not add numbers' }); }
  };
  const removeNumber = async (sid: string) => {
    try { await crmBroadcasts.removeSuppression(sid); setSupp((rs) => rs.filter((r) => r.id !== sid)); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Remove failed' }); }
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const keywords = f.opt_out_keywords.split(',').map((s) => s.trim()).filter(Boolean);
      const rates: BroadcastSettings['cost_rates'] = {};
      const addRate = (cat: string, v: string) => { const n = Number(v); if (v.trim() !== '' && Number.isFinite(n)) (rates as any)[cat] = { IN: n }; };
      addRate('marketing', f.rate_marketing_in); addRate('utility', f.rate_utility_in); addRate('authentication', f.rate_auth_in);
      const body: Partial<BroadcastSettings> = {
        frequency_cap_max: numOrNull(f.frequency_cap_max),
        frequency_cap_window_days: Number(f.frequency_cap_window_days || '7'),
        quiet_hours_start: numOrNull(f.quiet_hours_start),
        quiet_hours_end: numOrNull(f.quiet_hours_end),
        quiet_hours_tz: f.quiet_hours_tz || 'Asia/Kolkata',
        opt_out_keywords: keywords.length ? keywords : null,
        cost_rates: Object.keys(rates).length ? rates : null,
        reply_creates_task: f.reply_creates_task,
      };
      await crmBroadcasts.putSettings(body);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 60, maxWidth: 760 }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/dashboard/crm/campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Campaigns</Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '6px 0 0' }}>Campaign settings</h1>
      </div>

      {loading ? <div style={{ ...card, color: C.gray, fontSize: 13 }}>Loading…</div> : (
        <>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: C.blue }}>Frequency cap</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Suppress a lead who has already received this many broadcasts within the window. Leave blank for no cap.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><span style={label}>Max sends / lead</span><input value={f.frequency_cap_max} onChange={(e) => setF({ ...f, frequency_cap_max: e.target.value })} placeholder="e.g. 2" style={input} /></div>
              <div><span style={label}>Window (days)</span><input value={f.frequency_cap_window_days} onChange={(e) => setF({ ...f, frequency_cap_window_days: e.target.value })} style={input} /></div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: C.blue }}>Quiet hours</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Only send inside this window (24h clock, in the timezone below). Sends outside it are held, not dropped. Leave blank to send any time.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div><span style={label}>Open hour (0–23)</span><input value={f.quiet_hours_start} onChange={(e) => setF({ ...f, quiet_hours_start: e.target.value })} placeholder="9" style={input} /></div>
              <div><span style={label}>Close hour (0–23)</span><input value={f.quiet_hours_end} onChange={(e) => setF({ ...f, quiet_hours_end: e.target.value })} placeholder="21" style={input} /></div>
              <div><span style={label}>Timezone</span><input value={f.quiet_hours_tz} onChange={(e) => setF({ ...f, quiet_hours_tz: e.target.value })} placeholder="Asia/Kolkata" style={input} /></div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: C.blue }}>Replies</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Keywords that withdraw consent (and suppress the lead) when they reply. Blank = built-in defaults (STOP, UNSUBSCRIBE, …).</div>
            <input value={f.opt_out_keywords} onChange={(e) => setF({ ...f, opt_out_keywords: e.target.value })} placeholder="stop, unsubscribe, cancel" style={input} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.gray, cursor: 'pointer', marginTop: 14 }}>
              <input type="checkbox" checked={f.reply_creates_task} onChange={(e) => setF({ ...f, reply_creates_task: e.target.checked })} style={{ accentColor: C.green }} />
              When a lead replies to a campaign, create a follow-up task for their owner
            </label>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: C.blue }}>Suppression list</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Numbers here are never messaged by any campaign, on top of consent checks. Opt-outs land here automatically. Paste numbers (comma / space / newline separated).</div>
            <textarea value={newNumbers} onChange={(e) => setNewNumbers(e.target.value)} placeholder="+919876543210, +919812345678" rows={2} style={{ ...input, resize: 'vertical' }} />
            <div style={{ marginTop: 10, marginBottom: 12 }}>
              <button onClick={addNumbers} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add to list</button>
            </div>
            {supp.length === 0 ? (
              <div style={{ fontSize: 12, color: C.grayd }}>No suppressed numbers.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {supp.map((s) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.white, background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px' }}>
                    {s.phone_digits}{s.reason ? <span style={{ color: C.grayd }}>· {s.reason}</span> : null}
                    <button onClick={() => removeNumber(s.id)} style={{ background: 'none', border: 'none', color: C.grayd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: C.blue }}>Cost rates (India, per message)</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Used for the pre-send cost estimate and billed-so-far. Enter your negotiated per-message rates in ₹. Leave blank to use indicative defaults.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div><span style={label}>Marketing</span><input value={f.rate_marketing_in} onChange={(e) => setF({ ...f, rate_marketing_in: e.target.value })} placeholder="0.78" style={input} /></div>
              <div><span style={label}>Utility</span><input value={f.rate_utility_in} onChange={(e) => setF({ ...f, rate_utility_in: e.target.value })} placeholder="0.16" style={input} /></div>
              <div><span style={label}>Authentication</span><input value={f.rate_auth_in} onChange={(e) => setF({ ...f, rate_auth_in: e.target.value })} placeholder="0.13" style={input} /></div>
            </div>
          </div>

          {msg && <div style={{ ...card, padding: '12px 16px', background: msg.ok ? 'rgba(0,217,126,0.10)' : 'rgba(224,30,44,0.10)', borderColor: msg.ok ? 'rgba(0,217,126,0.3)' : 'rgba(224,30,44,0.3)', color: msg.ok ? C.green : C.red, fontSize: 13 }}>{msg.text}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save settings'}</button>
            {isSuper && <Link href="/dashboard/settings/whatsapp-campaigns" style={{ color: C.blue, fontSize: 13, textDecoration: 'none' }}>Manage access (super-admin) →</Link>}
          </div>
        </>
      )}
    </div>
  );
}
