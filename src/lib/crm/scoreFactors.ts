// Shared human-readable labels for lead-score breakdown keys, plus helpers to
// turn a raw `score_breakdown` jsonb into a sorted factor list. Used by the
// leads-table breakdown popup and the dashboard map popup so the explanation
// reads the same everywhere the score appears.

export const SCORE_FACTOR_LABELS: Record<string, string> = {
  // Reachability
  phone_present: 'Phone Number Present',
  phone_valid: 'Valid Mobile Number',
  email_present: 'Email Present',
  alt_mobiles: 'Alternate Mobiles',
  whatsapp_consent: 'WhatsApp Consent',
  marketing_consent: 'Marketing Consent',
  contact_complete: 'Contact Completeness',
  // Profile / field verification
  full_name: 'Full Name',
  geo: 'Location Known',
  gps_verified: 'GPS-Verified On-Site',
  photo_captured: 'Rep Photo Captured',
  address: 'Address Details',
  // Firmographics (B2B)
  title_seniority: 'Job Title Seniority',
  company_present: 'Company Present',
  company_size: 'Company Size',
  industry_match: 'Industry Match',
  // Intent / lifecycle
  status: 'Status Progression',
  lifecycle: 'Lifecycle Stage',
  converted: 'Converted / Deal Linked',
  volume_interest: 'Volume Interest (MT)',
  product_interest: 'Product Interest',
  tags: 'Tags',
  // Engagement
  whatsapp_30d: 'WhatsApp (30d)',
  calls_30d: 'Calls (30d)',
  meetings_30d: 'Meetings (30d)',
  updates_30d: 'Updates (30d)',
  activity_history: 'Activity History (all-time)',
  bant_signals_in_updates: 'BANT Signals in Updates',
  recent_touch: 'Recent Touch',
  // Source
  source_quality: 'Lead Source Quality',
  campaign: 'Campaign Attribution',
  // Legacy keys (v1/v2)
  source: 'Lead Source',
  engagement: 'Engagement Activity',
  recency: 'Recency',
  icp: 'ICP Match',
};

// Keys that are metadata, not scoring factors.
const META_KEYS = new Set(['total', 'base', 'llm_adjustment', 'llm_reasons', 'llm_confidence', 'model']);

export function factorLabel(key: string): string {
  return SCORE_FACTOR_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ScoreFactorEntry { key: string; label: string; value: number; }

/** Sorted (desc) list of real scoring factors from a raw score_breakdown. */
export function breakdownFactors(breakdown: unknown): ScoreFactorEntry[] {
  if (!breakdown || typeof breakdown !== 'object') return [];
  return Object.entries(breakdown as Record<string, unknown>)
    .filter(([k, v]) => typeof v === 'number' && !META_KEYS.has(k))
    .map(([k, v]) => ({ key: k, label: factorLabel(k), value: v as number }))
    .sort((a, b) => b.value - a.value);
}

export function llmAdjustmentOf(breakdown: unknown): number | null {
  const v = (breakdown as Record<string, unknown> | null | undefined)?.llm_adjustment;
  return typeof v === 'number' ? v : null;
}
