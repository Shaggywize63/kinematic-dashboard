'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmImport, crmSettings, crmCustomFields } from '../../../../../lib/crmApi';
import { extractFieldOverrides, buildFieldHelpers, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';
import type { ImportJob, CustomField } from '../../../../../types/crm';

type TargetField = { key: string; label: string; group: 'Built-in' | 'Custom fields' };

// Every built-in lead field the New Lead form can submit, with its import
// mapping key + default label. `scope` mirrors the form's B2B/B2C split;
// `gated` fields respect the client's field-override hide/relabel config.
// `overrideKey` is the key the override gate uses when it differs from the
// import key (owner_email → owner_id, source → source_id). The import service
// resolves owner_email → owner_id and source → source_id at commit time.
const BUILTIN_FIELDS: Array<{ key: string; label: string; scope?: 'b2b' | 'b2c'; gated?: boolean; overrideKey?: string }> = [
  { key: 'first_name', label: 'First Name', gated: true },
  { key: 'last_name', label: 'Last Name', gated: true },
  { key: 'email', label: 'Email', gated: true },
  { key: 'phone', label: 'Primary Mobile', gated: true },
  { key: 'alternate_mobiles', label: 'Alternate Mobiles' },
  { key: 'status', label: 'Status', gated: true },
  { key: 'source', label: 'Source', gated: true, overrideKey: 'source_id' },
  { key: 'owner_email', label: 'Assign To (owner email)', gated: true, overrideKey: 'owner_id' },
  { key: 'owner_name', label: 'Assign To (owner name)', gated: true, overrideKey: 'owner_id' },
  { key: 'company', label: 'Company', scope: 'b2b', gated: true },
  { key: 'title', label: 'Job Title', scope: 'b2b', gated: true },
  { key: 'industry', label: 'Industry', scope: 'b2b', gated: true },
  { key: 'date_of_birth', label: 'Date of Birth', scope: 'b2c', gated: true },
  { key: 'gender', label: 'Gender', scope: 'b2c', gated: true },
  { key: 'preferred_contact_method', label: 'Preferred Channel', scope: 'b2c', gated: true },
  { key: 'address_line1', label: 'Address Line 1', scope: 'b2c', gated: true },
  { key: 'address_line2', label: 'Address Line 2', scope: 'b2c', gated: true },
  { key: 'city', label: 'City', gated: true },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code', scope: 'b2c', gated: true },
  { key: 'country', label: 'Country', scope: 'b2c', gated: true },
  { key: 'district', label: 'District' },
  { key: 'block', label: 'Block' },
  { key: 'marketing_consent', label: 'Marketing Consent', scope: 'b2c', gated: true },
  { key: 'whatsapp_consent', label: 'WhatsApp Consent', scope: 'b2c', gated: true },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags' },
  { key: 'is_b2c', label: 'Is Consumer (B2C)' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
];

// Product-line custom fields the form manages via its own section — not import targets.
const PRODUCT_LINE_KEYS = new Set(['product_interested', 'quantity', 'measuring_unit', 'estimated_amount']);

// Build the import mapping targets = visible built-in fields (respecting the
// client's field overrides across both B2B and B2C scopes, since a CSV can hold
// either) + the client's lead custom fields. Passing overrides=null (before
// settings load) leaves all built-ins visible.
function computeTargets(overrides: FieldOverrides | null, customs: CustomField[]): TargetField[] {
  const b2b = buildFieldHelpers(overrides ?? undefined, 'lead', 'b2b');
  const b2c = buildFieldHelpers(overrides ?? undefined, 'lead', 'b2c');
  const builtins: TargetField[] = [];
  for (const f of BUILTIN_FIELDS) {
    const gk = f.overrideKey ?? f.key;
    let visible = true;
    let label = f.label;
    if (f.gated && overrides) {
      if (f.scope === 'b2b') { visible = !b2b.isHidden(gk); label = b2b.labelFor(gk, f.label); }
      else if (f.scope === 'b2c') { visible = !b2c.isHidden(gk); label = b2c.labelFor(gk, f.label); }
      else {
        const vb = !b2b.isHidden(gk);
        const vc = !b2c.isHidden(gk);
        visible = vb || vc;
        label = (vb ? b2b : b2c).labelFor(gk, f.label);
      }
    }
    if (visible) builtins.push({ key: f.key, label, group: 'Built-in' });
  }
  const custom: TargetField[] = customs
    .filter((c) => c.entity_type === 'lead' && !c.hidden && c.field_type !== 'formula' && !PRODUCT_LINE_KEYS.has(c.field_key))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ key: `custom_fields.${c.field_key}`, label: c.label || c.field_key, group: 'Custom fields' as const }));
  return [...builtins, ...custom];
}

function downloadTemplate(targets: TargetField[]) {
  const keys = targets.map((t) => t.key);
  const sampleMap: Record<string, string> = {
    first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.com', phone: '9999900000',
    company: 'Acme Corp', title: 'VP Sales', status: 'new', source: 'Website',
    owner_email: 'rep@company.com', city: 'Patna', state: 'Bihar',
  };
  const sample = keys.map((k) => sampleMap[k] ?? '');
  const csv = [keys.join(','), sample.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'leads_import_template.csv';
  a.click(); URL.revokeObjectURL(url);
}

// Summary shape now returned by POST /import/commit. Backend collapses every
// row through findOrCreateLead, so we get a definitive created-vs-merged
// split rather than a "looks duplicate, ignored" warning list.
interface CommitSummary {
  total: number;
  created: number;
  merged: number;
  error_count: number;
}

export default function LeadImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [busy, setBusy] = useState(false);
  // Mapping targets = visible built-in fields + this client's lead custom fields,
  // loaded from the same config the New Lead form uses so import maps everything.
  const [targetFields, setTargetFields] = useState<TargetField[]>(() => computeTargets(null, []));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, cf] = await Promise.all([crmSettings.get(), crmCustomFields.list()]);
        const overrides = extractFieldOverrides((s as { data?: unknown })?.data ?? s);
        const customs = (((cf as { data?: CustomField[] })?.data) ?? []) as CustomField[];
        if (alive) setTargetFields(computeTargets(overrides, customs));
      } catch {
        /* keep the default built-in list if settings/custom-fields fail to load */
      }
    })();
    return () => { alive = false; };
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity', 'lead');
      const r = await crmImport.upload(fd);
      setJob(r.data);
      const text = await file.text();
      const firstLine = text.split('\n')[0] || '';
      const cols = firstLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      setHeaders(cols);
      // Auto-map header → CRM field. Strict equality first; only fall back
      // to a synonym match if no exact hit. The previous "substring
      // includes" check wrongly mapped `owner_email` → `email` (because
      // "owner_email".includes("email") is true), which then overwrote
      // every imported lead's email with the rep's address and made
      // re-imports all dedup into the same lead. The fix: require an
      // exact normalised match OR an explicit synonym, never a loose
      // substring overlap.
      const SYNONYMS: Record<string, string> = {
        firstname: 'first_name', fname: 'first_name', given_name: 'first_name',
        lastname: 'last_name', lname: 'last_name', surname: 'last_name', family_name: 'last_name',
        mobile: 'phone', mobile_number: 'phone', phone_number: 'phone', contact: 'phone', contact_number: 'phone',
        email_id: 'email', email_address: 'email', mail: 'email',
        organization: 'company', organisation: 'company', firm: 'company',
        designation: 'title', position: 'title', role: 'title',
        lead_source: 'source', channel: 'source',
        // Owner-identity synonyms — these all map to owner_email (the
        // import service then resolves owner_email → owner_id at run
        // time). NEVER fold into the lead's own email/phone columns.
        owneremail: 'owner_email', rep_email: 'owner_email', sales_email: 'owner_email',
        assigned_to_email: 'owner_email', owner_mail: 'owner_email',
        // Owner by NAME — resolves to owner_id server-side just like owner_email.
        owner: 'owner_name', ownername: 'owner_name', assigned_to: 'owner_name',
        assigned_to_name: 'owner_name', rep_name: 'owner_name', sales_rep: 'owner_name',
        salesperson: 'owner_name', sales_person: 'owner_name', account_owner: 'owner_name',
      };
      // Header (normalised) → target key, built from the live target list so
      // built-in AND custom fields auto-map. Match on the target key, its label,
      // or (for custom fields) the bare field_key after the custom_fields. prefix.
      const keyByNorm = new Map<string, string>();
      const normKey = (v: string) => v.toLowerCase().replace(/[\s-]/g, '_');
      for (const t of targetFields) {
        keyByNorm.set(normKey(t.key), t.key);
        keyByNorm.set(normKey(t.label), t.key);
        if (t.key.startsWith('custom_fields.')) {
          keyByNorm.set(normKey(t.key.slice('custom_fields.'.length)), t.key);
        }
      }
      const auto: Record<string, string> = {};
      cols.forEach((c) => {
        const norm = normKey(c);
        if (keyByNorm.has(norm)) {
          auto[c] = keyByNorm.get(norm)!;
        } else if (SYNONYMS[norm]) {
          auto[c] = SYNONYMS[norm];
        }
        // Anything else stays unmapped — the rep can choose on the Map step.
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
      // Backend now kicks off the import in the background and returns
      // immediately with status='running'. We poll /jobs/:id every 1.5s
      // to drive the progress bar and detect completion.
      await crmImport.commit({ job_id: job.id });
      pollJobUntilDone(job.id);
    } catch (e: any) {
      toast.error(e.message || 'Commit failed');
      setBusy(false);
    }
  };

  // Poll the import job until status flips to 'completed' or 'failed'. Updates
  // the job state on every tick so the progress bar advances. Stops after
  // 30 minutes of polling as a hard safety cap.
  const pollJobUntilDone = (jobId: string) => {
    const started = Date.now();
    const tick = async () => {
      try {
        const r = await crmImport.getJob(jobId);
        const updated = (((r as unknown) as { data?: ImportJob & { summary?: CommitSummary } }).data
          ?? ((r as unknown) as ImportJob & { summary?: CommitSummary }));
        setJob(updated);
        const s = (updated as { status?: string }).status;
        if (s === 'completed') {
          const sum = (updated as { summary?: CommitSummary }).summary;
          if (sum) setSummary(sum);
          setStep(4);
          setBusy(false);
          return;
        }
        if (s === 'failed') {
          toast.error('Import failed. See errors in the job summary.');
          const sum = (updated as { summary?: CommitSummary }).summary;
          if (sum) { setSummary(sum); setStep(4); }
          setBusy(false);
          return;
        }
        if (Date.now() - started > 30 * 60_000) {
          toast.error('Import is taking unusually long — refresh and check the leads list.');
          setBusy(false);
          return;
        }
        setTimeout(tick, 1500);
      } catch {
        // Transient errors (e.g. brief network blip) — back off and retry.
        setTimeout(tick, 3000);
      }
    };
    void tick();
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18 }}>Import Leads</h2>
        <button onClick={() => downloadTemplate(targetFields)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ⬇ Download Template CSV
        </button>
      </div>
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
      {step === 1 && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
          style={{ border: '2px dashed var(--border-l)', borderRadius: 12, padding: 50, textAlign: 'center', color: 'var(--text-dim)' }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>⬇</div>
          <div style={{ marginBottom: 12 }}>Drop a CSV or XLSX file here, or</div>
          <label style={{ background: 'var(--primary)', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            Choose File
            <input type="file" accept=".csv,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          </label>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14, maxWidth: 480, margin: '14px auto 0' }}>
            Duplicates across phone + email are merged automatically — both within this file and
            against your existing leads. You&rsquo;ll see the create-vs-merge breakdown after import.
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>Map your CSV columns to lead fields:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {headers.map((h) => (
              <div key={h} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', padding: '6px 10px', background: 'var(--s3)', borderRadius: 6 }}>{h}</div>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <select value={mapping[h] || ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} style={{ flex: 1, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
                  <option value="">(skip)</option>
                  {(['Built-in', 'Custom fields'] as const).map((grp) => {
                    const items = targetFields.filter((t) => t.group === grp);
                    if (items.length === 0) return null;
                    return (
                      <optgroup key={grp} label={grp}>
                        {items.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </optgroup>
                    );
                  })}
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
      {step === 3 && job && (
        <div>
          <div style={{ marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: 'var(--text)' }}>{job.total_rows || sample.length} rows ready to import.</span>
            {job.errors && job.errors.length > 0 && (
              <div style={{ color: 'var(--primary)', marginTop: 6 }}>{job.errors.length} validation issues found.</div>
            )}
          </div>
          {busy && (() => {
            // Progress is updated by the backend every 25 rows; reads
            // straight off the polled job. Falls back to 0 / total when
            // the first poll hasn't landed yet.
            const total = (job.total_rows as number) || sample.length || 0;
            const processed = ((job as { processed_rows?: number }).processed_rows as number) || 0;
            const inserted = ((job as { inserted?: number }).inserted as number) || 0;
            const skipped = ((job as { skipped?: number }).skipped as number) || 0;
            const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
            return (
              <div style={{ marginBottom: 16, padding: 14, background: 'var(--s3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    Importing… {processed} / {total} rows
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {inserted} new · {skipped} merged or skipped
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--s2)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', background: 'var(--primary)',
                    transition: 'width 300ms ease',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                  Keep this tab open while the import runs. You can leave at any time — the job continues in the background and you can come back to /dashboard/crm/leads to see the result.
                </div>
              </div>
            );
          })()}
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
            <button onClick={() => setStep(2)} disabled={busy} style={btnGhost}>Back</button>
            <button onClick={commit} disabled={busy} style={btnPrimary}>{busy ? 'Importing…' : `Commit ${job.total_rows || sample.length} Rows`}</button>
          </div>
        </div>
      )}
      {step === 4 && summary && (
        <div>
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Import complete</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              Cross-channel dedup ran on every row before insert.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <SummaryCard label="Processed"        value={summary.total}      tint="var(--text-dim)" />
            <SummaryCard label="New leads"        value={summary.created}    tint="rgb(34, 197, 94)" />
            <SummaryCard label="Merged into existing" value={summary.merged} tint="rgb(99, 179, 237)" />
            {summary.error_count > 0 && (
              <SummaryCard label="Errors" value={summary.error_count} tint="rgb(239, 68, 68)" />
            )}
          </div>

          {summary.merged > 0 && (
            <div style={{
              background: 'rgba(99, 179, 237, 0.08)', border: '1px solid rgba(99, 179, 237, 0.25)',
              borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)', marginBottom: 12,
            }}>
              💡 {summary.merged} row{summary.merged === 1 ? '' : 's'} matched existing leads by phone or email.
              Each is attached as an additional source on the original lead — no duplicates created.
              Check Lead Sources for the &ldquo;Excel/CSV Import&rdquo; attribution.
            </div>
          )}

          {summary.error_count > 0 && job?.errors && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)', marginBottom: 12,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {summary.error_count} row{summary.error_count === 1 ? '' : 's'} skipped
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)' }}>
                {(job.errors as Array<{ row: number; reason: string }>).slice(0, 5).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.reason}</li>
                ))}
                {job.errors.length > 5 && <li>…and {job.errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setStep(1); setJob(null); setHeaders([]); setMapping({}); setSample([]); setSummary(null); }} style={btnGhost}>
              Import another file
            </button>
            <button onClick={() => router.push('/dashboard/crm/leads')} style={btnPrimary}>
              View leads →
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

const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
