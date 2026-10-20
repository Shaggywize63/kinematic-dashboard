'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, ChevronDown, FileText, Link2, MoreHorizontal, Pencil, Phone, RotateCcw, Search, Trash2, UserPlus, XCircle } from 'lucide-react';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import type { LeadStatusOption } from '../../../lib/crmLeadStatuses';
import { isValidWaPhone, waLink } from '../../../lib/whatsapp';
import { callComposerUrl, dialableNumber } from '../shared/CallButton';
import { WA_PATH } from '../shared/WhatsAppButton';
import InlineEditText from '../InlineEditText';
import LeadAvatar from '../leads/LeadAvatar';
import { Avatar, Badge, Button, Card, IconButton, T, buttonStyle } from '../../ui';
import StatusControl from './StatusControl';
import { fmtDate, fmtIST } from './format';
import { menuItemStyle, menuPanelStyle, useDismiss } from './useDismiss';
import type { LifecycleLead, UserOption } from './types';

export interface LeadHeroProps {
  lead: LifecycleLead;
  fullName: string;
  /** Title · company (or city, country) — already gated through the field overrides. */
  subtitle: string;
  /** The client's own name for this lead's segment ("Dealer" / "Farmers" / B2B / B2C). */
  segment: string;
  isB2C: boolean;
  fields: FieldHelpers;
  leadStatuses: LeadStatusOption[] | null;
  closed: { converted: boolean; unqualified: boolean; lost: boolean };
  narrow: boolean;
  canEdit: boolean;
  /** Assign menu: not own-scope, and the client's admin-only rule allows this viewer. */
  canAssign: boolean;
  users: UserOption[];
  usersLoading: boolean;
  onLoadUsers: () => void;
  onAssign: (id: string, name: string) => void;
  onRename: (next: string) => Promise<void>;
  onStatusChange: (next: string) => Promise<void>;
  onEdit: () => void;
  onProposal: () => void;
  onConvert: () => void;
  converting: boolean;
  onReopen: () => void;
  reopening: boolean;
  onDisqualify: (outcome: 'unqualified' | 'lost') => void;
  onDelete: () => void;
  deleting: boolean;
}

const actionBtn = (variant: 'secondary' | 'primary' = 'secondary'): React.CSSProperties => ({ ...buttonStyle(variant, 'md'), textDecoration: 'none' });

export default function LeadHero(p: LeadHeroProps) {
  const { lead, fields } = p;
  const router = useRouter();
  const closedAny = p.closed.converted || p.closed.unqualified || p.closed.lost;
  const phoneShown = !fields.isHidden('phone');
  const dial = phoneShown ? dialableNumber(lead.phone) : null;
  const canWa = phoneShown && isValidWaPhone(lead.phone);
  const firstName = (lead.first_name || p.fullName).split(' ')[0];
  const ownerName = lead.owner_name || 'Unassigned';

  return (
    <Card padding={p.narrow ? 16 : 20}>
      <div style={{ display: 'flex', flexDirection: p.narrow ? 'column' : 'row', alignItems: p.narrow ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: p.narrow ? 14 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: p.narrow ? 12 : 16, minWidth: 0, flex: 1 }}>
          <LeadAvatar lead={lead} size={p.narrow ? 48 : 60} />
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              {/* Inline per-field edit — change just the name in place. Saves first/last only. */}
              <InlineEditText
                value={p.fullName}
                ariaLabel="Edit name"
                displayStyle={{ fontFamily: T.heading, fontSize: p.narrow ? 19 : 24, fontWeight: 700, letterSpacing: '-0.015em', color: T.text, overflowWrap: 'anywhere', lineHeight: 1.2 }}
                inputStyle={{ fontSize: 20, fontWeight: 700, minWidth: 220 }}
                onSave={p.onRename}
              />
              <Badge tone={p.isB2C ? 'neutral' : 'info'}>{p.segment}</Badge>
              {p.closed.converted && <Badge tone="ok" dot>Converted</Badge>}
              {p.closed.unqualified && <Badge tone="warn" dot>Unqualified</Badge>}
              {p.closed.lost && <Badge tone="red" dot>Lost</Badge>}
            </div>
            {/* Imported data can put a whole URL + legal name in "company" — clamp it so it can't push the header around. */}
            {p.subtitle && (
              <div
                title={p.subtitle.length > 80 ? p.subtitle : undefined}
                style={{ fontSize: 13.5, color: T.dim, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >{p.subtitle}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px 18px', flexWrap: 'wrap', marginTop: 2, fontSize: 13, color: T.dim }}>
              {!fields.isHidden('status') && (
                <StatusControl status={lead.status} custom={p.leadStatuses} onChange={p.onStatusChange} />
              )}
              {!fields.isHidden('owner_id') && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Avatar name={lead.owner_name || '?'} size={20} />
                  <span style={{ color: T.text }}>{`${fields.labelFor('owner_id', 'Owner')}: ${ownerName}`}</span>
                  {p.canAssign && <AssignMenu users={p.users} loading={p.usersLoading} onOpen={p.onLoadUsers} onPick={p.onAssign} />}
                </span>
              )}
              {!fields.isHidden('source_id') && lead.source_name && (
                <span>{fields.labelFor('source_id', 'Source')} <span style={{ color: T.text, fontWeight: 600 }}>{lead.source_name}</span></span>
              )}
              <span title={fmtIST(lead.created_at)}>Added <span style={{ color: T.text, fontWeight: 600 }}>{fmtDate(lead.created_at)}</span></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0, justifyContent: p.narrow ? 'flex-start' : 'flex-end' }}>
          {dial && (
            <a
              href={`tel:${dial}`}
              className="km-btn"
              data-variant="secondary"
              title="Call and log the activity"
              // Same behaviour as the Call button everywhere else: dial, then land in the pre-filled "log this call" composer.
              onClick={() => window.setTimeout(() => router.push(callComposerUrl({ subject: `Call with ${p.fullName}`, leadId: lead.id })), 50)}
              style={actionBtn()}
            >
              <Phone size={15} strokeWidth={1.8} color="var(--ok)" aria-hidden />Call
            </a>
          )}
          {canWa && (
            <a
              href={waLink(lead.phone!, `Hi ${firstName}, `)}
              target="_blank"
              rel="noopener noreferrer"
              className="km-btn"
              data-variant="secondary"
              title="Open in WhatsApp"
              style={actionBtn()}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="#25D366" aria-hidden><path d={WA_PATH} /></svg>WhatsApp
            </a>
          )}
          <Button onClick={p.onProposal} icon={<FileText size={15} strokeWidth={1.8} />}>Proposal</Button>
          {closedAny ? (
            <Button variant="primary" onClick={p.onReopen} disabled={p.reopening} icon={<RotateCcw size={15} strokeWidth={1.8} />}>
              {p.reopening ? 'Re-opening…' : 'Re-open lead'}
            </Button>
          ) : (
            <Button variant="primary" onClick={p.onConvert} disabled={p.converting} icon={<ArrowRightLeft size={15} strokeWidth={1.8} />}>
              {p.converting ? 'Converting…' : 'Convert'}
            </Button>
          )}
          {p.canEdit && (
            <IconButton label="Edit lead" onClick={p.onEdit} style={{ border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, width: 34, height: 34 }}>
              <Pencil size={15} strokeWidth={1.8} />
            </IconButton>
          )}
          <MoreMenu
            closed={closedAny}
            deleting={p.deleting}
            onDisqualify={p.onDisqualify}
            onDelete={p.onDelete}
          />
        </div>
      </div>
    </Card>
  );
}

/** Owner picker. The trigger reads "Assign" (the admin-only-owner rule hides this whole control from reps). */
function AssignMenu({ users, loading, onOpen, onPick }: { users: UserOption[]; loading: boolean; onOpen: () => void; onPick: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => { setOpen(false); setQ(''); }, []);
  useDismiss(ref, open, close);
  const searchable = users.length > 7;
  useEffect(() => { if (open && searchable) searchRef.current?.focus(); }, [open, searchable]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? users.filter((u) => u.name.toLowerCase().includes(needle)) : users;
  }, [users, q]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); onOpen(); }}
        className="km-btn"
        data-variant="ghost"
        style={{ ...buttonStyle('ghost', 'sm'), height: 24, padding: '0 6px', gap: 3, color: T.red }}
      >
        <UserPlus size={13} strokeWidth={1.8} aria-hidden />Assign<ChevronDown size={12} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div role="menu" style={{ ...menuPanelStyle, left: 0, minWidth: 232, maxHeight: 320, overflowY: 'auto' }}>
          {searchable && (
            <div style={{ position: 'relative', padding: 4 }}>
              <Search size={13} strokeWidth={1.8} aria-hidden style={{ position: 'absolute', left: 14, top: 14, color: T.mute }} />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search teammates…"
                aria-label="Search teammates"
                className="km-input"
                style={{ width: '100%', height: 32, paddingLeft: 30, borderRadius: 6, border: `1px solid ${T.border}`, background: T.field, color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          )}
          {loading && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>Loading users…</div>}
          {!loading && list.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>{users.length === 0 ? 'No users found' : 'No match'}</div>}
          {list.map((u) => (
            <button key={u.id} type="button" role="menuitem" className="km-navrow" style={menuItemStyle} onClick={() => { close(); onPick(u.id, u.name); }}>
              <Avatar name={u.name} size={20} />{u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Overflow: the rarely-used and destructive actions, out of the way of the primary ones. */
function MoreMenu({ closed, deleting, onDisqualify, onDelete }: { closed: boolean; deleting: boolean; onDisqualify: (o: 'unqualified' | 'lost') => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href.split('#')[0].split('?')[0]); toast.success('Link copied'); }
    catch { toast.error('Could not copy the link'); }
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton label="More actions" onClick={() => setOpen((o) => !o)} active={open} aria-haspopup="menu" aria-expanded={open} style={{ width: 34, height: 34, border: `1px solid ${T.border}` }}>
        <MoreHorizontal size={17} strokeWidth={1.8} />
      </IconButton>
      {open && (
        <div role="menu" style={{ ...menuPanelStyle, right: 0, minWidth: 210 }}>
          <button type="button" role="menuitem" className="km-navrow" style={menuItemStyle} onClick={run(copyLink)}>
            <Link2 size={15} strokeWidth={1.8} color="var(--dim)" aria-hidden />Copy link
          </button>
          {!closed && (
            <>
              <button type="button" role="menuitem" className="km-navrow" style={menuItemStyle} onClick={run(() => onDisqualify('unqualified'))}>
                <XCircle size={15} strokeWidth={1.8} color="var(--warn)" aria-hidden />Mark unqualified
              </button>
              <button type="button" role="menuitem" className="km-navrow" style={menuItemStyle} onClick={run(() => onDisqualify('lost'))}>
                <XCircle size={15} strokeWidth={1.8} color="var(--red)" aria-hidden />Mark lost
              </button>
            </>
          )}
          <div role="separator" style={{ height: 1, background: T.border, margin: '4px 0' }} />
          <button type="button" role="menuitem" className="km-navrow" style={{ ...menuItemStyle, color: T.red }} disabled={deleting} onClick={run(onDelete)}>
            <Trash2 size={15} strokeWidth={1.8} aria-hidden />{deleting ? 'Deleting…' : 'Delete lead'}
          </button>
        </div>
      )}
    </div>
  );
}
