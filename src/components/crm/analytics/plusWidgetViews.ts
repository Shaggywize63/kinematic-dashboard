/**
 * View models for the Lead Management "plus" widgets (fetching lives in
 * plusWidgetData.ts so this file stays free of the API client and unit-testable).
 *
 * `plusWidgetView(type, chart, data)` is a PURE function: it turns an endpoint
 * payload into a small declarative description of what to draw (bar / h-bar /
 * line / area / pie / number / table / empty). AnalyticsWidget maps that onto
 * its existing chart primitives, so every widget supports every chart type it
 * advertises in the catalogue, and the logic is unit-tested without a browser.
 *
 * Numbers keep their units on screen: INR as ₹ (compact), percentages with %,
 * durations with d / m / h. Missing values show an em dash, never a zero.
 */
import type { ChartType } from '../../../lib/crm/widgetCatalog';
import {
  normaliseActivityMix, normaliseCallTrend, normaliseConversionTime, normaliseDealSize, normaliseFollowup, normaliseRecycling,
  normaliseSourcePerformance, normaliseStageVelocity, normaliseWeightedPipeline, normaliseWinRateTrend, normaliseWorkload,
} from '../../../lib/crm/crmPlusTypes';
import { fmtDays, fmtInr, fmtInt, fmtMinutes, fmtPct, monthLabel, weekLabel, DASH } from '../../../lib/crm/plusFormat';

export type ValueFormat = 'inr' | 'pct' | 'days';
type Cell = string | number;

export type PlusView =
  | { kind: 'empty'; label: string }
  | { kind: 'number'; main: string; sub: string }
  | { kind: 'table'; rows: Array<Record<string, Cell>> }
  | { kind: 'bar'; data: Array<Record<string, string | number | null>>; keys: string[]; format?: ValueFormat }
  | { kind: 'hbar'; data: Array<{ name: string; value: number }>; format?: ValueFormat }
  | { kind: 'line'; data: Array<Record<string, string | number | null>>; keys: string[]; format?: ValueFormat }
  | { kind: 'area'; data: Array<Record<string, string | number | null>>; keys: string[]; format?: ValueFormat }
  | { kind: 'pie'; data: Array<{ name: string; value: number }>; donut: boolean };

export const PLUS_WIDGET_TYPES: ReadonlySet<string> = new Set([
  'lead_source_performance', 'followup_compliance', 'owner_workload', 'stage_velocity', 'activity_mix', 'lead_conversion_time',
  'weighted_pipeline', 'deal_size_distribution', 'win_rate_trend', 'call_connect_trend', 'lead_recycling',
]);
export const isPlusWidget = (type: string): boolean => PLUS_WIDGET_TYPES.has(type);


/** Pure: pick the flat rows a custom dataset plots out of an endpoint payload. */
export function datasetRows(id: string, data: unknown): Array<Record<string, unknown>> {
  const d = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (id) {
    case 'source_performance':
    case 'followup_compliance_by_owner':
    case 'owner_workload':
    case 'stage_velocity':
    case 'activity_mix_by_owner':
    case 'weighted_pipeline':
    case 'deal_size_distribution':
    case 'win_rate_trend':
    case 'call_connect_trend':
    case 'lead_recycling':             return d?.rows ?? [];
    case 'followup_compliance_trend':  return d?.trend ?? [];
    case 'activity_mix_by_type':       return d?.by_type ?? [];
    case 'activity_mix_by_week':       return d?.by_week ?? [];
    case 'conversion_time_buckets':    return d?.buckets ?? [];
    case 'conversion_time_by_owner':   return (d?.by_owner ?? []).map((g: any) => ({ owner: g.label, converted: g.converted, avg_days: g.avg_days, median_days: g.median_days })); // eslint-disable-line @typescript-eslint/no-explicit-any
    case 'conversion_time_by_source':  return (d?.by_source ?? []).map((g: any) => ({ source: g.label, converted: g.converted, avg_days: g.avg_days, median_days: g.median_days })); // eslint-disable-line @typescript-eslint/no-explicit-any
    default: return [];
  }
}

// ── view models ──────────────────────────────────────────────────────────────

const empty = (label: string): PlusView => ({ kind: 'empty', label });
const n0 = (v: number | null | undefined) => v ?? 0;

/** Pie slices from name/value pairs; zero slices are dropped by the pie itself. */
const pie = (data: Array<{ name: string; value: number }>, chart: ChartType): PlusView => ({ kind: 'pie', data, donut: chart === 'donut' });

export function plusWidgetView(type: string, chart: ChartType, data: unknown): PlusView {
  switch (type) {
    case 'lead_source_performance': {
      const d = normaliseSourcePerformance(data);
      if (!d.rows.length) return empty('No leads in the last 90 days');
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: r.source, 'Conversion %': n0(r.conversion_pct) })), keys: ['Conversion %'], format: 'pct' };
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: d.rows.map((r) => ({ name: r.source, value: r.leads })) };
      if (chart === 'pie' || chart === 'donut') return pie(d.rows.map((r) => ({ name: r.source, value: r.leads })), chart);
      return {
        kind: 'table',
        rows: d.rows.map((r) => ({
          Source: r.source, Leads: r.leads, Converted: r.converted, 'Conversion %': fmtPct(r.conversion_pct),
          'Avg days to convert': fmtDays(r.avg_days_to_convert), 'Won value': fmtInr(r.won_value),
        })),
      };
    }

    case 'followup_compliance': {
      const d = normaliseFollowup(data);
      const t = d.totals;
      if (!t.due) return empty('No follow-ups fell due in the last 30 days');
      if (chart === 'number') {
        return {
          kind: 'number', main: t.compliance_pct === null ? DASH : fmtPct(t.compliance_pct),
          sub: `${t.on_time} on time · ${t.late} late · ${t.overdue} overdue (${t.due} due)`,
        };
      }
      if (chart === 'pie' || chart === 'donut') {
        return pie([
          { name: 'On time', value: t.on_time }, { name: 'Late', value: t.late }, { name: 'Overdue', value: t.overdue },
          { name: 'Not yet due', value: t.upcoming }, { name: 'Done, no time', value: t.done_untimed },
        ], chart);
      }
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: r.owner, 'On time': r.on_time, Late: r.late, Overdue: r.overdue })), keys: ['On time', 'Late', 'Overdue'] };
      return {
        kind: 'table',
        rows: d.rows.map((r) => ({
          Owner: r.owner, Due: r.due, 'On time': r.on_time, Late: r.late, Overdue: r.overdue, 'Not yet due': r.upcoming,
          'On-time %': fmtPct(r.compliance_pct), 'Avg days late': fmtDays(r.avg_days_late),
        })),
      };
    }

    case 'owner_workload': {
      const d = normaliseWorkload(data);
      if (!d.rows.length) return empty('No open leads');
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: d.rows.map((r) => ({ name: r.owner, value: r.open_leads })) };
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: r.owner, 'Open leads': r.open_leads, 'Idle 14d+': r.idle_14d, 'Overdue follow-ups': r.overdue_followups })), keys: ['Open leads', 'Idle 14d+', 'Overdue follow-ups'] };
      return {
        kind: 'table',
        rows: d.rows.map((r) => ({
          Owner: r.owner, 'Open leads': r.open_leads, 'New (30d)': r.new_leads, 'Never touched': r.never_touched, 'Idle 14d+': r.idle_14d,
          'Overdue follow-ups': r.overdue_followups, 'Median first touch': fmtMinutes(r.median_first_touch_minutes), 'SLA breach': fmtPct(r.sla_breach_pct),
        })),
      };
    }

    case 'stage_velocity': {
      const d = normaliseStageVelocity(data);
      const open = d.rows.filter((r) => r.stage_type === 'open');
      if (!open.some((r) => r.avg_days !== null || r.current_deals > 0)) return empty('No stage history yet');
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: open.map((r) => ({ name: r.stage, value: n0(r.avg_days) })), format: 'days' };
      if (chart === 'bar') return { kind: 'bar', data: open.map((r) => ({ name: r.stage, 'Avg days in stage': n0(r.avg_days) })), keys: ['Avg days in stage'], format: 'days' };
      return {
        kind: 'table',
        rows: open.map((r) => ({
          Stage: r.stage, 'Avg days': fmtDays(r.avg_days), 'Median days': fmtDays(r.median_days), 'Longest stay': fmtDays(r.max_days),
          'Open now': r.current_deals, 'Avg open age': fmtDays(r.avg_current_age_days), 'Slow now': r.slow_current_deals,
        })),
      };
    }

    case 'activity_mix': {
      const d = normaliseActivityMix(data);
      if (!d.totals.total) return empty('No activities logged in the last 30 days');
      if (chart === 'pie' || chart === 'donut') return pie(d.by_type.map((t) => ({ name: t.type, value: t.count })), chart);
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: d.by_type.map((t) => ({ name: t.type, value: t.count })) };
      if (chart === 'bar') return { kind: 'bar', data: d.by_type.map((t) => ({ name: t.type, Activities: t.count })), keys: ['Activities'] };
      return {
        kind: 'table',
        rows: d.rows.map((r) => ({
          Person: r.owner, Total: r.total, Calls: r.calls, Emails: r.emails, Meetings: r.meetings, 'Site visits': r.site_visits,
          'Completion %': fmtPct(r.completion_pct), 'Call connect %': fmtPct(r.connect_rate_pct),
        })),
      };
    }

    case 'lead_conversion_time': {
      const d = normaliseConversionTime(data);
      const t = d.totals;
      if (!t.converted) return empty('No leads converted in the last 90 days');
      if (chart === 'number') {
        return {
          kind: 'number', main: fmtDays(t.median_days),
          sub: `median · average ${fmtDays(t.avg_days)} · 90% within ${fmtDays(t.p90_days)} · ${t.converted} leads`,
        };
      }
      if (chart === 'pie' || chart === 'donut') return pie(d.buckets.map((b) => ({ name: b.bucket, value: b.count })), chart);
      if (chart === 'table') {
        return { kind: 'table', rows: d.buckets.map((b) => ({ 'Days to convert': b.bucket, Leads: b.count, Share: fmtPct(t.converted ? (b.count / t.converted) * 100 : null) })) };
      }
      return { kind: 'bar', data: d.buckets.map((b) => ({ name: b.bucket, Leads: b.count })), keys: ['Leads'] };
    }

    case 'weighted_pipeline': {
      const d = normaliseWeightedPipeline(data);
      const rows = d.rows.filter((r) => r.deals > 0);
      if (!rows.length) return empty('No open deals');
      if (chart === 'number') {
        const t = d.totals;
        return { kind: 'number', main: fmtInr(t.weighted_value), sub: `weighted · of ${fmtInr(t.value)} open (${fmtPct(t.weighted_pct_of_value)}) · ${t.deals} deals` };
      }
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: rows.map((r) => ({ name: r.stage, value: r.weighted_value })), format: 'inr' };
      if (chart === 'bar') return { kind: 'bar', data: rows.map((r) => ({ name: r.stage, 'Open value': r.value, 'Weighted value': r.weighted_value })), keys: ['Open value', 'Weighted value'], format: 'inr' };
      return {
        kind: 'table',
        rows: rows.map((r) => ({
          Stage: r.stage, Deals: r.deals, Value: fmtInr(r.value), Weighted: fmtInr(r.weighted_value), 'Avg deal': fmtInr(r.avg_deal_size),
          'Avg age': fmtDays(r.avg_age_days), 'Past close date': r.past_close_date,
        })),
      };
    }

    case 'deal_size_distribution': {
      const d = normaliseDealSize(data);
      if (!d.totals.deals) return empty('No deals created in the last 180 days');
      if (chart === 'pie' || chart === 'donut') return pie(d.rows.map((r) => ({ name: r.bucket, value: r.deals })), chart);
      if (chart === 'horizontal-bar') return { kind: 'hbar', data: d.rows.map((r) => ({ name: r.bucket, value: r.deals })) };
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: r.bucket, Won: r.won, Lost: r.lost, Open: r.open })), keys: ['Won', 'Lost', 'Open'] };
      return {
        kind: 'table',
        rows: d.rows.map((r) => ({ Band: r.bucket, Deals: r.deals, Won: r.won, Lost: r.lost, Open: r.open, Value: fmtInr(r.value), 'Win rate': fmtPct(r.win_rate_pct) })),
      };
    }

    case 'win_rate_trend': {
      const d = normaliseWinRateTrend(data);
      if (!d.totals.closed) return empty('No deals closed in this period');
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: monthLabel(r.month), Won: r.won, Lost: r.lost })), keys: ['Won', 'Lost'] };
      if (chart === 'table') {
        return { kind: 'table', rows: d.rows.map((r) => ({ Month: monthLabel(r.month), Won: r.won, Lost: r.lost, 'Win rate': fmtPct(r.win_rate_pct), 'Won value': fmtInr(r.won_value), 'Lost value': fmtInr(r.lost_value) })) };
      }
      const series = d.rows.map((r) => ({ name: monthLabel(r.month), 'Win rate %': r.win_rate_pct }));
      return chart === 'area'
        ? { kind: 'area', data: series, keys: ['Win rate %'], format: 'pct' }
        : { kind: 'line', data: series, keys: ['Win rate %'], format: 'pct' };
    }

    case 'call_connect_trend': {
      const d = normaliseCallTrend(data);
      const t = d.totals;
      if (!t.calls) return empty('No calls logged in the last 8 weeks');
      if (chart === 'number') {
        return {
          kind: 'number', main: t.connect_rate_pct === null ? DASH : fmtPct(t.connect_rate_pct),
          sub: t.with_outcome ? `${t.connected} of ${t.with_outcome} calls with an outcome connected · ${t.calls} calls` : `No call outcomes recorded yet · ${t.calls} calls`,
        };
      }
      if (chart === 'bar') return { kind: 'bar', data: d.rows.map((r) => ({ name: weekLabel(r.week), Calls: r.calls, Connected: r.connected })), keys: ['Calls', 'Connected'] };
      if (chart === 'table') {
        return { kind: 'table', rows: d.rows.map((r) => ({ 'Week starting': weekLabel(r.week), Calls: r.calls, 'With outcome': r.with_outcome, Connected: r.connected, 'Connect %': fmtPct(r.connect_rate_pct) })) };
      }
      const series = d.rows.map((r) => ({ name: weekLabel(r.week), 'Connect %': r.connect_rate_pct }));
      return chart === 'area'
        ? { kind: 'area', data: series, keys: ['Connect %'], format: 'pct' }
        : { kind: 'line', data: series, keys: ['Connect %'], format: 'pct' };
    }

    case 'lead_recycling': {
      const d = normaliseRecycling(data);
      const t = d.totals;
      if (!t.moved_to_lost && !t.reopened) return empty('No leads moved to or from Lost in this period');
      if (chart === 'number') {
        return { kind: 'number', main: fmtInt(t.reopened), sub: `leads reopened · ${t.distinct_leads_reopened} distinct · ${t.converted_after_reopen} converted since · ${t.moved_to_lost} moved to lost` };
      }
      if (chart === 'table') return { kind: 'table', rows: d.rows.map((r) => ({ Month: monthLabel(r.month), 'Moved to lost': r.moved_to_lost, Reopened: r.reopened })) };
      const series = d.rows.map((r) => ({ name: monthLabel(r.month), 'Moved to lost': r.moved_to_lost, Reopened: r.reopened }));
      return chart === 'line'
        ? { kind: 'line', data: series, keys: ['Moved to lost', 'Reopened'] }
        : { kind: 'bar', data: series, keys: ['Moved to lost', 'Reopened'] };
    }

    default:
      return empty('Unsupported widget');
  }
}
