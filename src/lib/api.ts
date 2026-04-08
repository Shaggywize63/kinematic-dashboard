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

    // --- DEMO MODE INTERCEPTION (STRICTLY FOR DASHBOARD DATA) ---
    const userEmail = this.getUserEmail();
    if (userEmail === demo.DEMO_USER_EMAIL) {
      if (path.includes('/analytics/summary')) return demo.mockSummary(new Date().toISOString().split('T')[0]) as T;
      if (path.includes('/analytics/activity-feed')) return demo.mockFeed() as T;
      if (path.includes('/analytics/tff-trends')) return demo.mockTrends() as T;
      if (path.includes('/analytics/contact-heatmap')) return demo.mockHeatmap() as T;
      if (path.includes('/analytics/dashboard-init')) return demo.mockDashboardInit() as T;
      if (path.includes('/analytics/mobile-home')) return demo.mockDashboardInit() as T; 
      
      // NEW EXPANDED ROUTES
      if (path.includes('/analytics/live-locations')) return demo.mockLocations() as T;
      if (path.includes('/attendance/team')) return demo.mockAttendanceTeam() as T;
      if (path.includes('/users') && !path.includes('/auth')) return demo.mockUsers() as T;
      if (path.includes('/visits/team')) return demo.mockVisitLogs() as T;
      if (path.includes('/forms/admin/submissions')) return demo.mockSubmissions() as T;
      if (path.includes('/forms/submissions/')) return demo.mockSubmissionDetails() as T;
      if (path.includes('/sos')) return demo.mockSOS() as T;
      if (path.includes('/grievances')) return demo.mockGrievances() as T;
      if (path.includes('/broadcast')) return demo.mockBroadcast() as T;
      
      // NEW DEMO INTERCEPTIONS FOR STABILITY
      if (path.includes('/stores')) return demo.mockStores() as T;
      if (path.includes('/orders/route-plan')) return demo.mockRoutePlans() as T;
      if (path.includes('/forms/templates')) return demo.mockFormTemplates() as T;
      if (path.includes('/activities')) return demo.mockActivities() as T;
      if (path.includes('/assets')) return demo.mockAssets() as T;
      if (path.includes('/misc/security/alerts/all')) return demo.mockSecurityAlerts() as T;
      if (path.includes('/cities')) return demo.mockCities() as T;
      if (path.includes('/zones')) return demo.mockZones() as T;
      if (path.includes('/clients')) return demo.mockClients() as T;
      if (path.includes('/inventory') || path.includes('/stock')) return demo.mockInventory() as T;
    }


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
    // --- DEMO LOGIN HIJACK ---
    if (email.toLowerCase() === demo.DEMO_USER_EMAIL) {
      const mockResult = {
        success: true,
        data: {
          access_token: 'demo-token-jwt-placeholder',
          user: {
            id: 'demo-user-id',
            org_id: 'demo-org-999',
            name: 'Demo Admin',
            email: demo.DEMO_USER_EMAIL,
            role: 'admin',
            is_active: true,
            permissions: [
              'dashboard', 'analytics', 'users', 'attendance', 'zones', 'inventory', 
              'broadcast', 'orders', 'work_activities', 'hr', 'visit_logs', 'clients', 
              'grievances', 'form_builder', 'settings', 'cities', 'stores', 'skus', 
              'activities', 'assets', 'live_tracking'
            ]
          }
        }
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('kinematic_token', mockResult.data.access_token);
        localStorage.setItem('kinematic_user', JSON.stringify(mockResult.data.user));
      }
      return Promise.resolve(mockResult);
    }

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
