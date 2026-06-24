// Resolves which demo fixture bundle matchDemoMock should serve, based on the
// demo account's selected industry vertical (kinematic_selected_industry).
//
// Generic (default, "") → today's steel/real-estate B2B content from
// seedData.ts + factoriesA.ts + factoriesB.ts.
// Insurance ("insurance") → the Aviva Life Insurance fixtures in
// ./insurance/crm.ts + ./insurance/field.ts.
//
// matchDemoMock destructures the returned bundle at call time so flipping the
// header industry switcher changes responses without a rebuild. Names NOT in
// the bundle (e.g. mockSOS, mockInventory, distribution data) keep using the
// generic module imports — those surfaces are vertical-agnostic.

import * as seed from './seedData';
import * as facA from './factoriesA';
import * as facB from './factoriesB';
import * as insCrm from './insurance/crm';
import { INSURANCE_FIELD } from './insurance/field';
import { getStoredIndustryScope } from '../../context/IndustryScopeContext';

export function isInsuranceDemo(): boolean {
  return getStoredIndustryScope() === 'insurance';
}

// The set of names matchDemoMock can swap per-vertical. Generic values come
// from the existing modules; the insurance branch overrides the CRM + field
// fixtures it themes. ROUTE_PLANS is intentionally absent from generic (it is
// a local const in demoMocks.ts) — matchDemoMock falls back to its own.
function genericBundle(): Record<string, unknown> {
  return {
    // CRM lists + lookups
    CRM_LEADS: seed.CRM_LEADS, CRM_DEALS: seed.CRM_DEALS, CRM_ACCOUNTS: seed.CRM_ACCOUNTS,
    CRM_CONTACTS: seed.CRM_CONTACTS, CRM_ACTIVITIES: seed.CRM_ACTIVITIES,
    CRM_PIPELINES: seed.CRM_PIPELINES, CRM_SOURCES: seed.CRM_SOURCES,
    CRM_TERRITORIES: seed.CRM_TERRITORIES, CRM_PRODUCTS: seed.CRM_PRODUCTS,
    CRM_WA_TEMPLATES_SEED: seed.CRM_WA_TEMPLATES_SEED,
    readDemoCustomFields: seed.readDemoCustomFields,
    writeDemoCustomFields: seed.writeDemoCustomFields,
    readDemoWaTemplates: seed.readDemoWaTemplates,
    CRM_SETTINGS: {}, // generic demo returned an empty settings blob
    // CRM analytics
    CRM_DASHBOARD_COMPLETE: seed.CRM_DASHBOARD_COMPLETE, CRM_DASHBOARD_SUMMARY: seed.CRM_DASHBOARD_SUMMARY,
    CRM_PIPELINE_VALUE: seed.CRM_PIPELINE_VALUE, CRM_FUNNEL: seed.CRM_FUNNEL, CRM_WIN_RATE: seed.CRM_WIN_RATE,
    CRM_SALES_CYCLE: seed.CRM_SALES_CYCLE, CRM_FORECAST: seed.CRM_FORECAST, CRM_HEATMAP: seed.CRM_HEATMAP,
    CRM_LEAD_SOURCE_ROI: seed.CRM_LEAD_SOURCE_ROI, CRM_SCORE_DIST: seed.CRM_SCORE_DIST,
    CRM_LEAD_VELOCITY: seed.CRM_LEAD_VELOCITY, CRM_TIME_TO_FIRST_TOUCH: seed.CRM_TIME_TO_FIRST_TOUCH,
    CRM_STUCK_LEADS_KPI: seed.CRM_STUCK_LEADS_KPI, CRM_LOST_REASONS: seed.CRM_LOST_REASONS,
    CRM_WON_REASONS: seed.CRM_WON_REASONS, CRM_DISQUAL_REASONS: seed.CRM_DISQUAL_REASONS,
    CRM_STAGE_CONVERSION: seed.CRM_STAGE_CONVERSION, CRM_LEAD_AGING: seed.CRM_LEAD_AGING,
    CRM_COHORT_CONVERSION: seed.CRM_COHORT_CONVERSION, CRM_ENGAGEMENT_COMPARISON: seed.CRM_ENGAGEMENT_COMPARISON,
    CRM_DAYS_SINCE_TOUCH: seed.CRM_DAYS_SINCE_TOUCH, CRM_SCORE_BAND_CONVERSION: seed.CRM_SCORE_BAND_CONVERSION,
    CRM_TERRITORY_CONVERSION: seed.CRM_TERRITORY_CONVERSION, CRM_TOUCHPOINTS_TO_RESPONSE: seed.CRM_TOUCHPOINTS_TO_RESPONSE,
    CRM_LEADS_AT_RISK: seed.CRM_LEADS_AT_RISK,
    CRM_ANALYTICS_LAYOUT: seed.CRM_ANALYTICS_LAYOUT, CRM_OVERVIEW_LAYOUT: seed.CRM_OVERVIEW_LAYOUT,
    // Field force
    mockDashboardInit: facA.mockDashboardInit, mockSummary: facA.mockSummary, mockTrends: facA.mockTrends,
    mockFeed: facA.mockFeed, mockHeatmap: facA.mockHeatmap, mockLocations: facA.mockLocations,
    mockUsers: facA.mockUsers, mockAttendanceTeam: facA.mockAttendanceTeam, mockStores: facA.mockStores,
    mockFormTemplates: facA.mockFormTemplates, mockActivities: facA.mockActivities,
    mockVisitLogs: facA.mockVisitLogs, mockSubmissions: facA.mockSubmissions,
    mockCityPerformance: facB.mockCityPerformance, mockOutletCoverage: facB.mockOutletCoverage,
    mockWeeklyContacts: facB.mockWeeklyContacts, mockBroadcasts: facB.mockBroadcasts,
    mockBroadcastAdmin: facB.mockBroadcastAdmin, mockLearningMaterials: facB.mockLearningMaterials,
    mockMobileHome: facB.mockMobileHome,
  };
}

export function getActiveSeed(): Record<string, any> {
  const base = genericBundle();
  if (!isInsuranceDemo()) return base;
  return {
    ...base,
    // CRM overrides
    CRM_LEADS: insCrm.CRM_LEADS, CRM_DEALS: insCrm.CRM_DEALS, CRM_ACCOUNTS: insCrm.CRM_ACCOUNTS,
    CRM_CONTACTS: insCrm.CRM_CONTACTS, CRM_ACTIVITIES: insCrm.CRM_ACTIVITIES,
    CRM_PIPELINES: insCrm.CRM_PIPELINES, CRM_SOURCES: insCrm.CRM_SOURCES,
    CRM_TERRITORIES: insCrm.CRM_TERRITORIES, CRM_PRODUCTS: insCrm.CRM_PRODUCTS,
    CRM_WA_TEMPLATES_SEED: insCrm.CRM_WA_TEMPLATES_SEED,
    readDemoCustomFields: insCrm.readDemoCustomFields,
    writeDemoCustomFields: insCrm.writeDemoCustomFields,
    CRM_SETTINGS: insCrm.CRM_SETTINGS,
    CRM_DASHBOARD_COMPLETE: insCrm.CRM_DASHBOARD_COMPLETE, CRM_DASHBOARD_SUMMARY: insCrm.CRM_DASHBOARD_SUMMARY,
    CRM_PIPELINE_VALUE: insCrm.CRM_PIPELINE_VALUE, CRM_FUNNEL: insCrm.CRM_FUNNEL, CRM_WIN_RATE: insCrm.CRM_WIN_RATE,
    CRM_SALES_CYCLE: insCrm.CRM_SALES_CYCLE, CRM_FORECAST: insCrm.CRM_FORECAST, CRM_HEATMAP: insCrm.CRM_HEATMAP,
    CRM_LEAD_SOURCE_ROI: insCrm.CRM_LEAD_SOURCE_ROI, CRM_SCORE_DIST: insCrm.CRM_SCORE_DIST,
    CRM_LEAD_VELOCITY: insCrm.CRM_LEAD_VELOCITY, CRM_TIME_TO_FIRST_TOUCH: insCrm.CRM_TIME_TO_FIRST_TOUCH,
    CRM_STUCK_LEADS_KPI: insCrm.CRM_STUCK_LEADS_KPI, CRM_LOST_REASONS: insCrm.CRM_LOST_REASONS,
    CRM_WON_REASONS: insCrm.CRM_WON_REASONS, CRM_DISQUAL_REASONS: insCrm.CRM_DISQUAL_REASONS,
    CRM_STAGE_CONVERSION: insCrm.CRM_STAGE_CONVERSION, CRM_LEAD_AGING: insCrm.CRM_LEAD_AGING,
    CRM_COHORT_CONVERSION: insCrm.CRM_COHORT_CONVERSION, CRM_ENGAGEMENT_COMPARISON: insCrm.CRM_ENGAGEMENT_COMPARISON,
    CRM_DAYS_SINCE_TOUCH: insCrm.CRM_DAYS_SINCE_TOUCH, CRM_SCORE_BAND_CONVERSION: insCrm.CRM_SCORE_BAND_CONVERSION,
    CRM_TERRITORY_CONVERSION: insCrm.CRM_TERRITORY_CONVERSION, CRM_TOUCHPOINTS_TO_RESPONSE: insCrm.CRM_TOUCHPOINTS_TO_RESPONSE,
    CRM_LEADS_AT_RISK: insCrm.CRM_LEADS_AT_RISK,
    CRM_ANALYTICS_LAYOUT: insCrm.CRM_ANALYTICS_LAYOUT, CRM_OVERVIEW_LAYOUT: insCrm.CRM_OVERVIEW_LAYOUT,
    // Field-force overrides (incl. ROUTE_PLANS, absent from generic)
    ...INSURANCE_FIELD,
  };
}
