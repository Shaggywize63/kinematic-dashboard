/**
 * Catalogue of the Lead Analytics widgets (the original 15 plus the Lead
 * Management "plus" set) + the custom-chart dataset registry that powers the
 * "Build chart" flow.
 *
 * WIDGET_CATALOG drives the "Add widget" picker — fixed presets with a
 * preset data source, supported chart types, and default size.
 *
 * CUSTOM_DATASETS describes the same analytics endpoints from a "row-and-
 * column" perspective: which fields a user can pick as X and Y axes when
 * they build a chart themselves. The 'custom' widget_type pairs that
 * registry with a free chart-type choice — see CustomChartBuilder.tsx.
 */

export type ChartType =
  | 'number'      // single big number tile (KPI)
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'horizontal-bar'
  | 'table'
  | 'heatmap';

export type WidgetType =
  | 'lead_velocity'
  | 'time_to_first_touch'
  | 'stuck_leads'
  | 'lost_reasons'
  | 'won_reasons'
  | 'disqualification_reasons'
  | 'stage_conversion'
  | 'lead_aging'
  | 'cohort_conversion'
  | 'engagement_comparison'
  | 'days_since_touch'
  | 'score_band_conversion'
  | 'territory_conversion'
  | 'touchpoints_to_response'
  | 'leads_at_risk'
  | 'leads_geo_heatmap'
  | 'targets_leaderboard'
  // Lead Management "plus" widgets (additive; see analytics-leads-plus.service.ts)
  | 'lead_source_performance'
  | 'followup_compliance'
  | 'owner_workload'
  | 'stage_velocity'
  | 'activity_mix'
  | 'lead_conversion_time'
  | 'weighted_pipeline'
  | 'deal_size_distribution'
  | 'win_rate_trend'
  | 'call_connect_trend'
  | 'lead_recycling'
  | 'custom';

export interface WidgetMeta {
  type: WidgetType;
  title: string;
  description: string;
  category: 'Velocity' | 'Quality' | 'Pipeline' | 'Engagement' | 'Risk' | 'Custom';
  endpoint: string;                 // GET path under /api/v1/crm/analytics
  supportedCharts: ChartType[];
  defaultChart: ChartType;
  defaultSize: { w: number; h: number; minW?: number; minH?: number };
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  { type: 'lead_velocity', title: 'Lead Velocity Rate', description: 'Month-over-month % growth in qualified leads. Salesforce-style leading indicator.', category: 'Velocity', endpoint: '/analytics/lead-velocity', supportedCharts: ['line', 'bar', 'area'], defaultChart: 'line', defaultSize: { w: 6, h: 4 } },
  { type: 'time_to_first_touch', title: 'Time to First Touch', description: 'Avg / median / SLA breach % between lead create and first rep activity.', category: 'Velocity', endpoint: '/analytics/time-to-first-touch', supportedCharts: ['number', 'bar', 'horizontal-bar'], defaultChart: 'number', defaultSize: { w: 4, h: 3 } },
  { type: 'stuck_leads', title: 'Stuck Leads', description: 'Open leads with no activity in 7 / 14 / 30 days.', category: 'Risk', endpoint: '/analytics/stuck-leads', supportedCharts: ['number', 'bar'], defaultChart: 'number', defaultSize: { w: 4, h: 3 } },
  { type: 'lost_reasons', title: 'Top Lost Reasons', description: 'Breakdown of why leads are marked Lost.', category: 'Quality', endpoint: '/analytics/lost-reasons', supportedCharts: ['horizontal-bar', 'bar', 'pie', 'donut', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'won_reasons', title: 'Top Won Reasons', description: 'What worked on the leads you marked Won.', category: 'Quality', endpoint: '/analytics/won-reasons', supportedCharts: ['horizontal-bar', 'bar', 'pie', 'donut', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'disqualification_reasons', title: 'Disqualification Reasons', description: 'Why leads end up Unqualified — useful for tightening ICP.', category: 'Quality', endpoint: '/analytics/disqualification-reasons', supportedCharts: ['horizontal-bar', 'pie', 'donut', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 4 } },
  { type: 'stage_conversion', title: 'Stage Conversion %', description: '% of deals that advance between each consecutive pipeline stage.', category: 'Pipeline', endpoint: '/analytics/stage-conversion', supportedCharts: ['bar', 'horizontal-bar', 'table'], defaultChart: 'bar', defaultSize: { w: 8, h: 4 } },
  { type: 'lead_aging', title: 'Lead Aging', description: 'Open leads bucketed by age: 0-7 / 8-30 / 31-60 / 60+ days.', category: 'Pipeline', endpoint: '/analytics/lead-aging', supportedCharts: ['bar', 'pie', 'donut'], defaultChart: 'bar', defaultSize: { w: 4, h: 4 } },
  { type: 'cohort_conversion', title: 'Cohort Conversion', description: 'How long each monthly cohort takes to convert. Reads like a retention heatmap.', category: 'Velocity', endpoint: '/analytics/cohort-conversion', supportedCharts: ['table', 'heatmap'], defaultChart: 'table', defaultSize: { w: 8, h: 5 } },
  { type: 'engagement_comparison', title: 'Touches: Won vs Lost', description: 'Avg activity count per won vs lost lead. Shows the touch-density delta.', category: 'Engagement', endpoint: '/analytics/engagement-comparison', supportedCharts: ['bar', 'number'], defaultChart: 'bar', defaultSize: { w: 4, h: 3 } },
  { type: 'days_since_touch', title: 'Days Since Last Touch', description: 'Distribution of how long open leads have gone without activity.', category: 'Engagement', endpoint: '/analytics/days-since-touch', supportedCharts: ['bar', 'pie', 'donut'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'score_band_conversion', title: 'Score-Band Conversion', description: '% of leads in each AI-score band that ended up converting.', category: 'Quality', endpoint: '/analytics/score-band-conversion', supportedCharts: ['bar', 'line', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'territory_conversion', title: 'Territory Conversion', description: 'Conversion rate by state / city. Top 20 territories by lead volume.', category: 'Pipeline', endpoint: '/analytics/territory-conversion', supportedCharts: ['table', 'horizontal-bar'], defaultChart: 'table', defaultSize: { w: 8, h: 5 } },
  { type: 'touchpoints_to_response', title: 'Touchpoints to Response', description: 'Number of outbound touches it takes before a lead responds.', category: 'Engagement', endpoint: '/analytics/touchpoints-to-response', supportedCharts: ['bar', 'horizontal-bar'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'leads_at_risk', title: 'Leads at Risk', description: 'High-score leads with no activity in 14d+ — flagged for pipeline leakage.', category: 'Risk', endpoint: '/analytics/leads-at-risk', supportedCharts: ['table'], defaultChart: 'table', defaultSize: { w: 8, h: 5 } },
  // Density map over the lead-geo payload — concentrations of captured
  // leads light up as warm spots, sparser areas read as cool. Reuses
  // crmLeads.geo() so the data already honours the same tenant + city
  // scope as the existing LeadsGeoMap.
  { type: 'leads_geo_heatmap', title: 'Leads Location Heatmap', description: 'Density heatmap of captured leads by lat/lng — at-a-glance read of where the demand is concentrated.', category: 'Pipeline', endpoint: '/leads/geo', supportedCharts: ['heatmap'], defaultChart: 'heatmap', defaultSize: { w: 8, h: 6 } },
  { type: 'targets_leaderboard', title: 'Targets Leaderboard', description: 'Top performer, who needs a nudge, average leads & target attainment — ranked by the chosen hierarchy role (e.g. Consumer Champion).', category: 'Engagement', endpoint: '', supportedCharts: ['table'], defaultChart: 'table', defaultSize: { w: 8, h: 7 } },

  // ── Lead Management "plus" widgets ─────────────────────────────────────────
  // Each description says how the number is computed. Windows are the widget's
  // own defaults (they do not follow a page date filter).
  { type: 'lead_source_performance', title: 'Lead Source Performance', description: 'Leads created in the last 90 days by source, and how many converted. Conversion % = converted leads ÷ leads from that source. Bar = conversion %, H-Bar = leads, Pie / Donut = share of leads.', category: 'Quality', endpoint: '/analytics/source-performance', supportedCharts: ['table', 'bar', 'horizontal-bar', 'donut', 'pie'], defaultChart: 'table', defaultSize: { w: 8, h: 5 } },
  { type: 'followup_compliance', title: 'Follow-up Compliance', description: 'Follow-ups and scheduled activities that fell due in the last 30 days: done on time, done late, still overdue or not yet due. On-time % = on time ÷ (on time + late + overdue). Ones marked done with no completion time are left out of the %.', category: 'Engagement', endpoint: '/analytics/followup-compliance', supportedCharts: ['donut', 'pie', 'bar', 'number', 'table'], defaultChart: 'donut', defaultSize: { w: 6, h: 4 } },
  { type: 'owner_workload', title: 'Owner Workload', description: 'Open leads per owner, how many have had no activity for 14+ days, and overdue follow-ups. A workload view, not a performance score: compare owners with similar territories.', category: 'Engagement', endpoint: '/analytics/owner-workload', supportedCharts: ['horizontal-bar', 'bar', 'table'], defaultChart: 'horizontal-bar', defaultSize: { w: 6, h: 5 } },
  { type: 'stage_velocity', title: 'Days in Stage', description: 'Average days deals spent in each stage of your default pipeline before moving on, worked out from the deal stage-change history. Deals with no history count from their creation date.', category: 'Velocity', endpoint: '/analytics/stage-velocity', supportedCharts: ['bar', 'horizontal-bar', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'activity_mix', title: 'Activity Mix', description: 'Activities logged in the last 30 days by type: calls, emails, meetings, site visits, tasks, notes and SMS / WhatsApp. Counted when logged.', category: 'Engagement', endpoint: '/analytics/activity-mix', supportedCharts: ['donut', 'pie', 'bar', 'horizontal-bar', 'table'], defaultChart: 'donut', defaultSize: { w: 6, h: 4 } },
  { type: 'lead_conversion_time', title: 'Lead Conversion Time', description: 'Days from a lead being created to being converted, for leads converted in the last 90 days. The number tile shows the median; average and 90th percentile are in its caption.', category: 'Velocity', endpoint: '/analytics/conversion-time', supportedCharts: ['bar', 'number', 'donut', 'pie', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
  { type: 'weighted_pipeline', title: 'Weighted Pipeline', description: 'Open deal value by stage next to its probability-weighted value (INR). Weighted = amount × probability, using the deal\'s own probability when set, otherwise its stage\'s. An estimate of expected revenue, not a commitment.', category: 'Pipeline', endpoint: '/analytics/weighted-pipeline', supportedCharts: ['bar', 'horizontal-bar', 'number', 'table'], defaultChart: 'bar', defaultSize: { w: 8, h: 4 } },
  { type: 'deal_size_distribution', title: 'Deal Size Distribution', description: 'Deals created in the last 180 days grouped by amount band (INR), split into won, lost and open. Win rate per band = won ÷ (won + lost).', category: 'Pipeline', endpoint: '/analytics/deal-size-distribution', supportedCharts: ['bar', 'horizontal-bar', 'donut', 'pie', 'table'], defaultChart: 'bar', defaultSize: { w: 8, h: 4 } },
  { type: 'win_rate_trend', title: 'Win Rate Trend', description: 'Win % by month over the last 6 months = deals won ÷ (won + lost) in the month they closed. Months with no closed deals show a gap, not zero.', category: 'Quality', endpoint: '/analytics/win-rate-trend', supportedCharts: ['line', 'bar', 'area', 'table'], defaultChart: 'line', defaultSize: { w: 6, h: 4 } },
  { type: 'call_connect_trend', title: 'Call Connect Rate', description: 'Calls logged per week over the last 8 weeks and the % that connected. Connect % = calls whose outcome starts with "Connected" ÷ calls with an outcome recorded; calls with no outcome are not in the %.', category: 'Engagement', endpoint: '/analytics/call-connect-trend', supportedCharts: ['line', 'bar', 'area', 'number', 'table'], defaultChart: 'line', defaultSize: { w: 6, h: 4 } },
  { type: 'lead_recycling', title: 'Reopened Leads', description: 'Per month over the last 6 months: leads moved to Lost / Unqualified, and leads reopened from Lost / Unqualified back to an open status (from the lead status history).', category: 'Quality', endpoint: '/analytics/lead-recycling', supportedCharts: ['bar', 'line', 'number', 'table'], defaultChart: 'bar', defaultSize: { w: 6, h: 4 } },
];

export const widgetByType = (type: string): WidgetMeta | undefined =>
  WIDGET_CATALOG.find(w => w.type === type);

// ────────────────────────────────────────────────────────────────────────────
// Custom-chart dataset registry. Each entry describes:
//   - which underlying endpoint to fetch
//   - what fields the user can pick for the X / Y axis
//   - sensible defaults to seed the builder
// The renderer in AnalyticsWidget knows how to resolve a dataset id → array
// of rows (including unwrapping nested arrays like
// time_to_first_touch.distribution).
// ────────────────────────────────────────────────────────────────────────────

export interface DatasetField {
  key: string;
  label: string;
  type: 'string' | 'number';
}

export interface CustomDataset {
  id: string;
  label: string;
  description: string;
  fields: DatasetField[];
  defaultX: string;
  defaultY: string;
}

export const CUSTOM_DATASETS: CustomDataset[] = [
  { id: 'lead_velocity', label: 'Lead Velocity (monthly)',
    description: 'Total + qualified leads per month, with MoM growth.',
    fields: [
      { key: 'month',          label: 'Month',          type: 'string' },
      { key: 'total',          label: 'Total leads',    type: 'number' },
      { key: 'qualified',      label: 'Qualified',      type: 'number' },
      { key: 'mom_growth_pct', label: 'MoM growth %',   type: 'number' },
    ],
    defaultX: 'month', defaultY: 'qualified' },
  { id: 'time_to_first_touch_distribution', label: 'Time to First Touch — distribution',
    description: 'How many leads were first-touched in each time bucket.',
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'string' },
      { key: 'count',  label: 'Count',  type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'count' },
  { id: 'lost_reasons', label: 'Lost Reasons',
    description: 'Counts of reasons leads were marked Lost.',
    fields: [
      { key: 'reason', label: 'Reason', type: 'string' },
      { key: 'count',  label: 'Count',  type: 'number' },
    ],
    defaultX: 'reason', defaultY: 'count' },
  { id: 'won_reasons', label: 'Won Reasons',
    description: 'What worked on the leads you marked Won.',
    fields: [
      { key: 'reason', label: 'Reason', type: 'string' },
      { key: 'count',  label: 'Count',  type: 'number' },
    ],
    defaultX: 'reason', defaultY: 'count' },
  { id: 'disqualification_reasons', label: 'Disqualification Reasons',
    description: 'Why leads end up Unqualified.',
    fields: [
      { key: 'reason', label: 'Reason', type: 'string' },
      { key: 'count',  label: 'Count',  type: 'number' },
    ],
    defaultX: 'reason', defaultY: 'count' },
  { id: 'stage_conversion', label: 'Stage Conversion',
    description: 'Counts and rate advancing between each consecutive pipeline stage.',
    fields: [
      { key: 'from_stage', label: 'From stage', type: 'string' },
      { key: 'to_stage',   label: 'To stage',   type: 'string' },
      { key: 'entered',    label: 'Entered',    type: 'number' },
      { key: 'advanced',   label: 'Advanced',   type: 'number' },
      { key: 'rate',       label: 'Rate %',     type: 'number' },
    ],
    defaultX: 'from_stage', defaultY: 'rate' },
  { id: 'lead_aging', label: 'Lead Aging',
    description: 'Open leads by age bucket.',
    fields: [
      { key: 'bucket', label: 'Age bucket', type: 'string' },
      { key: 'count',  label: 'Count',      type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'count' },
  { id: 'days_since_touch', label: 'Days Since Last Touch',
    description: 'Distribution of how long open leads have gone without activity.',
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'string' },
      { key: 'count',  label: 'Count',  type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'count' },
  { id: 'score_band_conversion', label: 'Score-Band Conversion',
    description: 'Conversion stats per AI-score band.',
    fields: [
      { key: 'band',      label: 'Score band', type: 'string' },
      { key: 'total',     label: 'Total',      type: 'number' },
      { key: 'converted', label: 'Converted',  type: 'number' },
      { key: 'rate',      label: 'Rate %',     type: 'number' },
    ],
    defaultX: 'band', defaultY: 'rate' },
  { id: 'territory_conversion', label: 'Territory Conversion',
    description: 'Lead volume + conversion rate by state / city.',
    fields: [
      { key: 'territory', label: 'Territory', type: 'string' },
      { key: 'total',     label: 'Total',     type: 'number' },
      { key: 'converted', label: 'Converted', type: 'number' },
      { key: 'rate',      label: 'Rate %',    type: 'number' },
    ],
    defaultX: 'territory', defaultY: 'total' },
  { id: 'touchpoints_to_response', label: 'Touchpoints to Response',
    description: 'How many outbound touches before a lead responds.',
    fields: [
      { key: 'bucket', label: 'Touches', type: 'string' },
      { key: 'count',  label: 'Count',   type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'count' },
  { id: 'leads_at_risk', label: 'Leads at Risk',
    description: 'High-score open leads that have gone quiet.',
    fields: [
      { key: 'name',       label: 'Name',        type: 'string' },
      { key: 'score',      label: 'Score',       type: 'number' },
      { key: 'days_idle',  label: 'Days idle',   type: 'number' },
    ],
    defaultX: 'name', defaultY: 'score' },
  { id: 'stuck_leads_top_owners', label: 'Stuck Leads — top owners',
    description: 'Reps with the most stuck (14d+) leads.',
    fields: [
      { key: 'owner', label: 'Owner', type: 'string' },
      { key: 'count', label: 'Count', type: 'number' },
    ],
    defaultX: 'owner', defaultY: 'count' },

  // ── Lead Management "plus" datasets ────────────────────────────────────────
  { id: 'source_performance', label: 'Lead Source Performance',
    description: 'Per source, last 90 days: leads, how far they got, conversion %, days to convert, won value and cost.',
    fields: [
      { key: 'source',              label: 'Source',               type: 'string' },
      { key: 'leads',               label: 'Leads',                type: 'number' },
      { key: 'qualified',           label: 'Qualified',            type: 'number' },
      { key: 'converted',           label: 'Converted',            type: 'number' },
      { key: 'lost',                label: 'Lost',                 type: 'number' },
      { key: 'open',                label: 'Open',                 type: 'number' },
      { key: 'qualified_pct',       label: 'Qualified %',          type: 'number' },
      { key: 'conversion_pct',      label: 'Conversion %',         type: 'number' },
      { key: 'avg_days_to_convert', label: 'Avg days to convert',  type: 'number' },
      { key: 'won_value',           label: 'Won value (INR)',      type: 'number' },
      { key: 'total_cost',          label: 'Cost (INR)',           type: 'number' },
    ],
    defaultX: 'source', defaultY: 'leads' },
  { id: 'followup_compliance_by_owner', label: 'Follow-up Compliance — by owner',
    description: 'Per person, last 30 days: follow-ups due, on time, late, overdue and on-time %.',
    fields: [
      { key: 'owner',          label: 'Owner',        type: 'string' },
      { key: 'due',            label: 'Due',          type: 'number' },
      { key: 'on_time',        label: 'On time',      type: 'number' },
      { key: 'late',           label: 'Late',         type: 'number' },
      { key: 'overdue',        label: 'Overdue',      type: 'number' },
      { key: 'upcoming',       label: 'Upcoming',     type: 'number' },
      { key: 'compliance_pct', label: 'On-time %',    type: 'number' },
    ],
    defaultX: 'owner', defaultY: 'due' },
  { id: 'followup_compliance_trend', label: 'Follow-up Compliance — weekly',
    description: 'Follow-ups due each week (by due date) and the on-time %.',
    fields: [
      { key: 'week',           label: 'Week starting', type: 'string' },
      { key: 'due',            label: 'Due',           type: 'number' },
      { key: 'on_time',        label: 'On time',       type: 'number' },
      { key: 'late',           label: 'Late',          type: 'number' },
      { key: 'overdue',        label: 'Overdue',       type: 'number' },
      { key: 'compliance_pct', label: 'On-time %',     type: 'number' },
    ],
    defaultX: 'week', defaultY: 'compliance_pct' },
  { id: 'owner_workload', label: 'Owner Workload',
    description: 'Per owner: open leads, idle leads, overdue follow-ups and first-touch speed.',
    fields: [
      { key: 'owner',                      label: 'Owner',                       type: 'string' },
      { key: 'open_leads',                 label: 'Open leads',                  type: 'number' },
      { key: 'new_leads',                  label: 'New leads (30d)',             type: 'number' },
      { key: 'never_touched',              label: 'Never touched',               type: 'number' },
      { key: 'idle_7d',                    label: 'Idle 7d+',                    type: 'number' },
      { key: 'idle_14d',                   label: 'Idle 14d+',                   type: 'number' },
      { key: 'idle_30d',                   label: 'Idle 30d+',                   type: 'number' },
      { key: 'overdue_followups',          label: 'Overdue follow-ups',          type: 'number' },
      { key: 'avg_open_age_days',          label: 'Avg open age (days)',         type: 'number' },
      { key: 'median_first_touch_minutes', label: 'Median first touch (min)',    type: 'number' },
      { key: 'sla_breach_pct',             label: 'First-touch SLA breach %',    type: 'number' },
    ],
    defaultX: 'owner', defaultY: 'open_leads' },
  { id: 'stage_velocity', label: 'Days in Stage',
    description: 'Per pipeline stage: average / median / longest completed stay and how long open deals have sat.',
    fields: [
      { key: 'stage',                label: 'Stage',                    type: 'string' },
      { key: 'avg_days',             label: 'Avg days in stage',        type: 'number' },
      { key: 'median_days',          label: 'Median days in stage',     type: 'number' },
      { key: 'max_days',             label: 'Longest stay (days)',      type: 'number' },
      { key: 'deals_entered',        label: 'Deals entered',            type: 'number' },
      { key: 'current_deals',        label: 'Open deals now',           type: 'number' },
      { key: 'current_value',        label: 'Open value now (INR)',     type: 'number' },
      { key: 'avg_current_age_days', label: 'Avg open age (days)',      type: 'number' },
    ],
    defaultX: 'stage', defaultY: 'avg_days' },
  { id: 'activity_mix_by_type', label: 'Activity Mix — by type',
    description: 'Activities logged in the last 30 days by type.',
    fields: [
      { key: 'type',  label: 'Type',  type: 'string' },
      { key: 'count', label: 'Count', type: 'number' },
    ],
    defaultX: 'type', defaultY: 'count' },
  { id: 'activity_mix_by_owner', label: 'Activity Mix — by person',
    description: 'Per person, last 30 days: activities by type, completion and call connect rate.',
    fields: [
      { key: 'owner',            label: 'Person',             type: 'string' },
      { key: 'total',            label: 'Total',              type: 'number' },
      { key: 'calls',            label: 'Calls',              type: 'number' },
      { key: 'emails',           label: 'Emails',             type: 'number' },
      { key: 'meetings',         label: 'Meetings',           type: 'number' },
      { key: 'site_visits',      label: 'Site visits',        type: 'number' },
      { key: 'tasks',            label: 'Tasks',              type: 'number' },
      { key: 'completed',        label: 'Completed',          type: 'number' },
      { key: 'completion_pct',   label: 'Completion %',       type: 'number' },
      { key: 'connect_rate_pct', label: 'Call connect %',     type: 'number' },
      { key: 'active_days',      label: 'Active days',        type: 'number' },
    ],
    defaultX: 'owner', defaultY: 'total' },
  { id: 'activity_mix_by_week', label: 'Activity Mix — weekly',
    description: 'Activities logged per week (total, calls, completed).',
    fields: [
      { key: 'week',      label: 'Week starting', type: 'string' },
      { key: 'total',     label: 'Total',         type: 'number' },
      { key: 'calls',     label: 'Calls',         type: 'number' },
      { key: 'completed', label: 'Completed',     type: 'number' },
    ],
    defaultX: 'week', defaultY: 'total' },
  { id: 'conversion_time_buckets', label: 'Lead Conversion Time — distribution',
    description: 'How many leads converted within each number of days from creation.',
    fields: [
      { key: 'bucket', label: 'Days to convert', type: 'string' },
      { key: 'count',  label: 'Leads',           type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'count' },
  { id: 'conversion_time_by_owner', label: 'Lead Conversion Time — by owner',
    description: 'Leads converted and average / median days to convert, per owner.',
    fields: [
      { key: 'owner',       label: 'Owner',        type: 'string' },
      { key: 'converted',   label: 'Converted',    type: 'number' },
      { key: 'avg_days',    label: 'Avg days',     type: 'number' },
      { key: 'median_days', label: 'Median days',  type: 'number' },
    ],
    defaultX: 'owner', defaultY: 'median_days' },
  { id: 'conversion_time_by_source', label: 'Lead Conversion Time — by source',
    description: 'Leads converted and average / median days to convert, per lead source.',
    fields: [
      { key: 'source',      label: 'Source',       type: 'string' },
      { key: 'converted',   label: 'Converted',    type: 'number' },
      { key: 'avg_days',    label: 'Avg days',     type: 'number' },
      { key: 'median_days', label: 'Median days',  type: 'number' },
    ],
    defaultX: 'source', defaultY: 'median_days' },
  { id: 'weighted_pipeline', label: 'Weighted Pipeline',
    description: 'Per open stage: deals, value, probability-weighted value, average deal size and age.',
    fields: [
      { key: 'stage',          label: 'Stage',                 type: 'string' },
      { key: 'deals',          label: 'Deals',                 type: 'number' },
      { key: 'value',          label: 'Value (INR)',           type: 'number' },
      { key: 'weighted_value', label: 'Weighted value (INR)',  type: 'number' },
      { key: 'avg_deal_size',  label: 'Avg deal size (INR)',   type: 'number' },
      { key: 'avg_age_days',   label: 'Avg age (days)',        type: 'number' },
      { key: 'past_close_date', label: 'Past close date',      type: 'number' },
    ],
    defaultX: 'stage', defaultY: 'weighted_value' },
  { id: 'deal_size_distribution', label: 'Deal Size Distribution',
    description: 'Deals created in the last 180 days by amount band, split by outcome.',
    fields: [
      { key: 'bucket',       label: 'Amount band',    type: 'string' },
      { key: 'deals',        label: 'Deals',          type: 'number' },
      { key: 'won',          label: 'Won',            type: 'number' },
      { key: 'lost',         label: 'Lost',           type: 'number' },
      { key: 'open',         label: 'Open',           type: 'number' },
      { key: 'value',        label: 'Value (INR)',    type: 'number' },
      { key: 'win_rate_pct', label: 'Win rate %',     type: 'number' },
    ],
    defaultX: 'bucket', defaultY: 'deals' },
  { id: 'win_rate_trend', label: 'Win Rate Trend',
    description: 'Per month: deals won, lost, win rate % and values.',
    fields: [
      { key: 'month',        label: 'Month',             type: 'string' },
      { key: 'won',          label: 'Won',               type: 'number' },
      { key: 'lost',         label: 'Lost',              type: 'number' },
      { key: 'closed',       label: 'Closed',            type: 'number' },
      { key: 'win_rate_pct', label: 'Win rate %',        type: 'number' },
      { key: 'won_value',    label: 'Won value (INR)',   type: 'number' },
      { key: 'lost_value',   label: 'Lost value (INR)',  type: 'number' },
    ],
    defaultX: 'month', defaultY: 'win_rate_pct' },
  { id: 'call_connect_trend', label: 'Call Connect Rate',
    description: 'Per week: calls logged, calls with an outcome, connected and connect %.',
    fields: [
      { key: 'week',             label: 'Week starting',        type: 'string' },
      { key: 'calls',            label: 'Calls',                type: 'number' },
      { key: 'with_outcome',     label: 'Calls with outcome',   type: 'number' },
      { key: 'connected',        label: 'Connected',            type: 'number' },
      { key: 'connect_rate_pct', label: 'Connect %',            type: 'number' },
    ],
    defaultX: 'week', defaultY: 'connect_rate_pct' },
  { id: 'lead_recycling', label: 'Reopened Leads',
    description: 'Per month: leads moved to Lost / Unqualified and leads reopened.',
    fields: [
      { key: 'month',         label: 'Month',          type: 'string' },
      { key: 'moved_to_lost', label: 'Moved to lost',  type: 'number' },
      { key: 'reopened',      label: 'Reopened',       type: 'number' },
    ],
    defaultX: 'month', defaultY: 'reopened' },
];

export const datasetById = (id: string): CustomDataset | undefined =>
  CUSTOM_DATASETS.find(d => d.id === id);
