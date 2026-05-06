// Single source of truth for the module catalog. Used by both the user form
// (settings/page.tsx) and the role hierarchy edit panel (settings/roles/page.tsx)
// so any new module added here flows through every permission UI.

export type ModuleGroup = 'Core' | 'Operations' | 'Business' | 'Distribution' | 'CRM' | 'People' | 'System';

export interface ModuleEntry {
  id: string;
  l: string;
  group: ModuleGroup;
}

export const ALL_MODULES: ModuleEntry[] = [
  // Core
  { id: 'analytics',                 l: 'Analytics',          group: 'Core' },
  { id: 'live_tracking',             l: 'Live Tracking',      group: 'Core' },
  { id: 'attendance',                l: 'Attendance',         group: 'Core' },
  { id: 'reports',                   l: 'Reports',            group: 'Core' },
  // Operations
  { id: 'orders',                    l: 'Route Plan',         group: 'Operations' },
  { id: 'work_activities',           l: 'Work Activities',    group: 'Operations' },
  { id: 'activities',                l: 'Activity Mgmt',      group: 'Operations' },
  { id: 'visit_logs',                l: 'Visit Logs',         group: 'Operations' },
  { id: 'form_builder',              l: 'Form Builder',       group: 'Operations' },
  { id: 'planograms',                l: 'Planograms',         group: 'Operations' },
  // Business
  { id: 'clients',                   l: 'Clients',            group: 'Business' },
  { id: 'inventory',                 l: 'Warehouse',          group: 'Business' },
  { id: 'skus',                      l: 'SKU Management',     group: 'Business' },
  { id: 'assets',                    l: 'Asset Management',   group: 'Business' },
  // Distribution (11)
  { id: 'distribution',              l: 'Overview',           group: 'Distribution' },
  { id: 'distribution_brands',       l: 'Brands',             group: 'Distribution' },
  { id: 'distribution_distributors', l: 'Distributors',       group: 'Distribution' },
  { id: 'distribution_pricing',      l: 'Price Lists',        group: 'Distribution' },
  { id: 'distribution_schemes',      l: 'Schemes',            group: 'Distribution' },
  { id: 'distribution_orders',       l: 'Orders',             group: 'Distribution' },
  { id: 'distribution_invoicing',    l: 'Invoicing',          group: 'Distribution' },
  { id: 'distribution_payments',     l: 'Payments',           group: 'Distribution' },
  { id: 'distribution_returns',      l: 'Returns',            group: 'Distribution' },
  { id: 'distribution_ledger',       l: 'Ledger',             group: 'Distribution' },
  { id: 'distribution_consumer',     l: 'Consumer',           group: 'Distribution' },
  // CRM (umbrella + sub-modules — granular control per area)
  { id: 'crm',                       l: 'CRM (all)',          group: 'CRM' },
  { id: 'crm_dashboard',             l: 'CRM Dashboard',      group: 'CRM' },
  { id: 'crm_leads',                 l: 'Leads',              group: 'CRM' },
  { id: 'crm_contacts',              l: 'Contacts',           group: 'CRM' },
  { id: 'crm_accounts',              l: 'Accounts',           group: 'CRM' },
  { id: 'crm_deals',                 l: 'Deals',              group: 'CRM' },
  { id: 'crm_pipeline',              l: 'Pipeline',           group: 'CRM' },
  { id: 'crm_products',              l: 'CRM Products',       group: 'CRM' },
  { id: 'crm_activities',            l: 'CRM Activities',     group: 'CRM' },
  { id: 'crm_tasks',                 l: 'CRM Tasks',          group: 'CRM' },
  { id: 'crm_whatsapp',              l: 'CRM WhatsApp',       group: 'CRM' },
  { id: 'crm_reports',               l: 'CRM Reports',        group: 'CRM' },
  { id: 'crm_settings',              l: 'CRM Settings',       group: 'CRM' },
  // People
  { id: 'broadcast',                 l: 'Broadcast',          group: 'People' },
  { id: 'users',                     l: 'Manpower',           group: 'People' },
  { id: 'hr',                        l: 'HR & Payroll',       group: 'People' },
  { id: 'grievances',                l: 'Grievances',         group: 'People' },
  // System
  { id: 'cities',                    l: 'Cities',             group: 'System' },
  { id: 'zones',                     l: 'Zones',              group: 'System' },
  { id: 'stores',                    l: 'Outlets',            group: 'System' },
  { id: 'settings',                  l: 'Settings',           group: 'System' },
];

export const MODULE_GROUPS: ModuleGroup[] = ['Core', 'Operations', 'Business', 'Distribution', 'CRM', 'People', 'System'];
