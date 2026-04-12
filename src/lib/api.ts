import * as demo from './demoMocks';
import { isUUID } from './utils';

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

    // GLOBAL PROTECTION: Strip invalid client_id, but ALLOW "Kinematic"
    let safePath = path;
    if (path.includes('client_id=')) {
      safePath = path.replace(/client_id=([^&]*)/g, (match, val) => {
        // ALLOW "Kinematic" and any UUID
        return (val === 'Kinematic' || isUUID(val)) ? match : '';
      })
      .replace(/\?&/g, '?')
      .replace(/&&+/g, '&')
      .replace(/[&?]$/, '');
      if (safePath.endsWith('?')) safePath = safePath.slice(0, -1);
    }

    const res = await fetch(`${this.baseUrl}${safePath}`, { ...options, headers });
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
  patch<T>(path: string, body: unknown, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string, options: RequestInit = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private sanitizeParams(params?: Record<string, string>) {
    if (!params) return '';
    const filtered = { ...params };
    // ALLOW "Kinematic"
    if (filtered.client_id && filtered.client_id !== 'Kinematic' && !isUUID(filtered.client_id)) {
      delete filtered.client_id;
    }
    const qs = new URLSearchParams(filtered).toString();
    return qs ? '?' + qs : '';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  login(email: string, password: string) {
    return this.post<{ success: boolean; data: { user: object; access_token: string } }>(
      '/api/v1/auth/login',
      { email, password }
    );
  }

  getAnalyticsSummary(period: string) {
    return this.get(`/api/v1/analytics/summary?period=${period}`);
  }
  getActivityFeed() {
    return this.get('/api/v1/analytics/activity-feed');
  }
  getLiveLocations(params?: Record<string, string>) {
    const base = typeof window !== 'undefined' ? window.location.origin : this.baseUrl;
    const token = this.getToken();
    const orgId = this.getOrgId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    const qs = this.sanitizeParams(params);
    return fetch(`${base}/api/v1/analytics/live-locations${qs}`, { headers, cache: 'no-store' })
      .then(async res => {
        if (res.status === 401) throw new Error('Unauthorized');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
        return data;
      });
  }

  getFieldExecutives(params?: Record<string, string>) {
    return this.get(`/api/v1/users${this.sanitizeParams(params)}`);
  }
  getFieldExecutive(id: string) {
    return this.get(`/api/v1/users/${id}`);
  }
  updateUser(id: string, data: object) {
    return this.patch(`/api/v1/users/${id}`, data);
  }

  getAttendanceTeam(params?: Record<string, string>) {
    return this.get(`/api/v1/attendance/team${this.sanitizeParams(params)}`);
  }
  getAttendanceHistory(params?: Record<string, string>) {
    return this.get(`/api/v1/attendance/history${this.sanitizeParams(params)}`);
  }

  getAdminSubmissions(params?: Record<string, string>) {
    const qs = this.sanitizeParams(params);
    // Use window.location.origin so this goes through the Next.js API route
    // instead of Railway (which has a broken filter select clause → 400 errors).
    const base = typeof window !== 'undefined' ? window.location.origin : this.baseUrl;
    const token = this.getToken();
    const orgId = this.getOrgId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    return fetch(`${base}/api/v1/forms/admin/submissions${qs}`, { headers })
      .then(async res => {
        if (res.status === 401) throw new Error('Unauthorized');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
        return data;
      });
  }
  getSubmission(id: string) {
    return this.get(`/api/v1/forms/submissions/${id}`);
  }
  getForms(params?: Record<string, string>) {
    return this.get(`/api/v1/forms/templates${this.sanitizeParams(params)}`);
  }

  getGrievances() {
    return this.get('/api/v1/grievances');
  }
  updateGrievance(id: string, data: { status: string; admin_remarks?: string }) {
    return this.patch(`/api/v1/grievances/${id}`, data);
  }

  getStockAllocations(params?: Record<string, string>) {
    return this.get(`/api/v1/stock/allocations${this.sanitizeParams(params)}`);
  }
  allocateStock(feId: string, items: Array<{ item_id: string; qty: number }>) {
    return this.post('/api/v1/stock/allocations', { fe_id: feId, items });
  }
  updateStockItem(id: string, data: object) {
    return this.patch(`/api/v1/stock/items/${id}`, data);
  }

  getBroadcast() { return this.get('/api/v1/broadcast'); }
  createBroadcast(data: object) { return this.post('/api/v1/broadcast', data); }
  getBroadcastResponses(id: string) { return this.get(`/api/v1/broadcast/${id}/responses`); }
  closeBroadcast(id: string) { return this.patch(`/api/v1/broadcast/${id}/close`, {}); }

  getNotifications() { return this.get('/api/v1/notifications'); }
  markNotificationsRead() { return this.patch('/api/v1/notifications/read', {}); }

  getLeaderboard() { return this.get('/api/v1/leaderboard'); }

  getSOSAlerts() { return this.get('/api/v1/sos'); }
  acknowledgeSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/acknowledge`, {}); }
  resolveSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/resolve`, {}); }

  getVisitLogs() { return this.get('/api/v1/visits'); }
  getVisitLogTeam(date: string, clientId?: string) {
    const params: Record<string, string> = { date };
    if (clientId) params.client_id = clientId;
    return this.get(`/api/v1/visits/team${this.sanitizeParams(params)}`);
  }

  getUsers(params?: Record<string, string>) {
    return this.get(`/api/v1/users${this.sanitizeParams(params)}`);
  }
  getZones(params?: Record<string, string>) {
    return this.get(`/api/v1/zones${this.sanitizeParams(params)}`);
  }
  getCities(params?: Record<string, string>) {
    return this.get(`/api/v1/cities${this.sanitizeParams(params)}`);
  }
  getStores(params?: Record<string, string>) {
    return this.get(`/api/v1/stores${this.sanitizeParams(params)}`);
  }
  getActivities(params?: Record<string, string>) {
    return this.get(`/api/v1/activities${this.sanitizeParams(params)}`);
  }

  getSecurityAlerts(params?: Record<string, string>) {
    return this.get(`/api/v1/misc/security/alerts/all${this.sanitizeParams(params)}`);
  }
}

export const api = new ApiClient(API_URL);
export default api;
