'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight, ArrowRight, Briefcase, CalendarDays, MapPinned, ExternalLink, Gauge, Hash, Mail, Megaphone, MessageSquareText, Pencil, Phone, Sparkles, Tag, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { InlineIcon } from '../../ui/PageIcon';
import type { Lead, NextBestAction } from '../../../types/crm';
import type { LeadStatusOption } from '../../../lib/crmLeadStatuses';
import type { FieldHelpers } from '../../../lib/crmFieldOverrides';
import { crmAi, crmLeads, type LeadUpdate, type LeadContactLink } from '../../../lib/crmApi';
import { breakdownFactors, llmAdjustmentOf } from '../../../lib/crm/scoreFactors';
import { isValidWaPhone, waLink } from '../../../lib/whatsapp';
import { callComposerUrl, dialableNumber } from '../shared/CallButton';
import { WA_PATH } from '../shared/WhatsAppButton';
import { formatRelativeTime } from '../LeadsTable';
import LeadAvatar, { leadDisplayName } from './LeadAvatar';
import { inferGrade } from './ScoreMeter';
import { Badge, Button, IconButton, T, eyebrowStyle, type Tone } from '../../ui';
import { isB2bClientActive } from '../../../lib/b2bClient';
import { LEAD_TYPE_DEFAULT_LABEL, leadTypeLabel } from '../../../lib/leadType';

const GRADE_COLORS: Record<string, string> = { A: '#28B463', B: '#7B61FF', C: '#F7B538', D: '#E01E2C' };
const NBA_LABEL: Record<string, string> = {
  call: 'Call', meeting: 'Schedule a meeting', send_proposal: 'Send a proposal', nurture: 'Nurture', disqualify: 'Disqualify', email: 'Send an email',
};

function statusTone(status?: string | null): Tone {
  switch ((status || '').toLowerCase()) {
    case 'new': return 'info';
    case 'working': return 'warn';
    case 'qualified': case 'converted': return 'ok';
    case 'lost': return 'red';
    default: return 'neutral';
  }
}

function ScoreRing({ score, grade }: { score?: number | null; grade?: 'A' | 'B' | 'C' | 'D' | null }) {
  const g = inferGrade(score, grade);
  const color = g ? GRADE_COLORS[g] : T.mute;
  const r = 24, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 58, height: 58, flexShrink: 0 }} title={g ? `Grade ${g}` : undefined}>
      <svg width={58} height={58} viewBox="0 0 58 58" aria-hidden style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={29} cy={29} r={r} fill="none" stroke="var(--s4)" strokeWidth={5} />
        <circle cx={29} cy={29} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <span style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 800, color: T.text }}>{score == null ? '—' : Math.round(score)}</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '0.1em', color: T.mute, marginTop: 2 }}>SCORE</span>
      </span>
    </span>
  );
}

const tileStyle: React.CSSProperties = {
  height: 54, borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: T.card, color: T.text, textDecoration: 'none',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
};

// The detail grid's field icons (by detail key).
const DETAIL_ICON: Record<string, LucideIcon> = {
  ref_no: Hash, phone: Phone, email: Mail, owner_id: UserRound, source_id: Megaphone, lead_type: Tag, title: Briefcase, state: MapPinned, created: CalendarDays,
};

function Section({ title, aside, children, icon }: { title: string; aside?: ReactNode; children: ReactNode; icon?: LucideIcon }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...eyebrowStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon && <InlineIcon icon={icon} size={13} />}{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Quick preview — everything a rep needs to act on a lead without leaving the
 * list: who, how to reach them, why they score what they do, what happened
 * last, and the one-click path to the full record.
 *
 * Every built-in lead field shown here goes through the field-override
 * helpers (hidden / relabelled by the admin in Settings → Custom Fields), per
 * the contract in CLAUDE.md. The "next step" suggestion is an AI call, so it
 * only runs when asked for — never on merely opening the panel.
 */
export default function LeadPreviewPanel({
  lead, mode, isB2C, statusOptions, fieldHelpers, onClose, onEdit, onOpenScore,
}: {
  lead: Lead;
  /** dock: sits beside the list. overlay: slides over it on narrower screens. */
  mode: 'dock' | 'overlay';
  isB2C: boolean;
  statusOptions: LeadStatusOption[] | null;
  fieldHelpers?: FieldHelpers;
  onClose: () => void;
  onEdit?: (lead: Lead) => void;
  onOpenScore: (lead: Lead) => void;
}) {
  const router = useRouter();
  const hid = (k: string) => !!fieldHelpers?.isHidden(k);
  const lbl = (k: string, d: string) => fieldHelpers?.labelFor(k, d) ?? d;

  const [updates, setUpdates] = useState<LeadUpdate[] | null>(null);
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [people, setPeople] = useState<LeadContactLink[]>([]);
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null);

  // Promote a secondary person to the nodal (primary) contact — the deal's point person changes as
  // it progresses. The server returns the refreshed list (primary first), so we render from truth.
  const makePrimary = async (linkId: string) => {
    if (primaryBusy) return;
    setPrimaryBusy(linkId);
    try {
      const r = await crmLeads.setPrimaryPerson(lead.id, linkId);
      setPeople(r.data || []);
      toast.success('Primary contact updated');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not change the primary contact');
    } finally {
      setPrimaryBusy(null);
    }
  };

  // Fresh data per lead: the timeline is fetched on open, the AI suggestion is reset.
  useEffect(() => {
    let cancelled = false;
    setUpdates(null);
    setNba(null);
    crmLeads.updates(lead.id, { limit: 3 })
      .then((r) => { if (!cancelled) setUpdates(r.data || []); })
      .catch(() => { if (!cancelled) setUpdates([]); });
    return () => { cancelled = true; };
  }, [lead.id]);

  // Spark: the customer people on this lead (primary/nodal first). Empty for other tenants.
  useEffect(() => {
    if (!isB2bClientActive()) { setPeople([]); return; }
    let cancelled = false;
    setPeople([]);
    crmLeads.people(lead.id)
      .then((r) => { if (!cancelled) setPeople(r.data || []); })
      .catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, [lead.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const suggest = async () => {
    if (nbaLoading) return;
    setNbaLoading(true);
    try {
      const r = await crmAi.nextBestActionLead(lead.id);
      setNba(r.data);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not suggest a next step');
    } finally {
      setNbaLoading(false);
    }
  };

  const name = leadDisplayName(lead);
  const statusMeta = statusOptions?.find((o) => o.value.toLowerCase() === String(lead.status).toLowerCase());
  const statusStyle = statusMeta?.color ? { background: `color-mix(in srgb, ${statusMeta.color} 15%, transparent)`, color: statusMeta.color } : undefined;
  const dial = !hid('phone') ? dialableNumber(lead.phone) : null;
  const canWa = !hid('phone') && isValidWaPhone(lead.phone);
  const showEmail = !hid('email') && !!lead.email;
  const company = !isB2C && !hid('company') ? lead.company : null;
  const city = !hid('city') ? lead.city : null;
  const headline = [company, city].filter(Boolean).join(' · ');

  const factors = breakdownFactors((lead as { score_breakdown?: unknown }).score_breakdown).filter((f) => f.value !== 0).slice(0, 4);
  const llmAdj = llmAdjustmentOf((lead as { score_breakdown?: unknown }).score_breakdown);

  const details: Array<{ k: string; label: string; value: string }> = [];
  const add = (key: string, label: string, value?: string | null) => { if (value && !hid(key)) details.push({ k: key, label: lbl(key, label), value }); };
  // Lead serial number (connected-B2B / Spark only). Server-owned, always shown when present — it is the lead's
  // unique, human-readable id (SR/LD/2627-12) that maps the form back to this lead.
  if (isB2bClientActive() && lead.ref_no) details.push({ k: 'ref_no', label: 'Lead No', value: lead.ref_no });
  add('phone', 'Phone', lead.phone);
  add('email', 'Email', lead.email);
  if (!hid('owner_id')) details.push({ k: 'owner_id', label: lbl('owner_id', 'Owner'), value: lead.owner_name || 'Unassigned' });
  add('source_id', 'Source', lead.source_name);
  // Connected-B2B built-in field: only once the settings are in (fieldHelpers), and only if the admin has not hidden it.
  if (isB2bClientActive() && fieldHelpers) add('lead_type', LEAD_TYPE_DEFAULT_LABEL, leadTypeLabel(lead.lead_type));
  add('title', 'Job title', lead.title);
  add('state', 'State', lead.state);
  if (lead.created_at) details.push({ k: 'created', label: 'Added', value: new Date(lead.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) });

  // Long values (phone, email) take a full row; the short ones pair up two-by-two, and an odd one out
  // stretches across — so the grid never shows an empty cell.
  const wideKeys = new Set(['phone', 'email']);
  const wideRows = details.filter((d) => wideKeys.has(d.k)).map((d) => ({ ...d, wide: true }));
  const shortRows = details.filter((d) => !wideKeys.has(d.k)).map((d) => ({ ...d, wide: false }));
  if (shortRows.length % 2 === 1) shortRows[shortRows.length - 1].wide = true;
  const orderedDetails = [...wideRows, ...shortRows];
  const latest = (lead as { latest_update?: string | null }).latest_update;
  const latestAt = (lead as { latest_update_at?: string | null }).latest_update_at;
  const canConvert = lead.status !== 'converted';

  const shell: React.CSSProperties = mode === 'dock'
    ? { width: 384, flexShrink: 0, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', borderRadius: T.radius.lg, border: `1px solid ${T.border}` }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 100vw)', zIndex: 1001, borderLeft: `1px solid ${T.border}`, boxShadow: 'var(--shadow-pop)' };

  return (
    <aside
      aria-label="Lead preview"
      style={{ ...shell, background: T.card, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: 18 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={eyebrowStyle}>Quick preview</span>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Link href={`/dashboard/crm/leads/${lead.id}`} aria-label="Open full lead" title="Open full lead" className="km-iconbtn" style={{ width: 32, height: 32, borderRadius: T.radius.sm, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.dim }}>
            <ExternalLink size={16} strokeWidth={1.6} />
          </Link>
          <IconButton label="Close preview" onClick={onClose}><X size={18} strokeWidth={1.6} /></IconButton>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <LeadAvatar lead={lead} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: T.text, overflowWrap: 'anywhere' }}>{name}</h3>
          {/* Imported data can put a whole URL + legal name in "company" — clamp it to two lines (full text on hover) so it can't push the header around. */}
          {headline && (
            <div
              title={headline.length > 60 ? headline : undefined}
              style={{ marginTop: 2, fontSize: 12.5, color: T.dim, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >{headline}</div>
          )}
          {!hid('status') && lead.status && (
            <div style={{ marginTop: 7 }}>
              <Badge tone={statusTone(lead.status)} dot style={{ textTransform: 'capitalize', ...statusStyle }}>{statusMeta?.label ?? String(lead.status).replace(/_/g, ' ')}</Badge>
            </div>
          )}
        </div>
        {!hid('score') && (
          <button type="button" onClick={() => onOpenScore(lead)} title="See the full score breakdown" aria-label="See the full score breakdown" style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
            <ScoreRing score={lead.score} grade={lead.score_grade} />
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))', gap: 8 }}>
        {dial && (
          <a
            href={`tel:${dial}`}
            // Same behaviour as the Call button everywhere else: dial, then land in the pre-filled "log this call" composer.
            onClick={() => window.setTimeout(() => router.push(callComposerUrl({ subject: `Call with ${name}`, leadId: lead.id })), 50)}
            style={{ ...tileStyle, background: T.red, borderColor: 'transparent', color: '#fff' }}
          >
            <Phone size={16} strokeWidth={1.8} aria-hidden />Call
          </a>
        )}
        {canWa && (
          <a href={waLink(lead.phone!)} target="_blank" rel="noopener noreferrer" style={tileStyle}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="#25D366" aria-hidden><path d={WA_PATH} /></svg>WhatsApp
          </a>
        )}
        {showEmail && (
          <a href={`mailto:${lead.email}`} style={tileStyle}><Mail size={16} strokeWidth={1.8} aria-hidden />Email</a>
        )}
        {onEdit && (
          <button type="button" onClick={() => onEdit(lead)} style={tileStyle}><Pencil size={16} strokeWidth={1.8} aria-hidden />Edit</button>
        )}
      </div>

      <Section title="Next step" icon={Sparkles}>
        {nba ? (
          <div style={{ border: `1px solid ${T.border}`, background: T.redWash, borderRadius: T.radius.md, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} strokeWidth={1.8} color="var(--red)" aria-hidden />
              {NBA_LABEL[nba.action] ?? nba.action.replace(/_/g, ' ')}
              {nba.priority && <Badge tone={nba.priority === 'high' ? 'red' : nba.priority === 'low' ? 'ok' : 'warn'} style={{ height: 18, fontSize: 10.5, textTransform: 'uppercase' }}>{nba.priority === 'med' ? 'medium' : nba.priority}</Badge>}
            </div>
            {(nba.reason || nba.rationale) && <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{nba.reason || nba.rationale}</div>}
          </div>
        ) : (
          <Button onClick={suggest} disabled={nbaLoading} icon={<Sparkles size={14} strokeWidth={1.8} />} style={{ justifyContent: 'flex-start' }}>
            {nbaLoading ? 'Thinking…' : 'Suggest the next best step'}
          </Button>
        )}
      </Section>

      {details.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'hidden' }}>
          {orderedDetails.map((d) => (
            <div key={d.k} style={{ background: T.card, padding: '9px 11px', minWidth: 0, gridColumn: d.wide ? '1 / -1' : undefined }}>
              <div style={{ ...eyebrowStyle, fontSize: 9.5, display: 'flex', alignItems: 'center', gap: 4 }}>{DETAIL_ICON[d.k] && <InlineIcon icon={DETAIL_ICON[d.k]} size={11} />}{d.label}</div>
              <div style={{ marginTop: 2, fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: d.k === 'phone' ? T.mono : 'inherit' }} title={d.value.length > 24 ? d.value : undefined}>{d.value}</div>
            </div>
          ))}
        </div>
      )}

      {people.length > 0 && (
        <Section title="People on this lead" icon={Users}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
                <InlineIcon icon={UserRound} size={14} style={{ color: T.dim }} />
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {p.title && <span style={{ color: T.dim, fontSize: 12 }}>· {p.title}</span>}
                {p.role && <span style={{ color: T.dim, fontSize: 12 }}>· {p.role}</span>}
                {p.is_primary
                  ? <Badge tone="red" style={{ marginLeft: 'auto', fontSize: 10, height: 18 }}>Primary</Badge>
                  : people.length > 1 && (
                    <button
                      type="button"
                      onClick={() => makePrimary(p.id)}
                      disabled={!!primaryBusy}
                      title="Make this the lead's primary (nodal) contact"
                      style={{
                        marginLeft: 'auto', background: 'transparent', border: `1px solid ${T.border}`, color: T.red,
                        fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', height: 18, cursor: primaryBusy ? 'default' : 'pointer',
                        opacity: primaryBusy && primaryBusy !== p.id ? 0.5 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}
                    >
                      {primaryBusy === p.id ? 'Setting…' : 'Make primary'}
                    </button>
                  )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!hid('score') && (
        <Section
          title="Why this score"
          icon={Gauge}
          aside={<button type="button" onClick={() => onOpenScore(lead)} style={{ background: 'transparent', border: 0, padding: 0, color: T.red, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>All factors</button>}
        >
          {factors.length === 0 ? (
            <div style={{ fontSize: 12.5, color: T.dim }}>No breakdown yet — open the lead and press Rescore to compute one.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {factors.map((f, i) => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontSize: 12.5, color: T.text, borderTop: i === 0 ? 0 : `1px solid ${T.border}` }}>
                  <span>{f.label}</span>
                  <span style={{ fontFamily: T.mono, fontWeight: 600, color: f.value < 0 ? T.red : T.ok }}>{f.value > 0 ? '+' : ''}{f.value}</span>
                </div>
              ))}
              {llmAdj != null && llmAdj !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontSize: 12.5, color: T.text, borderTop: `1px solid ${T.border}` }}>
                  <span>AI adjustment</span>
                  <span style={{ fontFamily: T.mono, fontWeight: 600, color: llmAdj < 0 ? T.red : T.ok }}>{llmAdj > 0 ? '+' : ''}{llmAdj}</span>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title="Latest updates" icon={MessageSquareText}>
        {updates === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <i className="km-skel" style={{ height: 11, width: '80%' }} />
            <i className="km-skel" style={{ height: 11, width: '60%' }} />
          </div>
        ) : updates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {updates.map((u, i) => (
              <div key={u.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i === 0 ? 0 : `1px solid ${T.border}` }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: i === 0 ? T.info : T.mute, marginTop: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{u.body}</div>
                  <div style={{ marginTop: 2, fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.04em', color: T.mute, textTransform: 'uppercase' }}>
                    {[u.author_name, formatRelativeTime(u.created_at)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : latest ? (
          <div style={{ fontSize: 13, color: T.text }}>
            {latest}
            {latestAt && <div style={{ marginTop: 2, fontFamily: T.mono, fontSize: 10.5, color: T.mute, textTransform: 'uppercase' }}>{formatRelativeTime(latestAt)}</div>}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.dim }}>No updates yet. Add one from the lead page.</div>
        )}
      </Section>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        <Button variant="primary" href={`/dashboard/crm/leads/${lead.id}`} icon={<ArrowRight size={15} strokeWidth={2} />} style={{ width: '100%' }}>Open full lead</Button>
        {canConvert && <Button href={`/dashboard/crm/leads/${lead.id}?convert=1`} icon={<ArrowLeftRight size={15} strokeWidth={1.8} />} style={{ width: '100%' }}>Convert to deal</Button>}
      </div>
    </aside>
  );
}
