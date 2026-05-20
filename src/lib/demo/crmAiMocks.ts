/**
 * Demo mocks for the CRM AI endpoints and deal history.
 *
 * The default demo intercept used to return an empty list for deal
 * history and a no-op for the AI POSTs (win probability + next-best
 * action), so the new methodology popups had nothing to render. These
 * helpers produce realistic, deal-id-keyed payloads that match the
 * shapes the live backend now ships:
 *
 *   - `mockDealHistory(dealId)` → 5 enriched history rows (stage moves)
 *   - `mockWinProbability(dealId)` → { probability, reasoning, breakdown }
 *   - `mockNextBestAction(dealId)` → NextBestAction + methodology
 *
 * Outputs are deterministic for a given deal id so the demo doesn't
 * flicker on refresh.
 */

const list = <T,>(rows: T[]) => ({ success: true, data: rows });
const wrap = <T,>(body: T) => ({ success: true, data: body });

// Stable "random" — deterministic per deal id so the demo doesn't change
// on every refresh.
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

// ── Deal History ─────────────────────────────────────────────────────
const DEMO_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation'] as const;

export function mockDealHistory(dealId: string) {
  const seed = hash(dealId || 'demo-deal');
  const now = Date.now();
  // Walk the deal through the funnel — earliest event first then reverse so
  // the response mirrors the backend's `changed_at DESC` ordering.
  const events = [
    { event_type: 'created',        from_stage: null,                  to_stage: DEMO_STAGES[0], daysAgo: 14, from_amount: 0,      to_amount: 250000 + (seed % 9) * 25000 },
    { event_type: 'stage_changed',  from_stage: DEMO_STAGES[0],        to_stage: DEMO_STAGES[1], daysAgo: 12 },
    { event_type: 'amount_changed', from_stage: DEMO_STAGES[1],        to_stage: DEMO_STAGES[1], daysAgo:  9, from_amount: 250000 + (seed % 9) * 25000, to_amount: 320000 + (seed % 9) * 25000 },
    { event_type: 'stage_changed',  from_stage: DEMO_STAGES[1],        to_stage: DEMO_STAGES[2], daysAgo:  6 },
    { event_type: 'stage_changed',  from_stage: DEMO_STAGES[2],        to_stage: DEMO_STAGES[3], daysAgo:  2 },
  ];
  const rows = events.map((e, i) => ({
    id: `demo-hist-${dealId}-${i + 1}`,
    deal_id: dealId,
    org_id: 'demo-org-999',
    event_type: e.event_type,
    from_stage: e.from_stage,
    to_stage: e.to_stage,
    from_stage_id: e.from_stage ? `demo-stage-${e.from_stage.toLowerCase()}` : null,
    to_stage_id:   e.to_stage   ? `demo-stage-${e.to_stage.toLowerCase()}`   : null,
    from_amount: e.from_amount ?? null,
    to_amount: e.to_amount ?? null,
    changed_by: 'demo-user-1',
    changed_at: new Date(now - e.daysAgo * 86_400_000).toISOString(),
    created_at: new Date(now - e.daysAgo * 86_400_000).toISOString(),
    time_in_previous_stage_seconds: i === 0 ? null : (events[i - 1].daysAgo - e.daysAgo) * 86_400,
  }));
  return list(rows.reverse()); // newest first, matches backend
}

// ── Win Probability ──────────────────────────────────────────────────
export function mockWinProbability(dealId: string) {
  const seed = hash(dealId || 'demo-deal');
  // Three personas so the demo shows a range, not the same number on
  // every deal:
  //   bucket 0: typical mid-funnel deal (~55%)
  //   bucket 1: hot deal w/ frequent engagement (~78%)
  //   bucket 2: stalled deal that crossed the age penalty (~30%)
  const bucket = seed % 3;
  const stageName = ['Proposal', 'Negotiation', 'Qualified'][bucket];
  const stageProb = [50, 80, 50][bucket];
  const ageDays = [42, 18, 95][bucket];
  const ageMultiplier = ageDays > 90 ? 0.70 : ageDays > 60 ? 0.85 : 1.0;
  const ageLabel = ageDays > 90
    ? 'Over 90 days old — heavy penalty (×0.70)'
    : ageDays > 60
      ? 'Between 60–90 days — moderate penalty (×0.85)'
      : 'Under 60 days — no penalty (×1.00)';
  const activities30d = [5, 9, 1][bucket];
  const engagementMultiplier = Math.min(1.5, 0.7 + activities30d * 0.1);
  const engagementLabel = activities30d === 0
    ? 'No activities in the last 30 days (×0.70)'
    : activities30d >= 8
      ? `${activities30d} activities in last 30 days — capped at ×1.50`
      : `${activities30d} ${activities30d === 1 ? 'activity' : 'activities'} in last 30 days (×${engagementMultiplier.toFixed(2)})`;
  const probability = Math.max(0, Math.min(100, Math.round(stageProb * ageMultiplier * engagementMultiplier)));
  const reasoning = bucket === 1
    ? `Strong engagement (${activities30d} touches in 30d) and the deal is fresh — pricing has been agreed in principle.`
    : bucket === 2
      ? `Deal is ${ageDays} days old with only ${activities30d} recent activity. Age penalty is dragging the score down.`
      : `${activities30d} touches over ${ageDays} days in ${stageName}. Engagement is healthy but the deal needs to move stages.`;

  return wrap({
    probability,
    reasoning,
    breakdown: {
      stage_probability: stageProb,
      stage_name: stageName,
      age_days: ageDays,
      age_multiplier: ageMultiplier,
      age_label: ageLabel,
      activities_30d: activities30d,
      engagement_multiplier: engagementMultiplier,
      engagement_label: engagementLabel,
      formula_text: `${stageProb}% × ${ageMultiplier.toFixed(2)} (age) × ${engagementMultiplier.toFixed(2)} (engagement) = ${probability}%`,
      final_probability: probability,
    },
  });
}

// ── Next Best Action ─────────────────────────────────────────────────
type WhenSlot = 'now' | 'today' | 'this_week' | 'next_week';
type ActionSlot = 'call' | 'meeting' | 'send_proposal' | 'nurture' | 'disqualify';

interface DemoPlanStep { step: number; action: string; rationale: string; when: WhenSlot }

const NBA_PROFILES: Array<{
  action: ActionSlot;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  when: WhenSlot;
  reasoning: string;
  signals: {
    stage_name: string; stage_type: string; stage_prob: number;
    days_in_stage: number; deal_age_days: number; win_probability: number;
    activities_30d_total: number; activities_30d_by_type: Record<string, number>;
    last_activity_type: string; days_since_last_touch: number; stage_transitions: number;
  };
  plan: DemoPlanStep[];
}> = [
  {
    action: 'meeting',
    priority: 'high',
    reason: 'Buyer has reviewed the proposal — schedule a closing meeting this week to lock pricing.',
    when: 'this_week',
    reasoning: 'Strong engagement + proposal sent — typical pattern for deals that close within 14 days when a meeting is locked.',
    signals: {
      stage_name: 'Proposal', stage_type: 'open', stage_prob: 70,
      days_in_stage: 6, deal_age_days: 42, win_probability: 60,
      activities_30d_total: 5, activities_30d_by_type: { call: 3, meeting: 1, whatsapp: 1 },
      last_activity_type: 'call', days_since_last_touch: 2, stage_transitions: 3,
    },
    plan: [
      { step: 1, action: 'Schedule a 30-min closing meeting with the decision-maker', rationale: 'Proposal is reviewed; time to surface objections and ask for the order.', when: 'this_week' },
      { step: 2, action: 'Send a WhatsApp recap with the proposal one-pager + meeting invite', rationale: 'Reduces no-show risk and keeps the customer on their preferred channel.', when: 'today' },
      { step: 3, action: 'Prep a revised quote with two pricing tiers', rationale: 'Anchor negotiation with options rather than a single number.', when: 'this_week' },
      { step: 4, action: 'Confirm the verbal commitment and request PO', rationale: 'Convert meeting outcome into a paper trail before momentum dies.', when: 'next_week' },
    ],
  },
  {
    action: 'call',
    priority: 'high',
    reason: 'No touch in 9 days at Negotiation — call today to re-establish urgency before the deal cools.',
    when: 'today',
    reasoning: 'Late-stage deals decay fast without contact. The activity-mix is heavy on email, which under-performs vs phone for this buyer.',
    signals: {
      stage_name: 'Negotiation', stage_type: 'open', stage_prob: 85,
      days_in_stage: 11, deal_age_days: 18, win_probability: 78,
      activities_30d_total: 9, activities_30d_by_type: { call: 2, whatsapp: 4, meeting: 2, note: 1 },
      last_activity_type: 'whatsapp', days_since_last_touch: 9, stage_transitions: 4,
    },
    plan: [
      { step: 1, action: 'Call the primary contact and ask for a verbal yes/no', rationale: 'Negotiation has stalled — direct ask is the fastest disqualifier or closer.', when: 'now' },
      { step: 2, action: 'Send a WhatsApp summarising the agreed commercial terms', rationale: 'Keeps the conversation on the customer\'s preferred channel.', when: 'today' },
      { step: 3, action: 'Book a final pricing review with finance + ops sponsors', rationale: 'Get internal stakeholders aligned before the customer goes silent again.', when: 'this_week' },
    ],
  },
  {
    action: 'nurture',
    priority: 'low',
    reason: 'Deal is 95 days old with 1 activity in 30 days. Drop into nurture and disqualify if no response in 2 weeks.',
    when: 'this_week',
    reasoning: 'Age penalty + low engagement = poor close probability. Heavy outreach is unlikely to convert; nurture and re-prioritise.',
    signals: {
      stage_name: 'Qualified', stage_type: 'open', stage_prob: 50,
      days_in_stage: 34, deal_age_days: 95, win_probability: 30,
      activities_30d_total: 1, activities_30d_by_type: { email: 1 },
      last_activity_type: 'email', days_since_last_touch: 24, stage_transitions: 2,
    },
    plan: [
      { step: 1, action: 'Send a "still interested?" WhatsApp template', rationale: 'Cheap, asynchronous signal — see if the buyer is still alive on this deal.', when: 'today' },
      { step: 2, action: 'If no response by Friday, downgrade to nurture-only cadence', rationale: 'Frees up the rep\'s focus for higher-probability deals.', when: 'this_week' },
      { step: 3, action: 'Set a 30-day check-in reminder', rationale: 'Re-evaluates the deal when business may have changed.', when: 'next_week' },
    ],
  },
];

export function mockNextBestAction(dealId: string) {
  const seed = hash(dealId || 'demo-deal');
  const profile = NBA_PROFILES[seed % NBA_PROFILES.length];
  return wrap({
    deal_id: dealId,
    action: profile.action,
    priority: profile.priority,
    reason: profile.reason,
    suggested_template_id: null,
    suggested_when: profile.when,
    methodology: {
      signals: {
        stage: { name: profile.signals.stage_name, type: profile.signals.stage_type, probability: profile.signals.stage_prob },
        days_in_stage: profile.signals.days_in_stage,
        deal_age_days: profile.signals.deal_age_days,
        win_probability: profile.signals.win_probability,
        activities_30d_total: profile.signals.activities_30d_total,
        activities_30d_by_type: profile.signals.activities_30d_by_type,
        last_activity_at: new Date(Date.now() - profile.signals.days_since_last_touch * 86_400_000).toISOString(),
        last_activity_type: profile.signals.last_activity_type,
        days_since_last_touch: profile.signals.days_since_last_touch,
        stage_transitions: profile.signals.stage_transitions,
      },
      closing_plan: profile.plan,
      reasoning: profile.reasoning,
    },
  });
}
