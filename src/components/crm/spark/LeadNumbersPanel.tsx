'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Hash } from 'lucide-react';
import { crmLeads } from '../../../lib/crmApi';
import type { LeadRefBackfillResult } from '../../../types/crm';
import { apiErrorText } from '../../../lib/sparkAccounts';
import { Button, Card, Eyebrow, T } from '../../ui';

// Settings -> Lead Stages -> "Lead numbers" (connected-B2B): give every lead that has no reference number (SR/LD/2627-12)
// one. Preview only counts (dry_run:true); "Number them now" asks first, then numbers leads in batches of BATCH and can
// be run again until nothing is left. Admin only: the server answers 403 / 400 / 503 NOT_MIGRATED and the message is
// shown as it is.

/** Leads numbered per run; the panel offers another run until `remaining` is 0. */
export const BACKFILL_BATCH = 500;

const n = (v: number) => v.toLocaleString('en-IN');
const leads = (v: number) => `${n(v)} lead${v === 1 ? '' : 's'}`;

export default function LeadNumbersPanel() {
  const [busy, setBusy] = useState<null | 'preview' | 'run'>(null);
  const [preview, setPreview] = useState<LeadRefBackfillResult | null>(null);
  const [run, setRun] = useState<LeadRefBackfillResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const status = (e as { status?: number } | null)?.status;
    const msg = apiErrorText(e, status === 403 ? 'Only admins can number leads.' : 'Could not reach the server. Try again.');
    setError(msg);
  };

  const doPreview = async () => {
    setBusy('preview'); setError(null); setConfirming(false);
    try {
      const r = await crmLeads.backfillRefNumbers({ dry_run: true });
      setPreview(r.data); setRun(null);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const doRun = async () => {
    setBusy('run'); setError(null); setConfirming(false);
    try {
      const r = await crmLeads.backfillRefNumbers({ dry_run: false, limit: BACKFILL_BATCH });
      setRun(r.data); setPreview(null);
      if (r.data.remaining === 0) toast.success('Every lead now has a number');
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const done = run !== null && run.remaining === 0;

  return (
    <div data-testid="lead-numbers-panel"><Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Hash size={16} strokeWidth={1.8} aria-hidden style={{ color: T.dim }} />
        <Eyebrow>Lead numbers</Eyebrow>
      </div>
      <h3 style={{ margin: '8px 0 0', fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>Number existing leads</h3>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: T.dim, lineHeight: 1.5, maxWidth: 640 }}>
        New leads get a number such as SR/LD/2627-12 automatically. Leads created before numbers were switched on have none yet. Preview shows how many, and Number them now gives each one its number. A number never changes once it is given.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Button onClick={doPreview} disabled={busy !== null}>{busy === 'preview' ? 'Checking…' : 'Preview'}</Button>
        {!done && (
          run && run.remaining > 0 ? (
            <Button variant="primary" onClick={doRun} disabled={busy !== null}>{busy === 'run' ? 'Numbering…' : `Number the next ${leads(Math.min(BACKFILL_BATCH, run.remaining))}`}</Button>
          ) : (
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={busy !== null || confirming || (preview !== null && preview.total_missing === 0)}>Number them now</Button>
          )
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Confirm numbering" data-testid="backfill-confirm" style={{ marginTop: 12, border: `1px solid ${T.borderStrong}`, borderRadius: 10, padding: 12, background: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
            {preview ? `Give a number to ${leads(preview.total_missing)}?` : 'Give a number to every lead that has none?'} Numbers cannot be changed afterwards. Large lists are done in batches of {n(BACKFILL_BATCH)}.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={doRun}>Yes, number them</Button>
            <Button size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" data-testid="backfill-error" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 13 }}>{error}</div>
      )}

      {preview && !error && (
        <div data-testid="backfill-preview" style={{ marginTop: 12, fontSize: 13, color: T.text }}>
          <div data-testid="backfill-preview-text" style={{ fontWeight: 600 }}>
            {preview.total_missing === 0 ? 'Every lead already has a number.' : `${n(preview.total_missing)} ${preview.total_missing === 1 ? 'lead has' : 'leads have'} no number yet.`}
          </div>
          {preview.sample.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: T.dim, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {preview.sample.map((s) => <li key={s.id}>{s.name}</li>)}
              {preview.total_missing > preview.sample.length && <li style={{ listStyle: 'none', marginLeft: -18, color: T.mute }}>and more…</li>}
            </ul>
          )}
        </div>
      )}

      {run && !error && (
        <div data-testid="backfill-run" style={{ marginTop: 12, fontSize: 13, color: T.text, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>
            <span data-testid="backfill-processed">Numbered {leads(run.processed)}.</span>{' '}
            <span data-testid="backfill-remaining">{run.remaining === 0 ? 'Every lead now has a number.' : `${leads(run.remaining)} still without a number.`}</span>
          </div>
          {run.sample.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, color: T.dim, fontFamily: T.mono, fontSize: 12 }}>
              {run.sample.filter((s) => s.ref_no).map((s) => <li key={s.id}>{s.ref_no} · <span style={{ fontFamily: 'inherit' }}>{s.name}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </Card></div>
  );
}
