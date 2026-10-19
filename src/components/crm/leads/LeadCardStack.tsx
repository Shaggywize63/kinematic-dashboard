'use client';
import { type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Phone } from 'lucide-react';
import type { Lead } from '../../../types/crm';
import type { LeadStatusOption } from '../../../lib/crmLeadStatuses';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { isValidWaPhone, waLink } from '../../../lib/whatsapp';
import { callComposerUrl, dialableNumber } from '../shared/CallButton';
import { WA_PATH } from '../shared/WhatsAppButton';
import { formatRelativeTime } from '../LeadsTable';
import LeadAvatar, { leadDisplayName } from './LeadAvatar';
import { inferGrade } from './ScoreMeter';
import { LeadsSkeleton } from './LeadsStates';
import { Badge, T, type Tone } from '../../ui';

const GRADE_COLORS: Record<string, string> = { A: '#28B463', B: '#7B61FF', C: '#F7B538', D: '#E01E2C' };

function statusTone(status?: string | null): Tone {
  switch ((status || '').toLowerCase()) {
    case 'new': return 'info';
    case 'working': return 'warn';
    case 'qualified': case 'converted': return 'ok';
    case 'lost': return 'red';
    default: return 'neutral';
  }
}

/**
 * Phone / "cards" layout for the Leads list. One card per lead with the two
 * actions a rep reaches for on a phone — Call and WhatsApp — on the card itself.
 * Tapping the avatar selects the card (bulk actions use the same floating bar
 * as desktop); the name opens the lead.
 */
export default function LeadCardStack({
  leads, selected, onToggle, loading, isB2C, statusOptions, fieldHelpers, onEdit, emptyState,
}: {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading?: boolean;
  isB2C: boolean;
  statusOptions: LeadStatusOption[] | null;
  fieldHelpers?: FieldHelpers;
  onEdit?: (lead: Lead) => void;
  emptyState?: ReactNode;
}) {
  const router = useRouter();
  const hid = (k: string) => !!fieldHelpers?.isHidden(k);

  if (loading && leads.length === 0) return <LeadsSkeleton rows={5} />;
  if (!loading && leads.length === 0) return <>{emptyState}</>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, opacity: loading ? 0.6 : 1, transition: 'opacity .15s ease' }}>
      {leads.map((l) => {
        const name = leadDisplayName(l);
        const isSel = selected.has(l.id);
        const g = inferGrade(l.score, l.score_grade);
        const gc = g ? GRADE_COLORS[g] : T.mute;
        const meta = statusOptions?.find((o) => o.value.toLowerCase() === String(l.status).toLowerCase());
        const metaStyle = meta?.color ? { background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color } : undefined;
        const company = !isB2C && !hid('company') ? l.company : null;
        const phone = !hid('phone') ? l.phone : null;
        const dial = dialableNumber(phone);
        const latest = (l as { latest_update?: string | null }).latest_update;
        const latestAt = (l as { latest_update_at?: string | null }).latest_update_at;
        return (
          <article
            key={l.id}
            style={{ border: `1px solid ${isSel ? T.info : T.border}`, background: isSel ? T.infoWash : T.card, borderRadius: 14, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSel}
                aria-label={`Select ${name}`}
                onClick={() => onToggle(l.id)}
                style={{ position: 'relative', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', flexShrink: 0, lineHeight: 0 }}
              >
                <LeadAvatar lead={l} size={38} />
                {isSel && (
                  <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 999, background: T.info, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={18} strokeWidth={2.4} />
                  </span>
                )}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/dashboard/crm/leads/${l.id}`} className="km-entity-link" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>{name}</Link>
                {(company || phone) && (
                  <div style={{ marginTop: 1, fontSize: 12, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[company, phone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {!hid('score') && g && (
                <span title={l.score != null ? `Score ${Math.round(l.score)}` : undefined} style={{ minWidth: 24, height: 24, padding: '0 7px', borderRadius: 7, background: `${gc}1F`, color: gc, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{g}</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: latest ? T.text : T.mute }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontStyle: latest ? 'normal' : 'italic' }}>{latest || 'No update yet'}</span>
              {latest && latestAt && <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.mute, whiteSpace: 'nowrap', paddingTop: 2 }}>{formatRelativeTime(latestAt)}</span>}
            </div>

            {!hid('status') && l.status && (
              <div>
                <Badge tone={statusTone(l.status)} dot style={{ textTransform: 'capitalize', ...metaStyle }}>{meta?.label ?? String(l.status).replace(/_/g, ' ')}</Badge>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
              {dial && (
                <a
                  href={`tel:${dial}`}
                  onClick={() => window.setTimeout(() => router.push(callComposerUrl({ subject: `Call with ${name}`, leadId: l.id })), 50)}
                  style={{ flex: 1, height: 34, borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.card, color: T.ok, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Phone size={14} strokeWidth={1.8} aria-hidden />Call
                </a>
              )}
              {!hid('phone') && isValidWaPhone(phone) && (
                <a
                  href={waLink(phone!)} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, height: 34, borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="#25D366" aria-hidden><path d={WA_PATH} /></svg>WhatsApp
                </a>
              )}
              {onEdit && (
                <button
                  type="button" aria-label="Edit lead" onClick={() => onEdit(l)}
                  style={{ flex: '0 0 34px', height: 34, borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.card, color: T.dim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Pencil size={14} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
