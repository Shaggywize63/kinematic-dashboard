// ─────────────────────────────────────────────────────────────────────────
// Per-client APP-UI customization catalog (shared contract).
//
// Client Management uses this catalog to render the "App Customization" toggle
// panel. The chosen config is persisted on the client row (clients.settings.app_ui)
// and served to the mobile apps on /auth/me as `app_ui_config`. The Android and
// iOS clients mirror these IDs at each render site.
//
// SEMANTICS — hide-only override (v1):
//   effective_visible(id) = (config[section][id] !== false) && app's_default_gate(id)
// i.e. a toggle turned OFF force-HIDES the item for that client; ON (or absent)
// simply defers to the app's built-in default (module/package/tenant) gate. This
// is intentionally safe: an admin can trim what a client sees, but cannot force a
// module-backed screen to appear without the underlying module entitlement.
//
// KEEP-IN-SYNC: every id below must be mirrored at the matching render site in
//   Kinematic-App  → ui/entitlements/Entitlements.kt (menuVisible/tabVisible/crmMoreVisible)
//   Kinematic-iOS  → ClientFeatureGates.swift (menuVisible/tabVisible/crmMoreVisible)
// ─────────────────────────────────────────────────────────────────────────

export interface AppItem {
  id: string;
  label: string;
  /** Optional hint shown under the toggle. */
  note?: string;
}

/** Side-menu / drawer items. Home, Settings and Sign Out are essential and not
 *  customizable, so they're intentionally omitted. */
export const MENU_ITEMS: AppItem[] = [
  { id: 'profile',           label: 'Profile' },
  { id: 'notifications',     label: 'Notifications' },
  { id: 'broadcast',         label: 'Broadcast Messages', note: 'needs the broadcast module' },
  { id: 'learning_hub',      label: 'Learning Hub' },
  { id: 'log_visit',         label: 'Log Visit' },
  { id: 'leaderboard',       label: 'Leaderboard' },
  { id: 'activity_feed',     label: 'Activity Feed' },
  { id: 'stock',             label: 'Stock' },
  { id: 'grievance',         label: 'Grievance', note: 'needs the grievances module' },
  { id: 'emergency_sos',     label: 'Emergency SOS' },
  { id: 'expenses',          label: 'Expenses', note: 'needs the field_expenses module' },
  { id: 'leave',             label: 'Leave' },
  { id: 'planogram',         label: 'Planogram' },
  { id: 'my_orders',         label: 'My Orders', note: 'needs the distribution package' },
  { id: 'van_load',          label: 'Van Load', note: 'needs distribution_van' },
  { id: 'distributor_stock', label: 'Distributor Stock', note: 'needs distribution_stock' },
  { id: 'log_damage',        label: 'Log Damage', note: 'needs distribution_damage' },
  { id: 'stock_batches',     label: 'Stock & Batches', note: 'needs distribution_batches' },
  { id: 'crm',               label: 'CRM', note: 'needs the CRM package' },
  { id: 'ask_kini',          label: 'Ask KINI', note: 'needs the CRM package' },
];

/** Field-force bottom-tab items. Home is essential (always shown). New Form is
 *  the ad-hoc form tab (route-less field-force clients like ByteBack). */
export const TAB_ITEMS: AppItem[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'route_plan', label: 'Route Plan' },
  { id: 'activity',   label: 'Activity' },
  { id: 'new_form',   label: 'New Form', note: 'ad-hoc form tab (route-less clients)' },
];

/** CRM "More" tab destinations. Activities, Appearance, Security and Sign Out
 *  are essential and omitted. */
export const CRM_MORE_ITEMS: AppItem[] = [
  { id: 'accounts',       label: 'Accounts' },
  { id: 'pipeline',       label: 'Pipeline' },
  { id: 'products',       label: 'Products' },
  { id: 'custom_objects', label: 'Custom Objects' },
  { id: 'nearest_leads',  label: 'Nearest Leads' },
  { id: 'leave',          label: 'Leave' },
  { id: 'expenses',       label: 'Expenses' },
  { id: 'dashboard',      label: 'Dashboard' },
  { id: 'lead_analytics', label: 'Lead Analytics' },
  { id: 'reports',        label: 'Reports' },
  { id: 'switch_ff',      label: 'Switch to Field Force' },
];

export interface AppCustomization {
  menu?: Record<string, boolean>;
  tabs?: Record<string, boolean>;
  crm_more?: Record<string, boolean>;
}

export const APP_CUSTOMIZATION_SECTIONS: Array<{ key: keyof AppCustomization; label: string; items: AppItem[] }> = [
  { key: 'menu',     label: 'Side menu',     items: MENU_ITEMS },
  { key: 'tabs',     label: 'Bottom tabs',   items: TAB_ITEMS },
  { key: 'crm_more', label: 'CRM “More” menu', items: CRM_MORE_ITEMS },
];

/** True unless the client explicitly hid this id (config value === false). */
export function isItemVisible(cfg: AppCustomization | null | undefined, section: keyof AppCustomization, id: string): boolean {
  return cfg?.[section]?.[id] !== false;
}
