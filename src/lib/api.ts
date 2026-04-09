import * as demo from './demoMocks';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('kinematic_token');
  }

  private getUserEmail(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('kinematic_user');
      return raw ? JSON.parse(raw)?.email ?? null : null;
    } catch { return null; }
  }

  private getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('kinematic_user');
      return raw ? JSON.parse(raw)?.org_id ?? null : null;
    } catch { return null; }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const orgId = this.getOrgId();
    if (orgId && !headers['X-Org-Id']) headers['X-Org-Id'] = orgId;

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    if (res.status === 401) throw new Error('Unauthorized');

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  }

  get<T>(path: string, options: RequestInit = {}) { return this.request<T>(path, options); }
  post<T>(path: string, body: unknown, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) });
  }
  put<T>(path: string, body: unknown, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
  }
  // ADDED: PATCH method (needed for grievances and other updates)
  patch<T>(path: string, body: unknown, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  login(email: string, password: string) {
    return this.post<{ success: boolean; data: { user: object; access_token: string } }>(
      '/api/v1/auth/login',
      { email, password }
    );
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  // FIXED: correct endpoints are /analytics/summary and /analytics/activity-feed
  getAnalyticsSummary(period: string) {
    return this.get(`/api/v1/analytics/summary?period=${period}`);
  }
  getActivityFeed() {
    return this.get('/api/v1/analytics/activity-feed');
  }

  // ── Field Executives ──────────────────────────────────────────────────────
  getFieldExecutives(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/users${qs}`);
  }
  getFieldExecutive(id: string) {
    return this.get(`/api/v1/users/${id}`);
  }
  updateUser(id: string, data: object) {
    return this.patch(`/api/v1/users/${id}`, data);
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  getAttendanceTeam(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/attendance/team${qs}`);
  }
  getAttendanceHistory(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/attendance/history${qs}`);
  }

  // ── Forms (TFF Submissions) ────────────────────────────────────────────────
  getAdminSubmissions(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/forms/admin/submissions${qs}`);
  }
  getSubmission(id: string) {
    return this.get(`/api/v1/forms/submissions/${id}`);
  }
  getForms(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/forms/templates${qs}`);
  }

  // ── Grievances ────────────────────────────────────────────────────────────
  // FIXED: correct endpoints — GET /grievances (admin), PATCH /grievances/:id
  getGrievances() {
    return this.get('/api/v1/grievances');
  }
  updateGrievance(id: string, data: { status: string; admin_remarks?: string }) {
    return this.patch(`/api/v1/grievances/${id}`, data);
  }

  // ── Stock ─────────────────────────────────────────────────────────────────
  getStockAllocations(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/stock/allocations${qs}`);
  }
  allocateStock(feId: string, items: Array<{ item_id: string; qty: number }>) {
    return this.post('/api/v1/stock/allocations', { fe_id: feId, items });
  }
  updateStockItem(id: string, data: object) {
    return this.patch(`/api/v1/stock/items/${id}`, data);
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────
  getBroadcast() { return this.get('/api/v1/broadcast'); }
  createBroadcast(data: object) { return this.post('/api/v1/broadcast', data); }
  getBroadcastResponses(id: string) { return this.get(`/api/v1/broadcast/${id}/responses`); }
  closeBroadcast(id: string) { return this.patch(`/api/v1/broadcast/${id}/close`, {}); }

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications() { return this.get('/api/v1/notifications'); }
  markNotificationsRead() { return this.patch('/api/v1/notifications/read', {}); }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  getLeaderboard() { return this.get('/api/v1/leaderboard'); }

  // ── SOS ───────────────────────────────────────────────────────────────────
  getSOSAlerts() { return this.get('/api/v1/sos'); }
  acknowledgeSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/acknowledge`, {}); }
  resolveSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/resolve`, {}); }

  // ── Visit Logs ────────────────────────────────────────────────────────────
  getVisitLogs() { return this.get('/api/v1/visits'); }
  getVisitLogTeam(date: string, clientId?: string) {
    let qs = `?date=${date}`;
    if (clientId) qs += `&client_id=${clientId}`;
    return this.get(`/api/v1/visits/team${qs}`);
  }

  // ── Users / Zones ─────────────────────────────────────────────────────────
  getUsers(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/users${qs}`);
  }
  getZones(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/zones${qs}`);
  }
  getCities(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/cities${qs}`);
  }
  getStores(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/stores${qs}`);
  }
  getActivities(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/activities${qs}`);
  }

  // ── Security Alerts ───────────────────────────────────────────────────────
  getSecurityAlerts(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/api/v1/misc/security/alerts/all${qs}`);
  }
}


export const api = new ApiClient(API_URL);
export default api;
