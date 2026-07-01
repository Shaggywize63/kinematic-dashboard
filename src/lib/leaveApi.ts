import api from './api';

// Typed client for the Leave Management + Attendance Regularization API
// (backend base path /api/v1/leave, bearer auth auto-attached by ./api).
// Every response is wrapped as { success, data }.

type Wrapped<T> = { success: boolean; data: T };

const BASE = '/api/v1/leave';

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(filtered)).toString();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  is_paid: boolean;
  annual_quota: number | null;
  allow_half_day: boolean;
  max_carry_forward: number | null;
  requires_attachment: boolean;
  color: string | null;
  is_active: boolean;
  position: number | null;
}

export interface Holiday {
  id: string;
  holiday_date: string; // YYYY-MM-DD
  name: string;
  is_optional: boolean;
}

export interface LeaveBalance {
  leave_type_id: string;
  name: string;
  code: string;
  color: string | null;
  is_paid: boolean;
  unlimited: boolean;
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  days: number;
  reason: string | null;
  contact_number: string | null;
  attachment_url: string | null;
  status: LeaveStatus;
  approver_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  // Some list endpoints join the requester / type for display; keep them
  // optional so the strict shape above stays authoritative.
  user_name?: string | null;
  leave_type_name?: string | null;
  leave_type_code?: string | null;
  color?: string | null;
}

export interface CalendarEntry {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  half_day_start: boolean;
  half_day_end: boolean;
  days: number;
  status: LeaveStatus;
  user_name?: string | null;
  leave_type_name?: string | null;
  color?: string | null;
}

export type RegularizationType =
  | 'missing_checkin'
  | 'missing_checkout'
  | 'wrong_time'
  | 'on_duty'
  | 'wfh';

export interface Regularization {
  id: string;
  user_id: string;
  att_date: string;
  type: RegularizationType;
  requested_checkin_at: string | null;
  requested_checkout_at: string | null;
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  user_name?: string | null;
}

export type Decision = 'approved' | 'rejected';

// Request bodies
export type LeaveTypeInput = Partial<Omit<LeaveType, 'id'>>;
export interface HolidayInput { holiday_date: string; name: string; is_optional?: boolean }
export interface LeaveRequestInput {
  leave_type_id: string;
  from_date: string;
  to_date: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
  reason?: string;
  contact_number?: string;
  attachment_url?: string;
}
export interface RegularizationInput {
  att_date: string;
  type: RegularizationType;
  requested_checkin_at?: string;
  requested_checkout_at?: string;
  reason?: string;
}
export interface DecisionInput { decision: Decision; note?: string }

// ── API surface ──────────────────────────────────────────────────────────────

export const leaveApi = {
  // Leave types (admin manages)
  listTypes: () => api.get<Wrapped<LeaveType[]>>(`${BASE}/types`),
  createType: (body: LeaveTypeInput) => api.post<Wrapped<LeaveType>>(`${BASE}/types`, body),
  updateType: (id: string, body: LeaveTypeInput) =>
    api.patch<Wrapped<LeaveType>>(`${BASE}/types/${id}`, body),
  deleteType: (id: string) => api.delete<Wrapped<{ success: true }>>(`${BASE}/types/${id}`),

  // Holidays
  listHolidays: (year?: number) => api.get<Wrapped<Holiday[]>>(`${BASE}/holidays${qs({ year })}`),
  createHoliday: (body: HolidayInput) => api.post<Wrapped<Holiday>>(`${BASE}/holidays`, body),
  deleteHoliday: (id: string) => api.delete<Wrapped<{ success: true }>>(`${BASE}/holidays/${id}`),

  // Balances
  listBalances: (year?: number) => api.get<Wrapped<LeaveBalance[]>>(`${BASE}/balances${qs({ year })}`),

  // Leave requests (mine)
  listRequests: () => api.get<Wrapped<LeaveRequest[]>>(`${BASE}/requests`),
  createRequest: (body: LeaveRequestInput) => api.post<Wrapped<LeaveRequest>>(`${BASE}/requests`, body),
  cancelRequest: (id: string) => api.patch<Wrapped<LeaveRequest>>(`${BASE}/requests/${id}/cancel`, {}),

  // Manager approvals
  listPendingRequests: () => api.get<Wrapped<LeaveRequest[]>>(`${BASE}/requests/pending`),
  decideRequest: (id: string, body: DecisionInput) =>
    api.patch<Wrapped<LeaveRequest>>(`${BASE}/requests/${id}/decision`, body),

  // Team calendar
  calendar: (from: string, to: string) =>
    api.get<Wrapped<CalendarEntry[]>>(`${BASE}/calendar${qs({ from, to })}`),

  // Attendance regularization
  listRegularizations: () => api.get<Wrapped<Regularization[]>>(`${BASE}/regularizations`),
  createRegularization: (body: RegularizationInput) =>
    api.post<Wrapped<Regularization>>(`${BASE}/regularizations`, body),
  listPendingRegularizations: () => api.get<Wrapped<Regularization[]>>(`${BASE}/regularizations/pending`),
  decideRegularization: (id: string, body: DecisionInput) =>
    api.patch<Wrapped<Regularization>>(`${BASE}/regularizations/${id}/decision`, body),
};

// ── Shared UI helpers ────────────────────────────────────────────────────────

export const REGULARIZATION_TYPE_LABELS: Record<RegularizationType, string> = {
  missing_checkin: 'Missing Check-in',
  missing_checkout: 'Missing Check-out',
  wrong_time: 'Wrong Time',
  on_duty: 'On Duty',
  wfh: 'Work From Home',
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, { bg: string; fg: string }> = {
  pending: { bg: 'rgba(234,179,8,0.14)', fg: '#eab308' },
  approved: { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e' },
  rejected: { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444' },
  cancelled: { bg: 'var(--s2)', fg: 'var(--text-dim)' },
};

// Count working days (Mon–Fri) inclusive between two ISO dates, minus half-day
// adjustments. Purely a UI hint — the backend computes the authoritative `days`.
export function workingDayCount(
  fromISO: string,
  toISO: string,
  halfStart = false,
  halfEnd = false,
  holidayDates: string[] = [],
): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(toISO + 'T00:00:00');
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 0;
  const holidays = new Set(holidayDates);
  let count = 0;
  const d = new Date(from);
  while (d <= to) {
    const dow = d.getDay(); // 0 Sun … 6 Sat
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
    d.setDate(d.getDate() + 1);
  }
  if (count === 0) return 0;
  let adj = count;
  if (halfStart) adj -= 0.5;
  // Only subtract the end half when it's a distinct day from the start.
  if (halfEnd && fromISO !== toISO) adj -= 0.5;
  return Math.max(adj, 0);
}

export default leaveApi;
