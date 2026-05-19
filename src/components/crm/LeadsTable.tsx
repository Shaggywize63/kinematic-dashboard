'use client';
import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import type { Lead } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import OwnerAvatar from './shared/OwnerAvatar';
import InlineOwnerAssign from './shared/InlineOwnerAssign';

interface Props {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
}

export default function LeadsTable({ leads, selected, onToggle, onToggleAll, loading, isB2C = false, onAssign }: Props) {
  const [scorePopup, setScorePopup] = useState<Lead | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const thStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };

  const colCount = isB2C ? 8 : 9;

  return (
    <>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="responsive-cards" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                </th>
                <th style={thStyle}>Name</th>
                {!isB2C && <th style={thStyle}>Company</th>}
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Owner</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading leads...</td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No leads found.</td></tr>
              )}
              {leads.map((l) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  isSelected={selected.has(l.id)}
                  onToggle={onToggle}
                  onScoreClick={setScorePopup}
                  onAssign={onAssign}
                  isB2C={isB2C}
                  tdStyle={tdStyle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {scorePopup && <ScoreBreakdownModal lead={scorePopup} onClose={() => setScorePopup(null)} />}
    </>
  );
}

interface LeadRowProps {
  lead: Lead;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onScoreClick: (lead: Lead) => void;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
  isB2C: boolean;
  tdStyle: React.CSSProperties;
}

const LeadRow = memo(function LeadRow({ lead: l, isSelected, onToggle, onScoreClick, onAssign, isB2C, tdStyle }: LeadRowProps) {
  const fullName = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
  const handleToggle = useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleScore  = useCallback(() => onScoreClick(l), [onScoreClick, l]);
  const handleAssign = useCallback((uid: string | null) => onAssign?.(l.id, uid) ?? Promise.resolve(), [onAssign, l.id]);

  return (
    <tr>
      <td style={tdStyle} data-label=""><input type="checkbox" checked={isSelected} onChange={handleToggle} /></td>
      <td style={tdStyle} data-label="Name">
        <Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{fullName}</Link>
        {l.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.title}</div>}
      </td>
      {!isB2C && <td style={tdStyle} data-label="Company">{l.company || '—'}</td>}
      <td style={tdStyle} data-label="Phone">{l.phone || '—'}</td>
      <td style={tdStyle} data-label="Status"><span style={{ textTransform: 'capitalize' }}>{l.status}</span></td>
      <td style={tdStyle} data-label="Score">
        <button type="button" onClick={handleScore} title="Click to see score breakdown" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
          <LeadScoreBadge score={l.score} grade={l.score_grade} />
        </button>
      </td>
      <td style={tdStyle} data-label="Source">{l.source_name || '—'}</td>
      <td style={tdStyle} data-label="Owner">
        {onAssign ? (
          <InlineOwnerAssign currentOwnerId={l.owner_id} currentOwnerName={l.owner_name} onAssign={handleAssign} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OwnerAvatar name={l.owner_name} size={24} /> <span style={{ fontSize: 12 }}>{l.owner_name || 'Unassigned'}</span></div>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Action">
        {l.status === 'converted' ? (
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Converted</span>
        ) : (
          <Link href={`/dashboard/crm/leads/${l.id}?convert=1`} style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none' }} title="Convert this lead to a deal">→ Deal</Link>
        )}
      </td>
    </tr>
  );
});

function ScoreBreakdownModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const breakdown = (lead as any).score_breakdown as Record<string, number> | null | undefined;
  const score = lead.score ?? 0;
  const grade = lead.score_grade;

  const entries: Array<[string, number]> = breakdown && typeof breakdown === 'object'
    ? Object.entries(breakdown).filter(([_, v]) => typeof v === 'number')
    : [];

  const labels: Record<string, string> = {
    title_seniority: 'Job Title Seniority',
    title: 'Job Title Seniority',
    company_size: 'Company Size',
    company: 'Company Match',
    source_weight: 'Lead Source',
    source: 'Lead Source',
    engagement: 'Engagement Activity',
    recency: 'Recency',
    icp_match: 'ICP (Ideal Customer Profile) Match',
    icp: 'ICP Match',
    industry: 'Industry Match',
    geo: 'Geography',
    email_quality: 'Email Quality',
    phone_present: 'Phone Number Present',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Lead Score Explanation</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'var(--s3)', borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444' }}>{score}</div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Total Score / 100</div>
            {grade && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>Grade <strong>{grade}</strong></div>}
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
          Score is computed from a heuristic model that weighs key lead attributes. Higher scores indicate hotter leads worth prioritizing first.
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: 16, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
            No detailed breakdown available yet. Click <em>Rescore</em> on the lead detail page to compute one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(([key, value]) => {
              const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const max = Math.max(20, ...entries.map(([, v]) => v));
              const pct = Math.max(0, Math.min(100, (value / max) * 100));
              const color = value >= 15 ? '#10b981' : value >= 8 ? '#f59e0b' : '#6366f1';
              return (
                <div key={key} style={{ background: 'var(--s3)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 12, color, fontWeight: 700 }}>+{value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Link
            href={`/dashboard/crm/leads/${lead.id}`}
            onClick={onClose}
            style={{ background: 'var(--primary)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
          >
            View Lead →
          </Link>
        </div>
      </div>
    </div>
  );
}
