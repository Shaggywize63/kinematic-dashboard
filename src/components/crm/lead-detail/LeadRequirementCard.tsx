'use client';
import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { crmLeads, type LeadProductLine } from '../../../lib/crmApi';
import { isB2bClientActive } from '../../../lib/b2bClient';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { T } from '../../ui';
import SectionCard from './SectionCard';

/**
 * The lead's own free-text `requirement` and the make / product / qty lines
 * captured under it (connected-B2B / Spark & Ray). On the detail page the
 * requirement otherwise only appears abbreviated in the header name; this gives
 * it a proper section. Shown for ANY Spark lead type (a "Discussion" lead that
 * has since captured a requirement included), and renders nothing when the lead
 * has neither a requirement nor product lines, or for other tenants.
 */
export default function LeadRequirementCard({ leadId, requirement, fields }: { leadId: string; requirement?: string | null; fields: FieldHelpers }) {
  const [lines, setLines] = useState<LeadProductLine[]>([]);
  useEffect(() => {
    let off = false;
    crmLeads.productLines(leadId).then((r) => { if (!off) setLines(r.data || []); }).catch(() => { /* lines are optional */ });
    return () => { off = true; };
  }, [leadId]);

  if (!isB2bClientActive()) return null;
  const hasReq = !!(requirement && requirement.trim());
  if (!hasReq && lines.length === 0) return null;

  return (
    <SectionCard title={fields.labelFor('requirement', 'Requirement')} icon={ClipboardList} count={lines.length || undefined}>
      {hasReq && (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: lines.length ? 12 : 0 }}>
          {requirement}
        </div>
      )}
      {lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lines.map((l) => {
            const left = [l.make_name?.trim(), l.product_name?.trim()].filter(Boolean).join(' · ') || '—';
            const qty = l.qty != null ? `${l.qty}${l.unit ? ` ${l.unit}` : ''}` : '';
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', fontSize: 13, color: T.text, background: T.raised, borderRadius: T.radius.md, padding: '8px 12px' }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{left}</span>
                {qty && <span style={{ color: T.mute, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{qty}</span>}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
