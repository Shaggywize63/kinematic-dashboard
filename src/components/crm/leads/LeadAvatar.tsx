'use client';
import type { Lead } from '../../../types/crm';

export function leadDisplayName(l: Pick<Lead, 'full_name' | 'first_name' | 'last_name' | 'email'>): string {
  return l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || name === '—') return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Same name → same colour, so a lead keeps its avatar across the list, the
// preview panel and the phone cards.
function gradientFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h}, 68%, 52%), hsl(${(h + 38) % 360}, 66%, 42%))`;
}

export default function LeadAvatar({ lead, size = 34 }: { lead: Pick<Lead, 'full_name' | 'first_name' | 'last_name' | 'email' | 'photo_url'>; size?: number }) {
  const name = leadDisplayName(lead);
  if (lead.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={lead.photo_url} alt="" aria-hidden style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0, background: gradientFor(name), color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(11, Math.round(size * 0.38)), fontWeight: 700, letterSpacing: '0.01em',
      }}
    >
      {initials(name)}
    </span>
  );
}
