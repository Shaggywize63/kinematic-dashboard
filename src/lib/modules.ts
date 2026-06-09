// Single source of truth for the module catalog. Used by the user form
// (settings/page.tsx), the role hierarchy edit panel (settings/roles/page.tsx),
// and the client-edit module-toggle UI. Matches the backend `modules` table
// and the `package` taxonomy seeded in migration_module_packaging_and_client_entitlements.
//
// Group ↔ package mapping (kept aligned so admin UI groups map directly to
// the SKU model the backend enforces via client_modules):
//   FieldForce   → package: field_force
//   CRM          → package: crm
//   Distribution → package: distribution
//   Business     → package: business (universal)
//   System       → package: system   (universal, per-toggle)
//   People       → package: people   (universal)
//   Audit        → package: audit    (super-admin only)

export type ModulePackage =
  | 'field_force'
  | 'crm'
  | 'distribution'
  | 'business'
  | 'system'
  | 'people'
  | 'audit';

export type ModuleGroup =
  | 'FieldForce'
  | 'CRM'
  | 'Distribution'
  | 'Business'
  | 'System'
  | 'People'
  | 'Audit';

export interface ModuleEntry {
  id: string;
  l: string;
  group: ModuleGroup;
  package: ModulePackage;
  /** Universal modules are always available regardless of which package the client purchased. */
  universal?: boolean;
}

export const ALL_MODULES: ModuleEntry[] = [
  // Field Force (bundle + per-feature toggles)
  { id: 'dashboard',       l: 'Dashboard',        group: 'FieldForce', package: 'field_force' },
  { id: 'attendance',      l: 'Attendance',       group: 'FieldForce', package: 'field_force' },
  { id: 'analytics',       l: 'Analytics',        group: 'FieldForce', package: 'field_force' },
  { id: 'ffm_analytics',   l: 'FFM Analytics',    group: 'FieldForce', package: 'field_force' },
  // FFM Reports hub — attendance, visit coverage, hours & idle, route
  // adherence, leaderboard, etc. Mirrors `crm_reports` for the CRM side.
  // Surfaced under Field Force in the sidebar.
  { id: 'ffm_reports',     l: 'FFM Reports',      group: 'FieldForce', package: 'field_force' },
  { id: 'live_tracking',   l: 'Live Tracking',    group: 'FieldForce', package: 'field_force' },
  { id: 'activities',      l: 'Activity Mgmt',    group: 'FieldForce', package: 'field_force' },
  { id: 'planograms',      l: 'Planograms',       group: 'FieldForce', package: 'field_force' },
  { id: 'form_builder',    l: 'Form Builder',     group: 'FieldForce', package: 'field_force' },
  { id: 'orders',          l: 'Route Plan',       group: 'FieldForce', package: 'field_force' },
  { id: 'work_activities', l: 'Work Activities',  group: 'FieldForce', package: 'field_force' },

  // CRM / Lead Management (bundle + per-feature toggles)
  { id: 'crm',                l: 'CRM (all)',        group: 'CRM', package: 'crm' },
  { id: 'crm_dashboard',      l: 'CRM Dashboard',    group: 'CRM', package: 'crm' },
  { id: 'crm_lead_analytics', l: 'Lead Analytics',   group: 'CRM', package: 'crm' },
  { id: 'crm_leads',          l: 'Leads',            group: 'CRM', package: 'crm' },
  { id: 'crm_contacts',       l: 'Contacts',         group: 'CRM', package: 'crm' },
  { id: 'crm_people_directory', l: 'People Directory', group: 'CRM', package: 'crm' },
  { id: 'crm_accounts',       l: 'Accounts',         group: 'CRM', package: 'crm' },
  { id: 'crm_deals',          l: 'Deals',            group: 'CRM', package: 'crm' },
  { id: 'crm_pipeline',       l: 'Pipeline',         group: 'CRM', package: 'crm' },
  { id: 'crm_products',       l: 'CRM Products',     group: 'CRM', package: 'crm' },
  { id: 'crm_activities',     l: 'CRM Activities',   group: 'CRM', package: 'crm' },
  { id: 'crm_tasks',          l: 'CRM Tasks',        group: 'CRM', package: 'crm' },
  { id: 'crm_whatsapp',       l: 'CRM WhatsApp',     group: 'CRM', package: 'crm' },
  { id: 'crm_email',          l: 'CRM Email',        group: 'CRM', package: 'crm' },
  { id: 'crm_reports',        l: 'CRM Reports',      group: 'CRM', package: 'crm' },
  { id: 'crm_settings',       l: 'CRM Settings',     group: 'CRM', package: 'crm' },

  // Supply Chain & Distribution (bundle + per-feature toggles)
  { id: 'distribution',                l: 'Overview',     group: 'Distribution', package: 'distribution' },
  { id: 'distribution_brands',         l: 'Brands',       group: 'Distribution', package: 'distribution' },
  { id: 'distribution_distributors',   l: 'Distributors', group: 'Distribution', package: 'distribution' },
  { id: 'distribution_pricing',        l: 'Price Lists',  group: 'Distribution', package: 'distribution' },
  { id: 'distribution_schemes',        l: 'Schemes',      group: 'Distribution', package: 'distribution' },
  { id: 'distribution_orders',         l: 'Orders',       group: 'Distribution', package: 'distribution' },
  { id: 'distribution_invoicing',      l: 'Invoicing',    group: 'Distribution', package: 'distribution' },
  { id: 'distribution_payments',       l: 'Payments',     group: 'Distribution', package: 'distribution' },
  { id: 'distribution_returns',        l: 'Returns',      group: 'Distribution', package: 'distribution' },
  { id: 'distribution_ledger',         l: 'Ledger',       group: 'Distribution', package: 'distribution' },
  { id: 'distribution_consumer',       l: 'Consumer',     group: 'Distribution', package: 'distribution' },

  // Business (universal — every client gets these)
  { id: 'clients',   l: 'Clients',        group: 'Business', package: 'business', universal: true },
  { id: 'inventory', l: 'Warehouse',      group: 'Business', package: 'business', universal: true },
  { id: 'skus',      l: 'SKU Management', group: 'Business', package: 'business', universal: true },
  { id: 'assets',    l: 'Asset Mgmt',     group: 'Business', package: 'business', universal: true },

  // System (universal but per-toggle per client)
  { id: 'cities',          l: 'Cities',          group: 'System', package: 'system', universal: true },
  { id: 'zones',           l: 'Zones',           group: 'System', package: 'system', universal: true },
  { id: 'stores',          l: 'Outlets',         group: 'System', package: 'system', universal: true },
  { id: 'security_alerts', l: 'Security Alerts', group: 'System', package: 'system', universal: true },
  { id: 'settings',        l: 'Settings',        group: 'System', package: 'system', universal: true },

  // People (universal subset)
  { id: 'users',      l: 'Manpower',     group: 'People', package: 'people', universal: true },
  { id: 'broadcast',    l: 'Broadcast',     group: 'People', package: 'people', universal: true },
  { id: 'notifications', l: 'Notifications', group: 'People', package: 'people', universal: true },
  { id: 'hr',         l: 'HR & Payroll', group: 'People', package: 'people', universal: true },
  { id: 'grievances', l: 'Grievances',   group: 'People', package: 'people', universal: true },
  { id: 'reports',    l: 'Reports',      group: 'People', package: 'people', universal: true },
  { id: 'visit_logs', l: 'Visit Logs',   group: 'People', package: 'people', universal: true },

  // Audit (super-admin only — never granted to clients)
  { id: 'audit_log', l: 'Activity Log', group: 'Audit', package: 'audit' },
];

export const MODULE_GROUPS: ModuleGroup[] = ['FieldForce', 'CRM', 'Distribution', 'Business', 'System', 'People', 'Audit'];

/** Friendly display labels for `MODULE_GROUPS` (used in admin permission UIs). */
export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  FieldForce:   'Field Force',
  CRM:          'Lead Management (CRM)',
  Distribution: 'Supply Chain & Distribution',
  Business:     'Business',
  System:       'System Management',
  People:       'People & Support',
  Audit:        'Audit',
};

/** Helper: groups by package SKU label for the client-edit "Grant Package" UI. */
export const PACKAGE_LABELS: Record<ModulePackage, string> = {
  field_force:  'Field Force',
  crm:          'Lead Management',
  distribution: 'Supply Chain & Distribution',
  business:     'Business (always-on)',
  system:       'System (always-on)',
  people:       'People & Support (always-on)',
  audit:        'Audit (super-admin only)',
};

export const SELLABLE_PACKAGES: ModulePackage[] = ['field_force', 'crm', 'distribution'];
