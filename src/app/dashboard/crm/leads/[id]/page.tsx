'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi } from '../../../../../lib/crmApi';
import type { Lead, Activity, LeadScore, NextBestAction } from '../../../../../types/crm';
import LeadScoreBreakdown from '../../../../../components/crm/LeadScoreBreakdown';
import NextBestActionCard from '../../../../../components/crm/NextBestActionCard';
import ActivityTimeline from '../../../../../components/crm/ActivityTimeline';
import LeadConvertModal from '../../../../../components/crm/LeadConvertModal';
import AiDraftReplyPanel from '../../../../../components/crm/AiDraftReplyPanel';
import OwnerAvatar from '../../../../../components/crm/shared/OwnerAvatar';
import WhatsAppButton from '../../../../../components/crm/shared/WhatsAppButton';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [score, setScore] = useState<LeadScore | null>(null);
  const [nba, setNba] = useState<NextBestAction | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, a] = await Promise.allSettled([crmLeads.get(id), crmLeads.activities(id)]);
      if (l.status === 'fulfilled') setLead(l.value.data);
      if (a.status === 'fulfilled') setActivities(a.value.data || []);
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <OwnerAvatar name={fullName} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{fullName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{lead.title || '—'}{lead.company ? ` · ${lead.company}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConvertOpen(true)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Convert</button>
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

        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Activity Timeline</div>
          <ActivityTimeline activities={activities} />
        </div>

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
        <NextBestActionCard action={nba} onLoad={async () => {
          try { setNba(null); } catch {}
        }} />
      </div>

      <LeadConvertModal
        leadId={id}
        defaultDealName={lead.company ? `${lead.company} Opportunity` : undefined}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onConverted={reload}
      />
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
