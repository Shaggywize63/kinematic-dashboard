'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import planogramApi from '../../../../lib/planogramApi';
import type { Capture } from '../../../../types/planogram';

const C = {
  red: '#E01E2C',
  green: '#00D97E',
  yellow: '#FFB800',
  blue: '#3E9EFF',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  s2: 'var(--s2)',
  border: 'var(--border)',
};

export default function CapturesListPage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planogramApi.listCaptures();
      setCaptures(res.data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load captures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link
            href="/dashboard/planograms"
            style={{
              fontSize: 11,
              color: C.gray,
              textDecoration: 'none',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            ← AI Planogram Engine
          </Link>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, marginTop: 4 }}>
            Shelf captures
          </div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 3 }}>
            History of field audits, AI recognition, and compliance scores.
          </div>
        </div>
        <button
          onClick={fetch}
          style={{
            padding: '9px 16px',
            background: C.s2,
            border: `1px solid ${C.border}`,
            color: C.gray,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(224,30,44,0.08)',
            border: '1px solid rgba(224,30,44,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: C.red,
          }}
        >
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
      ) : captures.length === 0 ? (
        <div
          style={{
            background: 'var(--s1)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 48,
            textAlign: 'center',
            color: C.grayd,
            fontSize: 14,
          }}
        >
          No captures yet. Start auditing shelves from the mobile app.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {captures.map((c) => (
            <CaptureCard key={c.id} capture={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaptureCard({ capture }: { capture: Capture }) {
  const score = capture.compliance?.score ?? 0;
  const color = score >= 80 ? C.green : score >= 65 ? C.yellow : C.red;

  return (
    <Link
      href={`/dashboard/planograms/captures/${capture.id}`}
      style={{
        background: 'var(--s1)',
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.15s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ position: 'relative', width: '100%', paddingTop: '65%', background: '#000' }}>
        <img
          src={capture.image_url}
          alt="Shelf capture"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            borderRadius: 20,
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{score}%</span>
        </div>
      </div>

      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            {capture.store?.name || `Store ${capture.store_id?.slice(0, 8)}…`}
          </div>
          <div style={{ fontSize: 11, color: C.gray }}>
            {capture.planogram?.name || 'Unknown planogram'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 'auto' }}>
          <div>
            <div style={{ fontSize: 9, color: C.grayd, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Auditor
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--textSec)', marginTop: 2 }}>
              {capture.fe?.name || 'FE Executive'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: C.grayd, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Time
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--textSec)', marginTop: 2 }}>
              {new Date(capture.captured_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            paddingTop: 12,
            borderTop: `1px solid ${C.border}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: C.grayd }}>📍</span>
            <span style={{ fontSize: 11, color: C.grayd, fontFamily: 'monospace' }}>
              {capture.capture_lat?.toFixed(4)}, {capture.capture_lng?.toFixed(4)}
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>View details →</span>
        </div>
      </div>
    </Link>
  );
}
