/**
 * Data fetching for the Lead Management "plus" widgets. Thin: it calls the typed
 * client (which normalises every reply), and hands custom-chart datasets their
 * flat rows through the pure datasetRows() in plusWidgetViews.ts.
 */
import { crmAnalyticsPlus } from '../../../lib/crmAnalyticsExtApi';
import { datasetRows } from './plusWidgetViews';

/** The payload for a plus widget type (already normalised, so a bad / empty reply is a clean empty state). */
export async function fetchPlusWidgetData(type: string): Promise<unknown> {
  switch (type) {
    case 'lead_source_performance': return crmAnalyticsPlus.sourcePerformance();
    case 'followup_compliance':     return crmAnalyticsPlus.followupCompliance();
    case 'owner_workload':          return crmAnalyticsPlus.ownerWorkload();
    case 'stage_velocity':          return crmAnalyticsPlus.stageVelocity();
    case 'activity_mix':            return crmAnalyticsPlus.activityMix();
    case 'lead_conversion_time':    return crmAnalyticsPlus.conversionTime();
    case 'weighted_pipeline':       return crmAnalyticsPlus.weightedPipeline();
    case 'deal_size_distribution':  return crmAnalyticsPlus.dealSizeDistribution();
    case 'win_rate_trend':          return crmAnalyticsPlus.winRateTrend();
    case 'call_connect_trend':      return crmAnalyticsPlus.callConnectTrend();
    case 'lead_recycling':          return crmAnalyticsPlus.leadRecycling();
    default: throw new Error(`Unknown widget: ${type}`);
  }
}

/** Flat rows for a custom-chart dataset id, or undefined when the id is not a plus dataset. */
export async function fetchPlusDataset(id: string): Promise<Array<Record<string, unknown>> | undefined> {
  switch (id) {
    case 'source_performance':            return datasetRows(id, await crmAnalyticsPlus.sourcePerformance());
    case 'followup_compliance_by_owner':
    case 'followup_compliance_trend':     return datasetRows(id, await crmAnalyticsPlus.followupCompliance());
    case 'owner_workload':                return datasetRows(id, await crmAnalyticsPlus.ownerWorkload());
    case 'stage_velocity':                return datasetRows(id, await crmAnalyticsPlus.stageVelocity());
    case 'activity_mix_by_type':
    case 'activity_mix_by_owner':
    case 'activity_mix_by_week':          return datasetRows(id, await crmAnalyticsPlus.activityMix());
    case 'conversion_time_buckets':
    case 'conversion_time_by_owner':
    case 'conversion_time_by_source':     return datasetRows(id, await crmAnalyticsPlus.conversionTime());
    case 'weighted_pipeline':             return datasetRows(id, await crmAnalyticsPlus.weightedPipeline());
    case 'deal_size_distribution':        return datasetRows(id, await crmAnalyticsPlus.dealSizeDistribution());
    case 'win_rate_trend':                return datasetRows(id, await crmAnalyticsPlus.winRateTrend());
    case 'call_connect_trend':            return datasetRows(id, await crmAnalyticsPlus.callConnectTrend());
    case 'lead_recycling':                return datasetRows(id, await crmAnalyticsPlus.leadRecycling());
    default: return undefined;
  }
}

