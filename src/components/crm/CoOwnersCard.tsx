'use client';
// Co-owners (additional owners) on a lead / account / contact / deal. The record keeps its single
// primary owner; co-owners are peers who ALSO see it in their lists and reports. Everyone who can see
// the record sees the co-owner chips; an admin or the record's primary owner can add / remove them.
// Backend: GET + PUT /crm/{leads,accounts,contacts,deals}/:id/co-owners.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, X, Users } from 'lucide-react';
import { Card, Eyebrow, T } from '../ui';
import { InlineIcon } from '../ui/PageIcon';
import UserSearchSelect from './shared/UserSearchSelect';
import { useAssignableUsers } from './spark/DealSections';
import { useLeadOwnerAccess } from '../../lib/leadOwnerAccess';
import { useFieldHelpers } from '../../lib/crm/useFieldHelpers';
import { getStoredUser } from '../../lib/auth';
import { crmCoOwners, type CoOwner, type CoOwnerEntity } from '../../lib/crmApi';

const SINGULAR: Record<CoOwnerEntity, 'lead' | 'account' | 'contact' | 'deal'> = {
  leads: 'lead', accounts: 'account', contacts: 'contact', deals: 'deal',
};

export default function CoOwnersCard({ entity, id, primaryOwnerId, primaryOwnerName }: {
  entity: CoOwnerEntity;
  id: string;
  primaryOwnerId?: string | null;
  primaryOwnerName?: string | null;
}) {
  const [owners, setOwners] = useState<CoOwner[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);

  // Owner is a built-in field: when the admin has hidden `owner_id` (field overrides), the Owners card
  // is withheld entirely, like every other built-in render site (the CLAUDE.md contract).
  const { fields, loaded: fieldsLoaded } = useFieldHelpers(SINGULAR[entity]);
  const ownerHidden = fieldsLoaded && fields.isHidden('owner_id');

  // An admin, or the record's own primary owner, can change the co-owner set. Everyone else just sees it.
  const access = useLeadOwnerAccess();
  const myId = getStoredUser()?.id ?? null;
  const canEdit = access.ready && (access.isAdmin || (!!myId && myId === primaryOwnerId));

  const users = useAssignableUsers(canEdit);

  useEffect(() => {
    let off = false;
    setState('loading');
    crmCoOwners.list(entity, id)
      .then((r) => { if (!off) { setOwners(r.data || []); setState('ready'); } })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, [entity, id]);

  const save = useCallback(async (nextIds: string[]) => {
    setSaving(true);
    try {
      const r = await crmCoOwners.set(entity, id, nextIds);
      setOwners(r.data || []);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not update co-owners');
    } finally {
      setSaving(false);
    }
  }, [entity, id]);

  const add = (userId: string) => {
    if (!userId || saving) return;
    if (userId === primaryOwnerId) { toast.error('That person is already the primary owner'); return; }
    if (owners.some((o) => o.user_id === userId)) return;
    void save([...owners.map((o) => o.user_id), userId]);
  };
  const remove = (userId: string) => { if (!saving) void save(owners.filter((o) => o.user_id !== userId).map((o) => o.user_id)); };

  // Don't offer the primary owner or an existing co-owner in the picker.
  const pickable = useMemo(() => {
    const taken = new Set<string>([...(primaryOwnerId ? [primaryOwnerId] : []), ...owners.map((o) => o.user_id)]);
    return users.filter((u) => !taken.has(u.id));
  }, [users, owners, primaryOwnerId]);

  const body = () => {
    if (state === 'loading') return <div style={{ fontSize: 13, color: T.mute }}>Loading owners…</div>;
    if (state === 'error') return <div style={{ fontSize: 13, color: T.dim }}>Couldn’t load owners</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {/* Primary owner, shown first and marked, never removable here (change it on the owner control). */}
          {(primaryOwnerName || primaryOwnerId) && (
            <span style={chip(true)}>
              {primaryOwnerName || 'Owner'}
              <span style={{ fontSize: 9.5, fontWeight: 700, color: T.mute, marginLeft: 2 }}>PRIMARY</span>
            </span>
          )}
          {owners.map((o) => (
            <span key={o.user_id} style={chip(false)}>
              {o.name || 'User'}
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${o.name || 'co-owner'}`}
                  onClick={() => remove(o.user_id)}
                  disabled={saving}
                  style={{ display: 'inline-flex', background: 'transparent', border: 0, padding: 0, marginLeft: 2, color: T.mute, cursor: saving ? 'default' : 'pointer' }}
                >
                  <X size={12} strokeWidth={2.4} aria-hidden />
                </button>
              )}
            </span>
          ))}
          {owners.length === 0 && !canEdit && <span style={{ fontSize: 12.5, color: T.mute }}>No co-owners</span>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InlineIcon icon={UserPlus} size={14} style={{ color: T.dim, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <UserSearchSelect
                ariaLabel="Add a co-owner"
                options={pickable}
                value=""
                onChange={add}
                placeholder={saving ? 'Saving…' : 'Add a co-owner…'}
                emptyLabel="None"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Defer until the field overrides are known (no flash of a hidden owner), then withhold when hidden.
  if (!fieldsLoaded || ownerHidden) return null;

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users aria-hidden size={13} strokeWidth={2} />Owners
      </Eyebrow>
      {body()}
    </Card>
  );
}

const chip = (primary: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999,
  fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
  background: primary ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : T.raised,
  color: primary ? 'var(--accent)' : T.text,
  border: `1px solid ${primary ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : T.border}`,
});
