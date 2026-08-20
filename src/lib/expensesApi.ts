import api from './api';

// Typed client for the Field Expense / Travel Claims API
// (backend base path /api/v1/expenses, bearer + X-Client-Id auto-attached by
// ./api). Every response is wrapped as { success, data }.
//
// Note: /api/v1/expenses/* is NOT in the base client's CITY_AWARE_CRM_PREFIXES
// allowlist, so `?city=` is never auto-appended — the approvals page passes it
// explicitly from the global city scope.

type Wrapped<T> = { success: boolean; data: T };

const BASE = '/api/v1/expenses';

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

// ── Types (mirror the backend expense_* tables) ──────────────────────────────

export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed' | 'cancelled';
export type ItemCategory = 'mileage' | 'travel' | 'food' | 'lodging' | 'fuel' | 'toll' | 'misc';
export type Decision = 'approved' | 'rejected';

export interface ExpensePolicy {
  id?: string;
  currency: string;
  mileage_rate: number;
  auto_approve_under: number;
  escalate_over: number | null;
  require_receipt_over: number;
  category_limits: Record<string, number> | null;
  is_active: boolean;
}

export interface ExpenseFlag { code: string; severity: 'info' | 'warn' | 'high'; detail: string; item_id?: string }

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
  ai_extracted: Record<string, unknown> | null;
  flagged: boolean;
  flag_reason: string | null;
}

export interface ClaimApproval {
  id: string;
  claim_id: string;
  level: number;
  approver_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  decided_at: string | null;
  approver_name?: string | null;
}

export interface ExpenseClaim {
  id: string;
  user_id: string;
  claim_no: string | null;
  title: string | null;
  status: ClaimStatus;
  currency: string;
  total_amount: number;
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
  reimbursed_at: string | null;
  reimbursed_ref: string | null;
  created_at: string;
  // stamped for display
  user_name?: string | null;
  employee_id?: string | null;
  approver_name?: string | null;
  // only present on getClaim
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

// Request bodies
export interface ClaimItemInput {
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
export interface DecisionInput { decision: Decision; note?: string }
export interface PolicyInput extends Partial<Omit<ExpensePolicy, 'id'>> {}

// ── API surface ──────────────────────────────────────────────────────────────

export const expensesApi = {
  // Policy
  getPolicy: () => api.get<Wrapped<ExpensePolicy>>(`${BASE}/policy`),
  savePolicy: (body: PolicyInput) => api.put<Wrapped<ExpensePolicy>>(`${BASE}/policy`, body),

  // Claims (mine)
  listClaims: (status?: ClaimStatus) => api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims${qs({ status })}`),
  getClaim: (id: string) => api.get<Wrapped<ExpenseClaim>>(`${BASE}/claims/${id}`),
  createClaim: (body: ClaimInput) => api.post<Wrapped<ExpenseClaim>>(`${BASE}/claims`, body),
  submitClaim: (id: string) => api.post<Wrapped<ExpenseClaim>>(`${BASE}/claims/${id}/submit`, {}),
  cancelClaim: (id: string) => api.patch<Wrapped<{ ok: boolean }>>(`${BASE}/claims/${id}/cancel`, {}),

  // Auto-mileage + receipt OCR
  mileage: (fromISO: string, toISO: string, userId?: string) =>
    api.get<Wrapped<MileageResult>>(`${BASE}/mileage${qs({ from: fromISO, to: toISO, user_id: userId })}`),
  scanReceipt: (image: string, mediaType?: string) =>
    api.post<Wrapped<ReceiptFields>>(`${BASE}/scan-receipt`, { image, media_type: mediaType }),

  // Approver
  listPending: (params?: Record<string, string>) =>
    api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims/pending${qs(params)}`),
  listAwaitingReimbursement: (params?: Record<string, string>) =>
    api.get<Wrapped<ExpenseClaim[]>>(`${BASE}/claims/awaiting-reimbursement${qs(params)}`),
  decideClaim: (id: string, body: DecisionInput) =>
    api.patch<Wrapped<{ ok: boolean; status: string }>>(`${BASE}/claims/${id}/decision`, body),

  // Admin/finance
  reimburse: (id: string, ref?: string) =>
    api.post<Wrapped<{ ok: boolean; status: string }>>(`${BASE}/claims/${id}/reimburse`, { ref }),
};

// ── shared display helpers ───────────────────────────────────────────────────

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, { bg: string; fg: string }> = {
  draft:      { bg: 'var(--s3)', fg: 'var(--text-dim)' },
  submitted:  { bg: 'rgba(234,179,8,0.14)', fg: '#eab308' },
  approved:   { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e' },
  rejected:   { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444' },
  reimbursed: { bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6' },
  cancelled:  { bg: 'var(--s2)', fg: 'var(--text-dim)' },
};

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  mileage: 'Mileage', travel: 'Travel', food: 'Food', lodging: 'Lodging',
  fuel: 'Fuel', toll: 'Toll', misc: 'Misc',
};

export const FLAG_COLORS: Record<ExpenseFlag['severity'], string> = {
  info: '#3b82f6', warn: '#eab308', high: '#ef4444',
};

export default expensesApi;
