'use client';
// Help & Support. A customer (client company) raises tickets and follows them here; the platform operator gets every
// customer's tickets on the same page ("Support inbox"), decided by the server's `is_operator`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LifeBuoy, Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, Input, PageHeader, Select, T, useIsCompact } from '../../../components/ui';
import RaiseTicketModal from '../../../components/support/RaiseTicketModal';
import TicketDrawer from '../../../components/support/TicketDrawer';
import { ChannelTag, CsatStars, PlatformTags, PriorityTag, RelTime, StatusPill } from '../../../components/support/ui';
import { usePageTitle } from '../../../lib/pageTitle';
import {
  ACTIVE_STATUSES, ALL_STATUSES, AREA_LABEL, AREAS, CATEGORIES, CATEGORY_LABEL, CATEGORY_SHORT,
  PLATFORM_LABEL, PLATFORMS, statusLabel, supportApi, supportError,
  type StatusFilter, type Ticket, type TicketArea, type TicketCategory, type TicketPlatform, type TicketStatus,
} from '../../../lib/supportApi';

const FILTERS: StatusFilter[] = ['active', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed', 'all'];
// ?ticket=<id> opens that ticket, so a link from a notification lands on it.
const TICKET_PARAM = 'ticket';

function filterLabel(f: StatusFilter, isOperator: boolean): string {
  if (f === 'active') return 'Active';
  if (f === 'all') return 'All';
  return statusLabel(f, isOperator);
}

function setTicketParam(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(TICKET_PARAM, id); else url.searchParams.delete(TICKET_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* ignore */ }
}

export default function SupportPage() {
  const narrow = useIsCompact(900);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [platform, setPlatform] = useState<TicketPlatform | ''>('');
  const [area, setArea] = useState<TicketArea | ''>('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Partial<Record<TicketStatus, number>>>({});
  const [isOperator, setIsOperator] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [raising, setRaising] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openInitial, setOpenInitial] = useState<Ticket | null>(null);
  const requestSeq = useRef(0);

  const title = isOperator ? 'Support inbox' : 'Help & Support';
  usePageTitle(title);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async (opts: { quiet?: boolean } = {}) => {
    const seq = ++requestSeq.current;
    if (!opts.quiet) setLoading(true);
    try {
      // Only operators see the search box, so a customer's query is always empty.
      const r = await supportApi.list(filter, debouncedQuery || undefined, { category, platform, area });
      if (seq !== requestSeq.current) return; // a newer request (filter / search change) owns the list
      setTickets(r.tickets);
      setCounts(r.counts);
      setIsOperator(r.is_operator);
      setError('');
      setLoaded(true);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(supportError(e, 'Could not load support tickets.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filter, debouncedQuery, category, platform, area]);

  useEffect(() => { void load(); }, [load]);

  // Deep link: open ?ticket=<id> on first paint.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get(TICKET_PARAM);
      if (id) setOpenId(id);
    } catch { /* ignore */ }
  }, []);

  const openTicket = useCallback((t: Ticket | string) => {
    const id = typeof t === 'string' ? t : t.id;
    setOpenInitial(typeof t === 'string' ? null : t);
    setOpenId(id);
    setTicketParam(id);
  }, []);

  const closeTicket = useCallback(() => {
    setOpenId(null);
    setOpenInitial(null);
    setTicketParam(null);
    // Counts / tab membership may have moved while the drawer was open.
    void load({ quiet: true });
  }, [load]);

  const onTicketChanged = useCallback((t: Ticket) => {
    setTickets((list) => list.map((x) => (x.id === t.id ? t : x)));
  }, []);

  const onCreated = (t: Ticket) => {
    setRaising(false);
    toast.success(`Ticket ${t.ref} raised. We'll update you here and on WhatsApp.`);
    openTicket(t);
    void load({ quiet: true });
  };

  const countFor = (f: StatusFilter): number | null => {
    if (!loaded) return null;
    const n = (s: TicketStatus) => counts[s] ?? 0;
    if (f === 'active') return ACTIVE_STATUSES.reduce((a, s) => a + n(s), 0);
    if (f === 'all') return ALL_STATUSES.reduce((a, s) => a + n(s), 0);
    return n(f);
  };

  const totalAll = loaded ? ALL_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0) : 0;
  // The extra filters are noise for a customer with a couple of tickets; operators always get them.
  const showFilters = isOperator || totalAll > 3 || !!category || !!platform || !!area;
  const clearFilters = () => { setCategory(''); setPlatform(''); setArea(''); };

  const description = isOperator
    ? 'Every customer\'s tickets. Update the status and reply; the customer is told on WhatsApp.'
    : 'Raise a ticket with the Kinematic team and follow it here. We reply here and on WhatsApp.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <PageHeader title={title} description={description} compact={narrow} icon="help"
        actions={(
          <Button variant="primary" toolbar icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setRaising(true)}>
            Raise a ticket
          </Button>
        )} />

      {/* Status tabs + operator search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Ticket status" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          {FILTERS.map((f) => {
            const on = f === filter;
            const c = countFor(f);
            return (
              <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)}
                style={{
                  height: 30, padding: '0 11px', borderRadius: T.radius.pill, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${on ? T.text : T.border}`, background: on ? T.text : T.card, color: on ? T.card : T.dim,
                  transition: 'background .12s ease, color .12s ease',
                }}>
                {filterLabel(f, isOperator)}
                {c != null && (
                  <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, opacity: on ? 0.85 : 1, color: on ? T.card : T.mute }}>{c}</span>
                )}
              </button>
            );
          })}
        </div>
        {isOperator && (
          <div style={{ position: 'relative', flex: narrow ? '1 1 100%' : '0 1 300px', minWidth: 0 }}>
            <Search size={15} strokeWidth={1.6} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tickets"
              placeholder="Search ref, subject, company, phone" style={{ paddingLeft: 32 }} />
          </div>
        )}
      </div>

      {showFilters && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <FilterSelect label="Type" value={category} onChange={(v) => setCategory(v as TicketCategory | '')}
            allLabel="All types" options={CATEGORIES.map((c) => [c, CATEGORY_SHORT[c] ?? CATEGORY_LABEL[c]])} narrow={narrow} />
          <FilterSelect label="Platform" value={platform} onChange={(v) => setPlatform(v as TicketPlatform | '')}
            allLabel="All platforms" options={PLATFORMS.map((p) => [p, PLATFORM_LABEL[p]])} narrow={narrow} />
          <FilterSelect label="Area" value={area} onChange={(v) => setArea(v as TicketArea | '')}
            allLabel="All areas" options={AREAS.map((a) => [a, AREA_LABEL[a]])} narrow={narrow} />
          {(category || platform || area) && (
            <Button size="sm" onClick={clearFilters}>Clear</Button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }}>
          <span>{error}</span>
          <Button size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {loading && tickets.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: T.mute, fontSize: 13.5 }}>Loading tickets…</div>
        ) : tickets.length === 0 ? (
          error ? (
            <EmptyState title="Tickets could not be loaded" description="Check your connection and try again." />
          ) : (
            <EmptyState icon={<LifeBuoy size={20} strokeWidth={1.8} />}
              title={emptyTitle(filter, isOperator, !!debouncedQuery)}
              description={debouncedQuery && isOperator
                ? 'Try another ref, subject, company or phone number.'
                : isOperator ? 'Nothing waiting here.' : 'Stuck on something, or found a bug? Raise a ticket and we will get back to you.'}
              action={!isOperator && (filter === 'active' || filter === 'all') ? (
                <Button variant="primary" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setRaising(true)}>Raise a ticket</Button>
              ) : undefined} />
          )
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: loading ? 0.6 : 1, transition: 'opacity .12s ease' }}>
            {tickets.map((t, i) => (
              <li key={t.id} style={{ borderTop: i === 0 ? 0 : `1px solid ${T.border}` }}>
                <TicketRow ticket={t} isOperator={isOperator} narrow={narrow} active={t.id === openId} onOpen={() => openTicket(t)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {raising && <RaiseTicketModal onClose={() => setRaising(false)} onCreated={onCreated} />}
      {openId && (
        <TicketDrawer ticketId={openId} initial={openInitial} isOperator={isOperator}
          onClose={closeTicket} onChanged={onTicketChanged} />
      )}
    </div>
  );
}

/** One labelled dropdown in the filter row, with an "all" option that clears it. */
function FilterSelect({ label, value, onChange, allLabel, options, narrow }: {
  label: string; value: string; onChange: (v: string) => void; allLabel: string;
  options: Array<[string, string]>; narrow: boolean;
}) {
  const id = `support-filter-${label.toLowerCase()}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: narrow ? '1 1 140px' : '0 0 auto', minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 11.5, color: T.mute }}>{label}</label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ height: 32, fontSize: 12.5, minWidth: narrow ? 0 : 150 }}>
        <option value="">{allLabel}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    </div>
  );
}

function emptyTitle(f: StatusFilter, isOperator: boolean, searching: boolean): string {
  if (searching) return 'No tickets match your search';
  if (f === 'active') return isOperator ? 'No open tickets' : 'You have no open tickets';
  if (f === 'all') return isOperator ? 'No tickets yet' : 'You have not raised any tickets yet';
  return `No ${statusLabel(f, isOperator).toLowerCase()} tickets`;
}

function TicketRow({ ticket: t, isOperator, narrow, active, onOpen }: {
  ticket: Ticket; isOperator: boolean; narrow: boolean; active: boolean; onOpen: () => void;
}) {
  const who = [t.contact_name, t.contact_phone].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onOpen} className="km-navrow" aria-label={`${t.ref}: ${t.subject}`}
      style={{
        width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 0, color: T.text,
        background: active ? 'var(--s3)' : 'transparent', padding: narrow ? '12px 14px' : '14px 18px',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, flexShrink: 0 }}>{t.ref}</span>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t.subject}</span>
        </div>
        {isOperator && (t.org_name || who) && (
          <div style={{ fontSize: 12.5, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.org_name && <span style={{ color: T.text, fontWeight: 500 }}>{t.org_name}</span>}
            {t.org_name && who ? ' · ' : ''}{who}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
          {narrow && <StatusPill status={t.status} isOperator={isOperator} />}
          <PriorityTag priority={t.priority} />
          <span aria-hidden style={{ color: T.mute }}>·</span>
          <span>{CATEGORY_SHORT[t.category] ?? t.category}</span>
          {!!t.platforms?.length && <PlatformTags platforms={t.platforms} />}
          <span aria-hidden style={{ color: T.mute }}>·</span>
          <ChannelTag channel={t.channel} />
          {!!t.csat_rating && (
            <>
              <span aria-hidden style={{ color: T.mute }}>·</span>
              <CsatStars rating={t.csat_rating} size={12} showLabel={false} />
            </>
          )}
          {narrow && <><span aria-hidden style={{ color: T.mute }}>·</span><RelTime iso={t.created_at} /></>}
        </div>
      </div>
      {!narrow && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusPill status={t.status} isOperator={isOperator} />
          <RelTime iso={t.created_at} />
        </div>
      )}
    </button>
  );
}
