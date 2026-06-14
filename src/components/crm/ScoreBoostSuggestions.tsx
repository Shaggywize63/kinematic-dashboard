'use client';
import { useEffect, useState } from 'react';
import type { Lead } from '../../types/crm';
import { crmSettings } from '../../lib/crmApi';

// "Ways to raise this lead's score" — derived from the v3 scoring signals the
// lead is currently missing, each with the points it would add and an
// actionable button. Keeps reps focused on the highest-leverage gaps.
//
// Client-specific items: the generic CRM gaps (name, email, city, qualify)
// show for every client. Field-sales / retail items — capturing GPS "on a
// visit", a storefront "photo", or "monthly volume (MT)" — only make sense
// for a client whose reps physically visit leads (e.g. Tata Tiscon), not for
// a SaaS client like Kinematic. Those carry a `verticalSignal` and are gated
// behind the per-client CRM setting `config.score_boost_signals` (an array of
// enabled signal keys: e.g. 'gps', 'photo', 'volume'), so they're hidden by
// default and each client (current or future) opts in explicitly.

interface Suggestion {
  key: string;
  label: string;
  points: number;
  action: 'edit' | 'qualify';
  /** When set, only show this item if the key is in the client's enabled signals. */
  verticalSignal?: string;
}

function computeSuggestions(lead: Lead, enabledSignals: string[]): Suggestion[] {
  const L = lead as unknown as Record<string, any>;
  const out: Suggestion[] = [];

  const status = String(lead.status || 'new').toLowerCase();
  if (!['qualified', 'converted', 'lost', 'unqualified'].includes(status)) {
    out.push({ key: 'qualify', label: 'Mark as Qualified once vetted', points: 18, action: 'qualify' });
  }

  const lat = Number(L.latitude), lng = Number(L.longitude);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  // Field-sales signal: capturing GPS "on a visit" only makes sense for a
  // client whose reps physically visit leads (e.g. Tata Tiscon dealers), not
  // for a SaaS client like Kinematic. Gated behind the 'gps' signal.
  if (!hasGps) out.push({ key: 'gps', label: 'Capture GPS location on a visit', points: 8, action: 'edit', verticalSignal: 'gps' });

  // Vertical-specific: monthly volume in MT. Only surfaced for clients that
  // enable the 'volume' signal (e.g. Tata Tiscon). Hidden for Kinematic and
  // any future client that hasn't opted in.
  const cf = (L.custom_fields ?? {}) as Record<string, unknown>;
  const vol = Number(cf.monthly_volume ?? cf.volume_mt);
  if (!(Number.isFinite(vol) && vol > 0)) {
    out.push({ key: 'volume', label: 'Record monthly volume (MT)', points: 8, action: 'edit', verticalSignal: 'volume' });
  }

  // Field-sales signal: a storefront/lead photo is a retail-visit artefact —
  // gated behind 'photo' for the same reason as GPS above.
  if (!L.photo_url) out.push({ key: 'photo', label: 'Add a photo of the lead / storefront', points: 5, action: 'edit', verticalSignal: 'photo' });
  if (!lead.email) out.push({ key: 'email', label: 'Add an email address', points: 5, action: 'edit' });
  if (!lead.city) out.push({ key: 'city', label: 'Set the city / location', points: 5, action: 'edit' });
  if (!(lead.first_name && lead.last_name)) out.push({ key: 'name', label: 'Add the full name', points: 4, action: 'edit' });

  return out
    .filter((s) => !s.verticalSignal || enabledSignals.includes(s.verticalSignal))
    .sort((a, b) => b.points - a.points)
    .slice(0, 6);
}

export default function ScoreBoostSuggestions({
  lead, onEdit, onQualify, busy,
}: {
  lead: Lead;
  onEdit: () => void;
  onQualify: () => void;
  busy?: boolean;
}) {
  // Enabled vertical signals for this client. `null` = still loading; we treat
  // gated items as hidden until settings resolve, so a generic client never
  // flashes a vertical-specific suggestion.
  const [enabledSignals, setEnabledSignals] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    crmSettings.get()
      .then((r) => {
        const cfg = (r.data?.config ?? {}) as Record<string, unknown>;
        const sig = Array.isArray(cfg.score_boost_signals) ? (cfg.score_boost_signals as string[]).map(String) : [];
        if (alive) setEnabledSignals(sig);
      })
      .catch(() => { if (alive) setEnabledSignals([]); });
    return () => { alive = false; };
  }, []);

  const suggestions = computeSuggestions(lead, enabledSignals ?? []);
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
