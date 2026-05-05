'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isSessionValid, clearSession, getRoleLabel } from '../../lib/auth';
import api from '../../lib/api';
import { ClientProvider, useClient } from '../../context/ClientContext';
import ClientSelect from '../../components/ClientSelect';
import { isCrmRoute, buildKiniContext } from '../../lib/kiniCrmContext';
import DealListCard from '../../components/crm/kini/DealListCard';
import LeadListCard from '../../components/crm/kini/LeadListCard';
import DraftEmailCard from '../../components/crm/kini/DraftEmailCard';
import SummaryCard from '../../components/crm/kini/SummaryCard';

function GlobalClientFilter({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const { selectedClientId, setSelectedClientId } = useClient();
  if (!isPlatformAdmin) return null;
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <ClientSelect
        value={selectedClientId}
        onChange={(id) => setSelectedClientId(id)}
        placeholder="Filter by Client..."
      />
    </div>
  );
}

const C = {
  bg: 'var(--bg)',
  side: 'var(--s1)',
  border: 'var(--border)',
  borderL: 'var(--border-l)',
  white: 'var(--text)',
  gray: 'var(--text-dim)',
  grayd: 'var(--text-dim)',
  red: 'var(--primary)',
  redD: 'rgba(224,30,44,0.12)',
  redB: 'rgba(224,30,44,0.2)',
  s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  green: 'var(--green)', blue: 'var(--accent)',
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

const QUICK = [
  'How many FEs are present today?',
  "Today's attendance summary",
  'Total active outlets',
  "Today's TFF numbers",
  "This week's performance",
  'Generate attendance report for today',
  'Top performers this week',
  'Zone-wise activity breakdown',
];

function md(text: string) {
  return text
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
  switch (card.type) {
    case 'deal_list':
      return <DealListCard title={card.title} deals={(card.data as any[]) || []} />;
    case 'lead_list':
      return <LeadListCard title={card.title} leads={(card.data as any[]) || []} />;
    case 'draft_email':
      return <DraftEmailCard subject={(card.data as any)?.subject} body={(card.data as any)?.body_text || (card.data as any)?.body_html} />;
    case 'summary':
    case 'next_best_action':
      return <SummaryCard title={card.title || (card.type === 'next_best_action' ? 'Next Best Action' : undefined)} summary={(card.data as any)?.summary || (card.data as any)?.action} highlights={(card.data as any)?.highlights || ((card.data as any)?.rationale ? [(card.data as any).rationale] : [])} />;
    default:
      return null;
  }
}

function KinematicAI({ token }: { token: string }) {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<any[]>([]);
  const [input,   setInput]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [live,    setLive]    = useState<Record<string,any>>({});
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

  // Only fetch live ops context when not in CRM mode (CRM has its own server-side context).
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

      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
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

// Tracks viewport width so the layout can switch between desktop sidebar
// and mobile drawer without re-renders on every resize tick.
function useIsMobile(breakpoint = 1024) {
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [token, setToken] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile(1024);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    setUser(u);
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('kinematic_token') || '');
    }
  }, [router]);

  const handleLogout = () => { clearSession(); router.push('/login'); };
  const userRole = user?.role || '';
  const userPerms = user?.permissions || [];
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  // On mobile the sidebar lives in a drawer overlay (not in the document flow),
  // so the main column gets zero left margin.
  const sideW = isMobile ? 0 : (collapsed ? 64 : 220);
  const drawerW = isMobile ? 240 : (collapsed ? 64 : 220);
  const sidebarVisible = isMobile ? drawerOpen : true;

  // Close drawer when navigation happens (pathname change)
  useEffect(() => { if (isMobile) setDrawerOpen(false); }, [pathname, isMobile]);

  const isPlatformAdmin = (() => {
    const role = (userRole || '').toLowerCase().trim().replace(/-/g, '_');
    const name = (user?.name || '').toLowerCase().trim();
    return ['super_admin', 'admin', 'main_admin', 'sub_admin', 'master_admin'].includes(role) ||
           role.includes('admin') ||
           name === 'sagar';
  })();

  const filterNav = (items: any[]) => {
    if (isPlatformAdmin) return items;
    return items.filter(i => !i.module || (userPerms && Array.isArray(userPerms) && userPerms.includes(i.module)));
  };

  const navGroups = [
    { label: 'Core', items: filterNav([
      { href: '/dashboard', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
      { href: '/dashboard/attendance-overview', label: 'Attendance', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', module: 'attendance' },
      { href: '/dashboard/analytics', label: 'Analytics', icon: 'M18 20V10 M12 20V4 M6 20v-6', module: 'analytics' },
      { href: '/dashboard/live-tracking', label: 'Live Tracking', icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z', module: 'live_tracking' },
    ])},
    { label: 'CRM', items: filterNav([
      { href: '/dashboard/crm/dashboard', label: 'Overview', icon: 'M3 3v18h18 M7 14l4-4 4 4 5-5', module: 'crm' },
      { href: '/dashboard/crm/leads', label: 'Leads', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z', module: 'crm' },
      { href: '/dashboard/crm/deals', label: 'Deals', icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', module: 'crm' },
      { href: '/dashboard/crm/pipeline', label: 'Pipeline', icon: 'M3 5h6v14H3z M9 9h6v6H9z M15 5h6v14h-6z', module: 'crm' },
      { href: '/dashboard/crm/accounts', label: 'Accounts', icon: 'M3 21h18 M3 7v14 M21 7v14 M3 7l9-4 9 4 M9 12h6', module: 'crm' },
      { href: '/dashboard/crm/contacts', label: 'Contacts', icon: 'M20 21v-2a4 4 0 00-3-3.87 M4 21v-2a4 4 0 014-4h4a4 4 0 014 4v2 M16 3.13a4 4 0 010 7.75 M8 11a4 4 0 100-8 4 4 0 000 8z', module: 'crm' },
      { href: '/dashboard/crm/activities', label: 'Activities', icon: 'M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3', module: 'crm' },
      { href: '/dashboard/crm/emails', label: 'Emails', icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6', module: 'crm' },
      { href: '/dashboard/crm/templates', label: 'Templates', icon: 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M3 9h18 M9 21V9', module: 'crm' },
      { href: '/dashboard/crm/campaigns', label: 'Campaigns', icon: 'M3 11l18-5v12L3 14v-3z M11.6 16.8a3 3 0 11-5.8-1.6', module: 'crm' },
      { href: '/dashboard/crm/reports', label: 'Reports', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8', module: 'crm' },
      { href: '/dashboard/crm/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z', module: 'crm' },
    ])},
    { label: 'Operations', items: filterNav([
      { href: '/dashboard/other-management/activities', label: 'Activity Management', icon: 'M12 2v20 M2 12h20', module: 'activities' },
      { href: '/dashboard/planograms', label: 'Planograms', icon: 'M3 5h18 M3 12h18 M3 19h18 M7 5v14 M17 5v14' },
      { href: '/dashboard/form-builder', label: 'Form Builder', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', module: 'form_builder' },
      { href: '/dashboard/route-plan', label: 'Route Plan', icon: 'M9 20l-5.44-2.72A2 2 0 013 15.49V4.5a2 2 0 012.89-1.8L9 4 M9 4v16 M15 1l5.44 2.72A2 2 0 0121 5.51v10.98a2 2 0 01-2.89 1.8L15 17 M15 1v16', module: 'orders' },
      { href: '/dashboard/work-activities', label: 'Work Activities', icon: 'M12 2v20 M2 12h20 M5 5l14 14 M19 5L5 14', module: 'work_activities' },
    ])},
    { label: 'Business', items: filterNav([
      { href: '/dashboard/clients', label: 'Clients', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z', module: 'clients' },
      { href: '/dashboard/warehouse', label: 'Warehouse', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'inventory' },
      { href: '/dashboard/other-management/assets', label: 'Assets', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', module: 'assets' },
      { href: '/dashboard/other-management/skus', label: 'SKU', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'skus' },
    ])},
    { label: 'Distribution', items: filterNav([
      { href: '/dashboard/distribution', label: 'Overview', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10', module: 'distribution' },
      { href: '/dashboard/distribution/brands', label: 'Brands', icon: 'M5 3a2 2 0 00-2 2v2a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z M5 11a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2H5z', module: 'distribution_brands' },
      { href: '/dashboard/distribution/distributors', label: 'Distributors', icon: 'M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4', module: 'distribution_distributors' },
      { href: '/dashboard/distribution/price-lists', label: 'Price Lists', icon: 'M9 7h6 M9 11h6 M9 15h4 M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2z', module: 'distribution_pricing' },
      { href: '/dashboard/distribution/schemes', label: 'Schemes', icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z', module: 'distribution_schemes' },
      { href: '/dashboard/distribution/orders', label: 'Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 12h6 M9 16h6', module: 'distribution_orders' },
      { href: '/dashboard/distribution/invoices', label: 'Invoices', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 13h6 M9 17h6', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/dispatches', label: 'Dispatches', icon: 'M3 6h18 M16 10l5 5-5 5 M21 15H3', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/payments', label: 'Payments', icon: 'M2 6h20v12H2z M2 10h20', module: 'distribution_payments' },
      { href: '/dashboard/distribution/returns', label: 'Returns', icon: 'M9 14l-4-4 4-4 M5 10h11a4 4 0 014 4v0a4 4 0 01-4 4h-3', module: 'distribution_returns' },
      { href: '/dashboard/distribution/ledger', label: 'Ledger', icon: 'M3 6l9-3 9 3 M5 6v15h14V6 M9 11h6 M9 15h6', module: 'distribution_ledger' },
      { href: '/dashboard/distribution/secondary-sales', label: 'Consumer', icon: 'M3 3h18v18H3z M3 9h18 M9 21V9', module: 'distribution_consumer' },
    ])},
    { label: 'People & Support', items: filterNav([
      { href: '/dashboard/manpower-directory', label: 'Users', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75', module: 'users' },
      { href: '/dashboard/grievances', label: 'Grievances', icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01', module: 'grievances' },
      { href: '/dashboard/visit-logs', label: 'Visit Logs', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', module: 'visit_logs' },
      { href: '/dashboard/broadcast', label: 'Broadcast', icon: 'M12 19V5 M5 12l7-7 7 7', module: 'broadcast' },
    ])},
    { label: 'System Management', items: filterNav([
      { href: '/dashboard/other-management/cities', label: 'Cities', icon: 'M3 21h18 M3 7v1a3 3 0 006 0V7m6 0v1a3 3 0 006 0V7', module: 'cities' },
      { href: '/dashboard/other-management/zones', label: 'Zones', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 10a3 3 0 100-6 3 3 0 000 6z', module: 'zones' },
      { href: '/dashboard/other-management/stores', label: 'Outlets', icon: 'M3 21h18 M9 8h10 M9 12h10 M9 16h10 M3 4h18', module: 'stores' },
      { href: '/dashboard/security-alerts', label: 'Security Alerts', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', module: 'live_tracking' },
      { href: '/dashboard/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z', module: 'settings' },
    ])},
  ];



  return (
    <ClientProvider>
      <div style={{ display:'flex', minHeight:'100vh', background:C.bg, color:C.white }}>
        {/* Mobile drawer scrim */}
        {isMobile && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:998,
          }}/>
        )}

        <aside style={{
          width: isMobile ? drawerW : sideW,
          background:C.side,
          borderRight:`1px solid ${C.border}`,
          position:'fixed', top:0, left:0, bottom:0,
          display:'flex', flexDirection:'column',
          transition:'transform .25s ease, width .2s',
          transform: sidebarVisible ? 'translateX(0)' : `translateX(-${drawerW}px)`,
          zIndex: isMobile ? 999 : 10,
          boxShadow: isMobile && drawerOpen ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
        }}>
          <div style={{ height:65, display:'flex', alignItems:'center', padding:'0 20px', borderBottom:`1px solid ${C.border}`, gap:12 }}>
            <img src="/logo-mark.png" alt="K" style={{ width:28, height:28, objectFit:'contain' }} />
            {(isMobile || !collapsed) && <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.5px' }}>Kinematic</span>}
          </div>

          <nav style={{ flex:1, padding:'15px 0', overflowY:'auto' }}>
            {navGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom:20 }}>
                {(isMobile || !collapsed) && <div style={{ padding:'0 20px', fontSize:10, color:C.grayd, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{g.label}</div>}
                {g.items.map((i:any) => (
                  <Link key={i.href} href={i.href}>
                    <div style={{ display:'flex', alignItems:'center', padding:'10px 20px', gap:12, color:isActive(i.href)?C.red:C.gray, background:isActive(i.href)?C.redD:'transparent', cursor:'pointer' }}>
                      <Icon d={i.icon} size={18} />
                      {(isMobile || !collapsed) && <span style={{ fontSize:14 }}>{i.label}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div style={{ padding:20, borderTop:`1px solid ${C.border}` }}>
            {(isMobile || !collapsed) && <div style={{ marginBottom:10, fontSize:12 }}>{user?.name || 'Admin'}</div>}
            <button onClick={handleLogout} style={{ width:'100%', padding:'10px', background:'transparent', border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, cursor:'pointer' }}>Sign Out</button>

            {/* DEFINITIVE DEPLOYMENT BADGE */}
            {user?.email === 'demo@kinematic.com' && (
              <div style={{ marginTop:15, padding:10, background:'rgba(255,59,48,0.1)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:8, textAlign:'center' }}>
                <div style={{ color:C.red, fontSize:9, fontWeight:900 }}>DEMO ACTIVE</div>
                <div style={{ fontSize:8, color:C.grayd }}>Stable Mock Intercept</div>
              </div>
            )}
          </div>
        </aside>

        <main style={{ marginLeft:sideW, flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <header style={{
            height:65, background:C.s1, borderBottom:`1px solid ${C.border}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding: isMobile ? '0 14px' : '0 25px', gap:10,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0, flex:1 }}>
              {isMobile && (
                <button
                  onClick={() => setDrawerOpen(o => !o)}
                  aria-label="Open menu"
                  style={{ background:'transparent', border:'none', color:C.white, cursor:'pointer', padding:6, display:'flex', alignItems:'center' }}
                >
                  <Icon d="M3 12h18 M3 6h18 M3 18h18" size={22} />
                </button>
              )}
              <span style={{ fontWeight:700, fontSize: isMobile ? 13 : 15, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {pathname.split('/').pop()?.toUpperCase() || 'DASHBOARD'}
              </span>
            </div>
            <GlobalClientFilter isPlatformAdmin={isPlatformAdmin} />
          </header>
          <div style={{ padding: isMobile ? 14 : 25, flex:1, minWidth:0 }}>{children}</div>
          <footer style={{ padding:15, borderTop:`1px solid ${C.border}`, textAlign:'center', fontSize:9, color:C.grayd }}>
            Kinematic Registry: STABLE-ENV | Interception Enabled
          </footer>
        </main>
        {token && <KinematicAI token={token} />}
      </div>
    </ClientProvider>
  );
}
