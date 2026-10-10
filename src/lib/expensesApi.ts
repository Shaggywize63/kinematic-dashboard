import api, { type AttendanceTravel } from './api';

// Typed client for the Expenses API (backend base path /api/v1/expenses, bearer +
// X-Client-Id auto-attached by ./api). Every JSON response is { success, data }.
//
// /api/v1/expenses/* is NOT in the base client's city-aware allowlist, so the
// approver pages pass `city` explicitly from the global city scope.

type Wrapped<T> = { success: boolean; data: T };
type Paged<T> = Wrapped<T[]> & { pagination: { total: number; page: number; limit: number } };

const BASE = '/api/v1/expenses';

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed' | 'cancelled';
export type ItemCategory = 'mileage' | 'travel' | 'food' | 'lodging' | 'fuel' | 'toll' | 'misc';
export type Decision = 'approved' | 'rejected';
export const CATEGORIES: ItemCategory[] = ['mileage', 'travel', 'food', 'lodging', 'fuel', 'toll', 'misc'];

export interface CategoryRule {
  enabled: boolean;
  per_day_limit: number | null;
  per_claim_limit: number | null;
  per_month_limit: number | null;
  receipt_required_over: number | null;
}

/** One vehicle type a policy pays for, with its per-km cost (Travel allowance by vehicle). */
export interface VehicleRate { id: string; label: string; rate_per_km: number }

export interface PolicyRules {
  mileage_rate: number;
  /**
   * When present, mileage lines are priced by vehicle from the odometer readings
   * (distance × that vehicle's rate), computed by the server — not typed in.
   */
  vehicle_rates?: VehicleRate[];
  /** With vehicle rates: a photo of the odometer before and after is mandatory (default true). */
  odometer_photos_required?: boolean;
  // ── Claim-form presentation (all optional; absent = the form behaves as it always did) ──
  /** Display-name overrides per category, e.g. { mileage: 'Travel' }. Shown wherever a category name appears. */
  category_labels?: Partial<Record<ItemCategory, string>>;
  /** false = no From / To on mileage lines (and none shown read-only). Default true. */
  route_fields?: boolean;
  /** true = one expense per claim: no "Add another expense". Default false. */
  single_line?: boolean;
  /** true = the odometer photo is camera-only and the reading is read from it (reading stays editable). Default false. */
  odometer_camera_only?: boolean;
  /**
   * true (with vehicle rates) = a mileage line is claimed from the GPS-measured distance of the day — no odometer
   * readings or photos. The server re-checks the distance against the claimant's trail and prices it. Default false.
   */
  gps_distance?: boolean;
  receipt_required_over: number;
  max_claim_amount: number | null;
  submit_within_days: number | null;
  auto_approve_under: number;
  escalate_over: number | null;
  enforcement: 'flag' | 'block';
  categories: Record<ItemCategory, CategoryRule>;
}

export interface AppliesTo {
  everyone: boolean;
  roles: string[];
  org_role_ids: string[];
  user_ids: string[];
}

/** A full policy as managed by admins. */
export interface ExpensePolicy {
  id?: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  currency: string;
  applies_to: AppliesTo;
  effective_from: string | null;
  effective_to: string | null;
  rules: PolicyRules;
  updated_at?: string | null;
  /** People this policy governs right now (list view only). */
  covers?: number;
  /** Names of the people in applies_to.user_ids (list and detail). */
  people?: Array<{ id: string; name: string }>;
}

/** What a claimant sees as "my policy" — legacy-compatible scalar fields plus the full rules. */
export interface MyPolicy {
  id?: string;
  name?: string;
  description?: string | null;
  currency: string;
  mileage_rate: number;
  auto_approve_under: number;
  escalate_over: number | null;
  require_receipt_over: number;
  category_limits: Record<string, number> | null;
  is_active: boolean;
  rules?: PolicyRules;
}

export interface PolicyPreset { key: string; name: string; description: string; rules: PolicyRules }
export interface PolicyRoles { legacy: Array<{ role: string; people: number }>; org_roles: Array<{ id: string; name: string }> }
export interface PolicyPerson { id: string; name: string; employee_id: string | null; role: string | null; email: string | null }

export interface ExpenseFlag {
  code: string;
  severity: 'info' | 'warn' | 'high';
  detail: string;
  item_id?: string;
  category?: string;
  blocking?: boolean;
}

export interface ClaimItem {
  id: string;
  claim_id: string;
  category: ItemCategory;
  item_date: string | null;
  description: string | null;
  amount: number;
  distance_km: number | null;
  from_location: string | null;
  to_location: string | null;
  merchant: string | null;
  receipt_url: string | null;
  /** Short-lived viewable link for receipt_url, signed by the server per read. */
  receipt_signed_url?: string | null;
  // Travel allowance by vehicle (policies with vehicle rates).
  vehicle_type?: string | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  odometer_start_photo_url?: string | null;
  odometer_end_photo_url?: string | null;
  odometer_start_photo_signed_url?: string | null;
  odometer_end_photo_signed_url?: string | null;
  ai_extracted: Record<string, unknown> | null;
  flagged: boolean;
  flag_reason: string | null;
  decision?: Decision | null;
  decision_note?: string | null;
}

export interface ItemDecisionSnapshot { item_id: string; category: ItemCategory; amount: number; decision: Decision; note: string | null }

export interface ClaimApproval {
  id: string;
  claim_id: string;
  level: number;
  round?: number;
  approver_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  decided_at: string | null;
  approver_name?: string | null;
  item_decisions?: ItemDecisionSnapshot[] | null;
  created_at?: string;
}

export interface ExpenseClaim {
  id: string;
  user_id: string;
  claim_no: string | null;
  title: string | null;
  status: ClaimStatus;
  currency: string;
  total_amount: number;
  approved_amount?: number | null;
  distance_km: number | null;
  gps_derived_km: number | null;
  approver_id: string | null;
  current_level: number;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  ai_summary: string | null;
  ai_flags: ExpenseFlag[] | null;
  policy_id?: string | null;
  policy_name?: string | null;
  submit_count?: number | null;
  auto_approved?: boolean | null;
  reimbursed_at: string | null;
  reimbursed_ref: string | null;
  created_at: string;
  updated_at?: string;
  // stamped for display
  user_name?: string | null;
  employee_id?: string | null;
  approver_name?: string | null;
  reviewer_name?: string | null;
  // only on getClaim
  items?: ClaimItem[];
  approvals?: ClaimApproval[];
}

export interface MileageResult {
  distance_km: number;
  points_used: number;
  points_excluded: number;
  segments_skipped: number;
  from: string;
  to: string;
  mileage_rate: number;
  currency: string;
  suggested_amount: number;
}

export interface ReceiptFields {
  merchant: string | null;
  txn_date: string | null;
  amount: number | null;
  currency: string | null;
  tax_amount: number | null;
  category: ItemCategory | null;
}

export interface UploadedReceipt {
  url: string;
  path: string;
  bucket: string;
  content_type: string;
  size: number;
  signed_url: string | null;
  scan: ReceiptFields | null;
  /** Only with `?scan=odometer`: the number read off the photo (null when it could not be read). */
  odometer?: OdometerRead | null;
}

export interface OdometerRead { reading: number | null; confidence: 'high' | 'medium' | 'low' | null }

/** One odometer entry from a claim line, newest first (GET /expenses/odometer-history). */
export interface OdometerHistoryRow {
  id: string;
  claim_id: string;
  claim_no: string | null;
  claim_status: ClaimStatus;
  user_id: string;
  user_name: string | null;
  item_date: string | null;
  vehicle_type: string | null;
  vehicle_label: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_km: number | null;
  amount: number | null;
  start_photo_url: string | null;
  end_photo_url: string | null;
  created_at: string;
}

export interface OdometerHistoryParams {
  limit?: number;
  from?: string;
  to?: string;
  /** Approvers only: one person's entries. */
  user_id?: string;
  /** Approvers only: everyone's entries (the default is the caller's own). */
  all?: boolean;
}

export interface ClaimItemInput {
  id?: string;
  category: ItemCategory;
  item_date?: string | null;
  description?: string | null;
  amount?: number | null;
  distance_km?: number | null;
  from_location?: string | null;
  to_location?: string | null;
  merchant?: string | null;
  receipt_url?: string | null;
  ai_extracted?: Record<string, unknown> | null;
  vehicle_type?: string | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  odometer_start_photo_url?: string | null;
  odometer_end_photo_url?: string | null;
}
export interface ClaimInput { title?: string | null; items?: ClaimItemInput[] }

export interface ClaimCheck {
  policy: MyPolicy;
  total: number;
  violations: ExpenseFlag[];
  blocking: boolean;
  would_auto_approve: boolean;
}

export interface LineDecisionInput { id: string; decision: Decision; note?: string | null }
export interface DecisionInput { decision: Decision; note?: string | null; items?: LineDecisionInput[] }
export interface DecisionResult { ok: boolean; status: ClaimStatus; approved_amount?: number; rejected_lines?: number; escalated?: boolean; level?: number }

export interface PolicyInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  priority?: number;
  currency?: string;
  applies_to?: Partial<AppliesTo>;
  effective_from?: string | null;
  effective_to?: string | null;
  rules?: Partial<Omit<PolicyRules, 'categories' | 'vehicle_rates'>> & {
    /** `id` is optional on the way in — the server derives one from the label. */
    vehicle_rates?: Array<{ id?: string; label: string; rate_per_km: number }>;
    categories?: Partial<Record<ItemCategory, Partial<CategoryRule>>>;
  };
}

export interface ClaimFilters {
  status?: string;
  user_id?: string;
  from?: string;
  to?: string;
  category?: string;
  policy_id?: string;
  q?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface ClaimsSummary {
  totals: {
    claims: number; claimed: number;
    pending_count: number; pending_amount: number;
    approved_count: number; approved_amount: number;
    reimbursed_count: number; reimbursed_amount: number;
    rejected_count: number; rejected_amount: number;
    auto_approved_count: number; avg_turnaround_hours: number | null;
  };
  by_status: Array<{ status: ClaimStatus; claims: number; amount: number }>;
  by_month: Array<{ month: string; amount: number; claims: number }>;
  by_category: Array<{ category: ItemCategory; amount: number }>;
  top_people: Array<{ user_id: string; name: string | null; amount: number; claims: number }>;
  by_policy: Array<{ policy: string; amount: number; claims: number }>;
}

// ── API surface ──────────────────────────────────────────────────────────────

export const expensesApi = {
  // The policy that governs me
  myPolicy: () => api.get<Wrapped<MyPolicy>>(`${BASE}/policy`),

  // Policies (admin)
  listPolicies: () => api.get<Wrapped<ExpensePolicy[]>>(`${BASE}/policies`),
  getPolicy: (id: string) => api.get<Wrapped<ExpensePolicy>>(`${BASE}/policies/${id}`),
  createPolicy: (body: PolicyInput) => api.post<Wrapped<ExpensePolicy>>(`${BASE}/policies`, body),
  updatePolicy: (id: string, body: PolicyInput) => api.put<Wrapped<ExpensePolicy>>(`${BASE}/policies/${id}`, body),
  duplicatePolicy: (id: string) => api.post<Wrapped<ExpensePolicy>>(`${BASE}/policies/${id}/duplicate`, {}),
  deletePolicy: (id: string) => api.delete<Wrapped<{ ok: boolean }>>(`${BASE}/policies/${id}`),
  policyPresets: () => api.get<Wrapped<PolicyPreset[]>>(`${BASE}/policies/presets`),
  policyRoles: () => api.get<Wrapped<PolicyRoles>>(`${BASE}/policies/roles`),
  policyPeople: (q: string) => api.get<Wrapped<PolicyPerson[]>>(`${BASE}/policies/people${qs({ q })}`),

  // Claims (mine)
  listClaims: (status?: string) => api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims${qs({ status })}`),
  getClaim: (id: string) => api.get<Wrapped<ExpenseClaim>>(`${BASE}/claims/${id}`),
  createClaim: (body: ClaimInput) => api.post<Wrapped<ExpenseClaim>>(`${BASE}/claims`, body),
  updateClaim: (id: string, body: ClaimInput) => api.patch<Wrapped<ExpenseClaim>>(`${BASE}/claims/${id}`, body),
  submitClaim: (id: string) => api.post<Wrapped<ExpenseClaim>>(`${BASE}/claims/${id}/submit`, {}),
  cancelClaim: (id: string) => api.patch<Wrapped<{ ok: boolean }>>(`${BASE}/claims/${id}/cancel`, {}),
  /** Dry-run the policy against unsaved lines, so problems show before submitting. */
  checkClaim: (body: { items: ClaimItemInput[]; claim_id?: string }) => api.post<Wrapped<ClaimCheck>>(`${BASE}/claims/check`, body),

  // Receipts + auto-mileage
  /**
   * `scan`: true = read it as a receipt (default), false = just store it (`?scan=0`, odometer photos today),
   * 'odometer' = store it and read the number off the odometer (`?scan=odometer`, camera-only policies).
   */
  uploadReceipt: (file: File | Blob, filename = 'receipt.jpg', scan: boolean | 'odometer' = true) => {
    const fd = new FormData();
    fd.append('file', file, filename);
    const q = scan === 'odometer' ? '?scan=odometer' : scan ? '' : '?scan=0';
    return api.postForm<Wrapped<UploadedReceipt>>(`${BASE}/receipts${q}`, fd);
  },
  mileage: (fromISO: string, toISO: string, userId?: string) =>
    api.get<Wrapped<MileageResult>>(`${BASE}/mileage${qs({ from: fromISO, to: toISO, user_id: userId })}`),
  /**
   * My distance for one IST day (YYYY-MM-DD): check-in → each form visit → check-out, from GET /attendance/travel.
   * What a GPS-distance policy prices a mileage line from. Never cached (an open shift keeps growing).
   */
  travelFor: (date: string): Promise<Wrapped<AttendanceTravel>> => api.getAttendanceTravel(date),

  /** Odometer readings from claim lines, newest first. Own entries by default; approvers can pass `all` / `user_id`. */
  odometerHistory: (p: OdometerHistoryParams = {}) =>
    api.get<Wrapped<OdometerHistoryRow[]>>(
      `${BASE}/odometer-history${qs({ limit: p.limit ?? 50, from: p.from, to: p.to, user_id: p.user_id, all: p.all ? 1 : undefined })}`,
      // New claims change this list, and a stale "last reading" would mislead — always ask the server.
      { noCache: true } as RequestInit,
    ),

  // Approver
  listPending: (params?: Record<string, string>) => api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims/pending${qs(params)}`),
  listAwaitingReimbursement: (params?: Record<string, string>) =>
    api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims/awaiting-reimbursement${qs(params)}`),
  decideClaim: (id: string, body: DecisionInput) => api.patch<Wrapped<DecisionResult>>(`${BASE}/claims/${id}/decision`, body),
  bulkDecide: (ids: string[], decision: Decision, note?: string) =>
    api.post<Wrapped<{ done: Array<{ id: string; status: string }>; failed: Array<{ id: string; error: string }> }>>(
      `${BASE}/claims/bulk-decision`, { ids, decision, note }),

  // Reports (managers / admins)
  listAll: (f: ClaimFilters) => api.get<Paged<ExpenseClaim>>(`${BASE}/claims/all${qs({ ...f })}`),
  summary: (f: ClaimFilters) => api.get<Wrapped<ClaimsSummary>>(`${BASE}/claims/summary${qs({ ...f, page: undefined, limit: undefined })}`),
  exportCsv: (f: ClaimFilters) => api.download(`${BASE}/claims/export${qs({ ...f, page: undefined, limit: undefined })}`),

  // Admin / finance
  reimburse: (id: string, ref?: string) =>
    api.post<Wrapped<{ ok: boolean; status: string }>>(`${BASE}/claims/${id}/reimburse`, { ref }),
};

// ── display helpers ──────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  mileage: 'Mileage', travel: 'Travel', food: 'Food', lodging: 'Lodging', fuel: 'Fuel', toll: 'Toll', misc: 'Other',
};

// ── claim-form presentation, driven by the policy rules ──────────────────────
// Everything below is opt-in per policy (data): with none of the rule keys set, each helper returns
// exactly what the form always showed.

/** The slice of a policy's rules the claim form reads. `PolicyRules` and `MyPolicy.rules` both fit. */
export interface FormRules {
  categories?: Partial<Record<ItemCategory, { enabled?: boolean }>>;
  category_labels?: Partial<Record<ItemCategory, string>>;
  route_fields?: boolean;
  single_line?: boolean;
  odometer_camera_only?: boolean;
  gps_distance?: boolean;
  vehicle_rates?: Array<{ id?: string }>;
}
type RulesIn = FormRules | null | undefined;

const catOn = (r: RulesIn, c: ItemCategory) => r?.categories?.[c]?.enabled !== false;
const customName = (r: RulesIn, c: ItemCategory): string | null => {
  const v = r?.category_labels?.[c];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/** Categories a claimant may use, in the usual order. */
export const enabledCategories = (r: RulesIn): ItemCategory[] => CATEGORIES.filter((c) => catOn(r, c));

/** The one category in use, or null when several are. A single-category form never asks for a category. */
export function singleCategory(r: RulesIn): ItemCategory | null {
  const on = enabledCategories(r);
  return on.length === 1 ? on[0] : null;
}

/**
 * The name to show for a category: the policy's custom name, else the built-in one. `mileage` and `travel` are
 * separate categories, so a policy that calls mileage "Travel" would otherwise show two "Travel"s side by side;
 * when the custom name matches another category that can appear next to it (the enabled ones, plus any in
 * `also` — e.g. the categories already on a claim) the built-in name is added: "Travel (Mileage)".
 */
export function categoryLabel(r: RulesIn, c: ItemCategory, also: ItemCategory[] = []): string {
  const base = CATEGORY_LABELS[c] ?? String(c);
  const custom = customName(r, c);
  if (!custom) return base;
  const others = Array.from(new Set([...enabledCategories(r), ...also])).filter((o) => o !== c);
  const clash = others.some((o) => (customName(r, o) ?? CATEGORY_LABELS[o]).toLowerCase() === custom.toLowerCase());
  return clash ? `${custom} (${base})` : custom;
}

/** Route (From / To) fields on mileage lines. On unless the policy turns them off. */
export const routeFieldsOn = (r: RulesIn): boolean => r?.route_fields !== false;
/** One expense per claim: no "Add another expense". */
export const singleLineOn = (r: RulesIn): boolean => r?.single_line === true;
/**
 * The vehicles a policy pays for, in policy order, each once. This is the whole list a claimant may choose from —
 * the claim form reads it from the claimant's own policy (GET /expenses/policy) and nowhere else.
 */
export function policyVehicles(r: { vehicle_rates?: VehicleRate[] } | null | undefined): VehicleRate[] {
  const seen = new Set<string>();
  return (r?.vehicle_rates ?? []).filter((v) => !!v?.id && !seen.has(v.id) && !!seen.add(v.id));
}

/** The policy's only vehicle, or '' when it pays for none or for several (then the person picks). */
export const soleVehicleId = (vs: VehicleRate[]): string => (vs.length === 1 ? vs[0].id : '');

/**
 * The vehicle a mileage line carries: its own while that vehicle is still on the policy; otherwise the policy's
 * only vehicle (so nobody has to pick it); otherwise whatever it had (blank → the person picks).
 */
export const lineVehicle = (current: string | null | undefined, vs: VehicleRate[]): string =>
  (current && vs.some((v) => v.id === current) ? current : soleVehicleId(vs) || current || '');

/** Mileage is priced by vehicle from odometer readings (the "travel allowance" flow). */
export const vehicleFlowOn = (r: RulesIn): boolean => (r?.vehicle_rates?.length ?? 0) > 0;
/** Odometer photo is camera-only and the reading is read from it. Only meaningful with the vehicle flow. */
export const odometerCameraOnly = (r: RulesIn): boolean => r?.odometer_camera_only === true && vehicleFlowOn(r);
/**
 * Mileage is claimed from the GPS-measured distance of the day, no odometer. Only meaningful with the vehicle flow
 * (the server prices by vehicle rate, and ignores the rule when the policy has no vehicles).
 */
export const gpsDistanceOn = (r: RulesIn): boolean => r?.gps_distance === true && vehicleFlowOn(r);

/** A mileage line that carries a vehicle and a distance but no odometer data — i.e. one claimed from GPS. */
export const isGpsDistanceLine = (it: Pick<ClaimItem, 'category' | 'vehicle_type' | 'distance_km' | 'odometer_start' | 'odometer_end' | 'odometer_start_photo_url' | 'odometer_end_photo_url'>): boolean =>
  it.category === 'mileage' && !!it.vehicle_type && Number(it.distance_km) > 0
  && it.odometer_start == null && it.odometer_end == null && !it.odometer_start_photo_url && !it.odometer_end_photo_url;

/**
 * One set of category rules for a screen that spans several policies (All claims): a category counts as in use
 * when any policy allows it, and a custom name is used only when every policy agrees on it — so the screen never
 * mislabels a category for somebody.
 */
export function mergeCategoryRules(list: RulesIn[]): FormRules | undefined {
  const rs = list.filter((r): r is FormRules => !!r);
  if (!rs.length) return undefined;
  const categories: NonNullable<FormRules['categories']> = {};
  const category_labels: NonNullable<FormRules['category_labels']> = {};
  for (const c of CATEGORIES) {
    categories[c] = { enabled: rs.some((r) => catOn(r, c)) };
    const names = Array.from(new Set(rs.map((r) => customName(r, c) ?? CATEGORY_LABELS[c])));
    if (names.length === 1 && names[0] !== CATEGORY_LABELS[c]) category_labels[c] = names[0];
  }
  return { categories, category_labels };
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: 'Draft', submitted: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', reimbursed: 'Reimbursed', cancelled: 'Cancelled',
};

/** Plain-language names for the policy checks the server reports. */
export const FLAG_LABELS: Record<string, string> = {
  category_not_allowed: 'Not reimbursable',
  receipt_missing: 'Receipt needed',
  over_category_limit: 'Over daily limit',
  over_claim_category_limit: 'Over claim limit',
  over_month_limit: 'Over monthly limit',
  over_claim_limit: 'Over claim maximum',
  late_submission: 'Submitted late',
  future_date: 'Future date',
  vehicle_missing: 'Pick a vehicle',
  odometer_missing: 'Odometer reading needed',
  odometer_invalid: 'Odometer reading wrong',
  odometer_photo_missing: 'Odometer photo needed',
};
export const flagLabel = (code: string) => FLAG_LABELS[code] ?? code.replace(/_/g, ' ');

export default expensesApi;
