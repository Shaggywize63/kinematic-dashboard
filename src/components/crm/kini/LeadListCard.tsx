'use client';
import Link from 'next/link';
import type { Lead } from '../../../types/crm';

export default function LeadListCard({ title, leads }: { title?: string; leads: Partial<Lead>[] }) {
  return (
    // Theme-var surfaces/text (was hardcoded dark-theme white) so the card
    // stays legible on the light theme too.
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      {title && <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {leads.slice(0, 5).map((l, i) => (
          <Link key={l.id || i} href={`/dashboard/crm/leads/${l.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--s4)', fontSize: 12, color: 'var(--text)' }}>
            <span style={{ fontWeight: 600 }}>{l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email}</span>
            <span style={{ color: '#7B61FF' }}>{l.company || ''}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
