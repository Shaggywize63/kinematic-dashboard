'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmImport } from '../../../../../lib/crmApi';
import type { ImportJob } from '../../../../../types/crm';

const CONTACT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'title', 'department',
  'account_name', 'owner_email', 'city', 'state', 'country',
  'marketing_consent', 'whatsapp_consent',
];

const TEMPLATE_ROWS = [
  'first_name,last_name,email,phone,title,department,account_name,owner_email,city,state,country',
  'Jane,Doe,jane@acme.com,9999900000,VP Sales,Sales,Acme Corp,rep@company.com,Mumbai,Maharashtra,India',
  'John,Smith,john@globex.com,8888800000,Manager,Ops,Globex Inc,,Delhi,Delhi,India',
];

function downloadTemplate() {
  const csv = TEMPLATE_ROWS.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'contacts_import_template.csv';
  a.click(); URL.revokeObjectURL(url);
}

export default function ContactImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity', 'contact');
      const r = await crmImport.upload(fd);
      setJob(r.data);
      const text = await file.text();
      const firstLine = text.split('\n')[0] || '';
      const cols = firstLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      setHeaders(cols);
      const auto: Record<string, string> = {};
      cols.forEach((c) => {
        const norm = c.toLowerCase().replace(/[\s-]/g, '_');
        const match = CONTACT_FIELDS.find((f) => f === norm || f.includes(norm) || norm.includes(f));
        if (match) auto[c] = match;
      });
      setMapping(auto);
      setStep(2);
    } catch (e: any) { toast.error(e.message || 'Upload failed'); } finally { setBusy(false); }
  };

  const preview = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const r = await crmImport.preview({ job_id: job.id, mapping });
      setSample(r.data.sample || []);
      setJob(r.data.job);
      setStep(3);
    } catch (e: any) { toast.error(e.message || 'Preview failed'); } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!job) return;
    setBusy(true);
    try {
      await crmImport.commit({ job_id: job.id });
      toast.success('Contacts imported successfully');
      router.push('/dashboard/crm/contacts');
    } catch (e: any) { toast.error(e.message || 'Commit failed'); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ marginTop: 0, color: 'var(--text)', fontSize: 18 }}>Import Contacts</h2>
        <button onClick={downloadTemplate} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ⬇ Download Template CSV
        </button>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{ flex: 1, padding: 10, borderRadius: 8, background: step >= s ? 'var(--primary)' : 'var(--s3)', color: step >= s ? '#fff' : 'var(--text-dim)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
            Step {s}: {s === 1 ? 'Upload' : s === 2 ? 'Map Columns' : 'Review & Commit'}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
            Upload a CSV or XLSX file. Required columns: <code>first_name</code> or <code>email</code>. Download the template above to get the correct format.
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
            style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 50, textAlign: 'center', color: 'var(--text-dim)' }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>⬇</div>
            <div style={{ marginBottom: 12 }}>{busy ? 'Uploading…' : 'Drop a CSV or XLSX file here, or'}</div>
            {!busy && (
              <label style={{ background: 'var(--primary)', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                Choose File
                <input type="file" accept=".csv,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              </label>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>Map your CSV columns to contact fields:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {headers.map((h) => (
              <div key={h} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', padding: '6px 10px', background: 'var(--s3)', borderRadius: 6 }}>{h}</div>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <select value={mapping[h] || ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
                  <option value="">(skip)</option>
                  {CONTACT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setStep(1)} style={btnGhost}>Back</button>
            <button onClick={preview} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Preview'}</button>
          </div>
        </div>
      )}

      {step === 3 && job && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: 'var(--text)' }}>{job.total_rows || sample.length} rows ready to import.</span>
            {(job.errors as any)?.length > 0 && (
              <div style={{ color: '#f59e0b', marginTop: 6 }}>{(job.errors as any).length} validation issues found — they will be skipped.</div>
            )}
          </div>
          <div style={{ overflowX: 'auto', background: 'var(--s3)', borderRadius: 8, padding: 8, maxHeight: 300 }}>
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
            <button onClick={commit} disabled={busy} style={btnPrimary}>{busy ? 'Importing…' : `Import ${job.total_rows || sample.length} Contacts`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
