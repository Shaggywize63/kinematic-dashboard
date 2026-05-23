'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivityImport } from '../../../../../lib/crmApi';
import type { ImportJob } from '../../../../../types/crm';

// Canonical activity fields the backend importer recognises. Mirrors
// CANONICAL_FIELDS in src/services/crm/activityImport.service.ts —
// keep the two in sync.
const ACTIVITY_FIELDS = [
  'type',
  'subject',
  'body',
  'status',
  'due_at',
  'completed_at',
  // Entity-resolution columns. At least one of these (or a *_id below)
  // must map per row, otherwise the activity has no parent to attach to.
  'lead_id',
  'lead_email',
  'lead_phone',
  'contact_id',
  'contact_email',
  'deal_id',
  'account_id',
  'owner_email',
];

// Downloadable starter file. Two example rows: a completed call against
// an existing lead (by phone) and a scheduled meeting against a lead
// (by email). The CSV preview in the dashboard's empty-state explains
// the column meanings inline.
const TEMPLATE_ROWS = [
  'type,subject,body,status,due_at,completed_at,lead_email,lead_phone,owner_email',
  'call,Pricing discussion,Discussed bulk pricing and warranty terms,completed,,2026-05-22T11:30:00+05:30,,9988776655,rep@company.com',
  'meeting,Site visit,Visit the construction site in Hirapur,open,2026-05-30T10:00:00+05:30,,ramesh@example.com,,rep@company.com',
];

function downloadTemplate() {
  const csv = TEMPLATE_ROWS.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'activities_import_template.csv';
  a.click(); URL.revokeObjectURL(url);
}

interface PreviewWarning { row: number; reason: string }
interface CommitSummary { total: number; created: number; skipped: number; error_count: number }

export default function ActivityImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<Array<Record<string, unknown>>>([]);
  const [warnings, setWarnings] = useState<PreviewWarning[]>([]);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await crmActivityImport.upload(fd);
      const data = r.data as ImportJob & {
        headers?: string[];
        suggested_mapping?: Record<string, string>;
      };
      setJob(data);
      const cols = data.headers ?? [];
      setHeaders(cols);
      // Backend already returns a heuristic mapping — trust it as the
      // initial state; user can override before previewing.
      setMapping(data.suggested_mapping ?? {});
      setStep(2);
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally { setBusy(false); }
  };

  const preview = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const r = await crmActivityImport.preview({ job_id: job.id, mapping });
      setSample(r.data.mapped_sample || []);
      setWarnings(r.data.warnings || []);
      setStep(3);
    } catch (e: any) { toast.error(e.message || 'Preview failed'); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const r = await crmActivityImport.commit({ job_id: job.id });
      const updated = (r.data ?? r) as ImportJob & { summary?: CommitSummary };
      setJob(updated);
      if (updated.summary) {
        setSummary(updated.summary);
        setStep(4);
      } else {
        toast.success('Import committed');
        router.push('/dashboard/crm/activities');
      }
    } catch (e: any) { toast.error(e.message || 'Commit failed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18 }}>Import Activities</h2>
        <button onClick={downloadTemplate} style={btnGhost}>
          ⬇ Download Template CSV
        </button>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {[
          { s: 1, label: 'Upload' },
          { s: 2, label: 'Map Columns' },
          { s: 3, label: 'Review' },
          { s: 4, label: 'Summary' },
        ].map(({ s, label }) => (
          <div key={s} style={{ flex: 1, padding: 10, borderRadius: 8, background: step >= (s as 1|2|3|4) ? 'var(--primary)' : 'var(--s3)', color: step >= (s as 1|2|3|4) ? '#fff' : 'var(--text-dim)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
            Step {s}: {label}
          </div>
        ))}
      </div>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
            style={{ border: '2px dashed var(--border-l)', borderRadius: 12, padding: 50, textAlign: 'center', color: 'var(--text-dim)' }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>⬇</div>
            <div style={{ marginBottom: 12 }}>Drop a CSV or XLSX file here, or</div>
            <label style={{ background: 'var(--primary)', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              Choose File
              <input type="file" accept=".csv,.xlsx" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            </label>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)', background: 'var(--s3)', border: '1px dashed var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>What goes in the file</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li><strong>type</strong> (required) — one of: call, email, meeting, task, note, sms, whatsapp</li>
              <li><strong>subject</strong> — short title shown in the activity timeline</li>
              <li><strong>body</strong> — long description / notes</li>
              <li><strong>status</strong> — open / in_progress / completed / cancelled (defaults to open; auto-set to completed if completed_at is provided)</li>
              <li><strong>due_at</strong>, <strong>completed_at</strong> — ISO timestamps (e.g. 2026-05-22T11:30:00+05:30) or YYYY-MM-DD</li>
              <li>
                <strong>One entity-resolution column per row</strong> — the activity must attach to something:
                <ul style={{ paddingLeft: 18 }}>
                  <li><code>lead_id</code> / <code>contact_id</code> / <code>deal_id</code> / <code>account_id</code> — exact UUID</li>
                  <li><code>lead_email</code> or <code>lead_phone</code> — we resolve to an existing lead in this client</li>
                  <li><code>contact_email</code> — resolve to a contact</li>
                </ul>
              </li>
              <li><strong>owner_email</strong> — optional. Assigns the activity to the user with this email. Falls back to no owner.</li>
            </ul>
            <div style={{ marginTop: 8, color: 'var(--text-dim)' }}>
              Rows that don&rsquo;t resolve to a parent entity are skipped and listed in the summary — they aren&rsquo;t silently dropped.
              Max 10,000 rows per file.
            </div>
          </div>
        </>
      )}

      {/* Step 2 — Map columns */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>
            Map your CSV columns to activity fields. We pre-filled the obvious ones — review and adjust below.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {headers.map((h) => (
              <div key={h} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', padding: '6px 10px', background: 'var(--s3)', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>{h}</div>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <select
                  value={mapping[h] || ''}
                  onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                  style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
                >
                  <option value="">(skip)</option>
                  {ACTIVITY_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setStep(1)} style={btnGhost}>Back</button>
            <button onClick={preview} disabled={busy} style={btnPrimary}>{busy ? '...' : 'Preview'}</button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && job && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: 'var(--text)' }}>
              {job.total_rows || sample.length} rows ready to import.
            </span>
            {warnings.length > 0 && (
              <div style={{ color: '#f59e0b', marginTop: 6, fontWeight: 600 }}>
                {warnings.length} sample row{warnings.length === 1 ? '' : 's'} flagged — see below.
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: 'var(--text)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Sample warnings (out of first 25 rows)</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)' }}>
                {warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>Sample row {w.row + 1}: {w.reason}</li>
                ))}
                {warnings.length > 8 && <li>…and {warnings.length - 8} more</li>}
              </ul>
              <div style={{ marginTop: 6, color: 'var(--text-dim)' }}>
                These rows will be skipped during commit and listed in the final summary. The other rows will import normally.
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto', background: 'var(--s3)', borderRadius: 8, padding: 8, maxHeight: 320 }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead><tr>{Object.keys(sample[0] || {}).map((k) => <th key={k} style={{ textAlign: 'left', padding: 6, color: 'var(--text-dim)' }}>{k}</th>)}</tr></thead>
              <tbody>
                {sample.slice(0, 10).map((row, i) => (
                  <tr key={i}>{Object.keys(sample[0] || {}).map((k) => <td key={k} style={{ padding: 6, color: 'var(--text)' }}>{String(row[k] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setStep(2)} style={btnGhost}>Back</button>
            <button onClick={commit} disabled={busy} style={btnPrimary}>
              {busy ? 'Committing...' : `Commit ${job.total_rows || sample.length} Rows`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Summary */}
      {step === 4 && summary && (
        <div>
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>{summary.created > 0 ? '✅' : '⚠️'}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              {summary.created > 0 ? 'Import complete' : 'Nothing imported'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              Each activity was attached to a resolved lead / contact / deal / account in this client.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <SummaryCard label="Processed" value={summary.total} tint="var(--text-dim)" />
            <SummaryCard label="Created" value={summary.created} tint="rgb(34, 197, 94)" />
            {summary.skipped > 0 && (
              <SummaryCard label="Skipped" value={summary.skipped} tint="rgb(245, 158, 11)" />
            )}
            {summary.error_count > 0 && (
              <SummaryCard label="Errors" value={summary.error_count} tint="rgb(239, 68, 68)" />
            )}
          </div>

          {summary.error_count > 0 && job?.errors && Array.isArray(job.errors) && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)', marginBottom: 12,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {summary.error_count} row{summary.error_count === 1 ? '' : 's'} skipped or errored
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)' }}>
                {(job.errors as unknown as Array<{ row: number; reason: string }>).slice(0, 8).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.reason}</li>
                ))}
                {job.errors.length > 8 && <li>…and {job.errors.length - 8} more</li>}
              </ul>
              <div style={{ marginTop: 8, color: 'var(--text-dim)' }}>
                Tip: most skips are &ldquo;no matching lead / contact&rdquo; — confirm the lead actually exists in this client first,
                or import the leads file before re-running the activity import.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setStep(1); setJob(null); setHeaders([]); setMapping({}); setSample([]); setWarnings([]); setSummary(null); }} style={btnGhost}>
              Import another file
            </button>
            <button onClick={() => router.push('/dashboard/crm/activities')} style={btnPrimary}>
              View activities →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tint, marginTop: 4 }}>{value.toLocaleString()}</div>
    </div>
  );
}

const btnGhost: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
