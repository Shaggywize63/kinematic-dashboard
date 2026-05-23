// CRM module types — mirror backend resource shapes.

export type LeadStatus = 'new' | 'working' | 'qualified' | 'unqualified' | 'converted';
export type DealStatus = 'open' | 'won' | 'lost';
export type ActivityType = 'call' | 'email' | 'meeting' | 'task' | 'note' | 'sms' | 'whatsapp';
export type WhatsappStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received' | 'replied';
export type WhatsappDirection = 'outbound' | 'inbound';
export type BusinessType = 'b2b' | 'b2c' | 'both';
export type ContactMethod = 'email' | 'phone' | 'whatsapp' | 'sms';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'vip';

export interface B2CFields {
  is_b2c?: boolean;
  date_of_birth?: string | null;
  gender?: Gender | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  preferred_contact_method?: ContactMethod | null;
  marketing_consent?: boolean;
  whatsapp_consent?: boolean;
  interests?: string[] | null;
  /** Secondary phone numbers — the primary stays in `phone` (lead) / `mobile` (contact). */
  alternate_mobiles?: string[] | null;
}

export interface Lead extends B2CFields {
  id: string;
  org_id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  status: LeadStatus;
  source_id?: string | null;
  source_name?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  score?: number | null;
  score_grade?: 'A' | 'B' | 'C' | 'D' | null;
  territory_id?: string | null;
  industry?: string | null;
  converted_at?: string | null;
  converted_account_id?: string | null;
  converted_contact_id?: string | null;
  converted_deal_id?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  custom?: Record<string, unknown> | null;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact extends B2CFields {
  id: string;
  org_id: string;
  account_id?: string | null;
  account_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  department?: string | null;
  linkedin_url?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  do_not_contact?: boolean;
  email_opt_out?: boolean;
  loyalty_tier?: LoyaltyTier | null;
  customer_since?: string | null;
  lifetime_value?: number;
  total_orders?: number;
  last_purchase_at?: string | null;
  referral_source?: string | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  annual_revenue?: number | null;
  employees?: number | null;
  owner_id?: string | null;
  owner_name?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  description?: string | null;
  tags?: string[] | null;
  ai_summary?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string; org_id: string; name: string; is_default: boolean;
  stages?: Stage[]; created_at: string; updated_at: string;
}
export interface Stage {
  id: string; pipeline_id: string; name: string; position: number;
  default_probability: number; is_won: boolean; is_lost: boolean; color?: string | null;
}

export interface Deal {
  id: string;
  org_id: string;
  name: string;
  account_id?: string | null;
  account_name?: string | null;
  contact_id?: string | null;
  primary_contact_id?: string | null;
  contact_name?: string | null;
  lead_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  stage_name?: string | null;
  amount?: number | null;
  currency?: string | null;
  probability?: number | null;
  expected_close_date?: string | null;
  status: DealStatus;
  owner_id?: string | null;
  owner_name?: string | null;
  source_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  ai_win_probability?: number | null;
  ai_win_confidence?: number | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface DealContact {
  contact_id: string;
  role?: string | null;
  is_primary: boolean;
  contact: Contact;
}

export interface DealHistoryEntry {
  id: string; deal_id: string; event_type: string;
  from_stage?: string | null; to_stage?: string | null;
  field?: string | null; old_value?: unknown; new_value?: unknown;
  actor_id?: string | null; actor_name?: string | null; created_at: string;
}

export interface Activity {
  id: string; org_id: string; type: ActivityType;
  subject?: string | null; body?: string | null; description?: string | null;
  due_at?: string | null; completed_at?: string | null;
  duration_min?: number | null; outcome?: string | null;
  lead_id?: string | null; contact_id?: string | null; account_id?: string | null; deal_id?: string | null;
  owner_id?: string | null; owner_name?: string | null;
  image_url?: string | null;
  created_at: string; updated_at: string;
}

export interface Note {
  id: string; org_id: string; body: string;
  entity_type?: 'lead' | 'contact' | 'account' | 'deal'; entity_id?: string;
  lead_id?: string | null; contact_id?: string | null; account_id?: string | null; deal_id?: string | null;
  owner_id?: string | null; owner_name?: string | null; pinned?: boolean; created_at: string;
}

export interface Task {
  id: string; org_id: string; subject: string; description?: string | null;
  due_at?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done';
  owner_id?: string | null; owner_name?: string | null;
  related_type?: 'lead' | 'contact' | 'account' | 'deal' | null; related_id?: string | null;
  created_at: string; updated_at: string;
}

export interface EmailTemplate {
  id: string; org_id: string; name: string;
  subject: string; body_html: string; body_text?: string | null;
  category?: string | null; variables?: string[] | null;
  created_at: string; updated_at: string;
}

export interface EmailLog {
  id: string; org_id: string; template_id?: string | null;
  to_email: string; from_email?: string | null; subject: string; body_html?: string | null;
  status: 'queued' | 'sent' | 'opened' | 'clicked' | 'bounced' | 'failed';
  opened_at?: string | null; clicked_at?: string | null;
  open_count?: number; click_count?: number;
  lead_id?: string | null; contact_id?: string | null; deal_id?: string | null;
  sent_at?: string | null; created_at: string;
}

export interface LeadSource {
  id: string; org_id: string; name: string; description?: string | null;
  is_active: boolean; created_at: string;
}

export interface AssignmentRule {
  id: string; org_id: string; name: string; position: number; is_active: boolean;
  match_field?: string | null; match_op?: string | null; match_value?: string | null;
  assignee_user_id?: string | null; assignee_team_id?: string | null;
  territory_id?: string | null; created_at: string;
}

export interface Territory {
  id: string; org_id: string; name: string; description?: string | null;
  parent_id?: string | null; manager_id?: string | null; created_at: string;
}

export interface Automation {
  id: string; org_id: string; name: string; trigger: string;
  conditions?: unknown; actions?: unknown; is_active: boolean;
  created_at: string; updated_at: string;
}

export interface CustomField {
  id: string; org_id: string;
  // Backend column is `entity_type` (lead/contact/account/deal). Older
  // code used `entity`; rename kept here so the field name matches what
  // the server actually returns + validates against.
  entity_type: 'lead' | 'contact' | 'account' | 'deal';
  field_key: string; label: string;
  field_type:
    | 'text' | 'longtext'
    | 'number' | 'currency'
    | 'boolean'
    | 'date' | 'datetime'
    | 'select' | 'multiselect' | 'radio'
    | 'url' | 'email' | 'phone'
    | 'image' | 'file';
  options?: string[] | null; required?: boolean; position?: number;
  created_at: string;
}

export interface ImportJob {
  id: string; org_id: string;
  entity: 'lead' | 'contact' | 'account' | 'deal';
  filename: string;
  status: 'pending' | 'preview' | 'committed' | 'failed';
  total_rows?: number; imported_rows?: number; failed_rows?: number;
  errors?: Array<{ row: number; message: string }>;
  mapping?: Record<string, string>;
  created_at: string; updated_at: string;
}

export interface CrmSettings {
  id?: string; org_id: string; business_type: BusinessType;
  config?: Record<string, unknown>;
}

export interface CrmState {
  id: string; org_id: string; name: string;
  code?: string | null; country: string;
  is_active: boolean;
  created_at: string; updated_at: string;
}

export interface CrmCity {
  id: string; org_id: string; state_id: string; name: string;
  district?: string | null;
  is_active: boolean;
  created_at: string; updated_at: string;
}

export interface StateCount {
  state: string;
  count: number;
}

export interface ScoreFactor { factor: string; weight: number; contribution: number; detail?: string; }
export interface LeadScore {
  lead_id: string; score: number; grade: 'A' | 'B' | 'C' | 'D';
  confidence?: number; factors: ScoreFactor[]; generated_at: string; model_version?: string;
}
export interface ScoreBreakdown { score: number; factors: ScoreFactor[]; grade: 'A' | 'B' | 'C' | 'D'; }

/**
 * Methodology shown in the NBA card's "How?" modal — surfaces the
 * signals the model considered + the multi-step closing plan derived
 * from history and recent activity.
 */
export interface NextBestActionMethodology {
  signals: {
    stage: { name: string | null; type: string | null; probability: number } | null;
    days_in_stage: number | null;
    deal_age_days: number;
    win_probability: number | null;
    activities_30d_total: number;
    activities_30d_by_type: Record<string, number>;
    last_activity_at: string | null;
    last_activity_type: string | null;
    days_since_last_touch: number | null;
    stage_transitions: number;
  };
  closing_plan: Array<{
    step: number;
    action: string;
    rationale: string;
    when: 'now' | 'today' | 'this_week' | 'next_week';
  }>;
  reasoning: string;
}

export interface NextBestAction {
  deal_id?: string; lead_id?: string;
  action: string;
  /** Backend field. The card reads `reason ?? rationale` so older shapes still work. */
  reason?: string;
  rationale?: string;
  priority: 'low' | 'medium' | 'high' | 'med';
  suggested_at?: string;
  suggested_when?: 'now' | 'today' | 'this_week' | 'next_week';
  channel?: 'call' | 'email' | 'meeting' | 'task';
  methodology?: NextBestActionMethodology;
}

export interface WinProbabilityBreakdown {
  short_circuit?: 'won' | 'lost';
  short_circuit_message?: string;
  stage_probability: number;
  stage_name: string | null;
  age_days: number;
  age_multiplier: number;
  age_label: string;
  activities_30d: number;
  engagement_multiplier: number;
  engagement_label: string;
  formula_text: string;
  final_probability: number;
}

export interface WinProbability {
  deal_id?: string;
  probability: number;
  reasoning?: string;
  breakdown?: WinProbabilityBreakdown;
  confidence?: number;
  drivers?: Array<{ name: string; impact: number; direction: 'positive' | 'negative' }>;
  generated_at?: string;
}

export interface AnalyticsSummary {
  total_leads: number; new_leads_30d: number;
  open_deals: number; open_deal_value: number;
  won_deals_30d: number; won_revenue_30d: number;
  win_rate_30d: number; avg_deal_size: number;
  avg_sales_cycle_days: number; pipeline_velocity: number;
  activities_7d: number; conversion_rate: number;
  by_stage?: Array<{ stage: string; count: number; value: number }>;
  by_owner?: Array<{ owner: string; count: number; value: number }>;
}

export interface FunnelPoint { stage: string; count: number; value: number; }
export interface PipelineValuePoint { stage: string; value: number; count: number; color?: string; }
export interface WinRatePoint { bucket: string; won: number; lost: number; rate: number; }
export interface ForecastPoint { period: string; committed: number; best_case: number; pipeline: number; closed: number; }
export interface ActivityHeatPoint { date: string; hour: number; count: number; }
export interface SourceROIRow { source: string; leads: number; deals: number; revenue: number; cost: number; roi: number; }
export interface ScoreDistributionPoint { bucket: string; count: number; grade: 'A' | 'B' | 'C' | 'D'; }

export interface KiniCard {
  type: 'deal_list' | 'lead_list' | 'draft_email' | 'summary' | 'next_best_action';
  title?: string; data: unknown;
}

export interface KiniContext {
  module: 'crm'; route: string;
  entity?: { type: string; id?: string } | null;
  org_id?: string | null;
}

// ---------- Phase 2: Products + WhatsApp ----------

export interface ProductCategory {
  id: string; org_id: string; parent_category_id?: string | null;
  name: string; description?: string | null; color?: string | null;
  sort_order: number; created_at: string; updated_at: string;
}

export interface Product {
  id: string; org_id: string; category_id?: string | null;
  sku: string; name: string; description?: string | null;
  unit?: string | null; price: number;
  weight_kg?: number | null;
  currency: string;
  tax_rate_pct?: number | null; hsn_code?: string | null;
  image_url?: string | null; is_active: boolean;
  tags?: string[] | null; created_at: string; updated_at: string;
}

export interface DealLineItem {
  id: string; org_id: string; deal_id: string; product_id?: string | null;
  name: string; description?: string | null; sku?: string | null; unit?: string | null;
  quantity: number; unit_price: number; discount_pct?: number | null;
  tax_pct?: number | null; line_total: number; position?: number | null;
  crm_products?: { name: string; sku: string; image_url?: string | null; currency?: string | null } | null;
  created_at: string; updated_at: string;
}

export interface WhatsappTemplate {
  id: string; org_id: string; meta_template_name: string;
  category: 'utility' | 'marketing' | 'authentication'; language: string;
  status: 'pending' | 'approved' | 'rejected';
  header_text?: string | null; body_text: string; footer_text?: string | null;
  variables?: string[] | null; provider_template_id?: string | null;
  header_media_type?: 'image' | 'video' | 'document' | null;
  header_media_url?: string | null;
  translations?: Record<string, { body_text?: string; header_text?: string; footer_text?: string }> | null;
  created_at: string; updated_at: string;
}

export interface WhatsappLog {
  id: string; org_id: string; direction: WhatsappDirection;
  template_id?: string | null; from_phone?: string | null; to_phone?: string | null;
  body_text?: string | null; media_url?: string | null; media_type?: string | null;
  status: WhatsappStatus; provider: string; provider_message_id?: string | null;
  error?: string | null; lead_id?: string | null; contact_id?: string | null; deal_id?: string | null;
  sent_at?: string | null; delivered_at?: string | null; read_at?: string | null;
  replied_at?: string | null; sent_by?: string | null;
  created_at: string; updated_at: string;
}
