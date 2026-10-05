import api from './api';

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

export interface PolicyRules {
  mileage_rate: number;
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
  rules?: Partial<Omit<PolicyRules, 'categories'>> & { categories?: Partial<Record<ItemCategory, Partial<CategoryRule>>> };
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
  uploadReceipt: (file: File | Blob, filename = 'receipt.jpg', scan = true) => {
    const fd = new FormData();
    fd.append('file', file, filename);
    return api.postForm<Wrapped<UploadedReceipt>>(`${BASE}/receipts${scan ? '' : '?scan=0'}`, fd);
  },
  mileage: (fromISO: string, toISO: string, userId?: string) =>
    api.get<Wrapped<MileageResult>>(`${BASE}/mileage${qs({ from: fromISO, to: toISO, user_id: userId })}`),

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
};
export const flagLabel = (code: string) => FLAG_LABELS[code] ?? code.replace(/_/g, ' ');

export default expensesApi;
