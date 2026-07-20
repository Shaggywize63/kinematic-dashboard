// Demo-account extras: location trails, conversation intelligence,
// lead-tracker / team reports, and AI suggest mocks.
//
// Everything here is VERTICAL-AGNOSTIC — generators take the active seed's
// leads/users/locations as input, so switching the demo industry (generic /
// insurance / pharmaceutical) keeps names and cities consistent without a
// per-vertical copy of this file. Wired up in ../demoMocks.ts.

import type {
  ConversationRow,
  ConversationDetail,
  ConversationAnalytics,
} from '../conversationsApi';
import type {
  LeadTrackerPayload,
  TeamPerformanceRow,
  TeamDailyCard,
  UpdateSuggestion,
} from '../../types/crm';

// ── deterministic PRNG ──────────────────────────────────────────────────────
// Trails and metrics must be stable across re-renders/refetches within a day,
// so everything derives from a string seed instead of Math.random().
function seeded(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const todayStr = () => new Date().toISOString().split('T')[0];

// ── 1. Live-activity trail ─────────────────────────────────────────────────
// A champion's day: check-in near the anchor, a wandering beat across the
// city with a few longer site stops, ending at the live-location anchor
// (so the trail's last point matches the marker on the map).
export interface DemoTrailPoint {
  lat: number; lng: number;
  battery_percentage: number;
  captured_at: string;
  activity_type: string;
}

export function mockLocationTrail(
  userId: string,
  anchor: { lat: number; lng: number } | undefined,
  date?: string
): { success: boolean; data: DemoTrailPoint[] } {
  const base = anchor ?? { lat: 12.9352, lng: 77.6245 };
  const day = date || todayStr();
  const rnd = seeded(`${userId}:${day}`);

  const points: DemoTrailPoint[] = [];
  const startHour = 9, startMin = 10 + Math.floor(rnd() * 20);
  const now = new Date();
  const isToday = day === todayStr();
  const endHour = isToday ? Math.min(now.getHours(), 18) : 18;

  // Walk backwards from the anchor so the trail ENDS at the live marker.
  const steps: Array<{ h: number; m: number; type: string }> = [];
  let h = startHour, mi = startMin;
  while (h < endHour || (h === endHour && mi <= (isToday ? now.getMinutes() : 30))) {
    steps.push({ h, m: mi, type: 'HEARTBEAT' });
    mi += 10;
    if (mi >= 60) { mi -= 60; h += 1; }
  }
  if (!steps.length) steps.push({ h: startHour, m: startMin, type: 'HEARTBEAT' });
  steps[0].type = 'CHECKIN';
  // 3–4 site visits spread through the day
  const visitCount = 3 + Math.floor(rnd() * 2);
  for (let v = 1; v <= visitCount; v++) {
    const idx = Math.min(steps.length - 1, Math.floor((v * steps.length) / (visitCount + 1)));
    if (steps[idx].type === 'HEARTBEAT') steps[idx].type = 'VISIT';
  }

  // Random-walk offsets, then shift so the final offset is 0 (ends at anchor).
  const offs: Array<[number, number]> = [];
  let dx = 0, dy = 0;
  for (let i = 0; i < steps.length; i++) {
    offs.push([dx, dy]);
    // Drift ~200–500 m per 10-min step, with occasional longer hops.
    const hop = rnd() < 0.15 ? 3 : 1;
    dx += (rnd() - 0.5) * 0.006 * hop;
    dy += (rnd() - 0.5) * 0.006 * hop;
  }
  const [lastX, lastY] = offs[offs.length - 1];

  const battStart = 88 + Math.floor(rnd() * 10);
  steps.forEach((s, i) => {
    const frac = steps.length > 1 ? i / (steps.length - 1) : 1;
    const captured = new Date(`${day}T00:00:00`);
    captured.setHours(s.h, s.m, Math.floor(rnd() * 50), 0);
    points.push({
      lat: +(base.lat + offs[i][0] - lastX * frac).toFixed(6),
      lng: +(base.lng + offs[i][1] - lastY * frac).toFixed(6),
      battery_percentage: Math.max(8, Math.round(battStart - frac * (30 + rnd() * 25))),
      captured_at: captured.toISOString(),
      activity_type: s.type,
    });
  });
  return { success: true, data: points };
}

// ── 2. Conversation intelligence ───────────────────────────────────────────

type SeedLead = {
  id: string; first_name?: string; last_name?: string;
  city?: string; owner_name?: string; score?: number;
};
type SeedUser = { id: string; name: string; employee_id?: string };

const CONVO_TEMPLATES = [
  {
    intent: 'evaluating', intent_score: 72, sentiment: 'positive', trajectory: 'improved',
    summary: 'Customer is comparing brands for an upcoming slab; price objection raised and partially handled with the full-weight comparison. Asked for a written quote before Friday.',
    objection: { type: 'price', handled: true, note: 'Handled with per-piece certified weight math' },
    competitor: 'Local brand', commitment: 'Share written quote by Friday',
    next_action: 'Send the quote card on WhatsApp today and book a Friday-morning follow-up visit.',
    talk: 42,
  },
  {
    intent: 'high_intent', intent_score: 86, sentiment: 'positive', trajectory: 'improved',
    summary: 'Roof casting planned in ~2 weeks; quantity discussed and financing question answered. Customer asked champion to meet the site engineer.',
    objection: { type: 'timeline', handled: true, note: 'Delivery timeline confirmed within 48h window' },
    competitor: null, commitment: 'Meet site engineer Tuesday',
    next_action: 'Confirm Tuesday site-engineer meeting and carry the test certificate.',
    talk: 38,
  },
  {
    intent: 'price_shopping', intent_score: 44, sentiment: 'neutral', trajectory: 'flat',
    summary: 'Customer anchored hard on a cheaper local quote. Champion quoted list price but did not use the whole-home cost delta. Coaching opportunity flagged.',
    objection: { type: 'price', handled: false, note: 'Cheaper local quote — cost-delta math not used' },
    competitor: 'Local brand', commitment: null,
    next_action: 'Revisit with the 0.5%-of-build-cost calculator and a nearby completed-home reference.',
    talk: 61,
  },
  {
    intent: 'early_research', intent_score: 35, sentiment: 'neutral', trajectory: 'flat',
    summary: 'Foundation stage only; buying 6–8 weeks out. Good rapport built; customer saved the champion\'s number and accepted a brochure on WhatsApp.',
    objection: { type: 'trust', handled: true, note: 'Neighbour reference shared' },
    competitor: null, commitment: 'Will call at slab stage',
    next_action: 'Set a nurture reminder keyed to the slab stage in ~6 weeks.',
    talk: 47,
  },
  {
    intent: 'at_risk', intent_score: 28, sentiment: 'negative', trajectory: 'declined',
    summary: 'Customer unhappy about a delayed earlier delivery; considering switching supplier. Champion apologised and escalated; needs a manager call-back.',
    objection: { type: 'service', handled: false, note: 'Past delivery delay unresolved on call' },
    competitor: 'Local brand', commitment: null,
    next_action: 'Manager call-back within 24h with a delivery-slot guarantee.',
    talk: 55,
  },
  {
    intent: 'evaluating', intent_score: 64, sentiment: 'positive', trajectory: 'improved',
    summary: 'Quality-focused customer; responded well to the bend-test video and certificates. Wants the champion to meet both decision makers together next week.',
    objection: { type: 'quality_proof', handled: true, note: 'Bend-test video + mill certificate shown' },
    competitor: null, commitment: 'Joint meeting with both decision makers',
    next_action: 'Schedule the joint decision-maker meeting; bring printed certificates.',
    talk: 40,
  },
];

function convoId(i: number) { return `demo-convo-${i + 1}`; }

export function buildDemoConversations(
  leads: SeedLead[],
  users: SeedUser[]
): ConversationRow[] {
  const rows: ConversationRow[] = [];
  const n = Math.min(CONVO_TEMPLATES.length + 2, Math.max(6, leads.length ? 8 : 0));
  for (let i = 0; i < n; i++) {
    const t = CONVO_TEMPLATES[i % CONVO_TEMPLATES.length];
    const lead = leads[i % Math.max(1, leads.length)];
    const user = users[i % Math.max(1, users.length)];
    const rnd = seeded(`convo:${i}`);
    const created = new Date();
    created.setDate(created.getDate() - Math.floor(rnd() * 12));
    created.setHours(10 + Math.floor(rnd() * 7), Math.floor(rnd() * 60), 0, 0);
    rows.push({
      id: convoId(i),
      status: 'complete',
      created_at: created.toISOString(),
      duration_seconds: 240 + Math.floor(rnd() * 480),
      language: rnd() < 0.7 ? 'hi' : 'hi-en',
      champion_name: user?.name ?? 'Champion',
      employee_id: user?.employee_id ?? null,
      lead_id: lead?.id ?? null,
      lead_name: lead ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() : null,
      lead_city: lead?.city ?? null,
      intent: t.intent,
      intent_score: t.intent_score,
      sentiment: t.sentiment,
      summary: t.summary,
      user_id: user?.id ?? null,
    });
  }
  // newest first, like the backend
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function demoConversationDetail(row: ConversationRow): ConversationDetail {
  const idx = Math.max(0, parseInt(row.id.replace('demo-convo-', ''), 10) - 1);
  const t = CONVO_TEMPLATES[idx % CONVO_TEMPLATES.length];
  const champ = row.champion_name || 'Champion';
  const cust = row.lead_name || 'Customer';
  const diar = [
    { speaker: champ, text: `Namaste ${cust.split(' ')[0]} ji, main ${champ.split(' ')[0]} bol raha hoon. Site pe kaam kaisa chal raha hai?`, start: 0, end: 9 },
    { speaker: cust, text: 'Haan chal raha hai. Slab ki taiyari hai, isliye rates pata karne the.', start: 9, end: 18 },
    { speaker: champ, text: 'Bilkul. Aapko grade aur quantity ke hisaab se best per-piece rate deta hoon — certified weight ke saath.', start: 18, end: 30 },
    { speaker: cust, text: 'Local wala ₹5 kam bol raha hai per kg. Aap kya doge?', start: 30, end: 38 },
    { speaker: champ, text: 'Samajh gaya. Ek minute — piece ka asli weight compare karte hain, phir poore ghar ke cost pe difference dekhte hain. Aksar farak aadha percent se bhi kam nikalta hai.', start: 38, end: 55 },
    { speaker: cust, text: 'Theek hai, quote bhej dijiye WhatsApp pe. Phir baat karte hain.', start: 55, end: 63 },
    { speaker: champ, text: 'Aaj hi bhejta hoon, aur Friday subah site pe milta hoon. Dhanyavaad!', start: 63, end: 70 },
  ];
  return {
    id: row.id,
    lead_id: row.lead_id,
    user_id: row.user_id ?? null,
    status: 'complete',
    transcript: diar.map(d => `${d.speaker}: ${d.text}`).join('\n'),
    diarization: diar,
    insights: {
      summary: t.summary,
      intent: { stage: t.intent, score: t.intent_score, signals: ['quantity discussed', 'timeline mentioned', t.competitor ? 'competitor named' : 'no competitor named'] },
      sentiment: { overall: t.sentiment, trajectory: t.trajectory },
      positives: ['Warm open in customer\'s language', 'Asked for the next meeting before hanging up'],
      improvements: t.objection.handled ? ['Quantify savings with the calculator earlier in the call'] : ['Use the full-weight comparison the moment price is raised', 'Anchor on whole-home cost, not per-kg'],
      objections: [t.objection],
      competitors: t.competitor ? [{ name: t.competitor, context: 'quoted a lower per-kg rate' }] : [],
      commitments: t.commitment ? [t.commitment] : [],
      extracted: { quantity_tonnes: 3, timeline: '2–6 weeks', project_stage: 'slab', decision_maker: cust },
      coaching: { talk_listen_ratio: t.talk, missed_questions: t.objection.handled ? [] : ['What is the total built-up area?'], tips: ['Show, don\'t tell — open the comparison card on screen'] },
      next_action: t.next_action,
      draft_followup: `Namaste ${cust.split(' ')[0]} ji, aaj ki baat ke liye dhanyavaad. Quote attach kar raha hoon — certified full-weight ke saath. Friday subah site pe milte hain. – ${champ.split(' ')[0]}`,
      risk_flags: t.intent === 'at_risk' ? ['churn risk — unresolved service issue'] : [],
    },
    audio_url: null,
    consent_captured: true,
    duration_seconds: row.duration_seconds,
    language: row.language,
    created_at: row.created_at,
    champion_name: row.champion_name,
    employee_id: row.employee_id,
    lead_name: row.lead_name,
    lead_city: row.lead_city,
  };
}

export function demoConversationAnalytics(rows: ConversationRow[]): ConversationAnalytics {
  const templates = rows.map((r) => CONVO_TEMPLATES[Math.max(0, parseInt(r.id.replace('demo-convo-', ''), 10) - 1) % CONVO_TEMPLATES.length]);
  const count = (pred: (t: typeof CONVO_TEMPLATES[number]) => boolean) => templates.filter(pred).length;

  const objMap = new Map<string, { count: number; well: number; partially: number; poor: number }>();
  templates.forEach((t) => {
    const cur = objMap.get(t.objection.type) ?? { count: 0, well: 0, partially: 0, poor: 0 };
    cur.count += 1;
    if (t.objection.handled) cur.well += 1; else cur.poor += 1;
    objMap.set(t.objection.type, cur);
  });

  const byRep = new Map<string, { name: string; calls: number; scoreSum: number; talkSum: number; pos: number; neu: number; neg: number }>();
  rows.forEach((r, i) => {
    const t = templates[i];
    const key = r.user_id ?? 'unknown';
    const cur = byRep.get(key) ?? { name: r.champion_name ?? 'Champion', calls: 0, scoreSum: 0, talkSum: 0, pos: 0, neu: 0, neg: 0 };
    cur.calls += 1; cur.scoreSum += t.intent_score; cur.talkSum += t.talk;
    if (t.sentiment === 'positive') cur.pos += 1; else if (t.sentiment === 'negative') cur.neg += 1; else cur.neu += 1;
    byRep.set(key, cur);
  });

  const timeline: ConversationAnalytics['timeline'] = [];
  for (let d = 13; d >= 0; d--) {
    const date = new Date(); date.setDate(date.getDate() - d);
    const key = date.toISOString().split('T')[0];
    const dayRows = rows.filter(r => r.created_at.startsWith(key));
    timeline.push({
      date: key,
      count: dayRows.length,
      avg_score: dayRows.length ? Math.round(dayRows.reduce((s, r) => s + (r.intent_score ?? 0), 0) / dayRows.length) : null,
    });
  }

  const intentMap = new Map<string, number>();
  templates.forEach(t => intentMap.set(t.intent, (intentMap.get(t.intent) ?? 0) + 1));

  return {
    window_days: 30,
    totals: {
      total: rows.length, analyzed: rows.length,
      reps: byRep.size, leads: new Set(rows.map(r => r.lead_id).filter(Boolean)).size,
      avg_intent_score: Math.round(templates.reduce((s, t) => s + t.intent_score, 0) / Math.max(1, templates.length)),
      avg_talk_pct: Math.round(templates.reduce((s, t) => s + t.talk, 0) / Math.max(1, templates.length)),
      risk_calls: count(t => t.intent === 'at_risk'),
      commitment_calls: count(t => !!t.commitment),
    },
    intent_stages: Array.from(intentMap.entries()).map(([key, c]) => ({ key, count: c })),
    sentiment: [
      { key: 'positive', count: count(t => t.sentiment === 'positive') },
      { key: 'neutral', count: count(t => t.sentiment === 'neutral') },
      { key: 'negative', count: count(t => t.sentiment === 'negative') },
    ],
    trajectory: [
      { key: 'improved', count: count(t => t.trajectory === 'improved') },
      { key: 'flat', count: count(t => t.trajectory === 'flat') },
      { key: 'declined', count: count(t => t.trajectory === 'declined') },
    ],
    objections: Array.from(objMap.entries()).map(([type, o]) => ({ type, ...o })),
    handling: {
      well: count(t => t.objection.handled),
      partially: 0,
      poor: count(t => !t.objection.handled),
    },
    competitors: [{ name: 'Local brand', count: count(t => t.competitor === 'Local brand') }].filter(c => c.count > 0),
    timeline,
    reps: Array.from(byRep.entries()).map(([user_id, r]) => ({
      user_id, name: r.name, calls: r.calls,
      avg_intent_score: Math.round(r.scoreSum / r.calls),
      avg_talk_pct: Math.round(r.talkSum / r.calls),
      positive: r.pos, neutral: r.neu, negative: r.neg,
    })),
  };
}

// ── 3. Report analytics: lead tracker / team performance / team daily ─────

export function mockLeadTracker(leads: SeedLead[]): LeadTrackerPayload {
  const rnd = seeded(`tracker:${todayStr()}`);
  const monthly = [] as Array<{ key: string; count: number }>;
  for (let m = 5; m >= 0; m--) {
    const d = new Date(); d.setMonth(d.getMonth() - m);
    monthly.push({ key: d.toLocaleString('en', { month: 'short' }), count: 24 + Math.floor(rnd() * 36) });
  }
  const weekly = [] as Array<{ key: string; count: number }>;
  for (let w = 7; w >= 0; w--) {
    const d = new Date(); d.setDate(d.getDate() - w * 7);
    weekly.push({ key: `W${d.getDate()}/${d.getMonth() + 1}`, count: 6 + Math.floor(rnd() * 12) });
  }
  const daily = [] as Array<{ key: string; count: number }>;
  for (let dd = 13; dd >= 0; dd--) {
    const d = new Date(); d.setDate(d.getDate() - dd);
    daily.push({ key: d.toISOString().split('T')[0], count: Math.floor(rnd() * 5) + (dd % 6 === 0 ? 0 : 1) });
  }
  const period = (label: string, from: Date, nl: number, conv: number) => ({
    label, from: from.toISOString().split('T')[0], to: todayStr(),
    new_leads: nl, converted: conv, conversion_rate: nl ? +(100 * conv / nl).toFixed(1) : 0,
  });
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const cityCount = new Map<string, number>();
  leads.forEach(l => { if (l.city) cityCount.set(l.city, (cityCount.get(l.city) ?? 0) + 1); });
  return {
    monthly, weekly, daily,
    period_today: period('Today', new Date(), 3, 0),
    period_week: period('This week', weekAgo, 18, 2),
    period_month: period('This month', monthAgo, 61, 7),
    status_breakdown: { new: 14, working: 19, qualified: 12, converted: 7, unqualified: 6, lost: 3 },
    source_breakdown: [
      { name: 'Field visit', count: 26 }, { name: 'Referral', count: 14 },
      { name: 'Website form', count: 9 }, { name: 'WhatsApp', count: 8 }, { name: 'Missed call', count: 4 },
    ],
    city_breakdown: Array.from(cityCount.entries()).map(([name, c]) => ({ name, count: c + 2 })),
    ageing_distribution: [
      { bucket: '0–7d', count: 21 }, { bucket: '8–14d', count: 14 },
      { bucket: '15–30d', count: 17 }, { bucket: '31–60d', count: 7 }, { bucket: '60d+', count: 2 },
    ],
  };
}

function perfRow(user_id: string | null, name: string, k: number): TeamPerformanceRow {
  const rnd = seeded(`perf:${name}`);
  const owned = 18 + Math.floor(rnd() * 26) + k;
  const qualified = Math.floor(owned * (0.3 + rnd() * 0.2));
  const converted = Math.floor(qualified * (0.25 + rnd() * 0.2));
  const won = Math.max(1, Math.floor(converted * 0.7));
  return {
    user_id, name,
    total_leads_owned: owned,
    new_leads_today: Math.floor(rnd() * 3),
    new_leads_week: 3 + Math.floor(rnd() * 5),
    new_leads_month: 10 + Math.floor(rnd() * 12),
    new_leads_period: 10 + Math.floor(rnd() * 12),
    qualified_count: qualified,
    converted_count: converted,
    unqualified_count: Math.floor(owned * 0.12),
    lost_leads_count: Math.floor(owned * 0.07),
    qualified_rate: +(100 * qualified / owned).toFixed(1),
    converted_rate: +(100 * converted / owned).toFixed(1),
    won_count: won,
    won_value: won * (180000 + Math.floor(rnd() * 240000)),
    lost_count: Math.floor(rnd() * 3),
    open_count: 2 + Math.floor(rnd() * 5),
    open_pipeline_value: (2 + Math.floor(rnd() * 5)) * (200000 + Math.floor(rnd() * 300000)),
    conversion_rate: +(100 * won / Math.max(1, converted + 2)).toFixed(1),
    avg_deal_size: 220000 + Math.floor(rnd() * 180000),
    avg_sales_cycle_days: 12 + Math.floor(rnd() * 14),
    avg_ageing_days: 6 + Math.floor(rnd() * 9),
    oldest_open_lead_days: 20 + Math.floor(rnd() * 30),
    activities_completed_period: 34 + Math.floor(rnd() * 40),
    activities_total_period: 40 + Math.floor(rnd() * 48),
    last_activity_at: new Date(Date.now() - Math.floor(rnd() * 36) * 3600_000).toISOString(),
    avg_lead_score: 52 + Math.floor(rnd() * 30),
  };
}

export function mockTeamPerformance(users: SeedUser[]): { total: TeamPerformanceRow; rows: TeamPerformanceRow[] } {
  const rows = users.map((u, i) => perfRow(u.id, u.name, i));
  const total = perfRow(null, 'Team total', 0);
  const sum = (f: (r: TeamPerformanceRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  total.total_leads_owned = sum(r => r.total_leads_owned);
  total.new_leads_today = sum(r => r.new_leads_today);
  total.new_leads_week = sum(r => r.new_leads_week);
  total.new_leads_month = sum(r => r.new_leads_month);
  total.new_leads_period = sum(r => r.new_leads_period);
  total.qualified_count = sum(r => r.qualified_count);
  total.converted_count = sum(r => r.converted_count);
  total.unqualified_count = sum(r => r.unqualified_count);
  total.lost_leads_count = sum(r => r.lost_leads_count);
  total.won_count = sum(r => r.won_count);
  total.won_value = sum(r => r.won_value);
  total.lost_count = sum(r => r.lost_count);
  total.open_count = sum(r => r.open_count);
  total.open_pipeline_value = sum(r => r.open_pipeline_value);
  total.activities_completed_period = sum(r => r.activities_completed_period);
  total.activities_total_period = sum(r => r.activities_total_period);
  total.qualified_rate = +(100 * total.qualified_count / Math.max(1, total.total_leads_owned)).toFixed(1);
  total.converted_rate = +(100 * total.converted_count / Math.max(1, total.total_leads_owned)).toFixed(1);
  total.conversion_rate = +(100 * total.won_count / Math.max(1, total.converted_count + 4)).toFixed(1);
  total.avg_deal_size = Math.round(total.won_value / Math.max(1, total.won_count));
  return { total, rows };
}

export function mockTeamDaily(
  users: SeedUser[],
  anchors: Map<string, { lat: number; lng: number; address?: string }>
): TeamDailyCard[] {
  return users.map((u, i) => {
    const rnd = seeded(`daily:${u.id}:${todayStr()}`);
    const anchor = anchors.get(u.id);
    const total = 3 + Math.floor(rnd() * 6);
    const completed = Math.max(1, total - Math.floor(rnd() * 3));
    const calls = Math.floor(rnd() * 3), meetings = Math.floor(rnd() * 2);
    const site_visits = Math.max(0, Math.min(total - calls - meetings, 1 + Math.floor(rnd() * 3)));
    const lastAct = new Date(Date.now() - Math.floor(rnd() * 5 + 1) * 3600_000 * (i === 4 ? 3 : 1));
    const wonToday = rnd() < 0.3 ? 1 : 0;
    return {
      user_id: u.id,
      name: u.name,
      last_known_location: {
        captured_at: lastAct.toISOString(),
        source: 'lead_created',
        latitude: anchor?.lat ?? null,
        longitude: anchor?.lng ?? null,
        address: anchor?.address ?? null,
      },
      last_activity_at: lastAct.toISOString(),
      activities_today: {
        total, completed, calls, emails: Math.floor(rnd() * 2), meetings,
        site_visits, tasks: Math.max(0, total - calls - meetings - site_visits), other: 0,
      },
      leads_today: Math.floor(rnd() * 4),
      leads_today_qualified: Math.floor(rnd() * 2),
      leads_today_converted: wonToday,
      deals_open_count: 2 + Math.floor(rnd() * 4),
      deals_won_today_count: wonToday,
      deals_won_today_value: wonToday * (240000 + Math.floor(rnd() * 260000)),
      pipeline_value: (3 + Math.floor(rnd() * 5)) * 250000,
      status: i === 4 ? 'idle' : 'active',
    };
  });
}

// ── 4. AI suggest mocks ────────────────────────────────────────────────────

export function mockSuggestFromUpdate(leadName: string | undefined, draft: string): { success: boolean; data: UpdateSuggestion } {
  const first = (leadName || 'the customer').split(' ')[0];
  const mentionsPrice = /price|rate|₹|cost|mehenga|sasta/i.test(draft);
  const due = new Date(); due.setDate(due.getDate() + 2); due.setHours(10, 30, 0, 0);
  return {
    success: true,
    data: {
      activity: {
        type: 'call',
        subject: mentionsPrice ? `Price follow-up with ${first}` : `Follow-up with ${first}`,
        body: mentionsPrice
          ? 'Walk through the per-piece certified-weight comparison and the whole-home cost delta before requoting.'
          : 'Confirm current construction stage and agree the next site visit.',
        due_at: due.toISOString(),
      },
      followup: {
        channel: 'whatsapp',
        message: mentionsPrice
          ? `Namaste ${first} ji! Jaisi baat hui — certified full-weight quote bhej raha hoon. Poore ghar ke cost par farak aadha percent se kam aata hai. Kal subah call karta hoon.`
          : `Namaste ${first} ji! Aaj ki baat ke liye dhanyavaad. Agla step confirm karne ke liye kal call karunga.`,
      },
      next_actions: mentionsPrice
        ? ['Send certified full-weight quote card', 'Book Friday site visit', 'Log competitor price on the lead']
        : ['Send brochure on WhatsApp', 'Schedule next site visit', 'Update construction stage on the lead'],
    },
  };
}
