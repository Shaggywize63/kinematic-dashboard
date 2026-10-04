'use client';
// "Apply to invoices" table shared by the Record Payment form and the payment detail's apply modal.

import Link from 'next/link';
import { Button, Input, T } from '../ui';
import { OpenInvoice } from '../../lib/financeApi';
import { fmtDate, inr, num } from '../../lib/financeFormat';
import { round2 } from './masterBits';

export const EPS = 0.005;

/** Row-level problem with an entered amount, or null. */
export function allocationError(inv: OpenInvoice, raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return 'Enter a valid amount';
  if (v > inv.balance + EPS) return `Exceeds balance (${inr(inv.balance)})`;
  return null;
}

export const sumAllocations = (values: Record<string, string>) =>
  round2(Object.values(values).reduce((s, v) => s + Math.max(0, num(v)), 0));

/** Fill oldest-first until `amount` is used up. */
export function autoAllocate(invoices: OpenInvoice[], amount: number): Record<string, string> {
  const out: Record<string, string> = {};
  let left = round2(amount);
  const sorted = [...invoices].sort((a, b) => (a.issue_date + a.number).localeCompare(b.issue_date + b.number));
  for (const inv of sorted) {
    if (left <= EPS) break;
    const take = Math.min(left, inv.balance);
    out[inv.id] = String(round2(take));
    left = round2(left - take);
  }
  return out;
}

const th = { padding: '8px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const };
const td = { padding: '8px 12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const };

export function AllocationTable({ invoices, values, onChange, onPayFull, disabled }: {
  invoices: OpenInvoice[]; values: Record<string, string>; onChange: (id: string, v: string) => void; onPayFull: (inv: OpenInvoice) => void; disabled?: boolean;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Invoice #</th>
            <th style={{ ...th, textAlign: 'left' }}>Date</th>
            <th style={{ ...th, textAlign: 'right' }}>Balance due</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount to apply</th>
            <th style={th}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const err = allocationError(inv, values[inv.id]);
            return (
              <tr key={inv.id}>
                <td style={td}><Link href={`/dashboard/finance/invoices/${inv.id}`} style={{ color: T.info, fontWeight: 600 }} target="_blank" rel="noopener">{inv.number}</Link></td>
                <td style={td}>{fmtDate(inv.issue_date)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{inr(inv.balance)}</td>
                <td style={{ ...td, textAlign: 'right', verticalAlign: 'top' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Input type="number" inputMode="decimal" min={0} step="0.01" value={values[inv.id] ?? ''} placeholder="0.00" disabled={disabled}
                      aria-label={`Amount to apply to invoice ${inv.number}`} invalid={!!err}
                      onChange={(e) => onChange(inv.id, e.target.value)} style={{ width: 150, textAlign: 'right' }} />
                    {err && <span role="alert" style={{ fontSize: 12, color: T.red, whiteSpace: 'normal', textAlign: 'right' }}>{err}</span>}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Button size="sm" disabled={disabled} onClick={() => onPayFull(inv)} aria-label={`Pay invoice ${inv.number} in full`}>Pay in full</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
