'use client';
// "Sample invoices" card on a lead page (connected-B2B / Spark & Ray only): a plain list of sample-invoice
// NUMBERS the rep has handed out. No invoice generation, no delivery details — just a text box to add a number,
// the list of added numbers, and a × to remove one.
//
// Storage: the numbers live on the lead row's `custom_fields` jsonb under `sample_invoices` (array of strings).
// There is NO migration and NO built-in column — so this is NOT a built-in field and the field-override contract
// does not apply. To mutate we read the lead's current custom_fields, swap in the new array, and PATCH the whole
// object back (merge — every other custom_fields key is preserved), then let the parent refetch so it survives a
// reload. Renders nothing, and sends nothing, for any other client.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, Eyebrow, IconButton, Input, T } from '../ui';
import { crmLeads } from '../../lib/crmApi';
import { isB2bClientActive } from '../../lib/b2bClient';
import type { LifecycleLead } from './lead-detail/types';

/** Trim, drop blanks, and dedupe (case-insensitive, first spelling wins) while keeping order. */
export function normalizeSampleInvoices(values: unknown): string[] {
  const arr = Array.isArray(values) ? values : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export default function SampleInvoicesCard({ lead, onSaved }: { lead: LifecycleLead; onSaved: (updated: LifecycleLead) => void }) {
  const b2b = isB2bClientActive();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // The persisted list is the source of truth — derived from the lead prop so a refetch (or a folded PATCH
  // response) flows straight through.
  const invoices = useMemo(
    () => normalizeSampleInvoices((lead.custom_fields as Record<string, unknown> | null)?.sample_invoices),
    [lead.custom_fields],
  );

  if (!b2b) return null;

  const save = async (next: string[]) => {
    setBusy(true);
    try {
      // Merge: keep every other custom_fields key, only swap sample_invoices.
      const merged = { ...(lead.custom_fields || {}), sample_invoices: next };
      const r = await crmLeads.update(lead.id, { custom_fields: merged } as any);
      onSaved(r.data as LifecycleLead);
    } catch (e: any) {
      toast.error(e?.message || 'Couldn’t update sample invoices');
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (busy) return;
    const next = normalizeSampleInvoices([...invoices, draft]);
    // Blank or a dupe of an existing number adds nothing — clear the box and don't send a PATCH.
    if (next.length === invoices.length) { setDraft(''); return; }
    setDraft('');
    void save(next);
  };

  const remove = (value: string) => {
    if (busy) return;
    void save(invoices.filter((v) => v.toLowerCase() !== value.toLowerCase()));
  };

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8 }}>Sample invoices</Eyebrow>
      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <Input
          aria-label="Invoice number"
          placeholder="Invoice number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          style={{ flex: '1 1 140px', minWidth: 0 }}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !draft.trim()}>Add</Button>
      </form>

      {invoices.length === 0 ? (
        <div style={{ fontSize: 13.5, color: T.mute, marginTop: 12 }}>No sample invoices yet</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {invoices.map((n) => (
            <li
              key={n}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${T.border}` }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, fontFamily: T.mono, overflowWrap: 'anywhere', minWidth: 0 }}>{n}</span>
              <IconButton label={`Remove ${n}`} onClick={() => remove(n)} disabled={busy}>
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
