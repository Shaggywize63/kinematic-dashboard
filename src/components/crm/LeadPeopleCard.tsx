'use client';
// "People on this lead" card for the full lead detail page (connected-B2B / Spark & Ray only). Shows the
// customer people linked to the lead — the primary (nodal) contact first — and lets you promote a secondary
// person to primary, the same action the lead preview panel offers. Renders nothing for other tenants or a
// lead with no people. Backend: GET /crm/leads/:id/people and POST /crm/leads/:id/people/:linkId/primary.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserRound } from 'lucide-react';
import { Card, Eyebrow, T } from '../ui';
import { InlineIcon } from '../ui/PageIcon';
import { isB2bClientActive } from '../../lib/b2bClient';
import { crmLeads, type LeadContactLink } from '../../lib/crmApi';

export default function LeadPeopleCard({ leadId }: { leadId: string }) {
  const b2b = isB2bClientActive();
  const [people, setPeople] = useState<LeadContactLink[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!b2b || !leadId) return;
    let off = false;
    setState('loading');
    crmLeads.people(leadId)
      .then((r) => { if (!off) { setPeople(r.data || []); setState('ready'); } })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, [b2b, leadId]);

  // Promote a secondary person to the nodal (primary) contact; the server returns the refreshed list.
  const makePrimary = async (linkId: string) => {
    if (primaryBusy) return;
    setPrimaryBusy(linkId);
    try {
      const r = await crmLeads.setPrimaryPerson(leadId, linkId);
      setPeople(r.data || []);
      toast.success('Primary contact updated');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not change the primary contact');
    } finally {
      setPrimaryBusy(null);
    }
  };

  // Nothing to show for other tenants, while loading the first time, or for a lead with no linked people.
  if (!b2b) return null;
  if (state !== 'error' && people.length === 0) return null;

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users aria-hidden size={13} strokeWidth={2} />People on this lead
      </Eyebrow>
      {state === 'error' ? (
        <div style={{ fontSize: 13, color: T.dim }}>Couldn’t load the people on this lead</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {people.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
              <InlineIcon icon={UserRound} size={14} style={{ color: T.dim, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.name}</span>
              {p.title && <span style={{ color: T.dim, fontSize: 12, whiteSpace: 'nowrap' }}>· {p.title}</span>}
              {p.is_primary ? (
                <span style={{
                  marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: 'var(--accent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
                }}>PRIMARY</span>
              ) : people.length > 1 && (
                <button
                  type="button"
                  onClick={() => makePrimary(p.id)}
                  disabled={!!primaryBusy}
                  title="Make this the lead's primary (nodal) contact"
                  style={{
                    marginLeft: 'auto', background: 'transparent', border: `1px solid ${T.border}`, color: 'var(--accent)',
                    fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', cursor: primaryBusy ? 'default' : 'pointer',
                    opacity: primaryBusy && primaryBusy !== p.id ? 0.5 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  {primaryBusy === p.id ? 'Setting…' : 'Make primary'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
