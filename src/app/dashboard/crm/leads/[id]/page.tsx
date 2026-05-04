'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi } from '../../../../../lib/crmApi';
import type { Lead, Activity, Deal, LeadScore, NextBestAction } from '../../../../../types/crm';
import LeadScoreBreakdown from '../../../../../components/crm/LeadScoreBreakdown';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import LeadConvertModal from '../../../../../components/crm/LeadConvertModal';
import AiDraftReplyPanel from '../../../../../components/crm/AiDraftReplyPanel';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';
import WhatsAppButton from '../../../../../components/crm/shared/WhatsAppButton';
import LeadEditModal from '../../../../../components/crm/LeadEditModal';
import { formatINR } from '../../../../../lib/formatCurrency';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [score, setScore] = useState<LeadScore | null>(null);
  const [nba] = useState<NextBestAction | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, a, d] = await Promise.allSettled([
        crmLeads.get(id),
        crmLeads.activities(id),
        crmLeads.deals(id),
      ]);
      if (l.status === 'fulfilled') setLead(l.value.data);
      if (a.status === 'fulfilled') setActivities(a.value.data || []);
      if (d.status === 'fulfilled') setDeals(d.value.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const reScore = async () => {
    if (!id) return;
    setScoring(true);
    try {
      const r = await crmAi.scoreLead(id);
      setScore(r.data);
      setLead((l) => l ? { ...l, score: r.data.score, score_grade: r.data.grade } : l);
      toast.success(`Lead scored: ${r.data.score} (${r.data.grade})`);
    } catch (e: any) { toast.error(e.message || 'Scoring failed'); } finally { setScoring(false); }
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading...</div>;
  if (!lead) return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Lead not found.</div>;

  const fullName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Unnamed';
  const firstName = (lead.first_name || fullName).split(' ')[0];
  const waPrefill = `Hi ${firstName}, `;
  const isB2C = !!lead.is_b2c;
  const isConverted = lead.status === 'converted' || !!lead.converted_at;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <OwnerAvatar name={fullName} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{fullName}</div>
                <Badge tone={isB2C ? 'consumer' : 'business'}>{isB2C ? 'B2C' : 'B2B'}</Badge>
                {isConverted && <Badge tone="success">Converted</Badge>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {isB2C
                  ? [lead.city, lead.country].filter(Boolean).join(', ') || '—'
                  : (lead.title ? `${lead.title}${lead.company ? ` · ${lead.company}` : ''}` : (lead.company || '—'))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
              {!isConverted && (
                <button onClick={() => setConvertOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Convert</button>
              )}
              <button onClick={() => router.back()} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Back</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
            <Field label="Email" value={lead.email} />
            <PhoneField phone={lead.phone} prefill={waPrefill} />
            <Field label="Status" value={lead.status} />
            <Field label="Source" value={lead.source_name} />
            <Field label="Owner" value={lead.owner_name || 'Unassigned'} />
            <Field label="Created" value={new Date(lead.created_at).toLocaleString()} />
          </div>
        </div>

        {isConverted && (lead.converted_account_id || lead.converted_contact_id || lead.converted_deal_id) && (
          <Card title="Converted To">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {lead.converted_contact_id && (<Link href={`/dashboard/crm/contacts/${lead.converted_contact_id}`} style={chipLink}>→ Contact</Link>)}
              {lead.converted_account_id && (<Link href={`/dashboard/crm/accounts/${lead.converted_account_id}`} style={chipLink}>→ Account</Link>)}
              {lead.converted_deal_id && (<Link href={`/dashboard/crm/deals/${lead.converted_deal_id}`} style={chipLink}>→ Deal</Link>)}
            </div>
          </Card>
        )}

        {isB2C && (
          <Card title="Customer Profile">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, fontSize: 13 }}>
              <Field label="Date of Birth" value={lead.date_of_birth ? new Date(lead.date_of_birth).toLocaleDateString() : null} />
              <Field label="Gender" value={lead.gender ? lead.gender.replace(/_/g, ' ') : null} />
              <Field label="Preferred Channel" value={lead.preferred_contact_method} />
              <Field label="Marketing Consent" value={lead.marketing_consent ? 'Yes' : 'No'} />
              <Field label="WhatsApp Consent" value={lead.whatsapp_consent ? 'Yes' : 'No'} />
              <Field label="Address" value={[lead.address_line1, lead.address_line2, lead.city, lead.state, lead.postal_code, lead.country].filter(Boolean).join(', ') || null} />
            </div>
          </Card>
        )}

        {deals.length > 0 && (
          <Card title={`Deals (${deals.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deals.map((d) => (
                <Link key={d.id} href={`/dashboard/crm/deals/${d.id}`} style={rowLink}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.stage_name} · {d.status}</div>
                  </div>
                  <div style={{ color: 'var(--text)', fontWeight: 700 }}>{formatINR(d.amount || 0)}</div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card title="Activity Timeline"><ActivityTimeline activities={activities} /></Card>
        <AiDraftReplyPanel leadId={id} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <LeadScoreBreakdown
          score={score?.score ?? lead.score}
          grade={(score?.grade ?? lead.score_grade) as any}
          factors={score?.factors}
          onRefresh={reScore}
          loading={scoring}
        />
        <NextBestActionCard action={nba} onLoad={async () => {}} />
      </div>

      <LeadConvertModal
        leadId={id}
        defaultDealName={lead.company ? `${lead.company} Opportunity` : undefined}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onConverted={reload}
      />

      <LeadEditModal
        lead={lead}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setLead(updated); reload(); }}
      />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ color: 'var(--text)', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}

function PhoneField({ phone, prefill }: { phone?: string | null; prefill: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>Phone</div>
      <div style={{ color: 'var(--text)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{phone || '—'}</span>
        <WhatsAppButton phone={phone} prefillText={prefill} size="sm" />
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'business' | 'consumer' | 'success' }) {
  const colors = {
    business: { bg: '#3b82f6', fg: '#fff' },
    consumer: { bg: '#8b5cf6', fg: '#fff' },
    success: { bg: '#10b981', fg: '#fff' },
  }[tone];
  return (
    <span style={{ background: colors.bg, color: colors.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>
  );
}

const chipLink: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--primary)',
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none',
};
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--s3)', borderRadius: 8, textDecoration: 'none', fontSize: 13,
};
