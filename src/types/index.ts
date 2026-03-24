export type UserRole = 'super_admin' | 'admin' | 'hr' | 'program_manager' | 'city_manager' | 'supervisor' | 'field_executive' | 'client';

export interface AuthUser {
  id: string; org_id: string; name: string; email: string; role: UserRole;
  employee_id?: string; zone_id?: string; avatar_url?: string;
}

export interface AuthSession {
  user: AuthUser; access_token: string; expires_at: number;
}

export interface FieldExecutive {
  id: string; name: string; employee_id: string; mobile: string; email?: string;
  zone_name?: string; supervisor_name?: string;
  status: 'active' | 'inactive' | 'suspended';
  is_checked_in: boolean; check_in_time?: string;
  today_cc: number; today_ecc: number; today_hours: number;
  monthly_attendance: number; on_break: boolean;
  location?: { lat: number; lng: number; updated_at: string };
  joined_date: string;
}

export interface DashboardStats {
  total_fes: number; checked_in_today: number; total_cc_today: number;
  total_ecc_today: number; avg_hours_today: number; attendance_rate: number;
  ecc_rate: number; active_sos: number; offline_forms: number; low_stock_alerts: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean; data?: T; error?: string; message?: string;
  pagination?: { page: number; limit: number; total: number; pages: number; };
}

export interface CCForm {
  id: string; fe_id: string; fe_name: string; outlet_name: string;
  outlet_type: string; consumer_age: string; consumer_gender: string;
  product_shown: string; consumer_reaction: string; is_ecc: boolean;
  photo_url?: string; remarks?: string; submitted_at: string;
  is_offline: boolean; synced: boolean;
}

export interface StockItem {
  id: string; name: string; sku: string;
  category: 'product' | 'tool' | 'asset';
  total_qty: number; allocated_qty: number; consumed_qty: number; remaining_qty: number;
}

export interface BroadcastQuestion {
  id: string; question: string; options: string[]; correct_option?: number;
  is_urgent: boolean; response_count: number; total_target: number;
  deadline?: string; created_at: string;
}

export interface Notification {
  id: string; title: string; body: string;
  target_type: 'all' | 'zone' | 'individual' | 'role';
  sent_at: string; read_count: number; total_target: number;
  type: 'info' | 'alert' | 'broadcast' | 'training' | 'sos';
}
