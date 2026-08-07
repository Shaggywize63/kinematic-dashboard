'use client';
import Link from 'next/link';
import type { Lead } from '../../../types/crm';

// Small on-brand (KINI red) pill button used for the per-row next-step actions.
// Ghost fill by default, deepens on hover. Theme-aware via CSS vars; the red
// accent is fixed to the KINI brand colour so it reads as "the assistant's"
// action regardless of the active theme.
function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 600, color: '#E01E2C',
        background: 'color-mix(in srgb, #E01E2C 10%, transparent)',
        border: '1px solid color-mix(in srgb, #E01E2C 28%, transparent)',
        borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
        transition: 'all .15s', whiteSpace: 'nowrap', lineHeight: 1.2,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, #E01E2C 18%, transparent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, #E01E2C 10%, transparent)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {label}
    </button>
  );
}

export default function LeadListCard({
  title,
  leads,
  // Optional callback wired by KiniCardRenderer → KinematicAI's send(). When
  // present, each lead row shows quick next-step buttons that fire a natural-
  // language prompt back into the chat, driving the agent loop forward.
  onAction,
}: {
  title?: string;
  leads: Partial<Lead>[];
  onAction?: (prompt: string) => void;
}) {
  return (
    // Theme-var surfaces/text (was hardcoded dark-theme white) so the card
    // stays legible on the light theme too.
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      {title && <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {leads.slice(0, 5).map((l, i) => {
          const name = l.full_name
            || `${l.first_name || ''} ${l.last_name || ''}`.trim()
            || l.email
            || 'this lead';
          return (
            <div key={l.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--s4)' }}>
              <Link href={`/dashboard/crm/leads/${l.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ color: '#7B61FF' }}>{l.company || ''}</span>
              </Link>
              {onAction && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <QuickAction label="Draft email" onClick={() => onAction(`Draft a follow-up email to ${name}`)} />
                  <QuickAction label="Add task" onClick={() => onAction(`Create a task to follow up with ${name}`)} />
                  <QuickAction label="Convert" onClick={() => onAction(`Convert lead ${name} to a deal`)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
