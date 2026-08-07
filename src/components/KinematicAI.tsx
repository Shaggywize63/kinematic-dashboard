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
import KiniMascot from './crm/KiniMascot';
import DealListCard from './crm/kini/DealListCard';
import LeadListCard from './crm/kini/LeadListCard';
import DraftEmailCard from './crm/kini/DraftEmailCard';
import SummaryCard from './crm/kini/SummaryCard';
import { getStoredProjectKey, DEFAULT_PROJECT } from '../lib/projects';

// KINI's chat + live-ops calls use raw fetch (they need the raw Response for the
// v2→v1 (403) fallback and 429 handling), so they must replicate the api
// client's multi-project header. WITHOUT X-Kinematic-Project the backend
// verifies the bearer token against the DEFAULT (Tata) project and 401s any
// user on another project (e.g. the Kinematic tenant) — which silently broke
// KINI for them. Mirror api.ts: send the header for non-default projects only.
function kiniAuthHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  try {
    const project = getStoredProjectKey();
    if (project && project !== DEFAULT_PROJECT) h['X-Kinematic-Project'] = project;
  } catch { /* ignore */ }
  return h;
}

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
// floating card on desktop). 768px catches phones in landscape + tablets in
// portrait so neither falls into the cramped desktop layout.
function useIsMobile(breakpoint = 768) {
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

// Tracks the visual viewport height so the chat panel resizes when the
// mobile keyboard opens. Without this, the input field disappears behind
// the keyboard on iOS Safari. visualViewport is supported on every
// modern mobile browser; falls back to window.innerHeight when missing.
function useVisualViewportHeight(active: boolean): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    if (!active || typeof window === 'undefined') { setH(null); return; }
    const vv: any = (window as any).visualViewport;
    const update = () => setH(vv ? vv.height : window.innerHeight);
    update();
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active]);
  return h;
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

// Line-aware markdown → HTML. Handles GitHub-style tables (previously the model's
// `| col | col |` output rendered as raw piped text with <br/>, i.e. "distorted"),
// headers, bullets, and inline bold/italic/code. All colours are theme vars so
// the output is legible in both light and dark.
function mdInline(s: string) {
  return escapeHtml(s)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--s3);padding:1px 6px;border-radius:4px;font-size:11px;font-family:monospace">$1</code>');
}
function md(text: string) {
  const lines = String(text).split('\n');
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string) => /\|/.test(l) && /-/.test(l) && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Table: a header row immediately followed by a |---|---| separator.
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i]) && !isSep(lines[i])) { rows.push(cells(lines[i])); i++; }
      const th = header.map(h => `<th style="text-align:left;padding:7px 11px;font-size:10.5px;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:var(--text-dim);white-space:nowrap">${mdInline(h)}</th>`).join('');
      const body = rows.map((r, ri) => `<tr style="${ri % 2 ? 'background:var(--s1)' : ''}">` + r.map(c => `<td style="padding:7px 11px;font-size:12.5px;color:var(--text);border-top:1px solid var(--border);vertical-align:top">${mdInline(c)}</td>`).join('') + '</tr>').join('');
      out.push(`<div style="overflow-x:auto;margin:9px 0;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--s3)">${th}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (/^### /.test(line)) { out.push(`<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--text);margin:10px 0 3px">${mdInline(line.slice(4))}</div>`); i++; continue; }
    if (/^## /.test(line))  { out.push(`<div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--text);margin:12px 0 4px">${mdInline(line.slice(3))}</div>`); i++; continue; }
    if (/^[-*] /.test(line)) { out.push(`<div style="display:flex;gap:7px;margin:3px 0"><span style="color:#E01E2C;font-weight:800">•</span><span>${mdInline(line.slice(2))}</span></div>`); i++; continue; }
    if (line.trim() === '') { out.push('<div style="height:6px"></div>'); i++; continue; }
    out.push(`<div style="margin:2px 0">${mdInline(line)}</div>`);
    i++;
  }
  return out.join('');
}

/**
 * Defense-in-depth strip applied after md(). md() already HTML-escapes
 * its input before re-injecting a fixed tag set, so injected raw HTML
 * from a model response can't reach the DOM under normal conditions —
 * but this catch-all paranoia layer kills the worst-case if a future
 * md() change ever forgets to escape:
 *   - any `on*="..."` event-handler attributes
 *   - any `javascript:` URI
 *   - any <script>/<iframe>/<object>/<embed> tag
 * Plus a CSP (set in next.config.mjs) forbids inline event handlers
 * even if one slips through.
 */
function sanitizeMdHtml(html: string): string {
  return String(html)
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, 'javascript-blocked:');
}

// `onAction` lets a card fire a natural-language prompt back into the chat
// (wired to send() at the call site) so each result card can drive the next
// step of the agent loop — e.g. "Draft a follow-up email to <lead>".
function KiniCardRenderer({ card, onAction }: { card: any; onAction?: (prompt: string) => void }) {
  if (!card || !card.type) return null;
  const d = card.data;
  const asArray = (v: unknown): any[] => Array.isArray(v) ? v : [];
  switch (card.type) {
    case 'deal_list':
      return <DealListCard title={d?.title ?? card.title} deals={asArray(d?.deals ?? d)} onAction={onAction} />;
    case 'lead_list':
      return <LeadListCard title={d?.title ?? card.title} leads={asArray(d?.leads ?? d)} onAction={onAction} />;
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
  // Pulls the visual-viewport height so the panel re-sizes when the soft
  // keyboard opens — only active when the chat is open + on mobile.
  const vvh = useVisualViewportHeight(open && isMobile);
  // Track monthly KINI usage. Server returns it on every chat response and
  // also exposes a GET /crm/ai/usage endpoint we hit on open so the badge
  // is accurate before the first message.
  const [usage, setUsage] = useState<{ used: number; cap: number; remaining: number; exempt?: boolean } | null>(null);
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

  // Lock body scroll when the mobile sheet is open so the page underneath
  // doesn't rubber-band behind the panel on iOS.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, isMobile]);

  const fetchLive = useCallback(async () => {
    try {
      const hdrs = kiniAuthHeaders(token);
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

  // Refresh usage on open so the badge in the header is current. Best-effort:
  // hide the indicator on failure rather than block the chat.
  useEffect(() => {
    if (!open) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/ai/usage`, {
      headers: kiniAuthHeaders(token),
    }).then(r => r.json()).then(d => {
      const u = d?.data ?? d;
      if (u && typeof u.used === 'number') setUsage(u);
    }).catch(() => {});
  }, [open, token]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  // A query handed off from the global smart search (⌘/Ctrl-K → "Ask KINI").
  // Stashed here so we auto-send it only AFTER the panel has opened, with the
  // current render's `send` closure (avoids a stale-state send).
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent).detail?.query;
      if (typeof q === 'string' && q.trim()) setPendingQuery(q.trim());
    };
    window.addEventListener('km-open-ai', h);
    return () => window.removeEventListener('km-open-ai', h);
  }, []);
  useEffect(() => {
    if (!open || !pendingQuery) return;
    const q = pendingQuery;
    // Let the panel mount/focus first, then fire the query as a normal turn.
    // IMPORTANT: pendingQuery is cleared INSIDE the timer, not synchronously —
    // clearing it here re-ran this effect and its cleanup cancelled the very
    // timer that would have sent the query, so the search→KINI hand-off opened
    // the panel without ever asking the question.
    const t = setTimeout(() => { setPendingQuery(null); send(q); }, 80);
    return () => clearTimeout(t);
    // `send` is intentionally not a dep — the effect runs post-render with the
    // current closure; adding it would re-fire on every keystroke-driven render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingQuery]);

  const sys = () => {
    // Explicit IST formatting + a directive so KINI never replies with UTC
    // timestamps. Earlier builds let the model pick the time zone and it
    // routinely answered with UTC, which confused reps doing follow-ups
    // ("call them at 3pm" turned into "call them at 09:30" on the user's
    // screen because UTC ≠ IST).
    const today = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const nowIst = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    });
    const timezoneNote = 'Time zone: Asia/Kolkata (IST, UTC+05:30). When you mention dates, times, or "now" in your replies, always express them in IST — never UTC. If a tool returns a UTC timestamp, convert it to IST before quoting it.';

    if (inCrm) {
      return `You are Kini AI — the CRM copilot for the Kinematic platform.
Today (IST): ${today}
Current time (IST): ${nowIst}
${timezoneNote}
Current Route: ${pathname}

You can call CRM tools to fetch leads, deals, accounts, contacts, activities, run analytics, draft replies, score leads, and predict win probability. When data is returned, render structured cards (deal_list, lead_list, draft_email, summary, next_best_action) so the user sees real records rather than raw JSON. Be proactive: suggest the next best action, flag stalled deals, and surface high-score leads. Use **bold** for metrics.`;
    }
    const att = live.att?.data || live.att?.summary || {};
    const locs = live.locs?.data?.locations || live.locs?.locations || [];
    const week = live.week?.data || live.week || {};
    const summ = live.summ?.data || live.summ || {};
    const fes = locs.filter((l: any) => l.status === 'active');

    return `You are Kini AI — the premium, AGENTIC copilot for the Kinematic field force + CRM platform.
Current Context: User is viewing ${pathname}
Today (IST): ${today}
Current time (IST): ${nowIst}
${timezoneNote}

You are agentic: you have tools that span CRM (leads, deals, contacts, accounts, activities) and Field Force (attendance, live locations, visits). When the user asks you to DO something — "add a lead", "create a deal", "log a visit", "who is present today" — CALL the matching tool and do it. Never reply that you "cannot create leads" or "cannot take actions"; act via tools and confirm what you did in 1-2 short sentences. Only fall back to explaining manual steps if no tool fits.

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

    // Patch the trailing (assistant) turn — the bubble we just pushed. send() is
    // the ONLY thing that mutates the tail while a turn is in flight (confirm /
    // cancel / follow-up chips are all gated on `busy`), so the streamed bubble
    // stays the last message for the whole call and this merge is race-free.
    const patchLast = (patch: any) =>
      setMsgs(p => p.map((m, i) => (i === p.length - 1 ? { ...m, ...patch } : m)));

    // rAF-batched token flush. Streamed `token` deltas accumulate in a ref and
    // paint at most once per animation frame, so a long reply never fires one
    // React setState per token (which would thrash + jank the scroll). The
    // authoritative `done` frame does a final, exact replace.
    const streamTextRef = { current: '' };
    let rafId: number | null = null;
    const cancelFlush = () => { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } };
    const scheduleFlush = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        patchLast({ content: streamTextRef.current, loading: false, streaming: true });
      });
    };

    try {
      let userOrgId: string | null = null;
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
        userOrgId = raw ? JSON.parse(raw)?.org_id ?? null : null;
      } catch {}

      let selCity: string | null = null;
      try {
        selCity = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_city') : null;
      } catch { /* ignore */ }

      // Sanitise the outgoing history window. Continuous (multi-turn) chats
      // were throwing because the upstream LLM requires the first message to be
      // a `user` turn with strictly alternating roles: once the conversation
      // grew, `.slice(-6)` could start on an assistant turn and the request was
      // rejected. Send only {role, content} (drop `cards`/`loading`/error
      // bubbles), keep the last 6 turns, then trim any leading assistant turns
      // so the window always opens on `user`.
      const history = [...msgs.filter(m => !m.loading && !m.error), um]
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-6);
      while (history.length && history[0].role !== 'user') history.shift();

      const body: any = {
        messages: history,
        system: sys(),
      };
      // Always send a context object so the agentic v2 endpoint can build its
      // context block. On CRM routes we pass the rich CRM context; elsewhere a
      // light operations context so KINI still knows the module + route.
      body.context = inCrm
        ? buildKiniContext(pathname || '', userOrgId, selCity)
        : { module: 'operations', route: pathname || '', org_id: userOrgId };

      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...kiniAuthHeaders(token) };
      if (userOrgId) headers['X-Org-Id'] = userOrgId;

      try {
        const sel = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_client') : null;
        if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
          headers['X-Client-Id'] = sel;
        }
      } catch { /* ignore */ }

      // KINI is agentic everywhere now — always target the cross-module v2
      // endpoint (CRM + Field Force tools, context block, planning loop),
      // regardless of the current route. That's what lets "add a lead",
      // "log a visit", "who's present today" work from ANY page, by voice or
      // text — not just on CRM screens. If the tenant's v2 flag is off the
      // backend returns 403 KINI_V2_DISABLED and we transparently fall back to
      // the legacy agentic CRM chat on CRM routes, or the ops assistant
      // elsewhere. The same `context` object carries both v1 and v2 fields.
      const apiBase = process.env.NEXT_PUBLIC_API_URL;
      const v2Endpoint = '/api/v1/kini/v2/chat';
      const v2StreamEndpoint = '/api/v1/kini/v2/chat/stream';
      const v1Endpoint = inCrm ? '/api/v1/crm/ai/chat' : '/api/v1/ai/chat';
      const reqInit = { method: 'POST', headers, body: JSON.stringify(body) } as const;

      // ------------------------------------------------------------------
      // Buffered path (the fallback). This is byte-for-byte the pre-streaming
      // behavior: hit v2, fall back to v1 on 403 (KINI_V2_DISABLED) / 404 (not
      // deployed), then render 429 / 401 / error / success. Reused by every
      // "streaming unavailable" branch below, so a stream failure can NEVER
      // regress the chat.
      // ------------------------------------------------------------------
      const fetchBuffered = async (initial?: Response): Promise<Response> => {
        let r = initial ?? await fetch(`${apiBase}${v2Endpoint}`, reqInit);
        if (r.status === 403 || r.status === 404) {
          r = await fetch(`${apiBase}${v1Endpoint}`, reqInit);
        }
        return r;
      };
      const applyBuffered = async (r: Response) => {
        // Parse defensively — an infra/proxy error (502/504) can return HTML,
        // not JSON, which would otherwise throw straight to the catch below.
        let d: any = null;
        try { d = await r.json(); } catch { /* non-JSON error body — d stays null */ }
        // Quota-exceeded: backend returns 429 with a friendly message + the
        // current usage view. Surface it as the assistant turn.
        if (r.status === 429) {
          const u = d?.data?.usage;
          if (u) setUsage(u);
          // Backend returns `error: { code, message }` — use .message, not the
          // object, otherwise it renders as the literal "[object Object]".
          const errMsg = typeof d?.error === 'string' ? d.error : (d?.error?.message || d?.message);
          patchLast({ role: 'assistant', content: errMsg || 'Monthly AI limit reached. Resets on the 1st.', cards: [], pending_action: null, error: true, loading: false, streaming: false, toolCalls: [] });
          return;
        }
        // Session expired / auth failure — tell the user to re-auth.
        if (r.status === 401) {
          patchLast({ role: 'assistant', content: 'Your session has expired. Please refresh the page and sign in again to keep using KINI.', cards: [], pending_action: null, error: true, loading: false, streaming: false, toolCalls: [] });
          return;
        }
        // Surface the REAL failure (404 → deploy, 5xx → server error) instead of
        // a blanket apology, so a broken chat is diagnosable.
        const errText = (d && (typeof d.error === 'object' ? d.error?.message : d.error)) as string | undefined;
        const reply = d?.data?.text
          || (!r.ok
            ? `KINI couldn't complete that (error ${r.status}${errText ? `: ${errText}` : ''}). Please try again in a moment — if it keeps happening, let the team know.`
            : 'I apologize, but I am unable to process that right now.');
        const cards = d?.data?.cards || [];
        // Approval gate: an un-executed write is attached here so a
        // ConfirmActionCard renders under the reply until the user acts on it.
        const pending_action = d?.data?.pending_action || null;
        const u = d?.data?.usage;
        if (u) setUsage(u);
        patchLast({ role: 'assistant', content: reply, cards, pending_action, error: !r.ok, loading: false, streaming: false, toolCalls: [] });
      };
      const runBuffered = async () => { await applyBuffered(await fetchBuffered()); };

      // ------------------------------------------------------------------
      // Streaming path (the PRIMARY attempt). Consumes an SSE body frame by
      // frame. Returns 'done' when it fully rendered the turn (including
      // rendering an in-band `error` after content), or 'fallback' when nothing
      // usable arrived and the caller should retry the buffered call.
      // ------------------------------------------------------------------
      let gotContent = false; // any token OR card rendered → never silently fall back
      const consumeStream = async (resp: Response): Promise<'done' | 'fallback'> => {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let sawDone = false;
        let sawError = false;
        let errorMsg: string | undefined;

        const handle = (evt: string, data: any) => {
          switch (evt) {
            case 'start':
              // Begin the assistant bubble (it already exists as the loading
              // turn); keep the dots until the first token/card/tool arrives.
              patchLast({ streaming: true, threadId: data?.thread_id });
              break;
            case 'tool_call': {
              // Live "working" chip. phase:'start' adds it; phase:'done' marks
              // the matching in-flight chip finished (with its ok flag).
              const phase = data?.phase;
              setMsgs(p => p.map((m, i) => {
                if (i !== p.length - 1) return m;
                const tcs = Array.isArray(m.toolCalls) ? [...m.toolCalls] : [];
                if (phase === 'done') {
                  const idx = tcs.findIndex((t: any) => t.tool === data?.tool && !t.done);
                  if (idx >= 0) tcs[idx] = { ...tcs[idx], done: true, ok: data?.ok !== false };
                  else tcs.push({ tool: data?.tool, label: data?.label, done: true, ok: data?.ok !== false });
                } else {
                  tcs.push({ tool: data?.tool, label: data?.label, done: false });
                }
                return { ...m, loading: false, streaming: true, toolCalls: tcs };
              }));
              break;
            }
            case 'card':
              // { type, data } is already the shape KiniCardRenderer expects.
              if (data && data.type) {
                gotContent = true;
                setMsgs(p => p.map((m, i) => (i === p.length - 1
                  ? { ...m, loading: false, streaming: true, cards: [...(m.cards || []), data] }
                  : m)));
              }
              break;
            case 'token':
              if (data && typeof data.text === 'string') {
                gotContent = true;
                streamTextRef.current += data.text;
                scheduleFlush();
              }
              break;
            case 'pending_action':
              // Same approval gate as the buffered path — ConfirmActionCard renders.
              if (data) patchLast({ pending_action: data, loading: false, streaming: true });
              break;
            case 'usage': {
              const u = data?.usage ?? data;
              if (u && typeof u.used === 'number') setUsage(u);
              break;
            }
            case 'done': {
              // Authoritative final payload — replace the streamed text exactly
              // (avoids any delta drift) and set final cards / pending_action.
              cancelFlush();
              const u = data?.usage;
              if (u && typeof u.used === 'number') setUsage(u);
              setMsgs(p => p.map((m, i) => (i === p.length - 1 ? {
                ...m,
                role: 'assistant',
                content: typeof data?.text === 'string' ? data.text : streamTextRef.current,
                cards: Array.isArray(data?.cards) ? data.cards : (m.cards || []),
                pending_action: data?.pending_action ?? m.pending_action ?? null,
                error: false,
                loading: false,
                streaming: false,
                toolCalls: [],
              } : m)));
              break;
            }
            // 'error' is handled by dispatch() (it decides fallback vs render).
          }
        };

        const dispatch = (chunk: string) => {
          let evt = 'message';
          const dataLines: string[] = [];
          for (const rawLine of chunk.split('\n')) {
            const line = rawLine.replace(/\r$/, '');
            if (line.startsWith('event:')) evt = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
          }
          const dataStr = dataLines.join('\n');
          let data: any = null;
          if (dataStr) { try { data = JSON.parse(dataStr); } catch { data = null; } }
          if (evt === 'done') sawDone = true;
          if (evt === 'error') { sawError = true; errorMsg = data?.message; return; }
          handle(evt, data);
        };

        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, sep);
              buf = buf.slice(sep + 2);
              if (chunk.trim()) dispatch(chunk);
            }
          }
          // Flush a trailing frame that had no terminating blank line.
          if (buf.trim()) dispatch(buf);
        } catch {
          // Network drop mid-stream: fall back only if nothing was shown yet;
          // otherwise keep the partial reply and stop the indicator.
          cancelFlush();
          if (!gotContent) return 'fallback';
          patchLast({ content: streamTextRef.current, streaming: false, loading: false, toolCalls: [] });
          return 'done';
        }

        cancelFlush();
        if (sawDone) return 'done';
        if (sawError) {
          // No tokens/cards yet → retry buffered; otherwise show the message.
          if (!gotContent) return 'fallback';
          patchLast({ content: errorMsg || 'Something went wrong. Please try again.', error: true, streaming: false, loading: false, toolCalls: [] });
          return 'done';
        }
        // Stream ended without an explicit done/error frame.
        if (!gotContent) return 'fallback';
        patchLast({ content: streamTextRef.current, streaming: false, loading: false, toolCalls: [] });
        return 'done';
      };

      // Attempt streaming first. A non-stream / not-ok response is treated
      // EXACTLY like the buffered path (403 → v1, 429, error, success). Any
      // setup failure (network, no ReadableStream) drops to the buffered call.
      try {
        const sr = await fetch(`${apiBase}${v2StreamEndpoint}`, {
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream' },
          body: reqInit.body,
        });
        const ct = (sr.headers.get('content-type') || '').toLowerCase();
        if (sr.ok && ct.includes('text/event-stream') && sr.body) {
          const outcome = await consumeStream(sr);
          if (outcome === 'fallback') await runBuffered();
          return;
        }
        // Not an event stream — hand the response to the buffered pipeline.
        await applyBuffered(await fetchBuffered(sr));
        return;
      } catch {
        // Stream endpoint unreachable / body not readable — use buffered.
        cancelFlush();
      }

      await runBuffered();
    } catch (e: any) {
      cancelFlush();
      patchLast({ role: 'assistant', content: `Connectivity Error: ${e.message}`, error: true, loading: false, streaming: false, toolCalls: [] });
    } finally { setBusy(false); }
  };

  // KINI approval gate. A chat turn may carry an un-executed `pending_action`
  // that the user must confirm before the write runs. Confirm POSTs the action
  // to the v2 confirm endpoint (mirroring the chat fetch's base URL + auth /
  // project / org / client headers), then appends the returned cards + text as a
  // NEW assistant turn and marks the source turn resolved so its buttons drop.
  // Throws on any non-OK/parse failure so the card can surface an inline error
  // and re-enable. Cancel resolves locally with no backend call.
  const confirmAction = useCallback(async (action: { id: string; tool: string; args: any }) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...kiniAuthHeaders(token) };
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      const orgId = raw ? JSON.parse(raw)?.org_id ?? null : null;
      if (orgId) headers['X-Org-Id'] = orgId;
    } catch { /* ignore */ }
    try {
      const sel = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_client') : null;
      if (sel && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel)) {
        headers['X-Client-Id'] = sel;
      }
    } catch { /* ignore */ }

    const r = await fetch(`${apiBase}/api/v1/kini/v2/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: { id: action.id, tool: action.tool, args: action.args } }),
    });
    let d: any = null;
    try { d = await r.json(); } catch { /* non-JSON error body */ }
    if (!r.ok) {
      const errText = (d && (typeof d.error === 'object' ? d.error?.message : d.error)) as string | undefined;
      throw new Error(errText || `KINI couldn't complete that (error ${r.status}). Please try again.`);
    }
    const cards = d?.data?.cards || [];
    const text = d?.data?.text || 'Done.';
    const usage = d?.data?.usage;
    if (usage) setUsage(usage);
    // Resolve the source turn (identified by the action id) AND append the
    // result as a fresh assistant turn — in one update so the buttons vanish
    // exactly as the outcome appears.
    setMsgs(p => ([
      ...p.map(m => (m.pending_action && m.pending_action.id === action.id) ? { ...m, pendingResolved: true } : m),
      { role: 'assistant', content: text, cards },
    ]));
  }, [token]);

  const cancelAction = useCallback((action: { id: string }) => {
    setMsgs(p => p.map(m => (m.pending_action && m.pending_action.id === action.id)
      ? { ...m, pendingResolved: true, pendingCancelled: true }
      : m));
  }, []);

  // Sheet (mobile) vs floating card (desktop). On mobile the panel anchors
  // to the bottom of the viewport and fills the width, so it never overflows
  // off-screen. Derived: have we hit the monthly cap? Used to grey-out
  // send / mic / input and surface a friendly notice in the header.
  const capped = !!usage && !usage.exempt && usage.remaining === 0;

  // Mobile sheet covers the full visual viewport. visualViewport.height
  // shrinks when the keyboard opens, so the panel + input always stay
  // above the keyboard. Falls back to 100dvh, then 100vh.
  const mobileHeight = vvh ? `${vvh}px` : '100dvh';

  const panelStyle: React.CSSProperties = isMobile
    ? {
        // Inset card rather than a full-bleed sheet — leave a margin on every
        // side (and a gap at the top) so the panel "fits" the screen with
        // breathing space instead of covering it edge-to-edge. Height tracks
        // the visual viewport (minus the top gap) so it still rides above the
        // keyboard when it opens.
        position: 'fixed', left: 10, right: 10, bottom: 'calc(10px + env(safe-area-inset-bottom))',
        height: `calc(${mobileHeight} - 64px - env(safe-area-inset-bottom))`,
        background: C.s2,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', zIndex: 999,
        boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
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
        @keyframes km-ai-spin    { to { transform: rotate(360deg); } }
      `}</style>

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open Kini AI"
        style={{
          position: 'fixed',
          // Raise the button on mobile so the dashboard's footer + iOS
          // home-indicator strip don't clip it. Previous bottom:20px was
          // colliding with the footer text band and ate the lower
          // 10-15px of the FAB on narrow screens. 88px + safe-area keeps
          // the whole circle visible above both.
          bottom: isMobile ? 'calc(88px + env(safe-area-inset-bottom))' : 30,
          right: isMobile ? 'calc(16px + env(safe-area-inset-right))' : 30,
          zIndex: 1000,
          width: isMobile ? 56 : 60,
          height: isMobile ? 56 : 60,
          borderRadius: isMobile ? 20 : 22,
          background: open ? `linear-gradient(135deg, ${C.red}, #FF4D4D)` : '#fff', color: '#fff',
          display: open && isMobile ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? 'none' : '0 10px 30px rgba(224,30,44,0.35)',
          cursor: 'pointer', border: 'none',
          animation: !open ? 'km-ai-pulse 2s infinite' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
        {open
          ? <span style={{ fontSize: 22, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>✕</span>
          : <span style={{ display: 'flex', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}><KiniMascot size={isMobile ? 40 : 44} /></span>}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Gradient header — gives the panel its 'product surface' look in
              both themes by using the brand red gradient as the only saturated
              element. */}
          <div style={{
            padding: isMobile ? '12px 16px' : '16px 20px',
            background: `linear-gradient(120deg, ${C.red} 0%, #FF4D4D 70%, ${C.blue} 130%)`,
            color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}><KiniMascot size={28} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 15, fontFamily: 'var(--font-manrope, inherit)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Kini AI {inCrm && <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.18)', padding: '2px 8px', borderRadius: 999, fontWeight: 800, letterSpacing: 0.6 }}>CRM</span>}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {inCrm ? 'Agentic CRM Copilot' : 'Operations Assistant'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {usage && !usage.exempt && (
                <span
                  title={`${usage.used} of ${usage.cap} AI queries this month`}
                  style={{
                    background: usage.remaining === 0 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.18)',
                    color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    padding: '4px 10px', borderRadius: 999,
                  }}
                >{usage.used}/{usage.cap}</span>
              )}
              {!isMobile && (
                <button
                  onClick={() => setMsgs([])}
                  title="Clear conversation"
                  style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontWeight: 700 }}
                >Clear</button>
              )}
              {/* Always-visible close on mobile — the FAB is hidden once the
                  sheet is open, so the user needs an explicit dismiss target.
                  Doubles as Clear on long-press not implemented; reps can
                  swipe back via the OS back gesture or this X. */}
              {isMobile && (
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  aria-label="Close Kini"
                  style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', width: 32, height: 32, borderRadius: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                >×</button>
              )}
            </div>
          </div>

          {usage && !usage.exempt && usage.remaining === 0 && (
            <div style={{ padding: '10px 16px', background: 'rgba(255,184,0,0.12)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', flexShrink: 0 }}>
              You've used all <strong>{usage.cap}</strong> AI queries this month. The counter resets on the 1st.
            </div>
          )}

          {/* Mobile gets tighter padding so message bubbles don't waste a
              quarter of the screen on a 360px-wide phone. */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : '20px', display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 16, scrollBehavior: 'smooth', background: C.s1, WebkitOverflowScrolling: 'touch' as any }}>
            {msgs.length === 0 && (
              <EmptyState inCrm={inCrm} onTry={(t) => { setInput(t); }} />
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: isMobile ? '9px 13px' : '11px 16px',
                  borderRadius: isMobile ? 16 : 18,
                  fontSize: isMobile ? 13.5 : 14, lineHeight: 1.5,
                  maxWidth: isMobile ? '92%' : '88%',
                  background: m.role === 'user'
                    ? `linear-gradient(135deg, ${C.red}, #FF4D4D)`
                    : C.s2,
                  color: m.role === 'user' ? '#fff' : C.white,
                  border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
                  boxShadow: m.role === 'user' ? '0 6px 16px rgba(224,30,44,0.18)' : 'none',
                  animation: m.loading ? 'km-ai-shimmer 1.5s infinite' : 'none',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}>
                  {m.loading ? (
                    <div style={{ display: 'flex', gap: 4, padding: '4px 2px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd, opacity: 0.6 }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.grayd, opacity: 0.3 }} />
                    </div>
                  ) : (
                    <>
                      {/* Live "working" chips while streaming — one per tool the
                          agent calls, spinning until its phase:'done' frame. */}
                      {m.streaming && Array.isArray(m.toolCalls) && m.toolCalls.length > 0 && (
                        <ToolCallChips calls={m.toolCalls} />
                      )}
                      {/* Append a block cursor to the still-streaming text for a
                          typewriter feel; md() escapes it so it's inert. On the
                          authoritative `done` frame `streaming` clears and it's gone. */}
                      {(m.content || !m.streaming) && (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeMdHtml(md(m.streaming && m.content ? m.content + '▌' : m.content)) }} className="km-chat-content" />
                      )}
                      {Array.isArray(m.cards) && m.cards.map((c: any, idx: number) => <KiniCardRenderer key={idx} card={c} onAction={(t) => void send(t)} />)}
                      {m.pending_action && (
                        <ConfirmActionCard
                          action={m.pending_action}
                          resolved={!!m.pendingResolved}
                          cancelled={!!m.pendingCancelled}
                          onConfirm={confirmAction}
                          onCancel={cancelAction}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {!busy && msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && !msgs[msgs.length - 1].loading && !msgs[msgs.length - 1].error && !(msgs[msgs.length - 1].pending_action && !msgs[msgs.length - 1].pendingResolved) && (
              <FollowUpChips inCrm={inCrm} onPick={(t) => void send(t)} />
            )}
            <div ref={endRef} />
          </div>

          <div style={{
            padding: isMobile ? '10px 12px' : '14px 16px',
            background: C.s2, borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 8, alignItems: 'center',
            flexShrink: 0,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !capped && void send()}
              disabled={busy || capped}
              style={{
                flex: 1, background: C.s3, border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: isMobile ? '10px 12px' : '12px 16px',
                color: C.white,
                fontSize: 16,  // 16px prevents iOS Safari zooming on focus
                outline: 'none', transition: 'border-color 0.2s',
                minWidth: 0, // critical: lets the flex item shrink below its content
                opacity: capped ? 0.5 : 1,
              }}
              placeholder={
                capped ? 'Limit reached — resets on the 1st'
                : speech.listening ? 'Listening…'
                : (inCrm ? (isMobile ? 'Ask, or "add deal", "log call"…' : 'Ask, or "add deal", "log call"… (हिन्दी, বাংলা, ଓଡ଼ିଆ, অসমীয়া also supported)') : 'Ask anything about operations…')
              }
            />

            {speech.supported && (
              <button
                onClick={() => speech.listening ? speech.stop() : speech.start()}
                disabled={busy || capped}
                title={speech.listening ? 'Stop listening' : 'Speak'}
                aria-label="Voice input"
                style={{
                  background: speech.listening ? C.red : C.s3,
                  border: `1px solid ${speech.listening ? C.red : C.border}`,
                  borderRadius: 14,
                  width: isMobile ? 40 : 44, height: isMobile ? 40 : 44,
                  color: speech.listening ? '#fff' : C.white,
                  cursor: (busy || capped) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  opacity: capped ? 0.4 : 1,
                  animation: speech.listening ? 'km-mic-pulse 1.2s infinite' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <Icon d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8" size={18} />
              </button>
            )}

            <button
              onClick={() => void send()}
              disabled={busy || capped || !input.trim()}
              title={capped ? 'Monthly limit reached' : 'Send'}
              aria-label="Send"
              style={{
                background: C.red, border: 'none', borderRadius: 14,
                width: isMobile ? 40 : 44, height: isMobile ? 40 : 44,
                color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: (busy || capped || !input.trim()) ? 0.5 : 1,
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

// KINI approval gate card. Rendered under an assistant turn that carries an
// unresolved `pending_action` — a write the backend deferred pending explicit
// user confirmation. Confirm (KINI-red, primary) fires onConfirm → the v2
// confirm POST; Cancel (ghost) resolves it locally. Manages its own busy /
// error state, guards against double-submit, and disables both buttons once
// the action is in-flight or resolved. Theme-aware via CSS vars; the fixed KINI
// red marks this as "the assistant's" write action regardless of theme.
function ConfirmActionCard({
  action,
  resolved,
  cancelled,
  onConfirm,
  onCancel,
}: {
  action: { id: string; tool: string; label?: string; summary?: string; args: any };
  resolved: boolean;
  cancelled: boolean;
  onConfirm: (action: { id: string; tool: string; args: any }) => Promise<void>;
  onCancel: (action: { id: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Disable both buttons while a submit is in flight OR once the action has
  // been resolved (confirmed / cancelled) — the double-submit guard.
  const locked = busy || resolved;

  const handleConfirm = async () => {
    if (locked) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm({ id: action.id, tool: action.tool, args: action.args });
      // On success the parent marks the turn resolved, which re-renders this
      // card into its "Confirmed" state; leave busy set until that lands so the
      // spinner shows through the transition.
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: 'color-mix(in srgb, #E01E2C 8%, transparent)',
      border: '1px solid color-mix(in srgb, #E01E2C 30%, transparent)',
      borderRadius: 12, padding: 12, marginTop: 8,
    }}>
      <div style={{ fontSize: 11, color: '#E01E2C', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" size={13} />
        Confirm action
      </div>
      {action.label && <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13, marginBottom: 4 }}>{action.label}</div>}
      {action.summary && <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: (resolved || cancelled) ? 0 : 10 }}>{action.summary}</div>}

      {cancelled ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 8 }}>Cancelled.</div>
      ) : resolved ? (
        <div style={{ fontSize: 12, color: '#28B463', fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon d="M20 6 9 17l-5-5" size={13} /> Confirmed
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={locked}
              style={{
                background: '#E01E2C', border: 'none', color: '#fff',
                fontSize: 12, fontWeight: 700, borderRadius: 999,
                padding: '7px 16px', cursor: locked ? 'default' : 'pointer',
                opacity: locked ? 0.6 : 1, transition: 'opacity .15s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {busy && <span style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'km-ai-spin .7s linear infinite' }} />}
              {busy ? 'Confirming…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => { if (!locked) onCancel({ id: action.id }); }}
              disabled={locked}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--text-dim)',
                fontSize: 12, fontWeight: 600, borderRadius: 999,
                padding: '7px 16px', cursor: locked ? 'default' : 'pointer',
                opacity: locked ? 0.6 : 1, transition: 'opacity .15s',
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 11.5, color: '#E01E2C', marginTop: 8, lineHeight: 1.4 }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}

// Live tool-activity chips shown inside a streaming assistant bubble. Each chip
// spins (km-ai-spin) while its tool is running and flips to a check (or an ✕ on
// failure) when the backend emits the matching `tool_call` phase:'done' frame.
// KINI red keeps them visually "the assistant's" work regardless of theme.
function ToolCallChips({ calls }: { calls: any[] }) {
  if (!Array.isArray(calls) || calls.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {calls.map((c, i) => {
        const failed = c.done && c.ok === false;
        return (
          <span
            key={i}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 600,
              color: failed ? '#E01E2C' : (c.done ? 'var(--text-dim)' : '#E01E2C'),
              background: 'color-mix(in srgb, #E01E2C 8%, transparent)',
              border: '1px solid color-mix(in srgb, #E01E2C 22%, transparent)',
              borderRadius: 999, padding: '4px 10px',
            }}
          >
            {c.done ? (
              failed
                ? <Icon d="M18 6 6 18 M6 6l12 12" size={11} />
                : <Icon d="M20 6 9 17l-5-5" size={11} />
            ) : (
              <span style={{ width: 10, height: 10, border: '2px solid color-mix(in srgb, #E01E2C 30%, transparent)', borderTopColor: '#E01E2C', borderRadius: '50%', display: 'inline-block', animation: 'km-ai-spin .7s linear infinite' }} />
            )}
            {c.label || c.tool || 'Working…'}
          </span>
        );
      })}
    </div>
  );
}

// Contextual "next step" chips shown under the latest KINI reply, to keep the
// conversation moving and nudge the user toward a useful follow-up action.
function FollowUpChips({ inCrm, onPick }: { inCrm: boolean; onPick: (text: string) => void }) {
  const chips = inCrm
    ? ['What should I prioritise today?', 'Draft a follow-up email', 'Which deals are at risk?', 'Add a task']
    : ['Who is offline right now?', 'Top performers this week', 'Any attendance gaps?'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 2, marginTop: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Suggested next steps</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            style={{
              fontSize: 12, fontWeight: 600, color: '#E01E2C',
              background: 'color-mix(in srgb, #E01E2C 10%, transparent)',
              border: '1px solid color-mix(in srgb, #E01E2C 28%, transparent)',
              borderRadius: 999, padding: '5px 12px', cursor: 'pointer',
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, #E01E2C 18%, transparent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, #E01E2C 10%, transparent)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
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
