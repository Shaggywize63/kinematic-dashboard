'use client';
/**
 * Bulk-import flow for the People Directory. Three steps so it feels
 * familiar to anyone who has used a Salesforce / HubSpot importer:
 *
 *   1. Upload — drop a CSV (or paste tabular data). We parse client-
 *      side so the user can review without hitting the server.
 *   2. Map — choose which uploaded column feeds each directory field
 *      (first_name, last_name, mobile, email, address). We auto-guess
 *      the obvious matches so most imports are zero-effort.
 *   3. Review + Commit — show a count, let the user pick the duplicate
 *      strategy (Skip vs Update by mobile/email), then POST to the
 *      backend's /bulk-import endpoint and surface the result.
 *
 * The whole thing lives on one page with a step indicator so the user
 * never wonders "where am I in this flow?".
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmPeopleDirectory } from '../../../../../lib/crmApi';

type DirField = 'first_name' | 'last_name' | 'mobile' | 'email' | 'address' | 'type' | 'city' | 'code';
const DIR_FIELDS: { key: DirField; label: string; hint?: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name',  label: 'Last name' },
  { key: 'mobile',     label: 'Mobile',  hint: 'Used for duplicate detection' },
  { key: 'email',      label: 'Email',   hint: 'Used for duplicate detection' },
  { key: 'type',       label: 'Type',    hint: 'Dealer / Engineer / Architect / …' },
  { key: 'city',       label: 'City' },
  { key: 'code',       label: 'Code',    hint: 'Employee / dealer code' },
  { key: 'address',    label: 'Address' },
];

// Cheap heuristic for the auto-mapping pass. Strip non-alphanum, lowercase,
// compare against a few known synonyms per field. Matches what reps
// typically name columns in their exports.
const SYNONYMS: Record<DirField, string[]> = {
  first_name: ['firstname', 'givenname', 'fname', 'first'],
  last_name:  ['lastname', 'surname', 'familyname', 'lname', 'last'],
  mobile:     ['mobile', 'mobilenumber', 'mob', 'phone', 'phonenumber', 'contact', 'contactnumber', 'whatsapp'],
  email:      ['email', 'emailaddress', 'mail', 'emailid'],
  address:    ['address', 'addressline', 'addr', 'street', 'location'],
  type:       ['type', 'role', 'category', 'designation', 'profession'],
  city:       ['city', 'town', 'cityname', 'locationcity'],
  code:       ['code', 'employeecode', 'empcode', 'empid', 'employeeid', 'dealercode', 'dealerid'],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function autoMap(headers: string[]): Record<DirField, string | null> {
  const out: Record<DirField, string | null> = {
    first_name: null, last_name: null, mobile: null, email: null, address: null, type: null, city: null, code: null,
  };
  for (const field of Object.keys(SYNONYMS) as DirField[]) {
    const syns = new Set(SYNONYMS[field]);
    const hit = headers.find((h) => syns.has(norm(h)));
    out[field] = hit ?? null;
  }
  return out;
}

// Tiny CSV parser. Handles double-quoted fields with commas + escaped
// quotes, which is enough for what reps export from Excel / Google Sheets.
// For anything wilder, dropping in PapaParse is a one-line swap.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else { cell += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else { cell += ch; }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function downloadTemplate() {
  const rows = [
    'first_name,last_name,mobile,email,code,type,city,address',
    'Ravi,Kumar,9988776655,ravi@example.com,EMP-001,Dealer,Bhagalpur,"Shop 12, Main Road"',
    'Priya,Sharma,8877665544,priya@example.com,EMP-002,Architect,Patna,"Flat 3, Building B"',
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'people-directory-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function PeopleDirectoryImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<DirField, string | null>>({
    first_name: null, last_name: null, mobile: null, email: null, address: null, type: null, city: null, code: null,
  });
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; total: number } | null>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setRawText(text);
    ingest(text);
  };
  const ingest = (text: string) => {
    const rows = parseCsv(text);
    if (rows.length < 2) { toast.error('No data rows found.'); return; }
    const headers = rows[0].map((h) => h.trim());
    const dataRows = rows.slice(1);
    setParsed({ headers, rows: dataRows });
    setMapping(autoMap(headers));
    setStep(2);
  };

  // Build the per-row payload using the chosen mapping. Skips rows that
  // would be entirely empty after mapping — keeps the server-side count
  // honest (no phantom "skipped" rows from blank spreadsheet lines).
  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    const idx = (col: string | null) => col === null ? -1 : parsed.headers.indexOf(col);
    const cols: Record<DirField, number> = {
      first_name: idx(mapping.first_name),
      last_name:  idx(mapping.last_name),
      mobile:     idx(mapping.mobile),
      email:      idx(mapping.email),
      address:    idx(mapping.address),
      type:       idx(mapping.type),
      city:       idx(mapping.city),
      code:       idx(mapping.code),
    };
    return parsed.rows
      .map((row) => ({
        first_name: cols.first_name >= 0 ? row[cols.first_name]?.trim() || null : null,
        last_name:  cols.last_name  >= 0 ? row[cols.last_name]?.trim()  || null : null,
        mobile:     cols.mobile     >= 0 ? row[cols.mobile]?.trim()     || null : null,
        email:      cols.email      >= 0 ? row[cols.email]?.trim()      || null : null,
        address:    cols.address    >= 0 ? row[cols.address]?.trim()    || null : null,
        type:       cols.type       >= 0 ? row[cols.type]?.trim()       || null : null,
        city:       cols.city       >= 0 ? row[cols.city]?.trim()       || null : null,
        code:       cols.code       >= 0 ? row[cols.code]?.trim()       || null : null,
      }))
      .filter((r) => r.first_name || r.last_name || r.mobile || r.email);
  }, [parsed, mapping]);

  const commit = async () => {
    if (!mappedRows.length) { toast.error('No rows to import after mapping.'); return; }
    setBusy(true);
    try {
      const r = await crmPeopleDirectory.bulkImport({ rows: mappedRows, on_duplicate: onDuplicate });
      setResult(r.data as any);
      toast.success(`Imported: ${r.data?.added ?? 0} added, ${r.data?.updated ?? 0} updated, ${r.data?.skipped ?? 0} skipped`);
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <header style={{ marginBottom: 16 }}>
        <button
          onClick={() => router.push('/dashboard/crm/people-directory')}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}
        >← Back to People Directory</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Bulk Import</h1>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
          Drop a CSV with your roster and map each column to a directory field.
        </div>
      </header>

      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 style={{ ...cardHeader, margin: 0 }}>Step 1 — Upload CSV</h3>
            <button onClick={downloadTemplate} style={btnSecondary}>Download template</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
            Pick a file (recommended) or paste rows below. The first row must be the header.{' '}
            <span style={{ color: 'var(--text-dim)' }}>Don't have a file? Download the template above to get started.</span>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            style={{ marginBottom: 12 }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Or paste here:</div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            placeholder={'first_name,last_name,mobile,email,address\nRavi,Kumar,9988776655,ravi@example.com,Delhi'}
            style={{ width: '100%', padding: 10, borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={() => ingest(rawText)}
              disabled={!rawText.trim()}
              style={{ ...btnPrimary, opacity: rawText.trim() ? 1 : 0.4 }}
            >Continue →</button>
          </div>
        </Card>
      )}

      {step === 2 && parsed && (
        <Card>
          <h3 style={cardHeader}>Step 2 — Map your columns</h3>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            We auto-matched what we could. Adjust if needed. Leave a field blank to skip it.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-dim)' }}>
                <th style={{ padding: '8px 0', width: '40%' }}>Directory field</th>
                <th style={{ padding: '8px 0' }}>Your column</th>
              </tr>
            </thead>
            <tbody>
              {DIR_FIELDS.map((f) => (
                <tr key={f.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{f.label}</div>
                    {f.hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{f.hint}</div>}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <select
                      value={mapping[f.key] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                      style={selectStyle}
                    >
                      <option value="">— don't import —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button onClick={() => setStep(1)} style={btnSecondary}>← Back</button>
            <button onClick={() => setStep(3)} style={btnPrimary}>Continue →</button>
          </div>
        </Card>
      )}

      {step === 3 && parsed && !result && (
        <Card>
          <h3 style={cardHeader}>Step 3 — Review &amp; import</h3>
          <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 14 }}>
            <strong>{mappedRows.length}</strong> usable row{mappedRows.length === 1 ? '' : 's'} from <strong>{parsed.rows.length}</strong> in the file
            {' '}(skipped {parsed.rows.length - mappedRows.length} that had no name, mobile, or email).
          </div>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>Duplicate handling</div>
            <label style={radioLabel}>
              <input type="radio" name="dup" value="skip"   checked={onDuplicate === 'skip'}   onChange={() => setOnDuplicate('skip')} />
              <span><strong>Skip</strong> existing — keep the row already in the directory.</span>
            </label>
            <label style={radioLabel}>
              <input type="radio" name="dup" value="update" checked={onDuplicate === 'update'} onChange={() => setOnDuplicate('update')} />
              <span><strong>Update</strong> existing — overwrite with the new values.</span>
            </label>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              We detect duplicates by matching <strong>mobile</strong>, then <strong>email</strong>.
            </div>
          </div>
          <Preview rows={mappedRows.slice(0, 5)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button onClick={() => setStep(2)} style={btnSecondary} disabled={busy}>← Back</button>
            <button onClick={commit} style={btnPrimary} disabled={busy}>{busy ? 'Importing…' : `Import ${mappedRows.length} row${mappedRows.length === 1 ? '' : 's'}`}</button>
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <h3 style={cardHeader}>Import complete</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat label="Added"   value={result.added} accent="#16a34a" />
            <Stat label="Updated" value={result.updated} accent="#2563eb" />
            <Stat label="Skipped" value={result.skipped} accent="#6b7280" />
            <Stat label="Total"   value={result.total} />
          </div>
          <button onClick={() => router.push('/dashboard/crm/people-directory')} style={btnPrimary}>Go to directory →</button>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Upload' },
    { n: 2, label: 'Map columns' },
    { n: 3, label: 'Review' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
      {steps.map((s) => {
        const active = step === s.n;
        const done = step > s.n;
        return (
          <div key={s.n} style={{
            flex: 1, padding: '10px 12px',
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: active ? 'var(--primary)' : done ? 'rgba(22,163,74,0.12)' : 'var(--s2)',
            color: active ? '#fff' : done ? '#16a34a' : 'var(--text-dim)',
            border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
            textAlign: 'center',
          }}>
            {done ? '✓' : s.n}. {s.label}
          </div>
        );
      })}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>{children}</div>;
}
function Preview({ rows }: { rows: Array<Record<string, string | null>> }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Preview (first 5):</div>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--s3)' }}>
            <th style={previewTh}>First</th><th style={previewTh}>Last</th><th style={previewTh}>Code</th><th style={previewTh}>Type</th><th style={previewTh}>Mobile</th><th style={previewTh}>Email</th><th style={previewTh}>City</th><th style={previewTh}>Address</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={previewTd}>{r.first_name || '—'}</td>
                <td style={previewTd}>{r.last_name || '—'}</td>
                <td style={previewTd}>{r.code || '—'}</td>
                <td style={previewTd}>{r.type || '—'}</td>
                <td style={previewTd}>{r.mobile || '—'}</td>
                <td style={previewTd}>{r.email || '—'}</td>
                <td style={previewTd}>{r.city || '—'}</td>
                <td style={previewTd}>{r.address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ padding: '8px 14px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || 'var(--text)' }}>{value}</div>
    </div>
  );
}

const cardHeader: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, color: 'var(--text)', fontWeight: 700 };
const radioLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: 'var(--text)', cursor: 'pointer' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer' };
const previewTh: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const previewTd: React.CSSProperties = { padding: '6px 10px', color: 'var(--text)' };
