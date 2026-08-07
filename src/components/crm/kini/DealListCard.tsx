'use client';
import Link from 'next/link';
import type { Deal } from '../../../types/crm';

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

export default function DealListCard({
  title,
  deals,
  // Optional callback wired by KiniCardRenderer → KinematicAI's send(). When
  // present, each deal row shows quick next-step buttons that fire a natural-
  // language prompt back into the chat, driving the agent loop forward.
  onAction,
}: {
  title?: string;
  deals: Partial<Deal>[];
  onAction?: (prompt: string) => void;
}) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      {title && <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {deals.slice(0, 5).map((d, i) => {
          const name = d.name || 'this deal';
          return (
            <div key={d.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--s4)' }}>
              <Link href={`/dashboard/crm/deals/${d.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}>
                <span style={{ fontWeight: 600 }}>{name === 'this deal' ? 'Untitled' : name}</span>
                <span style={{ color: '#28B463' }}>${Number(d.amount || 0).toLocaleString()}</span>
              </Link>
              {onAction && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <QuickAction label="Move stage" onClick={() => onAction(`Move ${name} to the next stage`)} />
                  <QuickAction label="Log activity" onClick={() => onAction(`Log an activity for the ${name} deal`)} />
                  <QuickAction label="Draft email" onClick={() => onAction(`Draft a follow-up email for the ${name} deal`)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
