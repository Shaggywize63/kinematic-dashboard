'use client';
/**
 * Scheduled report digests — let an admin set up a recurring email that renders
 * one of the analytics reports (server-side) and sends it to a recipient list.
 * Writes the crm_report_schedules shape the dispatcher (runDueReportDigests)
 * reads: { report_key, frequency, send_hour (UTC), day_of_week|day_of_month,
 * to_emails[] }.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  crmReportSchedules,
  type ReportSchedule,
  type DigestFrequency,
} from '../../../../../lib/crmApi';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Draft = {
  id?: string;
  name: string;
  report_key: string;
  frequency: DigestFrequency;
  send_hour: number;
  day_of_week: number;
  day_of_month: number;
  to_emails: string; // comma / newline separated in the form
  is_active: boolean;
};

function emptyDraft(): Draft {
  return { name: '', report_key: '', frequency: 'weekly', send_hour: 8, day_of_week: 1, day_of_month: 1, to_emails: '', is_active: true };
}

function parseEmails(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)));
}

export default function ReportSchedulesPage() {
  const [items, setItems] = useState<ReportSchedule[]>([]);
  const [catalog, setCatalog] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true);
    try { setItems((await crmReportSchedules.list()).data || []); }
    catch (e: any) { toast.error(e?.message || 'Load failed'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    (async () => {
      try { setCatalog((await crmReportSchedules.catalog()).data || []); }
      catch { /* non-fatal — select just shows empty */ }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reportLabel = (key: string) => catalog.find((c) => c.key === key)?.label || key;

  const summary = useMemo(() => {
    if (!draft.report_key) return 'Pick a report to preview the schedule.';
    const when =
      draft.frequency === 'daily' ? 'every day'
      : draft.frequency === 'weekly' ? `every ${DOW[draft.day_of_week]}`
      : `on day ${draft.day_of_month} of each month`;
    const hh = String(draft.send_hour).padStart(2, '0');
    const recips = parseEmails(draft.to_emails);
    return `Email “${reportLabel(draft.report_key)}” ${when} at ${hh}:00 UTC to ${recips.length || 0} recipient${recips.length === 1 ? '' : 's'}.`;
  }, [draft, catalog]);

  function startCreate() { setDraft(emptyDraft()); setShowForm(true); }
  function startEdit(s: ReportSchedule) {
    setDraft({
      id: s.id, name: s.name, report_key: s.report_key, frequency: s.frequency,
      send_hour: s.send_hour, day_of_week: s.day_of_week ?? 1, day_of_month: s.day_of_month ?? 1,
      to_emails: (s.to_emails || []).join(', '), is_active: s.is_active,
    });
    setShowForm(true);
  }

  async function save() {
    const to_emails = parseEmails(draft.to_emails);
    if (!draft.name.trim()) return toast.error('Give the digest a name');
    if (!draft.report_key) return toast.error('Pick a report');
    if (!to_emails.length) return toast.error('Add at least one recipient email');
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        report_key: draft.report_key,
        frequency: draft.frequency,
        send_hour: draft.send_hour,
        day_of_week: draft.frequency === 'weekly' ? draft.day_of_week : null,
        day_of_month: draft.frequency === 'monthly' ? draft.day_of_month : null,
        to_emails,
        is_active: draft.is_active,
      };
      if (draft.id) await crmReportSchedules.update(draft.id, body);
      else await crmReportSchedules.create(body);
      toast.success(draft.id ? 'Digest updated' : 'Digest scheduled');
      setShowForm(false);
      setDraft(emptyDraft());
      reload();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function toggleActive(s: ReportSchedule) {
    setBusy((b) => ({ ...b, [s.id]: true }));
    try { await crmReportSchedules.update(s.id, { is_active: !s.is_active }); reload(); }
    catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [s.id]: false })); }
  }

  async function remove(s: ReportSchedule) {
    if (!confirm(`Delete digest “${s.name}”?`)) return;
    setBusy((b) => ({ ...b, [s.id]: true }));
    try { await crmReportSchedules.remove(s.id); toast.success('Deleted'); reload(); }
    catch (e: any) { toast.error(e?.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [s.id]: false })); }
  }

  async function runNow(s: ReportSchedule) {
    setBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const r = await crmReportSchedules.runNow(s.id);
      toast.success(`Sent to ${r.data?.sent ?? 0}/${r.data?.recipients ?? 0} recipient(s)`);
    } catch (e: any) { toast.error(e?.message || 'Send failed'); }
    finally { setBusy((b) => ({ ...b, [s.id]: false })); }
  }

  function describe(s: ReportSchedule): string {
    const when =
      s.frequency === 'daily' ? 'Daily'
      : s.frequency === 'weekly' ? `Weekly · ${DOW[s.day_of_week ?? 1]}`
      : `Monthly · day ${s.day_of_month ?? 1}`;
    return `${when} at ${String(s.send_hour).padStart(2, '0')}:00 UTC`;
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Link href="/dashboard/crm/reports" style={{ color: 'var(--text-dim)', fontSize: 13, textDecoration: 'none' }}>← Reports</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📧 Scheduled Digests</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: 13 }}>
            Email a report to your team on a recurring schedule. Times are in UTC.
          </p>
        </div>
        {!showForm && <button style={btnPrimary} onClick={startCreate}>+ New digest</button>}
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="Name">
              <input style={input} value={draft.name} placeholder="e.g. Weekly sales summary"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Report">
              <select style={input} value={draft.report_key}
                onChange={(e) => setDraft({ ...draft, report_key: e.target.value })}>
                <option value="">Select a report…</option>
                {catalog.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Field label="Frequency">
                <select style={input} value={draft.frequency}
                  onChange={(e) => setDraft({ ...draft, frequency: e.target.value as DigestFrequency })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              {draft.frequency === 'weekly' && (
                <Field label="Day of week">
                  <select style={input} value={draft.day_of_week}
                    onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}>
                    {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </Field>
              )}
              {draft.frequency === 'monthly' && (
                <Field label="Day of month (1–28)">
                  <input type="number" min={1} max={28} style={{ ...input, width: 120 }} value={draft.day_of_month}
                    onChange={(e) => setDraft({ ...draft, day_of_month: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
                </Field>
              )}
              <Field label="Hour (UTC)">
                <select style={input} value={draft.send_hour}
                  onChange={(e) => setDraft({ ...draft, send_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </Field>
            </div>

            <Field label="Recipients (comma or newline separated)">
              <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={draft.to_emails}
                placeholder="manager@acme.com, head@acme.com"
                onChange={(e) => setDraft({ ...draft, to_emails: e.target.value })} />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
              <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
              Active
            </label>

            <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text)' }}>
              {summary}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : draft.id ? 'Update digest' : 'Schedule digest'}</button>
              <button style={btnGhost} onClick={() => { setShowForm(false); setDraft(emptyDraft()); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
      ) : items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-dim)' }}>
          No scheduled digests yet. Create one to email a report on a recurring cadence.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((s) => (
            <div key={s.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', opacity: s.is_active ? 1 : 0.6 }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {s.name}{' '}
                  <span style={{ fontWeight: 500, color: 'var(--text-dim)', fontSize: 12 }}>· {reportLabel(s.report_key)}</span>
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 3 }}>
                  {describe(s)} · {(s.to_emails || []).length} recipient{(s.to_emails || []).length === 1 ? '' : 's'}
                  {s.next_run_at && <> · next {new Date(s.next_run_at).toLocaleString()}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btnSmallGhost} disabled={busy[s.id]} onClick={() => runNow(s)}>Send now</button>
                <button style={btnSmallGhost} disabled={busy[s.id]} onClick={() => toggleActive(s)}>{s.is_active ? 'Pause' : 'Resume'}</button>
                <button style={btnSmallGhost} onClick={() => startEdit(s)}>Edit</button>
                <button style={btnSmallDanger} disabled={busy[s.id]} onClick={() => remove(s)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
