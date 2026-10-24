'use client';
import { useMemo } from 'react';
import type { LeadUpdate } from '../../../lib/crmApi';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import LeadDetailsPanel from '../LeadDetailsPanel';
import OwnerAvatar from '../shared/OwnerAvatar';
import { renderMentions } from '../../messaging/MentionInput';
import { Button, T } from '../../ui';
import ContactCard from './ContactCard';
import { ActivityRow } from './FeedItems';
import SectionCard from './SectionCard';
import { useActivityActions } from './useActivityActions';
import { fmtIST, isActionable, relTime, type DetailActivity } from './format';
import type { LeadTab, LifecycleLead } from './types';

const UP_NEXT_MAX = 3;

/** At-a-glance tab: what's due, the latest word on the lead, how to reach them, and every captured field. */
export default function OverviewTab({
  lead, fields, hideEmail, activities, latestUpdate, campaigns, leadCampaign, waPrefill, displayName, onPatch, onActivitiesChanged, onOpenTab,
}: {
  lead: LifecycleLead;
  fields: FieldHelpers;
  hideEmail: boolean;
  activities: DetailActivity[];
  latestUpdate: LeadUpdate | null;
  campaigns: string[];
  leadCampaign: string | null;
  waPrefill: string;
  displayName: string;
  onPatch: (patch: Record<string, unknown>, toastText: string) => Promise<void>;
  onActivitiesChanged: () => void;
  onOpenTab: (t: LeadTab) => void;
}) {
  const { busyId, setStatus, remove } = useActivityActions(onActivitiesChanged);
  const upcoming = useMemo(() => {
    const t = (a: DetailActivity) => (a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY);
    return activities.filter(isActionable).sort((a, b) => t(a) - t(b));
  }, [activities]);
  const shown = upcoming.slice(0, UP_NEXT_MAX);
  const overdue = upcoming.some((a) => a.due_at && new Date(a.due_at).getTime() < Date.now());
  // The denormalised column covers a lead whose update list hasn't loaded (or was truncated).
  const noteText = latestUpdate?.body ?? lead.latest_update ?? null;
  const noteAt = latestUpdate?.created_at ?? lead.latest_update_at ?? null;

  // Walk-in "Not Purchased" highlight — surfaces the capture reason + key
  // details at the top of the overview when this is a walk-in lead, mirroring
  // the Android My Calls WalkInDetailsCard. Reads the shared custom_fields
  // contract written by the walk-in capture form (web + Android).
  const walkIn = useMemo(() => {
    const cf = (lead.custom_fields as Record<string, unknown> | null) ?? {};
    const str = (k: string): string | null => {
      const v = cf[k];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const isWalkIn = str('campaign') === 'Walk-in' || cf.purchase_status === 'not_purchased' || !!str('not_purchase_reason');
    if (!isWalkIn) return null;
    const reason = str('not_purchase_reason');
    const details: Array<[string, string]> = [];
    const add = (label: string, k: string, prefix = '') => { const v = str(k); if (v) details.push([label, `${prefix}${v}`]); };
    add('Visit date', 'visit_date');
    add('Store branch', 'store_branch');
    add('Marketing employee', 'marketing_employee');
    add('Gold rate', 'gold_rate', '₹');
    add('Total weight', 'total_weight_gm', '');
    add('Estimate', 'estimate_amount', '₹');
    add('Discount', 'discount_value');
    add('Final price', 'estimated_final_price', '₹');
    add('Follow-up', 'next_follow_up_date');
    add('Remarks', 'estimate_remarks');
    const other = str('not_purchase_reason_other');
    return { reason: reason === 'Other' && other ? `Other — ${other}` : reason, details };
  }, [lead.custom_fields]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {walkIn && (
        <SectionCard title="Walk-in · Not purchased" accent={T.red}>
          {walkIn.reason && (
            <div style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 999, background: T.redWash, color: T.red, fontSize: 13, fontWeight: 700, marginBottom: walkIn.details.length ? 12 : 0 }}>
              Reason: {walkIn.reason}
            </div>
          )}
          {walkIn.details.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px 16px' }}>
              {walkIn.details.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: T.mute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ fontSize: 13.5, color: T.text, marginTop: 2, overflowWrap: 'anywhere' }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {shown.length > 0 && (
        <SectionCard
          title="Up next"
          count={upcoming.length}
          accent={overdue ? T.red : T.info}
          aside={upcoming.length > UP_NEXT_MAX ? <Button size="sm" variant="ghost" onClick={() => onOpenTab('timeline')}>See all {upcoming.length}</Button> : undefined}
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((a, i) => (
              <ActivityRow
                key={a.id}
                a={a}
                upcoming
                last={i === shown.length - 1}
                leadCampaign={leadCampaign}
                busy={busyId === a.id}
                onStatus={(s) => setStatus(a, s)}
                onDelete={() => remove(a)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {noteText && (
        <SectionCard
          title="Latest update"
          aside={<Button size="sm" variant="ghost" onClick={() => onOpenTab('timeline')}>Open timeline</Button>}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {latestUpdate?.author_name && <OwnerAvatar name={latestUpdate.author_name} size={30} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: T.dim }}>
                {latestUpdate?.author_name && <strong style={{ color: T.text, fontWeight: 650 }}>{latestUpdate.author_name}</strong>}
                {noteAt && <span style={{ marginLeft: latestUpdate?.author_name ? 8 : 0, color: T.mute }} title={fmtIST(noteAt)}>{relTime(noteAt)}</span>}
              </div>
              <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.55, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {renderMentions(noteText)}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <ContactCard
        lead={lead}
        fields={fields}
        hideEmail={hideEmail}
        onPatch={onPatch}
        waPrefill={waPrefill}
        displayName={displayName}
        campaigns={campaigns}
      />

      {/* Comprehensive categorised detail panel — every lead field grouped by Contact / Company / Personal /
          Address / Custom / Consent, hiding any group with no populated values. Gated through `fields`. */}
      <LeadDetailsPanel lead={lead} fields={fields} onPatch={(patch) => onPatch(patch as Record<string, unknown>, 'Updated')} />
    </div>
  );
}
