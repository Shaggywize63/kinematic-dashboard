'use client';
import type { Lead } from '../../types/crm';

// "Ways to raise this lead's score" — derived from the v3 scoring signals the
// lead is currently missing, each with the points it would add and an
// actionable button. Keeps reps focused on the highest-leverage gaps.

interface Suggestion {
  key: string;
  label: string;
  points: number;
  action: 'edit' | 'qualify';
}

function computeSuggestions(lead: Lead): Suggestion[] {
  const L = lead as unknown as Record<string, any>;
  const out: Suggestion[] = [];

  const status = String(lead.status || 'new').toLowerCase();
  if (!['qualified', 'converted', 'lost', 'unqualified'].includes(status)) {
    out.push({ key: 'qualify', label: 'Mark as Qualified once vetted', points: 18, action: 'qualify' });
  }

  const lat = Number(L.latitude), lng = Number(L.longitude);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!hasGps) out.push({ key: 'gps', label: 'Capture GPS location on a visit', points: 8, action: 'edit' });

  const cf = (L.custom_fields ?? {}) as Record<string, unknown>;
  const vol = Number(cf.monthly_volume ?? cf.volume_mt);
  if (!(Number.isFinite(vol) && vol > 0)) out.push({ key: 'volume', label: 'Record monthly volume (MT)', points: 8, action: 'edit' });

  if (!L.photo_url) out.push({ key: 'photo', label: 'Add a photo of the lead / storefront', points: 5, action: 'edit' });
  if (!lead.email) out.push({ key: 'email', label: 'Add an email address', points: 5, action: 'edit' });
  if (!lead.city) out.push({ key: 'city', label: 'Set the city / location', points: 5, action: 'edit' });
  if (!L.whatsapp_consent) out.push({ key: 'wa', label: 'Capture WhatsApp consent', points: 5, action: 'edit' });
  if (!(lead.first_name && lead.last_name)) out.push({ key: 'name', label: 'Add the full name', points: 4, action: 'edit' });

  return out.sort((a, b) => b.points - a.points).slice(0, 6);
}

export default function ScoreBoostSuggestions({
  lead, onEdit, onQualify, busy,
}: {
  lead: Lead;
  onEdit: () => void;
  onQualify: () => void;
  busy?: boolean;
}) {
  const suggestions = computeSuggestions(lead);
  if (suggestions.length === 0) return null;

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Boost this score</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
        Add the missing signals below to raise the lead score. Re-score after updating to see the new number.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {suggestions.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--s3)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, marginTop: 2 }}>up to +{s.points} pts</div>
            </div>
            <button
              type="button"
              onClick={s.action === 'qualify' ? onQualify : onEdit}
              disabled={busy}
              style={{
                background: s.action === 'qualify' ? 'var(--primary)' : 'var(--s2)',
                border: s.action === 'qualify' ? 'none' : '1px solid var(--border)',
                color: s.action === 'qualify' ? '#fff' : 'var(--text)',
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1,
              }}
            >
              {s.action === 'qualify' ? 'Mark Qualified' : 'Add detail'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
