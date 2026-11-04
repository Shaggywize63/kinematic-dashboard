'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Building2, Check, ChevronDown, ChevronRight, Handshake, ListChecks, MapPin, Receipt, UserPlus, Users,
  type LucideIcon,
} from 'lucide-react';
import { crmAccounts, type AccountJourney, type JourneyDeal, type JourneyExpense, type JourneyStep, type JourneyStepKey, type JourneyTimelineRow } from '../../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../../lib/b2bClient';
import { formatINR } from '../../../../../../lib/formatCurrency';
import { rows, eventKindMeta, journeyKpis, normalizeSteps, personName, sortedEvents, STEP_SECTION } from '../../../../../../lib/sparkAccounts';
import Breadcrumbs from '../../../../../../components/crm/shared/Breadcrumbs';
import { Badge, Button, Card, EmptyState, T, eyebrowStyle, useIsCompact, type Tone } from '../../../../../../components/ui';
import { fmtDate, fmtIST, relTime } from '../../../../../../components/crm/lead-detail/format';

const STEP_ICON: Record<JourneyStepKey, LucideIcon> = {
  lead: UserPlus, account: Building2, contacts: Users, visits: MapPin, followups: ListChecks, deals: Handshake, expenses: Receipt,
};

/**
 * Spark & Ray account journey: the whole path of one customer — lead → account → contacts → visits & forms →
 * tasks & updates → deals & quotations → expenses — drawn as a flow, with the detail of every stage below it
 * and one merged "what happened" feed. Reads defensively: any array may be empty or missing.
 */
export default function AccountJourneyPage() {
  const { id } = useParams<{ id: string }>();
  const narrow = useIsCompact(760);
  const spark = isB2bClientActive();
  const [data, setData] = useState<AccountJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<JourneyStepKey | null>(null);

  const load = useCallback(async () => {
    if (!id || !spark) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await crmAccounts.journey(id);
      const body = (r && typeof r === 'object' && 'data' in r ? (r as { data?: AccountJourney | null }).data : (r as unknown as AccountJourney)) || {};
      setData(body && typeof body === 'object' ? body : {});
    } catch (e) {
      setData(null);
      setError((e as { message?: string })?.message || 'Could not load the journey');
    } finally {
      setLoading(false);
    }
  }, [id, spark]);
  useEffect(() => { void load(); }, [load]);

  const steps = useMemo(() => normalizeSteps(data?.steps), [data]);
  const kpis = useMemo(() => journeyKpis(data), [data]);
  const events = useMemo(() => sortedEvents(data?.events), [data]);
  const name = (data?.account?.name as string | undefined) || 'Account';

  const jumpTo = (key: JourneyStepKey) => {
    setFocus((f) => (f === key ? null : key));
    const el = typeof document !== 'undefined' ? document.getElementById(STEP_SECTION[key]) : null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const crumbs = (
    <Breadcrumbs items={[
      { label: 'CRM', href: '/dashboard/crm/dashboard' },
      { label: 'Accounts', href: '/dashboard/crm/accounts' },
      { label: name, href: `/dashboard/crm/accounts/${id}` },
      { label: 'Journey' },
    ]} />
  );

  if (!spark) {
    return (
      <div>
        {crumbs}
        <EmptyState title="Journey is not available" description="The account journey is part of the Spark & Ray workspace." action={<Button href={`/dashboard/crm/accounts/${id}`}>Back to account</Button>} />
      </div>
    );
  }
  if (loading) return <div style={{ color: T.dim }} data-testid="journey-loading">Loading journey…</div>;
  if (error || !data) {
    return (
      <div>
        {crumbs}
        <EmptyState title="Could not load the journey" description={error || 'Please try again.'} action={<Button onClick={() => void load()}>Retry</Button>} />
      </div>
    );
  }

  const dim = (key: JourneyStepKey) => (focus && focus !== key ? 0.45 : 1);

  return (
    <div data-testid="account-journey" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {crumbs}

      {/* ── Header: who + KPI chips ───────────────────────────────────────────── */}
      <div id="journey-top" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>Account journey</div>
          <h1 data-testid="journey-account-name" style={{ margin: '4px 0 0', fontFamily: T.heading, fontSize: narrow ? 22 : 26, fontWeight: 800, color: T.text, overflowWrap: 'anywhere' }}>{name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button href={`/dashboard/crm/accounts/${id}`}>Account</Button>
          <Button variant="primary" href={`/dashboard/crm/deals/new?account_id=${id}`}>New deal</Button>
        </div>
      </div>

      <div data-testid="journey-kpis" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label="Visits" value={String(kpis.visits)} />
        <Kpi label="Forms" value={String(kpis.forms)} />
        <Kpi label="Open deals value" value={formatINR(kpis.openDealValue)} />
        <Kpi label="Quotations" value={String(kpis.quotations)} />
        <Kpi label="Expenses" value={String(kpis.expenses)} />
      </div>

      {/* ── The flow ─────────────────────────────────────────────────────────── */}
      <Card padding={narrow ? 16 : 24}>
        <Flow steps={steps} narrow={narrow} focus={focus} onPick={jumpTo} />
      </Card>

      {/* ── Detail sections ──────────────────────────────────────────────────── */}
      <Section id={STEP_SECTION.lead} title="Leads" count={rows(data.leads).length} dim={dim('lead')} focused={focus === 'lead'}>
        {rows<NonNullable<AccountJourney['leads']>[number]>(data.leads).length === 0 ? <Empty text="No lead is linked to this account." /> : (
          <Rows>
            {rows<NonNullable<AccountJourney['leads']>[number]>(data.leads).map((l) => (
              <RowLink key={l.id} href={`/dashboard/crm/leads/${l.id}`}
                title={personName(l, l.company || 'Lead')} sub={[l.company, l.status].filter(Boolean).join(' · ')} right={fmtDate(l.created_at)} />
            ))}
          </Rows>
        )}
      </Section>

      <Section id={STEP_SECTION.contacts} title="Contacts" count={rows(data.contacts).length} dim={dim('contacts')} focused={focus === 'contacts'}>
        {rows<NonNullable<AccountJourney['contacts']>[number]>(data.contacts).length === 0 ? <Empty text="No contact people yet." /> : (
          <Rows>
            {rows<NonNullable<AccountJourney['contacts']>[number]>(data.contacts).map((c) => (
              <RowLink key={c.id} href={`/dashboard/crm/contacts/${c.id}`}
                title={personName(c, c.email || 'Unnamed')} sub={[c.title, c.phone, c.email].filter(Boolean).join(' · ')} right={fmtDate(c.created_at)} />
            ))}
          </Rows>
        )}
      </Section>

      <Section id="journey-updates" title="Recent updates" count={rows(data.updates).length} dim={dim('followups')} focused={focus === 'followups'}>
        {rows(data.updates).length === 0 ? <Empty text="No updates logged on this account." /> : (
          <Rows>
            {rows<NonNullable<AccountJourney['updates']>[number]>(data.updates).map((u, i) => (
              <div key={u.id || i} style={rowBox}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 13, color: T.text }}>{u.author_name || 'Someone'}</strong>
                  {u.contact_name && <Badge tone="info">with {u.contact_name}</Badge>}
                  <span style={{ fontSize: 11, color: T.mute }} title={fmtIST(u.created_at)}>{relTime(u.created_at)}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>{u.body}</div>
              </div>
            ))}
          </Rows>
        )}
      </Section>

      <Section id={STEP_SECTION.visits} title="Visits & forms" count={rows(data.visits).length + rows(data.forms).length} dim={dim('visits')} focused={focus === 'visits'}>
        {rows(data.visits).length + rows(data.forms).length === 0 ? <Empty text="No visits or forms captured yet." /> : (
          <Rows>
            {[...rows<JourneyTimelineRow>(data.visits), ...rows<JourneyTimelineRow>(data.forms)]
              .sort((a, b) => (Date.parse(b?.at ?? '') || 0) - (Date.parse(a?.at ?? '') || 0))
              .map((r, i) => (
                <div key={`${r.kind}-${r.id ?? i}`} style={rowBox}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Dot color={eventKindMeta(r.kind).color} />
                    <strong style={{ fontSize: 13, color: T.text, overflowWrap: 'anywhere' }}>{r.title || eventKindMeta(r.kind).label}</strong>
                    {r.ref_no && <RefPill>{r.ref_no}</RefPill>}
                    {r.status && <Badge>{r.status}</Badge>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: T.mute }} title={fmtIST(r.at)}>{fmtIST(r.at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: T.dim }}>{[r.user_name ? `by ${r.user_name}` : '', r.detail || r.form_title || ''].filter(Boolean).join(' · ')}</div>
                </div>
              ))}
          </Rows>
        )}
      </Section>

      <Section id={STEP_SECTION.followups} title="Tasks" count={rows(data.activities).length} dim={dim('followups')} focused={focus === 'followups'}>
        {rows(data.activities).length === 0 ? <Empty text="No tasks or follow-ups yet." /> : (
          <Rows>
            {rows<JourneyTimelineRow>(data.activities).map((r, i) => (
              <div key={r.id ?? i} style={rowBox}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Dot color={eventKindMeta('activity').color} />
                  <strong style={{ fontSize: 13, color: T.text, overflowWrap: 'anywhere' }}>{r.title || 'Task'}</strong>
                  {r.status && <Badge tone={/done|complete/i.test(r.status) ? 'ok' : 'neutral'}>{r.status}</Badge>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: T.mute }}>{fmtIST(r.at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: T.dim }}>{[r.user_name ? `by ${r.user_name}` : '', r.detail || ''].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </Rows>
        )}
      </Section>

      <Section id={STEP_SECTION.deals} title="Deals & quotations" count={rows(data.deals).length} dim={dim('deals')} focused={focus === 'deals'}>
        <DealsTable deals={rows<JourneyDeal>(data.deals)} />
      </Section>

      <Section id={STEP_SECTION.expenses} title="Expenses" count={rows(data.expenses).length} dim={dim('expenses')} focused={focus === 'expenses'}>
        {rows(data.expenses).length === 0 ? <Empty text="No expense claims against this account." /> : (
          <Rows>
            {rows<JourneyExpense>(data.expenses).map((c, i) => (
              <div key={c.id ?? i} style={rowBox} data-testid="journey-expense">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13, color: T.text, fontFamily: T.mono }}>{c.claim_no || 'Claim'}</strong>
                  {c.status && <Badge tone={/approved|paid/i.test(c.status) ? 'ok' : /reject/i.test(c.status) ? 'red' : 'neutral'}>{c.status}</Badge>}
                  {c.form_ref_no && <RefPill title="Linked form">{c.form_ref_no}</RefPill>}
                  <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 13, fontWeight: 650, color: T.text }}>{c.total_amount != null ? formatINR(c.total_amount) : ''}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: T.mute }}>{fmtIST(c.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
            ))}
          </Rows>
        )}
      </Section>

      {/* ── What happened ────────────────────────────────────────────────────── */}
      <Section id="journey-feed" title="What happened" count={events.length}>
        {events.length === 0 ? <Empty text="Nothing has happened on this account yet." /> : (
          <ol data-testid="journey-feed" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((e, i) => {
              const m = eventKindMeta(e.kind);
              const last = i === events.length - 1;
              return (
                <li key={`${e.kind}-${i}`} data-testid="journey-event" style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: last ? 0 : 16 }}>
                  {!last && <span aria-hidden style={{ position: 'absolute', left: 5, top: 16, bottom: 0, width: 2, background: T.border }} />}
                  <span aria-hidden title={m.label} style={{ width: 12, height: 12, marginTop: 4, borderRadius: 999, background: m.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${m.color} 20%, transparent)`, flexShrink: 0, position: 'relative', zIndex: 1 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: m.color }}>{m.label}</span>
                      <strong style={{ fontSize: 13.5, color: T.text, overflowWrap: 'anywhere' }}>{e.title}</strong>
                      {e.ref && <RefPill>{e.ref}</RefPill>}
                      <span style={{ fontSize: 11, color: T.mute }} title={fmtIST(e.at)}>{relTime(e.at)}</span>
                    </div>
                    {(e.detail || e.who) && (
                      <div style={{ marginTop: 2, fontSize: 12.5, color: T.dim, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {[e.who, e.detail].filter(Boolean).join(' — ')}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}

// ── The flow ───────────────────────────────────────────────────────────────

function Flow({ steps, narrow, focus, onPick }: { steps: JourneyStep[]; narrow: boolean; focus: JourneyStepKey | null; onPick: (k: JourneyStepKey) => void }) {
  return (
    <ol data-testid="journey-flow" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'stretch' : 'flex-start', gap: 0, overflowX: narrow ? undefined : 'auto' }}>
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const lit = s.state !== 'todo' && next && next.state !== 'todo';
        return (
          <li key={s.key} style={{ display: 'flex', flexDirection: narrow ? 'row' : 'column', alignItems: narrow ? 'stretch' : 'center', flex: narrow ? undefined : '1 1 0', minWidth: narrow ? undefined : 108, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: 'center', width: narrow ? 52 : '100%', flexShrink: 0 }}>
              {/* connector in (horizontal only) */}
              {!narrow && <Connector on={i > 0 && steps[i - 1].state !== 'todo' && s.state !== 'todo'} hidden={i === 0} />}
              {narrow && <Connector vertical on={i > 0 && steps[i - 1].state !== 'todo' && s.state !== 'todo'} hidden={i === 0} />}
              <Node step={s} active={focus === s.key} onClick={() => onPick(s.key)} />
              {!narrow && <Connector on={!!lit} hidden={i === steps.length - 1} />}
              {narrow && <Connector vertical on={!!lit} hidden={i === steps.length - 1} grow />}
            </div>
            <div style={{ textAlign: narrow ? 'left' : 'center', padding: narrow ? '12px 0 12px 12px' : '10px 6px 0', minWidth: 0, flex: narrow ? 1 : undefined }}>
              <button
                type="button"
                onClick={() => onPick(s.key)}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'inherit', color: s.state === 'todo' ? T.mute : T.text, fontSize: 13, fontWeight: 650 }}
              >
                {s.label}
              </button>
              <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: s.state === 'todo' ? T.mute : s.state === 'current' ? T.red : T.text, marginTop: 2 }} data-testid={`journey-count-${s.key}`}>{s.count}</div>
              {s.note && <div style={{ fontSize: 11.5, color: T.dim, marginTop: 2, overflowWrap: 'anywhere' }}>{s.note}</div>}
              {s.at && <div style={{ fontSize: 10.5, color: T.mute, marginTop: 2 }}>since {fmtDate(s.at)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Connector({ on, hidden, vertical, grow }: { on: boolean; hidden?: boolean; vertical?: boolean; grow?: boolean }) {
  const line = on ? `2px solid ${T.ok}` : `2px dashed ${T.border}`;
  if (vertical) return <span aria-hidden style={{ width: 0, height: grow ? undefined : 12, flex: grow ? 1 : undefined, minHeight: 12, borderLeft: hidden ? '2px solid transparent' : line }} />;
  return <span aria-hidden style={{ flex: 1, height: 0, minWidth: 8, borderTop: hidden ? '2px solid transparent' : line }} />;
}

function Node({ step, active, onClick }: { step: JourneyStep; active: boolean; onClick: () => void }) {
  const reduce = useReducedMotion();
  const Icon = STEP_ICON[step.key];
  const done = step.state === 'done';
  const current = step.state === 'current';
  const color = current ? T.red : done ? T.ok : T.mute;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${step.label}: ${step.count}`}
      aria-pressed={active}
      data-state={step.state}
      data-testid={`journey-node-${step.key}`}
      style={{
        position: 'relative', width: 52, height: 52, borderRadius: 999, flexShrink: 0, cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color,
        background: current ? T.redWash : done ? T.okWash : 'transparent',
        border: step.state === 'todo' ? `2px dashed ${T.border}` : `2px solid ${color}`,
        outline: active ? `3px solid ${T.ring}` : 'none', outlineOffset: 2,
      }}
    >
      {current && !reduce && (
        <motion.span
          aria-hidden
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -2, borderRadius: 999, border: `2px solid ${T.red}`, pointerEvents: 'none' }}
        />
      )}
      <Icon size={22} strokeWidth={1.8} aria-hidden />
      {done && (
        <span aria-hidden style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 999, background: T.ok, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card)' }}>
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

const rowBox: React.CSSProperties = { padding: '10px 12px', background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 10 };

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', minWidth: 110 }}>
      <div style={{ ...eyebrowStyle, fontSize: 10 }}>{label}</div>
      <div style={{ marginTop: 2, fontFamily: T.mono, fontSize: 17, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function Section({ id, title, count, children, dim = 1, focused }: { id: string; title: string; count?: number; children: React.ReactNode; dim?: number; focused?: boolean }) {
  return (
    <section id={id} aria-label={title} style={{ scrollMarginTop: 80, opacity: dim, transition: 'opacity .2s ease' }}>
      <Card padding={0} style={focused ? { borderColor: T.red } : undefined}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</h2>
          {typeof count === 'number' && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>{count}</span>}
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </Card>
    </section>
  );
}

const Rows = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>;
const Empty = ({ text }: { text: string }) => <div style={{ fontSize: 13, color: T.dim }}>{text}</div>;
const Dot = ({ color }: { color: string }) => <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />;
const RefPill = ({ children, title = 'Form serial' }: { children: React.ReactNode; title?: string }) => (
  <span title={title} data-testid="ref-pill" style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 650, padding: '1px 8px', borderRadius: 999, background: T.okWash, color: T.ok, whiteSpace: 'nowrap' }}>{children}</span>
);

function RowLink({ href, title, sub, right }: { href: string; title: string; sub?: string; right?: string }) {
  return (
    <Link href={href} className="km-navrow" style={{ ...rowBox, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: T.dim, overflowWrap: 'anywhere' }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize: 11, color: T.mute, whiteSpace: 'nowrap' }}>{right}</div>}
    </Link>
  );
}

const STATUS_TONE: Record<string, Tone> = { won: 'ok', lost: 'red', open: 'info' };

function DealsTable({ deals }: { deals: JourneyDeal[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (deals.length === 0) return <Empty text="No deals or quotations yet." />;
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', ...eyebrowStyle, fontSize: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-testid="journey-deals" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 28 }} aria-label="Expand" />
            <th style={th}>Quotation</th>
            <th style={th}>Deal</th>
            <th style={th}>Stage</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            <th style={th}>Expected close</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => {
            const key = d.id || String(i);
            const items = rows<NonNullable<JourneyDeal['items']>[number]>(d.items);
            const isOpen = open.has(key);
            return (
              <FragmentRows key={key}>
                <tr data-testid="journey-deal-row">
                  <td style={td}>
                    {items.length > 0 && (
                      <button type="button" onClick={() => toggle(key)} aria-label={isOpen ? 'Hide line items' : 'Show line items'} aria-expanded={isOpen} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: T.dim, display: 'inline-flex' }}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    )}
                  </td>
                  <td style={td}>{d.quotation_no ? <RefPill title="Quotation number">{d.quotation_no}</RefPill> : <span style={{ color: T.mute }}>—</span>}</td>
                  <td style={td}>
                    {d.id ? <Link href={`/dashboard/crm/deals/${d.id}`} className="km-entity-link">{d.name || 'Deal'}</Link> : (d.name || 'Deal')}
                    {d.status && <span style={{ marginLeft: 8 }}><Badge tone={STATUS_TONE[d.status] ?? 'neutral'} style={{ textTransform: 'capitalize' }}>{d.status}</Badge></span>}
                  </td>
                  <td style={td}>{d.stage_name || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: T.mono, fontWeight: 650 }}>{formatINR(d.amount)}</td>
                  <td style={td}>{d.expected_close_date ? fmtDate(d.expected_close_date) : '—'}</td>
                </tr>
                {isOpen && items.length > 0 && (
                  <tr data-testid="journey-deal-items">
                    <td />
                    <td colSpan={5} style={{ ...td, background: 'var(--s3)' }}>
                      {items.map((it, j) => (
                        <div key={j} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
                          <span style={{ overflowWrap: 'anywhere' }}>{it.name}</span>
                          <span style={{ fontFamily: T.mono, color: T.dim, whiteSpace: 'nowrap' }}>{Number(it.quantity) || 0} × {formatINR(it.unit_price)} = <strong style={{ color: T.text }}>{formatINR((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</strong></span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// <tbody> children must be rows; a keyed fragment keeps the pair together without a wrapper element.
function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }
