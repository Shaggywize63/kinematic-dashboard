'use client';
/**
 * KINI AI chat — extracted from dashboard/layout.tsx so it can be imported
 * via `next/dynamic({ ssr: false })`. Keeps the chat code (and its lazy deps
 * like the markdown helpers + KiniCardRenderer) out of the main dashboard
 * bundle for ~250ms TBT win on first paint.
 *
 * Mounted by layout.tsx; fetches its own live-ops context lazily when opened.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { isCrmRoute, buildKiniContext } from '../lib/kiniCrmContext';
import DealListCard from './crm/kini/DealListCard';
import LeadListCard from './crm/kini/LeadListCard';
import DraftEmailCard from './crm/kini/DraftEmailCard';
import SummaryCard from './crm/kini/SummaryCard';

const C = {
  border: 'var(--border)',
  white: 'var(--text)',
  grayd: 'var(--text-dim)',
  red: 'var(--primary)',
  s3: 'var(--s3)',
  green: 'var(--green)',
  blue: 'var(--accent)',
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function md(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`(.*?)`/g,'<code style="background:#131B2A;padding:1px 6px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>')
    .replace(/^### (.*)/gm,'<div style="font-family:\'Syne\',sans-serif;font-size:13px;font-weight:800;color:#E8EDF8;margin:10px 0 3px">$1</div>')
    .replace(/^## (.*)/gm, '<div style="font-family:\'Syne\',sans-serif;font-size:14px;font-weight:800;color:#E8EDF8;margin:12px 0 4px">$1</div>')
    .replace(/^- (.*)/gm,  '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:#E01E2C">•</span><span>$1</span></div>')
    .replace(/\n/g,'<br/>');
}

function KiniCardRenderer({ card }: { card: any }) {
  if (!card || !card.type) return null;
  const d = card.data;
  const asArray = (v: unknown): any[] => Array.isArray(v) ? v : [];
  switch (card.type) {
    case 'deal_list':
      return <DealListCard title={d?.title ?? card.title} deals={asArray(d?.deals ?? d)} />;
    case 'lead_list':
      return <LeadListCard title={d?.title ?? card.title} leads={asArray(d?.leads ?? d)} />;
    case 'draft_email':
      return <DraftEmailCard subject={d?.subject} body={d?.body_text || d?.body_html} />;
    case 'summary':
    case 'next_best_action':
      return (
        <SummaryCard
          title={card.title || (card.type === 'next_best_action' ? 'Next Best Action' : undefined)}
          summary={d?.text || d?.summary || d?.action}
          highlights={d?.highlights || (d?.rationale ? [d.rationale] : [])}
        />
      );
    default:
      return null;
  }
}

export default function KinematicAI({ token }: { token: string }) {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<any[]>([]);
  const [input,   setInput]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [live,    setLive]    = useState<Record<string, any>>({});
  const [ready,   setReady]   = useState(false);
  const endRef  = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const inCrm = isCrmRoute(pathname || '');

  const fetchLive = useCallback(async () => {
    try {
      const hdrs = { Authorization: `Bearer ${token}` };
      const [a, l, s, w] = await Promise.allSettled([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/attendance/summary`, { headers: hdrs }).then(r => r.json()),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/live-tracking/locations`, { headers: hdrs }).then(r => r.json()),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/summary`, { headers: hdrs }).then(r => r.json()),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/performance/weekly`, { headers: hdrs }).then(r => r.json())
      ]);
      const ctx: any = {};
      if (a.status === 'fulfilled') ctx.att = a.value?.data || a.value;
      if (l.status === 'fulfilled') ctx.locs = l.value?.data || l.value;
      if (s.status === 'fulfilled') ctx.summ = s.value?.data || s.value;
      if (w.status === 'fulfilled') ctx.week = w.value?.data || w.value;
      setLive(ctx);
      setReady(true);
    } catch (e) { console.error('AI Data Context Error:', e); }
  }, [token]);

  useEffect(() => { if (open && !ready && !inCrm) fetchLive(); }, [open, ready, fetchLive, inCrm]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener('km-open-ai', h);
    return () => window.removeEventListener('km-open-ai', h);
  }, []);

  const sys = () => {
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (inCrm) {
      return `You are Kini AI — the CRM copilot for the Kinematic platform.
Today: ${today}
Current Route: ${pathname}

You can call CRM tools to fetch leads, deals, accounts, contacts, activities, run analytics, draft replies, score leads, and predict win probability. When data is returned, render structured cards (deal_list, lead_list, draft_email, summary, next_best_action) so the user sees real records rather than raw JSON. Be proactive: suggest the next best action, flag stalled deals, and surface high-score leads. Use **bold** for metrics.`;
    }
    const att = live.att?.data || live.att?.summary || {};
    const locs = live.locs?.data?.locations || live.locs?.locations || [];
    const week = live.week?.data || live.week || {};
    const summ = live.summ?.data || live.summ || {};
    const fes = locs.filter((l: any) => l.status === 'active');

    return `You are Kini AI — premium operations assistant for the Kinematic field force platform.
Current Context: User is viewing ${pathname}
Today: ${today}

## LIVE OPERATIONS DATA
### Attendance Summary
- Total FEs: ${att.total || '0'}
- Present: ${att.present || '0'}
- On Break: ${att.on_break || '0'}
- Absent: ${att.absent || '0'}

### Active Field Force (${fes.length})
${fes.slice(0, 10).map((f: any) => `- ${f.name} (${f.zone_name || 'Global'}) · ${f.status}`).join('\n') || '- No active FEs currently.'}

### Performance Metrics
- Today Total TFF: ${summ.total_tff || 0}
- Weekly TFF Trend: ${(week.days || []).map((d: any) => `${d.short_label}:${d.tff}`).join(', ') || 'Processing...'}

Be elite, professional, and data-driven. Use **bold** for key metrics. Proactively suggest optimizations. If the user is on the Form Builder page, offer help in designing logical audits or surveys.`;
  };

  const send = async (text?: string) => {
    const q = (text || input).trim(); if (!q || busy) return;
    setInput('');
    const um = { role: 'user', content: q };
    const lm = { role: 'assistant', content: '', loading: true };
    setMsgs(p => [...p, um, lm]); setBusy(true);
    try {
      let userOrgId: string | null = null;
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
        userOrgId = raw ? JSON.parse(raw)?.org_id ?? null : null;
      } catch {}

      const endpoint = inCrm ? '/api/v1/crm/ai/chat' : '/api/v1/ai/chat';
      const body: any = {
        messages: [...msgs.filter(m => !m.loading), um].slice(-6),
        system: sys(),
      };
      if (inCrm) body.context = buildKiniContext(pathname || '', userOrgId);

      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      if (userOrgId) headers['X-Org-Id'] = userOrgId;

      try {
        const sel = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_client') : null;
        if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
          headers['X-Client-Id'] = sel;
        }
      } catch { /* ignore */ }

      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const d = await r.json();
      const reply = d?.data?.text || 'I apologize, but I am unable to process that right now.';
      const cards = d?.data?.cards || [];
      setMsgs(p => p.map((m, i) => i === p.length - 1 ? { role: 'assistant', content: reply, cards } : m));
    } catch (e: any) {
      setMsgs(p => p.map((m, i) => i === p.length - 1 ? { role: 'assistant', content: `Connectivity Error: ${e.message}` } : m));
    } finally { setBusy(false); }
  };

  return (
    <>
      <style>{`
        @keyframes km-ai-pulse { 0% { box-shadow: 0 0 0 0 rgba(224,30,44,0.4); } 70% { box-shadow: 0 0 0 15px rgba(224,30,44,0); } 100% { box-shadow: 0 0 0 0 rgba(224,30,44,0); } }
        @keyframes km-ai-shimmer { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 30, right: 30, zIndex: 1000, width: 60, height: 60, borderRadius: '22px',
          background: open ? C.s3 : `linear-gradient(135deg, ${C.red}, #FF4D4D)`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? 'none' : '0 10px 30px rgba(224,30,44,0.4)', cursor: 'pointer', border: 'none',
          animation: !open ? 'km-ai-pulse 2s infinite' : 'none', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
        <span style={{ fontSize: 24, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{open ? '✕' : '✦'}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 105, right: 30, zIndex: 999, width: 420, height: 620,
          background: 'rgba(26,27,30,0.85)', backdropFilter: 'blur(24px)', border: `1px solid ${C.blue}20`,
          borderRadius: 32, display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)', overflow: 'hidden', animation: 'km-ai-slide .4s ease-out'
        }}>
          <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
             <div>
               <div style={{ fontWeight: 900, color: C.white, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 10px ${C.green}` }} />
                  Kini AI {inCrm && <span style={{ fontSize: 10, color: C.blue, fontWeight: 800, marginLeft: 4, letterSpacing: 1 }}>· CRM</span>}
               </div>
                <div style={{ fontSize: 10, color: C.blue, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>{inCrm ? 'CRM Copilot' : 'Operations Assistant'}</div>
             </div>
             <button onClick={() => setMsgs([])} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.grayd, fontSize: 10, cursor: 'pointer', padding: '6px 12px', borderRadius: 10, fontWeight: 700 }}>Reset Cache</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, scrollBehavior: 'smooth' }}>
            {msgs.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 140 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{inCrm ? 'How can I help close more deals?' : 'How can I optimize your operations?'}</div>
                <div style={{ color: C.grayd, fontSize: 13, maxWidth: 280, margin: '0 auto', lineHeight: 1.5 }}>{inCrm ? 'Ask about leads, pipeline, forecasts, or have me draft emails and suggest next actions.' : 'I have access to your live attendance, performance data, and field activities.'}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '12px 18px', borderRadius: 20, fontSize: 14, lineHeight: 1.6, maxWidth: '85%',
                  background: m.role === 'user' ? `linear-gradient(135deg, ${C.red}, ${C.red}DD)` : 'rgba(255,255,255,0.05)',
                  color: C.white, border: m.role === 'user' ? 'none' : `1px solid rgba(255,255,255,0.05)`,
                  boxShadow: m.role === 'user' ? '0 10px 20px rgba(224,30,44,0.15)' : 'none',
                  animation: m.loading ? 'km-ai-shimmer 1.5s infinite' : 'none'
                }}>
                  {m.loading ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.white }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.white, opacity: 0.6 }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.white, opacity: 0.3 }} />
                    </div>
                  ) : (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: md(m.content) }} className="km-chat-content" />
                      {Array.isArray(m.cards) && m.cards.map((c: any, idx: number) => <KiniCardRenderer key={idx} card={c} />)}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div style={{ padding: '20px 24px', background: 'rgba(0,0,0,0.2)', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 12 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={busy}
              style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 20px', color: C.white, fontSize: 14, outline: 'none', transition: 'all 0.2s' }}
              placeholder={inCrm ? 'Ask about leads, deals, forecasts...' : 'Ask anything about operations...'}
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              style={{ background: C.red, border: 'none', borderRadius: 16, width: 48, height: 48, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}>
              <Icon d="M5 12h14M12 5l7 7-7 7" size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
