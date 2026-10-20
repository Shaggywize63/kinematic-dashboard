// ─────────────────────────────────────────────────────────────────────────
// Per-client APP-UI customization catalog (shared contract).
//
// Client Management uses this catalog to render the "App Customization" toggle
// panel. The chosen config is persisted on the client row (clients.settings.app_ui)
// and served to the mobile apps on /auth/me as `app_ui_config`. The Android and
// iOS clients mirror these IDs at each render site.
//
// SEMANTICS — hide-only override + optional rename (v2):
//   effective_visible(id) = (config[section][id] !== false) && app's_default_gate(id)
//   effective_label(id)   = config.labels[section][id] (if non-empty) else app default
// i.e. a toggle turned OFF force-HIDES the item for that client; ON (or absent)
// simply defers to the app's built-in default (module/package/tenant) gate. This
// is intentionally safe: an admin can trim what a client sees, but cannot force a
// module-backed screen to appear without the underlying module entitlement. A
// non-empty label in `labels[section][id]` renames the item in the apps.
//
// BACKWARD COMPAT: visibility stays a plain boolean map per section (old app
// builds keep decoding it); `home`, `settings`, `labels` and `features` are
// additive — an older build simply ignores the sections/labels it doesn't know.
//
// FEATURES — the one OPT-IN section (the opposite default to everything above):
//   feature_enabled(id) = (config.features[id] === true)
// A feature is OFF unless the stored value is exactly `true`; absent, false or any
// other value means off. It is NOT an `AppUiSection` (no hide-only semantics, no
// rename, no Show all / Hide all), so it lives beside the sections, never in them.
// Switching one off deletes its key (and `features` itself once empty) instead of
// storing `false`, so a legacy client's stored config only changes when an admin
// actually touches a feature. The Android app reads `features.rate_prompt`.
//
// KEEP-IN-SYNC: every id below must be mirrored at the matching render site in
//   Kinematic-App  → ui/entitlements/Entitlements.kt (menuVisible/tabVisible/crmMoreVisible/homeVisible/settingsVisible/labelFor)
//   Kinematic-iOS  → ClientFeatureGates.swift (menuVisible/tabVisible/crmMoreVisible/homeVisible/settingsVisible/labelFor)
// ─────────────────────────────────────────────────────────────────────────

export interface AppItem {
  id: string;
  label: string;
  /** Optional hint shown under the toggle. */
  note?: string;
}

/** The customizable sections. `labels` is a sibling map, not a section. */
export type AppUiSection = 'menu' | 'tabs' | 'crm_more' | 'home' | 'settings';

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
  { id: 'timeline',          label: 'Timeline', note: 'needs the timeline module' },
  { id: 'planogram',         label: 'Planogram' },
  { id: 'book_order',        label: 'Book Order', note: 'needs distribution_orders' },
  { id: 'collect_payment',  label: 'Collect Payment', note: 'needs distribution_payments' },
  { id: 'my_orders',         label: 'My Orders', note: 'needs the distribution package' },
  { id: 'van_load',          label: 'Van Load', note: 'needs distribution_van' },
  { id: 'distributor_stock', label: 'Distributor Stock', note: 'needs distribution_stock' },
  { id: 'log_damage',        label: 'Log Damage', note: 'needs distribution_damage' },
  { id: 'stock_batches',     label: 'Stock & Batches', note: 'needs distribution_batches' },
  { id: 'crm',               label: 'CRM', note: 'needs the CRM package' },
  { id: 'ask_kini',          label: 'Ask KINI', note: 'needs the CRM package' },
];

/** Field-force bottom-tab items. Home is essential (always shown). New Form is
 *  the ad-hoc form tab (any field-force client with the form_builder module). */
export const TAB_ITEMS: AppItem[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'route_plan', label: 'Route Plan' },
  { id: 'activity',   label: 'Activity' },
  { id: 'new_form',   label: 'New Form', note: 'ad-hoc form tab (needs form_builder)' },
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

/** Field-force Home-screen cards/sections. The daily selfie / clock-in card is
 *  essential (attendance entry point) and intentionally omitted. */
export const HOME_ITEMS: AppItem[] = [
  { id: 'stores',       label: 'Stores', note: 'store target / assigned stores tile' },
  { id: 'visited',      label: 'Visited', note: 'visited-today tile' },
  { id: 'forms',        label: 'Forms', note: 'forms-submitted-today tile' },
  { id: 'todays_route', label: "Today's Route / Session", note: 'route-plan or session preview on Home' },
  { id: 'my_targets',   label: 'My Targets', note: 'targets progress card' },
  { id: 'open_volume',  label: 'Open Volume', note: 'CRM home tile with the open pipeline volume (the web dashboard hides the volume on its Open Pipeline tile)' },
];

/** Settings-screen rows. The account summary and Sign Out are essential and
 *  intentionally omitted. */
export const SETTINGS_ITEMS: AppItem[] = [
  { id: 'appearance',      label: 'Appearance (theme)' },
  { id: 'crm_only_mode',   label: 'CRM-only mode toggle' },
  { id: 'app_lock',        label: 'App Lock (biometric)' },
  { id: 'face_enrollment', label: 'Face Enrollment', note: 'needs the face_attendance module' },
  { id: 'about',           label: 'About (version / build)' },
];

/** Opt-in app features, switched on per client. Unlike the sections above these
 *  are OFF by default — see FEATURES in the header. `note` is the description
 *  shown under the switch. */
export const FEATURE_ITEMS: AppItem[] = [
  {
    id: 'rate_prompt',
    label: 'Ask users to rate the app on Google Play',
    note: 'Android only. Shown after a few days of use, at most 3 times.',
  },
];

export interface AppCustomization {
  /**
   * The drag-and-drop layout (see lib/appLayout.ts): the order of each container and which screens sit in the bottom bar.
   * Optional and additive — absent = the apps' default order. Ids are the same ids the hide maps below use.
   */
  layout?: Partial<Record<AppUiSection, string[]>>;
  menu?: Record<string, boolean>;
  tabs?: Record<string, boolean>;
  crm_more?: Record<string, boolean>;
  home?: Record<string, boolean>;
  settings?: Record<string, boolean>;
  /** Optional per-item display-name overrides, keyed by section then id. */
  labels?: Partial<Record<AppUiSection, Record<string, string>>>;
  /** Opt-in feature flags (e.g. `rate_prompt`). A feature is on ONLY when its
   *  value is exactly `true`; the key is removed (not set to false) when off. */
  features?: Record<string, boolean>;
}

export const APP_CUSTOMIZATION_SECTIONS: Array<{ key: AppUiSection; label: string; items: AppItem[] }> = [
  { key: 'menu',     label: 'Side menu',       items: MENU_ITEMS },
  { key: 'tabs',     label: 'Bottom tabs',     items: TAB_ITEMS },
  { key: 'home',     label: 'Home screen',     items: HOME_ITEMS },
  { key: 'settings', label: 'Settings',        items: SETTINGS_ITEMS },
  { key: 'crm_more', label: 'CRM “More” menu', items: CRM_MORE_ITEMS },
];

/** True unless the client explicitly hid this id (config value === false). */
export function isItemVisible(cfg: AppCustomization | null | undefined, section: AppUiSection, id: string): boolean {
  return cfg?.[section]?.[id] !== false;
}

/** True ONLY when the client explicitly enabled this feature (value === true).
 *  Opt-in: absent, false or any non-boolean value is off. */
export function isFeatureEnabled(cfg: AppCustomization | null | undefined, id: string): boolean {
  return cfg?.features?.[id] === true;
}

/** Returns a copy of `cfg` with one feature switched on or off. On stores
 *  `features[id] = true`; off DELETES the key and drops `features` entirely when
 *  nothing else is left in it. Every other section, label and feature key is
 *  carried over untouched. */
export function withFeature(cfg: AppCustomization, id: string, on: boolean): AppCustomization {
  const { features: current, ...rest } = cfg;
  const features: Record<string, boolean> =
    current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
  if (on) features[id] = true; else delete features[id];
  return Object.keys(features).length ? { ...rest, features } : rest;
}

/** The admin's custom label for an item, if set and non-empty; else the default. */
export function labelFor(cfg: AppCustomization | null | undefined, section: AppUiSection, id: string, fallback: string): string {
  const v = cfg?.labels?.[section]?.[id];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}
