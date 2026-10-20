'use client';
import Link from 'next/link';
import { intentColor, sentimentColor, statusMeta, type ConversationRow } from '../../../lib/conversationsApi';
import { T } from '../../ui';
import SectionCard from './SectionCard';
import { fmtIST, relTime } from './format';

/** Recorded / consented calls that went through Conversation Analysis. */
export default function InsightsTab({ conversations }: { conversations: ConversationRow[] }) {
  return (
    <SectionCard title="Call insights" count={conversations.length}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conversations.map((c) => {
          const sm = statusMeta(c.status);
          const sc = sentimentColor(c.sentiment);
          const ic = intentColor(c.intent_score);
          const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: bg, color: fg });
          return (
            <Link key={c.id} href="/dashboard/crm/conversations" className="km-navrow" style={{ display: 'block', padding: '12px 14px', background: 'var(--s3)', borderRadius: 10, textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: T.text, fontWeight: 600, fontSize: 14 }}>{c.champion_name || 'Consumer Champion'}</span>
                <span style={{ color: T.mute, fontSize: 12, fontFamily: T.mono }} title={fmtIST(c.created_at)}>{relTime(c.created_at)}</span>
              </div>
              {c.summary && <div style={{ fontSize: 13, color: T.dim, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.summary}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(c.intent || c.intent_score != null) && <span style={pill(ic.bg, ic.fg)}>{c.intent || 'Intent'}{c.intent_score != null ? ` · ${c.intent_score}` : ''}</span>}
                {c.sentiment && <span style={pill(sc.bg, sc.fg)}>{c.sentiment}</span>}
                <span style={pill(sm.bg, sm.fg)}>{sm.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
