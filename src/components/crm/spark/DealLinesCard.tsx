'use client';
import type { CSSProperties } from 'react';
import type { DealLineItem } from '../../../types/crm';
import { arr } from '../../../lib/sparkAccounts';
import { formatINR } from '../../../lib/formatCurrency';
import { T } from '../../ui';

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const has = (v: unknown): boolean => v !== null && v !== undefined && v !== '';
const dash = <span style={{ color: T.mute }}>{'—'}</span>;

/** The product reference of a stored line: the server's `reference` (the product sku), else the sku fields. */
export const lineReference = (l: Pick<DealLineItem, 'reference' | 'sku' | 'crm_products'>): string => l.reference || l.sku || l.crm_products?.sku || '';

/** Quoted total (sum of line totals) and ordered total (sum of order values, null when no line has one). */
export function lineTotals(items: DealLineItem[]): { quoted: number; ordered: number | null } {
  const list = arr<DealLineItem>(items);
  const quoted = list.reduce((s, l) => s + num(l.line_total), 0);
  const withOrder = list.filter((l) => has(l.order_value));
  return { quoted: Math.round(quoted * 100) / 100, ordered: withOrder.length ? Math.round(withOrder.reduce((s, l) => s + num(l.order_value), 0) * 100) / 100 : null };
}

const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' };
const thR: CSSProperties = { ...th, textAlign: 'right' };
const td: CSSProperties = { textAlign: 'left', padding: '10px', verticalAlign: 'top' };
const tdR: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: T.mono };

/**
 * Spark & Ray deal detail: the product lines as a table (reference, item, make, brand, qty, quoted, ordered, MAC
 * funnel reference) with totals. Blanks show an em dash. Order values are entered when the deal is closed as Won
 * (or in Edit deal), so this table is read-only.
 */
export function DealLinesCard({ items, error }: { items: DealLineItem[] | null; error?: boolean }) {
  const list = arr<DealLineItem>(items);
  const totals = lineTotals(list);
  return (
    <div data-testid="deal-lines-card" style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{`Products${list.length ? ` (${list.length})` : ''}`}</div>
      {error ? (
        <div style={{ fontSize: 12, color: T.red }}>Could not load the product lines.</div>
      ) : items === null ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading{'…'}</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No product lines yet. Use Edit deal to add the products quoted to the customer.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="deal-lines-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                <th style={th}>Reference</th>
                <th style={th}>Item</th>
                <th style={th}>Make</th>
                <th style={th}>Brand</th>
                <th style={thR}>Qty</th>
                <th style={thR}>Quoted</th>
                <th style={thR}>Ordered</th>
                <th style={th}>Funnel ref</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} data-testid="deal-line-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontFamily: T.mono }}>{lineReference(l) || dash}</td>
                  <td style={{ ...td, overflowWrap: 'anywhere' }}>{l.name || dash}</td>
                  <td style={td}>{l.make_name || dash}</td>
                  <td style={td}>{l.brand_name || dash}</td>
                  <td style={tdR}>{has(l.quantity) ? num(l.quantity) : dash}</td>
                  <td style={tdR}>{formatINR(num(l.line_total))}</td>
                  <td style={tdR}>{has(l.order_value) ? formatINR(num(l.order_value)) : dash}</td>
                  <td style={{ ...td, fontFamily: T.mono }}>{l.funnel_ref || dash}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="deal-lines-totals" style={{ fontWeight: 700 }}>
                <td style={td} colSpan={5}>Total</td>
                <td style={tdR} data-testid="deal-lines-quoted-total">{formatINR(totals.quoted)}</td>
                <td style={tdR} data-testid="deal-lines-ordered-total">{totals.ordered === null ? dash : formatINR(totals.ordered)}</td>
                <td style={td} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The Won dialog's extra step, shown when a line has no order value yet: one input per line, pre-filled with the
 * quoted value (or the order value already recorded) and editable.
 */
export function OrderValueStep({ items, values, onChange }: {
  items: DealLineItem[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div data-testid="order-value-step" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Confirm the ordered value</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Quoted values are filled in. Change a line to what the customer actually ordered.</div>
      </div>
      {arr<DealLineItem>(items).map((l, i) => (
        <div key={l.id} data-testid="order-value-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', overflowWrap: 'anywhere' }}>{l.name || `Line ${i + 1}`}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Quoted {formatINR(num(l.line_total))}</div>
          </div>
          <input
            aria-label={`Ordered value for ${l.name || `line ${i + 1}`}`} type="number" min={0} step="0.01" value={values[l.id] ?? ''}
            onChange={(e) => onChange(l.id, e.target.value)}
            style={{ width: 130, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, textAlign: 'right' }}
          />
        </div>
      ))}
    </div>
  );
}
