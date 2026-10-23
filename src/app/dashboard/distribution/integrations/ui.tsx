'use client';
import type React from 'react';

// ── Modal + tokens ────────────────────────────────────────────────────────────
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Modal({ children, onClose, title, subtitle }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string;
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 14,
        maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto',
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
};
export const input: React.CSSProperties = {
  width: '100%', background: 'var(--s3)', border: '1px solid var(--border)',
  color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};
export const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff',
  padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
export const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '9px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600,
};
export const ghostBtnDanger: React.CSSProperties = {
  ...ghostBtn, color: 'rgb(239, 68, 68)', borderColor: 'rgba(239, 68, 68, 0.4)',
};
export const miniBtn: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
};
export const codeStyle: React.CSSProperties = {
  background: 'var(--s3)', padding: '1px 5px', borderRadius: 3, fontSize: 11,
};
export const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 10, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
};
export const td: React.CSSProperties = {
  padding: '8px 10px', color: 'var(--text)',
};
