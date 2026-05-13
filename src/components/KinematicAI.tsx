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

// All colours come from CSS vars so the panel adapts to whichever theme
// is active (dark by default, [data-theme="light"] flips them).
const C = {
  border: 'var(--border)',
  white:  'var(--text)',
  grayd:  'var(--text-dim)',
  red:    'var(--primary)',
  s1:     'var(--s1)',
  s2:     'var(--s2)',
  s3:     'var(--s3)',
  green:  'var(--green)',
  blue:   'var(--accent)',
};

// Small hook so the panel can react to the viewport (sheet-style on phones,
// floating card on desktop).
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// Web Speech API recogniser. Returns helpers + the `listening` flag.
// Falls back to a no-op when the browser doesn't support it (Firefox stable,
// Safari iOS < 14). The mic button hides itself in that case.
function useSpeechRecognition({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) onResult(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.abort(); } catch { /* */ } };
  // onResult is stable per chat instance; intentionally not in deps to avoid
  // tearing down the recogniser on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    if (!recRef.current || listening) return;
    try { recRef.current.start(); setListening(true); } catch { /* already running */ }
  }, [listening]);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch { /* */ }
  }, []);

  return { listening, supported, start, stop };
}

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
  const isMobile = useIsMobile();
  // Voice mode — transcribes a single utterance, drops it into the input, and
  // auto-sends so the user can dictate "log a meeting with vikram about
  // pricing" without typing.
  const speech = useSpeechRecognition({
    onResult: (transcript) => {
      setInput('');
      // Slight delay so React commits the empty input before send() reads
      // the new transcript; avoids racing with input state.
      setTimeout(() => { void send(transcript); }, 30);
    },
  });

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

  // Sheet (mobile) vs floating card (desktop). On mobile the panel anchors
  // to the bottom of the viewport and fills the width, so it never overflows
  // off-screen.
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0,
        width: '100%', height: '85dvh', maxHeight: '90vh',
        background: C.s2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', zIndex: 999,
        boxShadow: '0 -20px 60px rgba(0,0,0,0.35)',
        animation: 'km-ai-slide-up .25s ease-out',
      }
    : {
        position: 'fixed', bottom: 105, right: 30, zIndex: 999,
        width: 420, height: 620, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 140px)',
        background: C.s2, border: `1px solid ${C.border}`,
        borderRadius: 24, display: 'flex', flexDirection: 'column',
        boxShadow: '0 40px 100px rgba(0,0,0,0.35)', overflow: 'hidden',
        animation: 'km-ai-slide-up .25s ease-out',
      };

  return (
    <>
      <style>{`
        @keyframes km-ai-pulse  { 0% { box-shadow: 0 0 0 0 rgba(224,30,44,0.45); } 70% { box-shadow: 0 0 0 16px rgba(224,30,44,0); } 100% { box-shadow: 0 0 0 0 rgba(224,30,44,0); } }
        @keyframes km-ai-shimmer { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        @keyframes km-ai-slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes km-mic-pulse  { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.18); opacity: 0.7; } }
      `}</style>

      {/* Backdrop scrim on mobile so taps outside dismiss the sheet */}
      {open && isMobile && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 998,
          animation: 'km-ai-slide-up .25s ease-out',
        }} />
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open Kini AI"
        style={{
          position: 'fixed',
          bottom: isMobile ? 20 : 30, right: isMobile ? 20 : 30,
          zIndex: 1000, width: 60, height: 60, borderRadius: 22,
          background: open ? C.s3 : `linear-gradient(135deg, ${C.red}, #FF4D4D)`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? 'none' : '0 10px 30px rgba(224,30,44,0.4)',
          cursor: 'pointer', border: 'none',
          animation: !open ? 'km-ai-pulse 2s infinite' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
        <span style={{ fontSize: 24, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{open ? '✕' : '✦'}</span>
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Gradient header — gives the panel its 'product surface' look in
              both themes by using the brand red gradient as the only saturated
              element. */}
          <div style={{
            padding: '16px 20px',
            background: `linear-gradient(120deg, ${C.red} 0%, #FF4D4D 70%, ${C.blue} 130%)`,
            color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>✦</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, fontFamily: 'var(--font-manrope, inherit)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Kini AI {inCrm && <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.18)', padding: '2px 8px', borderRadius: 999, fontWeight: 800, letterSpacing: 0.6 }}>CRM</span>}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2 }}>
                  {inCrm ? 'Agentic CRM Copilot' : 'Operations Assistant'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setMsgs([])}
              title="Clear conversation"
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontWeight: 700 }}
            >Clear</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, scrollBehavior: 'smooth', background: C.s1 }}>
            {msgs.length === 0 && (
              <EmptyState inCrm={inCrm} onTry={(t) => { setInput(t); }} />
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '11px 16px', borderRadius: 18,
                  fontSize: 14, lineHeight: 1.55, maxWidth: '88%',
                  background: m.role === 'user'
                    ? `linear-gradient(135deg, ${C.red}, #FF4D4D)`
                    : C.s2,
                  color: m.role === 'user' ? '#fff' : C.white,
                  border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
                  boxShadow: m.role === 'user' ? '0 6px 16px rgba(224,30,44,0.18)' : 'none',
                  animation: m.loading ? 'km-ai-shimmer 1.5s infinite' : 'none',
                }}>
                  {m.loading ? (
                    <div style={{ display: 'flex', gap: 4, padding: '4px 2px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd, opacity: 0.6 }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd, opacity: 0.3 }} />
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

          <div style={{
            padding: '14px 16px', background: C.s2, borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void send()}
              disabled={busy}
              style={{
                flex: 1, background: C.s3, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '12px 16px', color: C.white, fontSize: 14,
                outline: 'none', transition: 'border-color 0.2s',
                minWidth: 0, // critical: lets the flex item shrink below its content
              }}
              placeholder={speech.listening ? 'Listening…' : (inCrm ? 'Ask, or "add deal", "log call"…' : 'Ask anything about operations…')}
            />

            {speech.supported && (
              <button
                onClick={() => speech.listening ? speech.stop() : speech.start()}
                disabled={busy}
                title={speech.listening ? 'Stop listening' : 'Speak'}
                aria-label="Voice input"
                style={{
                  background: speech.listening ? C.red : C.s3,
                  border: `1px solid ${speech.listening ? C.red : C.border}`,
                  borderRadius: 14, width: 44, height: 44,
                  color: speech.listening ? '#fff' : C.white,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  animation: speech.listening ? 'km-mic-pulse 1.2s infinite' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <Icon d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8" size={18} />
              </button>
            )}

            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              title="Send"
              aria-label="Send"
              style={{
                background: C.red, border: 'none', borderRadius: 14,
                width: 44, height: 44, color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: busy || !input.trim() ? 0.5 : 1,
                flexShrink: 0, transition: 'opacity 0.2s',
              }}>
              <Icon d="M5 12h14M12 5l7 7-7 7" size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({ inCrm, onTry }: { inCrm: boolean; onTry: (text: string) => void }) {
  const suggestions = inCrm ? [
    'Show my hottest 5 leads',
    'What deals are closing this week?',
    'Add lead Rahul Sharma from Acme Steel',
    'Log a meeting with Vikram about pricing',
  ] : [
    'How many FEs are present today?',
    'Today\'s attendance summary',
    'Top performers this week',
  ];
  return (
    <div style={{ textAlign: 'center', marginTop: 'min(40px, 8vh)', padding: '0 16px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
      <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 17, marginBottom: 6, fontFamily: 'var(--font-manrope, inherit)' }}>
        {inCrm ? 'How can I help close more deals?' : 'How can I help right now?'}
      </div>
      <div style={{ color: 'var(--text-dim)', fontSize: 13, maxWidth: 320, margin: '0 auto 14px', lineHeight: 1.5 }}>
        {inCrm
          ? 'Ask about your pipeline, or tell me to log activities, add leads, and create deals — voice works too.'
          : 'I can pull live ops data and answer questions.'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 360, margin: '0 auto' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onTry(s)}
            style={{
              background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >{s}</button>
        ))}
      </div>
    </div>
  );
}
