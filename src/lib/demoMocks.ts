// Demo mock layer for the demo@kinematic.com user. Intercepts client API
// calls and returns hand-crafted India-FMCG seed data so the demo can be
// driven without a backend. Heavy data tables live in ./demo/* helpers
// to keep this entry file small enough to be edited and pushed via the
// platform's MCP tooling.

export const DEMO_USER_EMAIL = 'demo@kinematic.com';

export * from './demo/factoriesA';
export * from './demo/factoriesB';

import {
  mockDashboardInit, mockSummary, mockTrends, mockFeed, mockHeatmap,
  mockLocations, mockUsers, mockAttendanceTeam, mockStores, mockFormTemplates,
  mockRoutePlans, mockActivities, mockAssets, mockSecurityAlerts, mockVisitLogs,
  mockSubmissions,
} from './demo/factoriesA';
import {
  mockSOS, mockGrievances, mockCities, mockZones, mockClients, mockInventory,
  mockWarehouseSummary, mockMovements, mockWeeklyContacts, mockCityPerformance,
  mockOutletCoverage, mockBroadcasts, mockBroadcastAdmin, mockLearningMaterials,
  mockMobileHome,
} from './demo/factoriesB';
import {
  CRM_LEADS, CRM_PIPELINES, CRM_ACCOUNTS, CRM_CONTACTS, CRM_DEALS, CRM_ACTIVITIES,
  CRM_SOURCES, CRM_DASHBOARD_SUMMARY, CRM_PIPELINE_VALUE, CRM_FUNNEL, CRM_WIN_RATE,
  CRM_FORECAST, CRM_HEATMAP, CRM_LEAD_SOURCE_ROI, CRM_SCORE_DIST, CRM_SALES_CYCLE,
  CRM_DASHBOARD_COMPLETE, CRM_TERRITORIES, CRM_PRODUCTS, CRM_LEAD_VELOCITY,
  CRM_TIME_TO_FIRST_TOUCH, CRM_STUCK_LEADS_KPI, CRM_LOST_REASONS, CRM_WON_REASONS,
  CRM_DISQUAL_REASONS, CRM_STAGE_CONVERSION, CRM_LEAD_AGING, CRM_COHORT_CONVERSION,
  CRM_ENGAGEMENT_COMPARISON, CRM_DAYS_SINCE_TOUCH, CRM_SCORE_BAND_CONVERSION,
  CRM_TERRITORY_CONVERSION, CRM_TOUCHPOINTS_TO_RESPONSE, CRM_LEADS_AT_RISK,
  CRM_ANALYTICS_LAYOUT, CRM_OVERVIEW_LAYOUT, CRM_WA_TEMPLATES_SEED,
  readDemoWaTemplates, writeDemoWaTemplates, pushDemoWaTemplate,
  PLANOGRAMS, PLAN_ASSIGNMENTS, PLAN_CAPTURES, planRecognitionFor, planComplianceFor,
  PLAN_TREND, PLAN_STORE_RANKING, PLAN_CHRONIC_GAPS, PLAN_SKU_VISIBILITY,
  PLAN_RISK_FORECAST, HR_CANDIDATES,
} from './demo/seedData';

// ---------------------------------------------------------------------------
// Path → mock router. Returns the wrapped {success, data} payload, or
// undefined to fall through to the network call.
// ---------------------------------------------------------------------------
const list = <T,>(rows: T[]) => ({ success: true, data: rows });
const wrap = <T,>(body: T)  => ({ success: true, data: body });

export function matchDemoMock<T>(rawPath: string, method: string, body?: unknown): T | undefined {
  const noQuery = rawPath.split('?')[0];
  const path = noQuery.startsWith('/api/v1') ? noQuery.slice('/api/v1'.length) : noQuery;
  const m = method.toUpperCase();
  const bodyObj: Record<string, unknown> = (body && typeof body === 'object' && !Array.isArray(body))
    ? (body as Record<string, unknown>)
    : {};

  if (m === 'GET') {
    if (path === '/analytics/dashboard-init')   return mockDashboardInit() as unknown as T;
    if (path === '/analytics/summary')          return mockSummary(new Date().toISOString().split('T')[0]) as unknown as T;
    if (path === '/analytics/trends')           return mockTrends() as unknown as T;
    if (path === '/analytics/tff-trends')       return mockTrends() as unknown as T;
    if (path === '/analytics/feed')             return mockFeed() as unknown as T;
    if (path === '/analytics/heatmap')          return mockHeatmap() as unknown as T;
    if (path === '/analytics/contact-heatmap')  return mockHeatmap() as unknown as T;
    if (path === '/analytics/locations')        return mockLocations() as unknown as T;
    if (path === '/analytics/weekly-contacts')  return mockWeeklyContacts() as unknown as T;
    if (path === '/analytics/city-performance') return mockCityPerformance() as unknown as T;
    if (path === '/analytics/outlet-coverage')  return mockOutletCoverage() as unknown as T;
    if (path === '/analytics/attendance-today') return mockAttendanceTeam() as unknown as T;
    if (path === '/analytics/mobile-home')      return mockMobileHome() as unknown as T;

    if (path === '/users')                      return mockUsers() as unknown as T;
    if (path === '/attendance/team')            return mockAttendanceTeam() as unknown as T;
    if (path === '/zones')                      return mockZones() as unknown as T;
    if (path === '/clients')                    return mockClients() as unknown as T;
    if (path === '/inventory' || path === '/skus') return mockInventory() as unknown as T;
    if (path === '/warehouses' || path === '/warehouse/summary' || path === '/warehouses/summary') return mockWarehouseSummary() as unknown as T;
    if (path === '/movements' || path === '/wms/movements')      return mockMovements() as unknown as T;
    if (/^\/warehouses\/[^/]+\/movements$/.test(path))            return mockMovements() as unknown as T;
    if (path === '/cities')                     return mockCities() as unknown as T;
    if (path === '/grievances')                 return mockGrievances() as unknown as T;
    if (path === '/sos' || path === '/sos/active') return mockSOS() as unknown as T;
    if (path === '/broadcast' || path === '/broadcasts') return mockBroadcasts() as unknown as T;
    if (path === '/learning')                   return mockLearningMaterials() as unknown as T;
    if (path === '/visit-logs' || path === '/visits/team' || path === '/visits') return mockVisitLogs() as unknown as T;
    if (path === '/forms/templates' || path === '/form-templates') return mockFormTemplates() as unknown as T;
    if (path === '/forms/submissions' || path === '/submissions')  return mockSubmissions() as unknown as T;
    if (path === '/route-plans')                return mockRoutePlans() as unknown as T;
    if (path === '/activity-mappings')          return list([]) as unknown as T;
    if (path === '/activities')                 return mockActivities() as unknown as T;
    if (path === '/assets')                     return mockAssets() as unknown as T;
    if (path === '/security/alerts')            return mockSecurityAlerts() as unknown as T;
    if (path === '/stores')                     return mockStores() as unknown as T;

    if (path === '/crm/leads')      return list(CRM_LEADS) as unknown as T;
    if (path === '/crm/deals')      return list(CRM_DEALS) as unknown as T;
    if (path === '/crm/accounts')   return list(CRM_ACCOUNTS) as unknown as T;
    if (path === '/crm/contacts')   return list(CRM_CONTACTS) as unknown as T;
    if (path === '/crm/activities') return list(CRM_ACTIVITIES) as unknown as T;
    if (path === '/crm/tasks')      return list(CRM_ACTIVITIES.filter(a => a.type === 'task')) as unknown as T;
    if (path === '/crm/pipelines')  return wrap(CRM_PIPELINES) as unknown as T;
    if (path === '/crm/lead-sources')        return list(CRM_SOURCES)      as unknown as T;
    if (path === '/crm/territories')         return list(CRM_TERRITORIES)  as unknown as T;
    if (path === '/crm/products')            return list(CRM_PRODUCTS)     as unknown as T;
    if (path === '/crm/email-templates')     return list([])               as unknown as T;
    if (path === '/crm/whatsapp-templates') {
      const userMade = readDemoWaTemplates();
      return list([...userMade, ...CRM_WA_TEMPLATES_SEED]) as unknown as T;
    }
    if (path === '/crm/automations')         return list([])               as unknown as T;
    if (path === '/crm/assignment-rules')    return list([])               as unknown as T;
    if (path === '/crm/custom-fields')       return list([])               as unknown as T;
    if (path === '/crm/settings')            return wrap({})               as unknown as T;

    {
      const leadById = path.match(/^\/crm\/leads\/([^/]+)$/);
      if (leadById) return wrap(CRM_LEADS.find(l => l.id === leadById[1]) || CRM_LEADS[0]) as unknown as T;
      const dealById = path.match(/^\/crm\/deals\/([^/]+)$/);
      if (dealById) return wrap(CRM_DEALS.find(d => d.id === dealById[1]) || CRM_DEALS[0]) as unknown as T;
      const acctById = path.match(/^\/crm\/accounts\/([^/]+)$/);
      if (acctById) return wrap(CRM_ACCOUNTS.find(a => a.id === acctById[1]) || CRM_ACCOUNTS[0]) as unknown as T;
      const ctcById = path.match(/^\/crm\/contacts\/([^/]+)$/);
      if (ctcById) return wrap(CRM_CONTACTS.find(c => c.id === ctcById[1]) || CRM_CONTACTS[0]) as unknown as T;

      if (/^\/crm\/leads\/[^/]+\/activities$/.test(path))    return list(CRM_ACTIVITIES.slice(0, 4)) as unknown as T;
      if (/^\/crm\/leads\/[^/]+\/deals$/.test(path))         return list(CRM_DEALS.slice(0, 2)) as unknown as T;
      if (/^\/crm\/leads\/[^/]+\/score-history$/.test(path)) return list([]) as unknown as T;
      if (/^\/crm\/deals\/[^/]+\/(activities|history|contacts|notes|line-items)$/.test(path)) return list([]) as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/contacts$/.test(path))   return list(CRM_CONTACTS.slice(0, 3))  as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/deals$/.test(path))      return list(CRM_DEALS.slice(0, 3))     as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/activities$/.test(path)) return list(CRM_ACTIVITIES.slice(0, 3))as unknown as T;
      if (/^\/crm\/accounts\/[^/]+\/notes$/.test(path))      return list([])                        as unknown as T;
      if (/^\/crm\/contacts\/[^/]+\/(activities|deals|notes|emails)$/.test(path)) return list([]) as unknown as T;
    }

    if (path === '/crm/analytics/dashboard-complete')      return wrap(CRM_DASHBOARD_COMPLETE) as unknown as T;
    if (path === '/crm/analytics/dashboard-summary')       return wrap(CRM_DASHBOARD_SUMMARY)  as unknown as T;
    if (path === '/crm/analytics/pipeline-value')          return wrap(CRM_PIPELINE_VALUE)     as unknown as T;
    if (path === '/crm/analytics/funnel')                  return wrap(CRM_FUNNEL)             as unknown as T;
    if (path === '/crm/analytics/win-rate')                return wrap(CRM_WIN_RATE)           as unknown as T;
    if (path === '/crm/analytics/sales-cycle')             return wrap(CRM_SALES_CYCLE)        as unknown as T;
    if (path === '/crm/analytics/forecast')                return wrap(CRM_FORECAST)           as unknown as T;
    if (path === '/crm/analytics/activity-heatmap')        return wrap(CRM_HEATMAP)            as unknown as T;
    if (path === '/crm/analytics/lead-source-roi')         return wrap(CRM_LEAD_SOURCE_ROI)    as unknown as T;
    if (path === '/crm/analytics/lead-score-distribution') return wrap(CRM_SCORE_DIST)         as unknown as T;
    if (path === '/crm/analytics/by-state')                return list([])                     as unknown as T;

    if (path === '/crm/analytics/lead-velocity')            return wrap(CRM_LEAD_VELOCITY)          as unknown as T;
    if (path === '/crm/analytics/time-to-first-touch')      return wrap(CRM_TIME_TO_FIRST_TOUCH)    as unknown as T;
    if (path === '/crm/analytics/stuck-leads')              return wrap(CRM_STUCK_LEADS_KPI)        as unknown as T;
    if (path === '/crm/analytics/lost-reasons')             return wrap(CRM_LOST_REASONS)           as unknown as T;
    if (path === '/crm/analytics/won-reasons')              return wrap(CRM_WON_REASONS)            as unknown as T;
    if (path === '/crm/analytics/disqualification-reasons') return wrap(CRM_DISQUAL_REASONS)        as unknown as T;
    if (path === '/crm/analytics/stage-conversion')         return wrap(CRM_STAGE_CONVERSION)       as unknown as T;
    if (path === '/crm/analytics/lead-aging')               return wrap(CRM_LEAD_AGING)             as unknown as T;
    if (path === '/crm/analytics/cohort-conversion')        return wrap(CRM_COHORT_CONVERSION)      as unknown as T;
    if (path === '/crm/analytics/engagement-comparison')    return wrap(CRM_ENGAGEMENT_COMPARISON)  as unknown as T;
    if (path === '/crm/analytics/days-since-touch')         return wrap(CRM_DAYS_SINCE_TOUCH)       as unknown as T;
    if (path === '/crm/analytics/score-band-conversion')    return wrap(CRM_SCORE_BAND_CONVERSION)  as unknown as T;
    if (path === '/crm/analytics/territory-conversion')     return wrap(CRM_TERRITORY_CONVERSION)   as unknown as T;
    if (path === '/crm/analytics/touchpoints-to-response')  return wrap(CRM_TOUCHPOINTS_TO_RESPONSE)as unknown as T;
    if (path === '/crm/analytics/leads-at-risk')            return wrap(CRM_LEADS_AT_RISK)          as unknown as T;

    if (path === '/crm/dashboard-layouts/analytics')        return wrap(CRM_ANALYTICS_LAYOUT)       as unknown as T;
    if (path === '/crm/dashboard-layouts/overview')         return wrap(CRM_OVERVIEW_LAYOUT)        as unknown as T;

    if (path === '/misc/clients') {
      return list([
        { id: 'demo-client-1', name: 'Acme Corp',         is_active: true },
        { id: 'demo-client-2', name: 'Globex Industries', is_active: true },
        { id: 'demo-client-3', name: 'Wayne Enterprises', is_active: true },
      ]) as unknown as T;
    }
    if (path === '/misc/security/alerts/all') return list([]) as unknown as T;
    if (path === '/notifications/history')    return list([]) as unknown as T;
    if (path === '/candidates' || path.startsWith('/candidates?')) {
      return list(HR_CANDIDATES) as unknown as T;
    }
    if (/^\/candidates\/[^/]+\/documents$/.test(path)) return list([]) as unknown as T;
    if (path === '/forms/submissions' || path === '/builder/forms/admin/submissions') {
      return wrap({ data: [], total: 0 }) as unknown as T;
    }
    if (path === '/broadcast/admin') return mockBroadcastAdmin() as unknown as T;
    if (path === '/route-plans/summary') {
      return wrap({
        total_fes: 10, total_outlets: 42, visited_outlets: 22, missed_outlets: 2,
        completed_plans: 3, partial_plans: 2, in_progress_plans: 4, pending_plans: 1,
        avg_completion: 56,
      }) as unknown as T;
    }

    if (path === '/hr/dashboard' || path === '/hr/summary') {
      const by_stage: Record<string, number> = {};
      for (const c of HR_CANDIDATES) by_stage[c.stage] = (by_stage[c.stage] || 0) + 1;
      return wrap({ pipeline: HR_CANDIDATES, by_stage, total: HR_CANDIDATES.length }) as unknown as T;
    }

    if (path === '/settings' || path === '/settings/org') return wrap({}) as unknown as T;
    if (path === '/roles')   return list([]) as unknown as T;
    if (path === '/modules') return list([]) as unknown as T;

    if (path === '/audit-log') {
      const sample = (() => {
        const reps = [
          { id: 'fe1', name: 'Arjun Sharma', email: 'arjun@kinematic.demo', role: 'executive' },
          { id: 'fe2', name: 'Priya Patel',  email: 'priya@kinematic.demo', role: 'executive' },
          { id: 'fe3', name: 'Rahul Verma',  email: 'rahul@kinematic.demo', role: 'supervisor' },
          { id: 'demo-user-id', name: 'Demo Admin', email: 'demo@kinematic.com', role: 'super_admin' },
        ];
        const clients = [
          { id: 'cl1', name: 'Hindustan Unilever' },
          { id: 'cl2', name: 'ITC Limited' },
          { id: null,  name: null },
        ];
        const actions = [
          { action: 'leads.create',        entity: 'leads',      method: 'POST',   status: 201 },
          { action: 'leads.update',        entity: 'leads',      method: 'PATCH',  status: 200 },
          { action: 'deals.move-stage',    entity: 'deals',      method: 'POST',   status: 200 },
          { action: 'deals.win',           entity: 'deals',      method: 'POST',   status: 200 },
          { action: 'orders.create',       entity: 'orders',     method: 'POST',   status: 201 },
          { action: 'orders.approve',      entity: 'orders',     method: 'POST',   status: 200 },
          { action: 'invoices.create',     entity: 'invoices',   method: 'POST',   status: 201 },
          { action: 'payments.create',     entity: 'payments',   method: 'POST',   status: 201 },
          { action: 'attendance.checkin',  entity: 'attendance', method: 'POST',   status: 201 },
          { action: 'attendance.checkout', entity: 'attendance', method: 'PATCH',  status: 200 },
          { action: 'planograms.update',   entity: 'planograms', method: 'PATCH',  status: 200 },
          { action: 'users.create',        entity: 'users',      method: 'POST',   status: 201 },
          { action: 'broadcast.send',      entity: 'broadcast',  method: 'POST',   status: 201 },
          { action: 'visit-logs.create',   entity: 'visit-logs', method: 'POST',   status: 201 },
          { action: 'leads.delete',        entity: 'leads',      method: 'DELETE', status: 204 },
        ];
        const rows = Array.from({ length: 60 }, (_, i) => {
          const a = actions[i % actions.length];
          const u = reps[i % reps.length];
          const c = clients[i % clients.length];
          const ts = new Date(Date.now() - i * 1000 * 60 * (3 + (i % 10))).toISOString();
          return {
            id: 'demo-audit-' + i,
            created_at: ts,
            action: a.action,
            entity_table: a.entity,
            entity_id: i % 4 === 0 ? null : 'demo-' + a.entity + '-' + (i + 1),
            actor: u,
            client: c.id ? c : null,
            ip_address: '203.0.113.' + (10 + (i % 200)),
            metadata: { method: a.method, path: `/api/v1/${a.entity.replace('-', '/')}${i % 4 === 0 ? '' : '/demo-' + a.entity + '-' + (i + 1)}`, status: a.status },
            payload: null,
          };
        });
        return { rows, limit: 100, offset: 0, has_more: false };
      })();
      return wrap(sample) as unknown as T;
    }

    if (path === '/planograms/captures')                 return list(PLAN_CAPTURES) as unknown as T;
    if (path === '/planograms/analytics/trend')          return list(PLAN_TREND) as unknown as T;
    if (path === '/planograms/analytics/store-ranking')  return list(PLAN_STORE_RANKING) as unknown as T;
    if (path === '/planograms/analytics/chronic-gaps')   return list(PLAN_CHRONIC_GAPS) as unknown as T;
    if (path === '/planograms/analytics/sku-visibility') return list(PLAN_SKU_VISIBILITY) as unknown as T;
    if (path === '/planograms/analytics/risk-forecast')  return list(PLAN_RISK_FORECAST) as unknown as T;
    if (path === '/planograms')                          return list(PLANOGRAMS) as unknown as T;
    {
      const capDetail = path.match(/^\/planograms\/captures\/([^/]+)$/);
      if (capDetail) {
        const cap = PLAN_CAPTURES.find(c => c.id === capDetail[1]) || PLAN_CAPTURES[0];
        return wrap({
          capture: cap,
          recognition: planRecognitionFor(cap.id),
          compliance: planComplianceFor(cap.id, cap.planogram_id, cap.score),
        }) as unknown as T;
      }
      const pgAssign = path.match(/^\/planograms\/([^/]+)\/assignments$/);
      if (pgAssign) return list(PLAN_ASSIGNMENTS.filter(a => a.planogram_id === pgAssign[1])) as unknown as T;
      const pgDetail = path.match(/^\/planograms\/([^/]+)$/);
      if (pgDetail) return wrap(PLANOGRAMS.find(p => p.id === pgDetail[1]) || PLANOGRAMS[0]) as unknown as T;
    }
  }

  if (m === 'POST' || m === 'PATCH' || m === 'PUT') {
    if (m === 'PUT' && path === '/crm/dashboard-layouts/analytics') {
      return wrap((bodyObj as object) ?? CRM_ANALYTICS_LAYOUT) as unknown as T;
    }
    if (m === 'PUT' && path === '/crm/dashboard-layouts/overview') {
      return wrap((bodyObj as object) ?? CRM_OVERVIEW_LAYOUT) as unknown as T;
    }
    if (m === 'POST' && path === '/crm/dashboard-layouts/overview/pin') {
      const w = bodyObj as { id?: string; widget_type?: string; chart_type?: string };
      if (w?.id && w?.widget_type) {
        const next = {
          widgets: [...CRM_OVERVIEW_LAYOUT.widgets, w],
          layouts: {
            lg: [...CRM_OVERVIEW_LAYOUT.layouts.lg, { i: w.id, x: 0, y: 8,  w: 6, h: 4 }],
            md: [...CRM_OVERVIEW_LAYOUT.layouts.md, { i: w.id, x: 0, y: 8,  w: 4, h: 4 }],
            sm: [...CRM_OVERVIEW_LAYOUT.layouts.sm, { i: w.id, x: 0, y: 16, w: 2, h: 4 }],
          },
        };
        return wrap(next) as unknown as T;
      }
      return wrap(CRM_OVERVIEW_LAYOUT) as unknown as T;
    }
    {
      const wonM = path.match(/^\/crm\/leads\/([^/]+)\/won$/);
      if (m === 'POST' && wonM) {
        const base = CRM_LEADS[0];
        return wrap({
          ...base, id: wonM[1], status: 'converted',
          won_reason: (bodyObj as { reason?: string }).reason ?? null,
          won_at: new Date().toISOString(),
        }) as unknown as T;
      }
      const reopenM = path.match(/^\/crm\/leads\/([^/]+)\/reopen$/);
      if (m === 'POST' && reopenM) {
        const base = CRM_LEADS[0];
        return wrap({ ...base, id: reopenM[1], status: 'working', is_converted: false }) as unknown as T;
      }
    }
    if (m === 'POST' && path === '/crm/whatsapp-templates') {
      const row = {
        id: 'demo-wa-tpl-' + Math.random().toString(36).slice(2, 8),
        org_id: 'demo-org-999',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending',
        ...bodyObj,
      };
      pushDemoWaTemplate(row);
      return wrap(row) as unknown as T;
    }
    if (m === 'PATCH' && path.startsWith('/crm/whatsapp-templates/')) {
      const id = path.split('/').pop() || '';
      const list = readDemoWaTemplates();
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...bodyObj, updated_at: new Date().toISOString() };
        writeDemoWaTemplates(list);
        return wrap(list[idx]) as unknown as T;
      }
      const seed = CRM_WA_TEMPLATES_SEED.find((r) => r.id === id);
      if (seed) {
        const merged = { ...seed, ...bodyObj, updated_at: new Date().toISOString() };
        pushDemoWaTemplate(merged);
        return wrap(merged) as unknown as T;
      }
    }
    return wrap({ id: 'demo-noop-' + Math.random().toString(36).slice(2, 8), ok: true, demo: true }) as unknown as T;
  }
  if (m === 'DELETE') {
    {
      const layoutDelM = path.match(/^\/crm\/dashboard-layouts\/(analytics|overview)\/widgets\/([^/]+)$/);
      if (layoutDelM) {
        const src = layoutDelM[1] === 'overview' ? CRM_OVERVIEW_LAYOUT : CRM_ANALYTICS_LAYOUT;
        const wid = layoutDelM[2];
        return wrap({
          widgets: src.widgets.filter(w => w.id !== wid),
          layouts: {
            lg: src.layouts.lg.filter(it => it.i !== wid),
            md: src.layouts.md.filter(it => it.i !== wid),
            sm: src.layouts.sm.filter(it => it.i !== wid),
          },
        }) as unknown as T;
      }
    }
    if (path.startsWith('/crm/whatsapp-templates/')) {
      const id = path.split('/').pop() || '';
      const list = readDemoWaTemplates().filter((r) => r.id !== id);
      writeDemoWaTemplates(list);
    }
    return wrap({ ok: true, demo: true }) as unknown as T;
  }

  if (m === 'GET' && rawPath.startsWith('/api/v1/')) {
    return list([]) as unknown as T;
  }

  return undefined;
}
