/**
 * Frontend-only demo seed for the Nurturing module. No backend wiring —
 * just realistic mock data so the user can click through the flow
 * (segments → audience sync → sequences → attribution) before any of
 * the engines are actually built. All numbers chosen to feel plausible
 * for Tata Tiscon scale (~5k leads/month inflow).
 */

export type DemoSegment = {
  id: string;
  name: string;
  description: string;
  rule_summary: string;          // human-readable rule, no backend evaluator yet
  member_count: number;
  last_refreshed_at: string;     // ISO
  meta_audience: {
    enabled: boolean;
    name: string;
    matched: number;
    match_rate: number;          // 0-1
    last_sync_at: string;
  };
  google_audience: {
    enabled: boolean;
    name: string;
    matched: number;
    match_rate: number;
    last_sync_at: string;
  };
  primary_use_case: string;
  ad_creative_themes: string[];
};

export type DemoSequenceStep = {
  position: number;
  channel: 'whatsapp' | 'sms' | 'ivr';
  template_name: string;
  template_preview: string;     // body text
  delay_label: string;           // "Immediately" | "After 1 day" | etc
  send_window: string;           // "09:00–21:00 IST"
  category?: 'Marketing' | 'Utility' | 'Authentication';
};

export type DemoSequence = {
  id: string;
  name: string;
  segment_id: string;            // which segment enrolls into this
  trigger_label: string;
  is_active: boolean;
  enrolled: number;
  completed: number;
  exited_replied: number;
  exited_converted: number;
  exited_opted_out: number;
  reply_rate: number;            // 0-1
  conversion_rate: number;       // 0-1
  steps: DemoSequenceStep[];
};

export type DemoFunnelStage = {
  label: string;
  count: number;
  pct_of_previous?: number;      // 0-1
};

export type DemoCostBreakdown = {
  channel: string;
  spend_inr: number;
  unit_label: string;
  units: number;
};

export type DemoAttributedConversion = {
  lead_name: string;
  segment_name: string;
  sequence_name: string;
  touches: number;
  channels: string[];
  deal_amount_inr: number;
  time_to_close_days: number;
  converted_at: string;
};

// ──────────────────────────────────────────────────────────────
// Segments — 7 representative segments for Tata Tiscon
// ──────────────────────────────────────────────────────────────
export const DEMO_SEGMENTS: DemoSegment[] = [
  {
    id: 'seg-fresh',
    name: 'Fresh leads (last 7 days)',
    description: 'New leads, never contacted. Highest WA reply rate window.',
    rule_summary: 'status = new AND created_at >= today - 7d AND consent.whatsapp = granted',
    member_count: 142,
    last_refreshed_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Fresh_Leads_7d',
      matched: 89,
      match_rate: 0.627,
      last_sync_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Fresh_Leads_7d',
      matched: 73,
      match_rate: 0.514,
      last_sync_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    },
    primary_use_case: 'Welcome WA + brand-awareness retargeting',
    ad_creative_themes: ['100 years of Tata strength', 'Build for the next earthquake'],
  },
  {
    id: 'seg-engaged',
    name: 'Engaged unconverted',
    description: 'Replied to a WA or clicked a link. Active consideration.',
    rule_summary: 'status IN (working, nurturing) AND last_activity_at <= today - 7d AND last_activity_at > today - 30d',
    member_count: 87,
    last_refreshed_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Engaged_Unconverted',
      matched: 59,
      match_rate: 0.678,
      last_sync_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Engaged_Unconverted',
      matched: 48,
      match_rate: 0.552,
      last_sync_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    primary_use_case: 'Value-content WA + "expert consultation" retargeting',
    ad_creative_themes: ['Verified by 5000 contractors', 'TMT SD grade vs ordinary'],
  },
  {
    id: 'seg-hot-ab',
    name: 'Hot A/B grade leads',
    description: 'AI score A or B, status qualified. Top conversion priority.',
    rule_summary: 'score_grade IN (A, B) AND status = qualified',
    member_count: 23,
    last_refreshed_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Hot_AB_Grade',
      matched: 17,
      match_rate: 0.739,
      last_sync_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Hot_AB_Grade',
      matched: 14,
      match_rate: 0.609,
      last_sync_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    primary_use_case: 'Premium WA offer + high-bid brand-keyword Search',
    ad_creative_themes: ['Lock today\'s price for 30 days', 'Tata Steel guarantee'],
  },
  {
    id: 'seg-stale',
    name: 'Stale (14+ days silent)',
    description: 'In nurture but no activity in 14+ days. Re-engagement opportunity.',
    rule_summary: 'status IN (working, nurturing) AND last_activity_at < today - 14d',
    member_count: 56,
    last_refreshed_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Stale_Reengage',
      matched: 34,
      match_rate: 0.607,
      last_sync_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Stale_Reengage',
      matched: 28,
      match_rate: 0.500,
      last_sync_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    },
    primary_use_case: '"Did we lose you?" WA + reminder retargeting',
    ad_creative_themes: ['Monsoon scheme expires this week', 'Your Diwali home build'],
  },
  {
    id: 'seg-lost',
    name: 'Lost-but-recoverable',
    description: 'Lost on price or timing in last 90d. Worth one quarterly re-pitch.',
    rule_summary: 'status = lost AND lost_reason IN (price, timing) AND closed_at >= today - 90d',
    member_count: 31,
    last_refreshed_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Lost_Recoverable',
      matched: 18,
      match_rate: 0.581,
      last_sync_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: false,
      name: 'TT_Lost_Recoverable',
      matched: 0,
      match_rate: 0,
      last_sync_at: '',
    },
    primary_use_case: 'Quarterly scheme push WA',
    ad_creative_themes: ['You looked, now save', 'Build season is here'],
  },
  {
    id: 'seg-converted',
    name: 'Converted (LTV play)',
    description: 'Already a customer in the last 12mo. Cross-sell + referral.',
    rule_summary: 'is_converted = true AND last_deal_won_at >= today - 365d',
    member_count: 64,
    last_refreshed_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Converted_LTV',
      matched: 48,
      match_rate: 0.750,
      last_sync_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Converted_LTV',
      matched: 41,
      match_rate: 0.641,
      last_sync_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    },
    primary_use_case: 'Loyalty WA + cross-sell (Tata cement, GI wire) ads',
    ad_creative_themes: ['Refer & earn ₹2,000', 'Complete your build with Tata cement'],
  },
  {
    id: 'seg-geo-jh',
    name: 'Jharkhand / Bihar / Odisha',
    description: 'East-India geo. Hindi-first WA copy + state-dealer creatives.',
    rule_summary: 'state IN (Jharkhand, Bihar, Odisha) AND consent.whatsapp = granted',
    member_count: 119,
    last_refreshed_at: new Date(Date.now() - 21 * 60 * 1000).toISOString(),
    meta_audience: {
      enabled: true,
      name: 'TT_Geo_East_India',
      matched: 81,
      match_rate: 0.681,
      last_sync_at: new Date(Date.now() - 33 * 60 * 1000).toISOString(),
    },
    google_audience: {
      enabled: true,
      name: 'TT_Geo_East_India',
      matched: 64,
      match_rate: 0.538,
      last_sync_at: new Date(Date.now() - 33 * 60 * 1000).toISOString(),
    },
    primary_use_case: 'Hindi WA templates + East-India dealer scheme ads',
    ad_creative_themes: ['Ranchi dealer offer this week', '50 साल की मज़बूती'],
  },
];

// ──────────────────────────────────────────────────────────────
// Sequences — 3 representative WA drip campaigns
// ──────────────────────────────────────────────────────────────
export const DEMO_SEQUENCES: DemoSequence[] = [
  {
    id: 'seq-welcome',
    name: 'Tata Tiscon — New lead welcome',
    segment_id: 'seg-fresh',
    trigger_label: 'When lead joins "Fresh leads" segment',
    is_active: true,
    enrolled: 412,
    completed: 287,
    exited_replied: 94,
    exited_converted: 31,
    exited_opted_out: 12,
    reply_rate: 0.228,
    conversion_rate: 0.075,
    steps: [
      {
        position: 1,
        channel: 'whatsapp',
        template_name: 'tt_welcome_v1',
        template_preview: 'नमस्ते {{1}} जी 🙏 Tata Tiscon में आपकी रुचि के लिए धन्यवाद। हम भारत के सबसे भरोसेमंद TMT बार ब्रांड हैं।\n\n[View brochure] [Talk to expert]',
        delay_label: 'Immediately',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
      {
        position: 2,
        channel: 'whatsapp',
        template_name: 'tt_warranty_v1',
        template_preview: '{{1}} जी, did you know? Tata Tiscon SD bars come with a 10-year warranty. Used in 50+ landmark projects.\n\n[Watch 30s video] [Get free quote]',
        delay_label: 'After 1 day',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
      {
        position: 3,
        channel: 'whatsapp',
        template_name: 'tt_case_study_v1',
        template_preview: 'Hi {{1}}, see how Mr Sharma in {{2: city}} built his home with Tata Tiscon SD bars 👇',
        delay_label: 'After 3 days',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
      {
        position: 4,
        channel: 'whatsapp',
        template_name: 'tt_dealer_offer_v1',
        template_preview: 'Your nearest Tata Tiscon dealer in {{2: city}} has a special scheme this week.\nDealer: {{3: name}} | Call: {{4: phone}}\n\n[Lock the price]',
        delay_label: 'After 5 days',
        send_window: '10:00–19:00 IST',
        category: 'Utility',
      },
      {
        position: 5,
        channel: 'ivr',
        template_name: 'tt_callback_ivr_v1',
        template_preview: 'Auto-call: "Hi, this is Tata Tiscon. Press 1 to speak to a consultant, 2 to receive pricing on WhatsApp."',
        delay_label: 'After 7 days',
        send_window: '11:00–18:00 IST',
      },
      {
        position: 6,
        channel: 'whatsapp',
        template_name: 'tt_final_touch_v1',
        template_preview: '{{1}}, our Tata Tiscon expert will call you tomorrow morning to help finalize your construction plan.\n\n[Pick a time] [Get pricing] [Not interested]',
        delay_label: 'After 10 days',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
    ],
  },
  {
    id: 'seq-reengage',
    name: 'Re-engage stale leads (Hindi)',
    segment_id: 'seg-stale',
    trigger_label: 'When lead joins "Stale 14+ days" segment',
    is_active: true,
    enrolled: 56,
    completed: 38,
    exited_replied: 11,
    exited_converted: 4,
    exited_opted_out: 3,
    reply_rate: 0.196,
    conversion_rate: 0.071,
    steps: [
      {
        position: 1,
        channel: 'whatsapp',
        template_name: 'tt_reengage_hindi_v1',
        template_preview: 'नमस्ते {{1}}, क्या निर्माण कार्य शुरू हो गया है? इस महीने {{2: city}} में Tata Tiscon की एक खास स्कीम है।\n\n[Yes, send pricing] [Maybe later]',
        delay_label: 'Immediately',
        send_window: '09:00–20:00 IST',
        category: 'Marketing',
      },
      {
        position: 2,
        channel: 'sms',
        template_name: 'tt_reengage_sms_v1',
        template_preview: 'Hi {{1}}, Tata Tiscon dealers in {{2}} are running a Diwali scheme: ₹500/tonne off Fe550D. wa.me/91XXXXXXXXXX',
        delay_label: 'After 2 days',
        send_window: '09:00–20:00 IST',
      },
      {
        position: 3,
        channel: 'whatsapp',
        template_name: 'tt_reengage_final_v1',
        template_preview: '{{1}} जी, last chance to lock this month\'s scheme. Reply YES and we\'ll send dealer details.',
        delay_label: 'After 5 days',
        send_window: '10:00–19:00 IST',
        category: 'Marketing',
      },
    ],
  },
  {
    id: 'seq-post-convert',
    name: 'Post-conversion thank-you + referral',
    segment_id: 'seg-converted',
    trigger_label: 'When a deal is marked Won',
    is_active: true,
    enrolled: 64,
    completed: 41,
    exited_replied: 27,
    exited_converted: 0,
    exited_opted_out: 1,
    reply_rate: 0.422,
    conversion_rate: 0,
    steps: [
      {
        position: 1,
        channel: 'whatsapp',
        template_name: 'tt_thankyou_v1',
        template_preview: 'Thank you {{1}} for choosing Tata Tiscon! 🙏 Your order #{{2}} for {{3}} tonnes is confirmed.\n\n[Track delivery] [Site-safety guide]',
        delay_label: 'Immediately',
        send_window: '09:00–21:00 IST',
        category: 'Utility',
      },
      {
        position: 2,
        channel: 'whatsapp',
        template_name: 'tt_progress_v1',
        template_preview: '{{1}}, hope construction is going well! Need anything? Reply HI for instant help.',
        delay_label: 'After 30 days',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
      {
        position: 3,
        channel: 'whatsapp',
        template_name: 'tt_referral_v1',
        template_preview: '{{1}}, know someone building? Refer them and you both get ₹2,000 off on the next 5-tonne order.\n\n[Send my referral link]',
        delay_label: 'After 90 days',
        send_window: '09:00–21:00 IST',
        category: 'Marketing',
      },
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// Funnel + economics (last 30 days)
// ──────────────────────────────────────────────────────────────
export const DEMO_FUNNEL: DemoFunnelStage[] = [
  { label: 'Reached (WA delivered)', count: 2341 },
  { label: 'Opened (WA read)', count: 1820, pct_of_previous: 0.777 },
  { label: 'Engaged (clicked / replied)', count: 489, pct_of_previous: 0.269 },
  { label: 'Qualified by FE', count: 167, pct_of_previous: 0.342 },
  { label: 'Converted (deal won)', count: 41, pct_of_previous: 0.246 },
];

export const DEMO_COSTS_LAST_30D: DemoCostBreakdown[] = [
  { channel: 'WhatsApp Marketing', spend_inr: 17920, unit_label: 'conversations', units: 22974 },
  { channel: 'WhatsApp Utility', spend_inr: 920, unit_label: 'conversations', units: 8000 },
  { channel: 'SMS fallback', spend_inr: 400, unit_label: 'sends', units: 2000 },
  { channel: 'IVR (Exotel)', spend_inr: 1000, unit_label: 'calls', units: 4000 },
  { channel: 'Meta retargeting', spend_inr: 10200, unit_label: 'impressions', units: 102000 },
  { channel: 'Google Customer Match', spend_inr: 8750, unit_label: 'impressions', units: 87500 },
  { channel: 'Click-to-WhatsApp ads', spend_inr: 47800, unit_label: 'opens', units: 683 },
  { channel: 'Search RLSA (brand keywords)', spend_inr: 14250, unit_label: 'clicks', units: 950 },
];

export const DEMO_TOP_CONVERSIONS: DemoAttributedConversion[] = [
  {
    lead_name: 'Amit Verma',
    segment_name: 'Hot A/B grade leads',
    sequence_name: 'Tata Tiscon — New lead welcome',
    touches: 7,
    channels: ['WA', 'IG', 'YouTube', 'Search'],
    deal_amount_inr: 235000,
    time_to_close_days: 9,
    converted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    lead_name: 'Sunita Devi',
    segment_name: 'Jharkhand / Bihar / Odisha',
    sequence_name: 'Tata Tiscon — New lead welcome',
    touches: 5,
    channels: ['WA', 'IG', 'IVR'],
    deal_amount_inr: 142000,
    time_to_close_days: 14,
    converted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    lead_name: 'Rakesh Patel',
    segment_name: 'Engaged unconverted',
    sequence_name: 'Tata Tiscon — New lead welcome',
    touches: 9,
    channels: ['WA', 'FB', 'IG', 'YouTube'],
    deal_amount_inr: 310000,
    time_to_close_days: 21,
    converted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    lead_name: 'Priya Sharma',
    segment_name: 'Stale (14+ days silent)',
    sequence_name: 'Re-engage stale leads (Hindi)',
    touches: 4,
    channels: ['WA', 'SMS', 'IG'],
    deal_amount_inr: 88000,
    time_to_close_days: 32,
    converted_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    lead_name: 'Vikram Singh',
    segment_name: 'Fresh leads (last 7 days)',
    sequence_name: 'Tata Tiscon — New lead welcome',
    touches: 6,
    channels: ['WA', 'IG', 'YouTube'],
    deal_amount_inr: 198000,
    time_to_close_days: 11,
    converted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_CONSENT_FUNNEL = {
  total_leads: 1247,
  consent_granted_whatsapp: 1083,
  consent_granted_sms: 1014,
  consent_granted_ads: 989,
  withdrawn_last_30d: 18,
  capture_sources: [
    { source: 'Webform v1', leads: 642, granted_pct: 0.91 },
    { source: 'Field-rep mobile app', leads: 378, granted_pct: 0.96 },
    { source: 'Meta Lead Ads', leads: 167, granted_pct: 0.81 },
    { source: 'CSV import', leads: 60, granted_pct: 0.65 },
  ],
};
