/**
 * Catalogue of the 15 Lead Analytics widgets.
 *
 * Each entry is the FE-side metadata for a `widget_type` that the backend
 * exposes under /api/v1/crm/analytics/<endpoint>. Used by:
 *   - The "Add widget" dialog (renders the title + description)
 *   - The widget renderer (picks a Recharts component from chart_type)
 *   - The customizer popover (restricts chart_type choices to supportedCharts)
 *   - The grid (uses defaultSize for newly added widgets)
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
  | 'leads_at_risk';

export interface WidgetMeta {
  type: WidgetType;
  title: string;
  description: string;
  category: 'Velocity' | 'Quality' | 'Pipeline' | 'Engagement' | 'Risk';
  endpoint: string;                 // GET path under /api/v1/crm/analytics
  supportedCharts: ChartType[];
  defaultChart: ChartType;
  // react-grid-layout cell sizing. Grid columns: lg=12, md=8, sm=2.
  // Widgets default to half-width (6) on lg / md and full width on sm.
  defaultSize: { w: number; h: number; minW?: number; minH?: number };
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    type: 'lead_velocity',
    title: 'Lead Velocity Rate',
    description: 'Month-over-month % growth in qualified leads. Salesforce-style leading indicator.',
    category: 'Velocity',
    endpoint: '/analytics/lead-velocity',
    supportedCharts: ['line', 'bar', 'area'],
    defaultChart: 'line',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'time_to_first_touch',
    title: 'Time to First Touch',
    description: 'Avg / median / SLA breach % between lead create and first rep activity.',
    category: 'Velocity',
    endpoint: '/analytics/time-to-first-touch',
    supportedCharts: ['number', 'bar', 'horizontal-bar'],
    defaultChart: 'number',
    defaultSize: { w: 4, h: 3 },
  },
  {
    type: 'stuck_leads',
    title: 'Stuck Leads',
    description: 'Open leads with no activity in 7 / 14 / 30 days.',
    category: 'Risk',
    endpoint: '/analytics/stuck-leads',
    supportedCharts: ['number', 'bar'],
    defaultChart: 'number',
    defaultSize: { w: 4, h: 3 },
  },
  {
    type: 'lost_reasons',
    title: 'Top Lost Reasons',
    description: 'Breakdown of why leads are marked Lost.',
    category: 'Quality',
    endpoint: '/analytics/lost-reasons',
    supportedCharts: ['horizontal-bar', 'bar', 'pie', 'donut', 'table'],
    defaultChart: 'horizontal-bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'won_reasons',
    title: 'Top Won Reasons',
    description: 'What worked on the leads you marked Won.',
    category: 'Quality',
    endpoint: '/analytics/won-reasons',
    supportedCharts: ['horizontal-bar', 'bar', 'pie', 'donut', 'table'],
    defaultChart: 'horizontal-bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'disqualification_reasons',
    title: 'Disqualification Reasons',
    description: 'Why leads end up Unqualified — useful for tightening ICP.',
    category: 'Quality',
    endpoint: '/analytics/disqualification-reasons',
    supportedCharts: ['horizontal-bar', 'pie', 'donut', 'table'],
    defaultChart: 'horizontal-bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'stage_conversion',
    title: 'Stage Conversion %',
    description: '% of deals that advance between each consecutive pipeline stage.',
    category: 'Pipeline',
    endpoint: '/analytics/stage-conversion',
    supportedCharts: ['bar', 'horizontal-bar', 'table'],
    defaultChart: 'bar',
    defaultSize: { w: 8, h: 4 },
  },
  {
    type: 'lead_aging',
    title: 'Lead Aging',
    description: 'Open leads bucketed by age: 0-7 / 8-30 / 31-60 / 60+ days.',
    category: 'Pipeline',
    endpoint: '/analytics/lead-aging',
    supportedCharts: ['bar', 'pie', 'donut'],
    defaultChart: 'bar',
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: 'cohort_conversion',
    title: 'Cohort Conversion',
    description: 'How long each monthly cohort takes to convert. Reads like a retention heatmap.',
    category: 'Velocity',
    endpoint: '/analytics/cohort-conversion',
    supportedCharts: ['table', 'heatmap'],
    defaultChart: 'table',
    defaultSize: { w: 8, h: 5 },
  },
  {
    type: 'engagement_comparison',
    title: 'Touches: Won vs Lost',
    description: 'Avg activity count per won vs lost lead. Shows the touch-density delta.',
    category: 'Engagement',
    endpoint: '/analytics/engagement-comparison',
    supportedCharts: ['bar', 'number'],
    defaultChart: 'bar',
    defaultSize: { w: 4, h: 3 },
  },
  {
    type: 'days_since_touch',
    title: 'Days Since Last Touch',
    description: 'Distribution of how long open leads have gone without activity.',
    category: 'Engagement',
    endpoint: '/analytics/days-since-touch',
    supportedCharts: ['bar', 'pie', 'donut'],
    defaultChart: 'bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'score_band_conversion',
    title: 'Score-Band Conversion',
    description: '% of leads in each AI-score band that ended up converting.',
    category: 'Quality',
    endpoint: '/analytics/score-band-conversion',
    supportedCharts: ['bar', 'line', 'table'],
    defaultChart: 'bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'territory_conversion',
    title: 'Territory Conversion',
    description: 'Conversion rate by state / city. Top 20 territories by lead volume.',
    category: 'Pipeline',
    endpoint: '/analytics/territory-conversion',
    supportedCharts: ['table', 'horizontal-bar'],
    defaultChart: 'table',
    defaultSize: { w: 8, h: 5 },
  },
  {
    type: 'touchpoints_to_response',
    title: 'Touchpoints to Response',
    description: 'Number of outbound touches it takes before a lead responds.',
    category: 'Engagement',
    endpoint: '/analytics/touchpoints-to-response',
    supportedCharts: ['bar', 'horizontal-bar'],
    defaultChart: 'bar',
    defaultSize: { w: 6, h: 4 },
  },
  {
    type: 'leads_at_risk',
    title: 'Leads at Risk',
    description: 'High-score leads with no activity in 14d+ — flagged for pipeline leakage.',
    category: 'Risk',
    endpoint: '/analytics/leads-at-risk',
    supportedCharts: ['table'],
    defaultChart: 'table',
    defaultSize: { w: 8, h: 5 },
  },
];

export const widgetByType = (type: string): WidgetMeta | undefined =>
  WIDGET_CATALOG.find(w => w.type === type);
