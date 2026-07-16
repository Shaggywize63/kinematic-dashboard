'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '../../../../../hooks/useAuth';
import { API_BASE_URL } from '../../../../../lib/api';
import { reportFetchHeaders } from '../../../../../lib/reportAuth';
import { canDownloadSrsReport } from '../../../../../lib/clientFeatures';
import {
  useReportCityKey,
  ReportRangePicker,
  defaultReportRange,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';

// The columns the SRS Tiscon team's day-wise "Format" defines. Shown here as a
// preview so a rep knows exactly what the CSV contains before they download it
// — the backend (/api/v1/crm/activities/export-daywise-report) is the source
// of truth for the actual column order.
const COLUMNS = [
  'Owner Name', 'Hierarchy', 'City', 'Total Activity', 'Unique Lead',
  'Lead Visit', 'Lead Call', 'Dealer Visit', 'Other Visit', 'Deals',
  'Tonnage (MT)', 'Date',
];

export default function DaywiseReportPage() {
  const { user } = useAuth();
  const cityKey = useReportCityKey();
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(90));
  const [downloading, setDownloading] = useState(false);

  // Access gate — mirrors the backend's SRS_REPORT_ROLES check. Anyone who
  // isn't an SRS/Tata Area Sales Officer or CRM Admin gets a plain message
  // instead of a broken download button (and the backend would 403 anyway).
  if (!canDownloadSrsReport(user as any)) {
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Overall Day-Wise Report</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
          This report is available to the Area Sales Officer and CRM Admin roles only.
        </p>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none' }}>← Back to Reports</Link>
      </div>
    );
  }

  const download = async () => {
    setDownloading(true);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to)   qs.set('to',   range.to);
      // Honour the global city scope for parity with every other CRM read.
      // The raw fetch below bypasses api.ts, so the picker value has to be
      // appended manually.
      if (cityKey)    qs.set('city', cityKey);

      const url = `${API_BASE_URL}/api/v1/crm/activities/export-daywise-report${qs.toString() ? `?${qs.toString()}` : ''}`;
      // Impersonation- and project-aware headers (mirrors api.ts). Using the
      // raw stored token while impersonating a user in another Supabase
      // project was the cause of "Invalid or expired token" here.
      const headers = reportFetchHeaders();

      const res = await fetch(url, { headers });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.clone().json();
          if (body?.error && typeof body.error === 'string') detail = body.error;
        } catch { /* not JSON */ }
        throw new Error(`Download failed: ${detail}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `daywise-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success('Day-wise report downloaded');
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Overall Day-Wise Report</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 560 }}>
            A per-rep, per-day rollup — activity split (lead visits, calls, dealer and other visits),
            unique leads touched, deals closed and tonnage — with a grand-total row across the range.
            An Area Sales Officer sees their own days; a CRM Admin sees the whole tenant. Narrow by an
            activity-date range below; the global city filter is applied automatically.
          </div>
        </div>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--primary)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>← Back to Reports</Link>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <ReportRangePicker range={range} onChange={setRange} />
        <button
          onClick={download}
          disabled={downloading}
          style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: downloading ? 'default' : 'pointer',
            background: downloading ? 'var(--s3)' : 'var(--primary)',
            color: downloading ? 'var(--text-dim)' : '#fff',
          }}
        >
          {downloading ? 'Preparing…' : '⬇ Download CSV'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
        Columns
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {COLUMNS.map((c) => (
          <span key={c} style={{
            fontSize: 12, color: 'var(--text)', background: 'var(--s3)',
            border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
          }}>{c}</span>
        ))}
      </div>
    </div>
  );
}
