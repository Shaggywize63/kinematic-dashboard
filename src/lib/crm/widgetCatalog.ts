/**
 * Catalogue of the 15 Lead Analytics widgets + the custom-chart dataset
 * registry that powers the "Build chart" flow.
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
  | 'targets_leaderboard'
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
  { type: 'targets_leaderboard', title: 'Targets Leaderboard', description: 'Top performer, who needs a nudge, average leads & target attainment — ranked by the chosen hierarchy role (e.g. Consumer Champion).', category: 'Engagement', endpoint: '', supportedCharts: ['table'], defaultChart: 'table', defaultSize: { w: 8, h: 7 } },
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
      { key: 'owner_id', label: 'Owner', type: 'string' },
      { key: 'count',    label: 'Count', type: 'number' },
    ],
    defaultX: 'owner_id', defaultY: 'count' },
];

export const datasetById = (id: string): CustomDataset | undefined =>
  CUSTOM_DATASETS.find(d => d.id === id);
