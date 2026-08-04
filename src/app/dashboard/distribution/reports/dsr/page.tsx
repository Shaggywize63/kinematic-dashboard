'use client';
import { useEffect, useState } from 'react';
import api from '../../../../../lib/api';
import { Card, PageHeader, Th, Td, Btn, Pill, inr } from '../../../../../components/distribution/Atoms';

const fmtDay = (s?: string) => {
  if (!s) return { date: '—', day: '' };
  try { const d = new Date(s + 'T00:00:00'); return { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), day: d.toLocaleDateString('en-IN', { weekday: 'long' }) }; }
  catch { return { date: s, day: '' }; }
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-dim)', marginBottom: 12 }}>{title}</div>
      {children}
    </Card>
  );
}
function KV({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{k}</span>
      <span style={{ color: 'var(--text)', fontWeight: strong ? 800 : 600, fontFamily: strong ? undefined : 'JetBrains Mono, monospace' }}>{v}</span>
    </div>
  );
}

export default function DsrReport() {
  const [challans, setChallans] = useState<any[]>([]);
  const [sel, setSel] = useState<string>('');
  const [rep, setRep] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await api.getDsrList(); const list = (r?.data || r)?.challans || [];
        setChallans(list);
        if (list.length) setSel(`${list[0].salesman_id}|${list[0].report_date}`);
      } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!sel) return;
    const [salesman, date] = sel.split('|');
    (async () => {
      try { const r: any = await api.getDsr(salesman, date); setRep(r?.data || r); } catch { setRep(null); }
    })();
  }, [sel]);

  const day = fmtDay(rep?.header?.report_date);

  return (
    <div>
      <PageHeader
        title="Daily Salesman Challan"
        subtitle="Beat sales report — van stock, collection and performance for a salesman-day."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/distribution/reports" style={{ color: 'var(--text-dim)', fontSize: 13, alignSelf: 'center' }}>← Reports</a>
            <select value={sel} onChange={(e) => setSel(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontSize: 13, fontWeight: 700, maxWidth: 320 }}>
              {challans.map((c) => (
                <option key={c.id} value={`${c.salesman_id}|${c.report_date}`}>{c.salesman_name} · {c.report_date} · {c.challan_no}</option>
              ))}
            </select>
            <Btn variant="ghost" onClick={() => window.print()}>Print / PDF</Btn>
          </div>
        }
      />

      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading…</div>
        : !rep ? <div style={{ color: 'var(--text-dim)' }}>No challans available.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Challan header */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Challan No.</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{rep.header.challan_no}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>PM CORPORATION</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 1 }}>DAILY SALESMAN CHALLAN / BEAT SALES REPORT</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{day.date}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{day.day}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2px 24px' }}>
                  <KV k="Salesman" v={rep.header.salesman_name} />
                  <KV k="Route / Territory" v={rep.header.route_label || '—'} />
                  <KV k="Beat / Area" v={rep.header.beat_area || '—'} />
                  <KV k="Vehicle No." v={rep.header.vehicle_no || '—'} />
                  <KV k="Driver Name" v={rep.header.driver_name || '—'} />
                  <KV k="Helper Name" v={rep.header.helper_name || '—'} />
                  <KV k="Start Time" v={rep.header.start_time || '—'} />
                  <KV k="End Time" v={rep.header.end_time || '—'} />
                </div>
              </Card>

              {/* Performance + Stock summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <Section title="Performance Summary">
                  <KV k="Total Shops Visited" v={rep.performance.shops_visited} />
                  <KV k="Productive Calls" v={rep.performance.productive_calls} />
                  <KV k="Non-Productive Calls" v={rep.performance.nonproductive_calls} />
                  <KV k="Total Bills Generated" v={rep.performance.total_bills} />
                  <KV k="Total Quantity Sold" v={rep.performance.total_qty_sold} />
                  <KV k="Total Sales Value" v={inr(rep.performance.total_sales_value)} />
                  <KV k="Total Discount" v={inr(rep.performance.total_discount)} />
                  <KV k="Average Bill Value" v={inr(rep.performance.average_bill_value)} />
                </Section>
                <Section title="Stock Summary">
                  <KV k="Total Issued Qty" v={rep.stock_summary.total_issued} />
                  <KV k="Total Sold Qty" v={rep.stock_summary.total_sold} />
                  <KV k="Total Returned Qty" v={rep.stock_summary.total_returned} />
                  <KV k="Closing Stock Balance" v={rep.stock_summary.closing_balance} strong />
                </Section>
              </div>

              {/* Product-wise stock & sales */}
              <Section title="Product-wise Stock & Sales">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead><tr>
                      <Th>Sl.</Th><Th>Product</Th><Th>SKU</Th><Th>Unit</Th>
                      <Th style={{ textAlign: 'right' }}>Issued (A)</Th><Th style={{ textAlign: 'right' }}>Sold (B)</Th>
                      <Th style={{ textAlign: 'right' }}>Returned (C)</Th><Th style={{ textAlign: 'right' }}>Closing (A-B-C)</Th>
                    </tr></thead>
                    <tbody>
                      {rep.product_rows.map((p: any, i: number) => (
                        <tr key={i}>
                          <Td style={{ color: 'var(--text-dim)' }}>{i + 1}</Td>
                          <Td style={{ fontWeight: 700 }}>{p.product_name}</Td>
                          <Td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{p.sku}</Td>
                          <Td>{p.unit}</Td>
                          <Td style={{ textAlign: 'right' }}>{p.qty_issued}</Td>
                          <Td style={{ textAlign: 'right' }}>{p.qty_sold}</Td>
                          <Td style={{ textAlign: 'right' }}>{p.qty_returned}</Td>
                          <Td style={{ textAlign: 'right', fontWeight: 700 }}>{p.closing_stock}</Td>
                        </tr>
                      ))}
                      <tr>
                        <Td colSpan={4} style={{ fontWeight: 800, textAlign: 'right' }}>TOTAL</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 800 }}>{rep.stock_summary.total_issued}</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 800 }}>{rep.stock_summary.total_sold}</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 800 }}>{rep.stock_summary.total_returned}</Td>
                        <Td style={{ textAlign: 'right', fontWeight: 800 }}>{rep.stock_summary.closing_balance}</Td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Sales / Collection / Expenses */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <Section title="Sales Summary">
                  <KV k="Gross Sales" v={inr(rep.sales_summary.gross_sales)} />
                  <KV k="Total Discount" v={`- ${inr(rep.sales_summary.total_discount)}`} />
                  <KV k="Net Sales" v={inr(rep.sales_summary.net_sales)} />
                  <KV k="GST" v={inr(rep.sales_summary.total_gst)} />
                  <KV k="Round Off" v={inr(rep.sales_summary.round_off)} />
                  <KV k="Final Net Sales" v={inr(rep.sales_summary.final_net_sales)} strong />
                </Section>
                <Section title="Collection Summary">
                  {rep.collection.map((c: any) => (
                    <KV key={c.mode} k={c.mode.replace('_', ' ').replace(/\b\w/g, (m: string) => m.toUpperCase())} v={inr(c.amount)} />
                  ))}
                  <KV k="Total Collection" v={inr(rep.total_collection)} strong />
                </Section>
                <Section title="Other Expenses">
                  <KV k="Loading / Unloading" v={inr(rep.expenses.loading)} />
                  <KV k="Transport" v={inr(rep.expenses.transport)} />
                  <KV k="Miscellaneous" v={inr(rep.expenses.misc)} />
                  <KV k="Total Expenses" v={inr(rep.expenses.total)} strong />
                </Section>
              </div>

              {/* Top shops / Category / GST */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                <Section title="Top Shops by Sale">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><Th>Shop</Th><Th style={{ textAlign: 'right' }}>Bills</Th><Th style={{ textAlign: 'right' }}>Value</Th></tr></thead>
                    <tbody>
                      {rep.top_shops.map((s: any, i: number) => (
                        <tr key={i}><Td>{s.shop_name}</Td><Td style={{ textAlign: 'right' }}>{s.bills}</Td><Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(s.sales_value)}</Td></tr>
                      ))}
                      {!rep.top_shops.length && <tr><Td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>—</Td></tr>}
                    </tbody>
                  </table>
                </Section>
                <Section title="Category-wise Sales">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><Th>Category</Th><Th style={{ textAlign: 'right' }}>Value</Th><Th style={{ textAlign: 'right' }}>%</Th></tr></thead>
                    <tbody>
                      {rep.category_sales.map((c: any, i: number) => (
                        <tr key={i}><Td>{c.category}</Td><Td style={{ textAlign: 'right' }}>{inr(c.sales_value)}</Td><Td style={{ textAlign: 'right' }}>{c.pct}%</Td></tr>
                      ))}
                      {!rep.category_sales.length && <tr><Td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>—</Td></tr>}
                    </tbody>
                  </table>
                </Section>
                <Section title="GST Summary">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><Th>GST %</Th><Th style={{ textAlign: 'right' }}>Taxable</Th><Th style={{ textAlign: 'right' }}>CGST</Th><Th style={{ textAlign: 'right' }}>SGST</Th></tr></thead>
                    <tbody>
                      {rep.gst_summary.map((g: any, i: number) => (
                        <tr key={i}><Td>{g.gst_rate}%</Td><Td style={{ textAlign: 'right' }}>{inr(g.taxable_value)}</Td><Td style={{ textAlign: 'right' }}>{inr(g.cgst)}</Td><Td style={{ textAlign: 'right' }}>{inr(g.sgst)}</Td></tr>
                      ))}
                      {!rep.gst_summary.length && <tr><Td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>—</Td></tr>}
                    </tbody>
                  </table>
                </Section>
              </div>

              {rep.remarks && (
                <Card>
                  <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-dim)', marginBottom: 8 }}>Today&apos;s Remarks</div>
                  <div style={{ fontSize: 14 }}>{rep.remarks}</div>
                </Card>
              )}
            </div>
          )}
    </div>
  );
}
