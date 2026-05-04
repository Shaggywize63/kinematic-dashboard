'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmAi } from '../../lib/crmApi';
import AiBadge from './shared/AiBadge';

export default function AccountSummaryCard({ accountId, initial }: { accountId: string; initial?: string | null }) {
  const [summary, setSummary] = useState<string | null>(initial || null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await crmAi.summarizeAccount(accountId);
      setSummary(r.data.summary);
      setHighlights(r.data.highlights || []);
    } catch (e: any) { toast.error(e.message || 'Summary failed'); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Account 360 Summary</div>
          <AiBadge />
        </div>
        <button onClick={generate} disabled={busy} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          {busy ? 'Summarizing...' : 'Generate'}
        </button>
      </div>
      {summary ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, marginBottom: 12 }}>{summary}</div>
          {highlights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {highlights.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>•</span><span>{h}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Click Generate to summarize this account using all linked deals, contacts, and recent activity.</div>
      )}
    </div>
  );
}
