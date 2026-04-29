'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import planogramApi from '../../../../../lib/planogramApi';
import PlanogramShelfOverlay from '../../../../../components/PlanogramShelfOverlay';
import type { Capture, Compliance, Recognition } from '../../../../../types/planogram';

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

export default function CaptureDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [capture, setCapture] = useState<Capture | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await planogramApi.getCapture(id);
      setCapture(r.data.capture);
      setRecognition(r.data.recognition);
      setCompliance(r.data.compliance);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load capture');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const missingIds = new Set(compliance?.missing_skus.map((m) => m.sku_id) || []);

  if (loading)
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.grayd, fontSize: 14 }}>Loading…</div>
    );
  if (error)
    return (
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
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>
          Shelf capture
        </div>
        <div style={{ fontSize: 13, color: C.gray, marginTop: 4, display: 'flex', gap: 16 }}>
          <span>📅 {capture && new Date(capture.captured_at).toLocaleString()}</span>
          <span>🏬 Store: {capture?.store?.name || capture?.store_id?.slice(0, 8) || '—'}</span>
          <span>👤 Auditor: {capture?.fe?.name || 'FE Executive'}</span>
          <span>📍 {capture?.capture_lat?.toFixed(5)}, {capture?.capture_lng?.toFixed(5)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        {/* Image with overlay */}
        <div>
          {capture && recognition && (
            <PlanogramShelfOverlay
              imageUrl={capture.image_url}
              detectedSkus={recognition.detected_skus}
              missingSkuIds={missingIds}
            />
          )}
          {recognition?.needs_review && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: 'rgba(255,184,0,0.12)',
                border: '1px solid rgba(255,184,0,0.3)',
                borderRadius: 10,
                fontSize: 12,
                color: C.yellow,
              }}
            >
              ⚠ Low confidence ({Math.round(recognition.overall_confidence * 100)}%) — flag for review.
            </div>
          )}
        </div>

        {/* Score panel */}
        {compliance && (
          <div
            style={{
              background: 'var(--s1)',
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div
              style={{
                fontFamily: "'Syne',sans-serif",
                fontSize: 56,
                fontWeight: 800,
                color:
                  compliance.score >= 80 ? C.green : compliance.score >= 65 ? C.yellow : C.red,
                lineHeight: 1,
              }}
            >
              {compliance.score}%
            </div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>compliance score</div>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ScoreBar label="Presence" value={compliance.presence_score} />
              <ScoreBar label="Facings" value={compliance.facing_score} />
              <ScoreBar label="Position" value={compliance.position_score} />
              <ScoreBar
                label="Competitor share"
                value={compliance.competitor_share}
                inverted
              />
            </div>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {compliance && compliance.recommendations.length > 0 && (
        <div
          style={{
            background: 'var(--s1)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${C.border}`,
              fontFamily: "'Syne',sans-serif",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Recommended actions
          </div>
          {compliance.recommendations.map((r, i) => (
            <div
              key={i}
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${C.border}40`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <PriorityBadge p={r.priority} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.action}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{r.rationale}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing & misplaced lists */}
      {compliance && (compliance.missing_skus.length > 0 || compliance.misplaced_skus.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {compliance.missing_skus.length > 0 && (
            <Panel title={`Missing SKUs (${compliance.missing_skus.length})`}>
              {compliance.missing_skus.map((m) => (
                <Row key={m.sku_id} left={m.sku_name} right={`${m.expected_facings} expected`} />
              ))}
            </Panel>
          )}
          {compliance.misplaced_skus.length > 0 && (
            <Panel title={`Misplaced (${compliance.misplaced_skus.length})`}>
              {compliance.misplaced_skus.map((m) => (
                <Row
                  key={m.sku_id}
                  left={m.sku_name}
                  right={`shelf ${m.actual_shelf} → ${m.expected_shelf}`}
                />
              ))}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  value,
  inverted = false,
}: {
  label: string;
  value: number;
  inverted?: boolean;
}) {
  const good = inverted ? value <= 25 : value >= 80;
  const ok = inverted ? value <= 40 : value >= 65;
  const color = good ? C.green : ok ? C.yellow : C.red;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: C.gray,
          marginBottom: 5,
        }}
      >
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--s2)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, value)}%`,
            height: '100%',
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function PriorityBadge({ p }: { p: 'critical' | 'high' | 'medium' | 'low' }) {
  const tone: Record<string, { bg: string; color: string }> = {
    critical: { bg: 'rgba(224,30,44,0.18)', color: '#E01E2C' },
    high: { bg: 'rgba(255,184,0,0.16)', color: '#FFB800' },
    medium: { bg: 'rgba(62,158,255,0.14)', color: '#3E9EFF' },
    low: { bg: 'rgba(122,139,160,0.10)', color: '#7A8BA0' },
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '5px 10px',
        borderRadius: 20,
        ...tone[p],
        whiteSpace: 'nowrap',
      }}
    >
      {p.toUpperCase()}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          fontFamily: "'Syne',sans-serif",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        borderBottom: '1px solid rgba(122,139,160,0.15)',
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600 }}>{left}</span>
      <span style={{ color: 'var(--textSec)' }}>{right}</span>
    </div>
  );
}
