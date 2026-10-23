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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
