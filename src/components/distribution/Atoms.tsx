'use client';
import React from 'react';

const C = {
  side: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', text: 'var(--text)', dim: 'var(--text-dim)',
  red: 'var(--primary)', green: 'var(--green)', accent: 'var(--accent)',
};

export const palette = C;

export function StatCard({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: string }) {
  return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, minWidth: 180, flex: 1 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.dim }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || C.text, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  const map = {
    gray: { bg: 'rgba(255,255,255,0.05)', fg: C.dim, br: C.border },
    green: { bg: 'rgba(34,197,94,0.12)', fg: C.green, br: 'rgba(34,197,94,0.3)' },
    red: { bg: 'rgba(224,30,44,0.12)', fg: C.red, br: 'rgba(224,30,44,0.3)' },
    amber: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B', br: 'rgba(245,158,11,0.3)' },
    blue: { bg: 'rgba(59,130,246,0.12)', fg: C.accent, br: 'rgba(59,130,246,0.3)' },
  } as const;
  const s = map[color];
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, border: `1px solid ${s.br}` }}>{children}</span>
  );
}

export function statusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  const s = (status || '').toLowerCase();
  if (['placed', 'pending', 'requested', 'draft'].includes(s)) return 'amber';
  if (['approved', 'cleared', 'issued', 'delivered', 'credited', 'supervisor_approved', 'paid'].includes(s)) return 'green';
  if (['cancelled', 'rejected', 'bounced'].includes(s)) return 'red';
  if (['invoiced', 'partially_invoiced', 'out', 'prepared'].includes(s)) return 'blue';
  return 'gray';
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.side, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, ...style }}>{children}</div>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...style }}>{children}</div>;
}

export function Btn({ onClick, children, variant = 'primary', disabled }: { onClick?: () => void; children: React.ReactNode; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: C.red, color: '#fff', border: 'none' },
    ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}` },
    danger: { background: 'transparent', color: C.red, border: `1px solid ${C.red}` },
  };
  return (
    <button disabled={disabled} onClick={onClick} style={{
      ...styles[variant], padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

export function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, borderBottom: `1px solid ${C.border}`, ...style }}>{children}</th>;
}

export function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, ...style }}>{children}</td>;
}

export function inr(n: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; }
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
