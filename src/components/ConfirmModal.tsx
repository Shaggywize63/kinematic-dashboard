'use client';
import React from 'react';

const C = {
  bg: 'var(--bg)',
  s2: 'var(--s2)',
  s3: 'var(--s3)',
  border: 'var(--border)',
  white: 'var(--text)',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  red: '#E01E2C',
};

interface ConfirmModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName?: string;
  loading?: boolean;
}

const Spinner = () => (
  <div style={{
    width: 15,
    height: 15,
    border: '2.5px solid rgba(255,255,255,0.18)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'kspin .65s linear infinite'
  }} />
);

export default function ConfirmModal({ show, onClose, onConfirm, title, message, itemName, loading }: ConfirmModalProps) {
  if (!show) return null;

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(6px)'
      }}
    >
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>
      <div 
        style={{
          background: C.s2,
          border: `1px solid ${C.border}`,
          borderRadius: 24,
          padding: 32,
          width: '100%',
          maxWidth: 420,
          position: 'relative'
        }}
      >
        {/* Close button (X) */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: C.s3,
            color: C.gray,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.white; e.currentTarget.style.background = C.border; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.gray; e.currentTarget.style.background = C.s3; }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header Icon */}
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'rgba(224,30,44,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.red,
          marginBottom: 24
        }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </div>

        {/* Content */}
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8, color: C.white }}>{title}</div>
        <div style={{ fontSize: 14, color: C.gray, lineHeight: 1.5, marginBottom: 32 }}>
          {message} {itemName && <span style={{ fontWeight: 700, color: C.white }}>"{itemName}"</span>}? This action cannot be undone.
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px',
              border: `1.5px solid ${C.border}`,
              borderRadius: 14,
              background: 'transparent',
              color: C.gray,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif"
            }}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px',
              border: 'none',
              borderRadius: 14,
              background: C.red,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: "'DM Sans', sans-serif",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? <><Spinner /> Deleting...</> : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  );
}
