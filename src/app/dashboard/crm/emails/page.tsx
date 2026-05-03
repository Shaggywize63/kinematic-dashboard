'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmEmails } from '../../../../lib/crmApi';
import type { EmailLog } from '../../../../types/crm';

const STATUS_COLORS: Record<string, string> = { sent: '#7B61FF', opened: '#00B4D8', clicked: '#28B463', bounced: '#E01E2C', failed: '#E01E2C', queued: '#F7B538' };

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await crmEmails.list(); setEmails(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
    })();
  }, []);

  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Link href="/dashboard/crm/emails/templates" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>Templates</Link>
        <Link href="/dashboard/crm/emails/compose" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ Compose</Link>
      </div>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>To</th><th style={th}>Subject</th><th style={th}>Status</th><th style={th}>Opens</th><th style={th}>Clicks</th><th style={th}>Sent</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && emails.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No emails yet.</td></tr>}
            {emails.map((e) => (
              <tr key={e.id}>
                <td style={td}>{e.to_email}</td>
                <td style={td}>{e.subject}</td>
                <td style={td}><span style={{ color: STATUS_COLORS[e.status] || 'var(--text-dim)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{e.status}</span></td>
                <td style={td}>{e.open_count || 0}</td>
                <td style={td}>{e.click_count || 0}</td>
                <td style={td}>{e.sent_at ? new Date(e.sent_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
