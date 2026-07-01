'use client';
import React from 'react';
import { LEAVE_STATUS_COLORS, type LeaveStatus } from '../../../lib/leaveApi';

// Shared inline-style tokens + small presentational helpers for the Leave
// pages. Mirrors the token set used across CRM settings pages (var(--s2/s3),
// var(--primary), etc.) so the module matches the rest of the dashboard.

export const card: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
};
export const input: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};
export const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 5, display: 'block',
};
export const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px',
  borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
};
export const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
};
export const btnSmallGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
};
export const btnSmallSuccess: React.CSSProperties = {
  background: 'transparent', border: '1px solid #22c55e', color: '#22c55e',
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
};
export const btnSmallDanger: React.CSSProperties = {
  background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
};

export function StatusChip({ status }: { status: LeaveStatus }) {
  const c = LEAVE_STATUS_COLORS[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {status}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// Sub-nav tabs shared across the leave module pages.
export function LeaveTabs({ active, canManage, canAdmin }: { active: string; canManage: boolean; canAdmin: boolean }) {
  const tabs = [
    { key: 'mine', href: '/dashboard/leave', label: 'My Leave' },
    { key: 'regularize', href: '/dashboard/leave/regularize', label: 'Regularize' },
    ...(canManage ? [{ key: 'approvals', href: '/dashboard/leave/approvals', label: 'Approvals' }] : []),
    ...(canAdmin ? [{ key: 'settings', href: '/dashboard/leave/settings', label: 'Settings' }] : []),
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <a key={t.key} href={t.href} style={{
          textDecoration: 'none', fontSize: 13, fontWeight: 600,
          padding: '6px 14px', borderRadius: 8,
          background: active === t.key ? 'var(--primary)' : 'var(--s2)',
          color: active === t.key ? '#fff' : 'var(--text-dim)',
          border: '1px solid var(--border)',
        }}>{t.label}</a>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 460 }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: width, padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Resolve whether the signed-in user can act as a manager / admin for the
// leave module. Managers see approvals; admins see settings. We reuse the
// same coarse role detection the dashboard layout uses.
export function useLeaveRoles(): { canManage: boolean; canAdmin: boolean } {
  const [roles, setRoles] = React.useState({ canManage: false, canAdmin: false });
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('kinematic_user');
      const u = raw ? JSON.parse(raw) : null;
      const role = (u?.role || '').toLowerCase().trim().replace(/-/g, '_');
      const perms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
      const adminRoles = ['super_admin', 'admin', 'main_admin', 'master_admin', 'sub_admin', 'client'];
      const managerRoles = [...adminRoles, 'program_manager', 'city_manager', 'supervisor', 'hr'];
      const isAdmin = adminRoles.includes(role) || role.includes('admin') || perms.includes('settings');
      const isManager = isAdmin || managerRoles.includes(role) || perms.includes('attendance') || perms.includes('users');
      setRoles({ canManage: isManager, canAdmin: isAdmin });
    } catch { /* default: no elevated access */ }
  }, []);
  return roles;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
