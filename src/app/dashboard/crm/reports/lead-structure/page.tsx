'use client';
import { useCallback, useEffect, useState } from 'react';
import { crmReports, type LeadStructureReportData, type LeadStructureReportRow, type LeadStructureFilters } from '../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { isManagerOrAdmin } from '../../../../../lib/clientFeatures';
import { useAuth } from '../../../../../hooks/useAuth';
import { usePageTitle } from '../../../../../lib/pageTitle';
import { EmptyState, T, useIsCompact } from '../../../../../components/ui';
import TileGrid from '../../../../../components/ui/TileGrid';

const EMPTY: LeadStructureReportData = { total_leads: 0, by_group: [], by_company: [], by_plant: [], by_make: [], by_product: [] };

// Which filter key a click on a row of each dimension sets.
type Dim = { title: string; rows: LeadStructureReportRow[]; filterKey?: keyof LeadStructureFilters; showQty?: boolean };

function Bar({ row, max, showQty, active, onClick }: { row: LeadStructureReportRow; max: number; showQty?: boolean; active: boolean; onClick?: () => void }) {
  const pct = max > 0 ? Math.round((row.lead_count / max) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || row.id === null}
      style={{
        display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
        padding: '6px 0', cursor: onClick && row.id !== null ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: active ? 800 : 600, color: active ? T.red : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
          {row.lead_count}{showQty && row.qty_total != null ? <span style={{ color: T.dim, fontWeight: 500 }}> · {row.qty_total} qty</span> : null}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: T.panel }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: active ? T.red : '#E88', minWidth: pct > 0 ? 6 : 0 }} />
      </div>
    </button>
  );
}

export default function LeadStructureReportPage() {
  usePageTitle('Lead structure report', 'Lead counts by group, company, plant, make and product. Click a bar to drill in.');
  const { user, loading: authLoading } = useAuth();
  const compact = useIsCompact();
  const [data, setData] = useState<LeadStructureReportData>(EMPTY);
  const [filters, setFilters] = useState<LeadStructureFilters>({});
  const [loading, setLoading] = useState(true);
  const allowed = !authLoading && isB2bClientActive() && isManagerOrAdmin(user as never);

  const load = useCallback(async (f: LeadStructureFilters) => {
    setLoading(true);
    try {
      const r = await crmReports.leadStructure(f);
      setData(r.data ?? EMPTY);
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) load(filters); }, [allowed, filters, load]);

  if (!authLoading && !allowed) {
    return <EmptyState title="Not available" description="The lead-structure report is available to managers on the connected-B2B workspace." />;
  }

  // Active-filter chips (removable).
  const chips: Array<{ key: keyof LeadStructureFilters; label: string }> = [];
  const nameFor = (rows: LeadStructureReportRow[], id?: string) => rows.find((r) => r.id === id)?.name || id || '';
  if (filters.group_id) chips.push({ key: 'group_id', label: `Group: ${nameFor(data.by_group, filters.group_id)}` });
  if (filters.account_id) chips.push({ key: 'account_id', label: `Company: ${nameFor(data.by_company, filters.account_id)}` });
  if (filters.site_id) chips.push({ key: 'site_id', label: `Plant: ${nameFor(data.by_plant, filters.site_id)}` });
  if (filters.make_id) chips.push({ key: 'make_id', label: `Make: ${nameFor(data.by_make, filters.make_id)}` });
  if (filters.product_id) chips.push({ key: 'product_id', label: `Product: ${nameFor(data.by_product, filters.product_id)}` });
  const setFilter = (key: keyof LeadStructureFilters, id: string | null) => setFilters((f) => ({ ...f, [key]: id ?? undefined }));

  const dims: Dim[] = [
    { title: 'By group', rows: data.by_group, filterKey: 'group_id' },
    { title: 'By company', rows: data.by_company, filterKey: 'account_id' },
    { title: 'By plant', rows: data.by_plant, filterKey: 'site_id' },
    { title: 'By make', rows: data.by_make, filterKey: 'make_id', showQty: true },
    { title: 'By product', rows: data.by_product, filterKey: 'product_id', showQty: true },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <span style={{ fontSize: 13, color: T.dim }}>
          <b style={{ color: T.text, fontSize: 15 }}>{data.total_leads}</b> {data.total_leads === 1 ? 'lead' : 'leads'}{Object.keys(filters).some((k) => filters[k as keyof LeadStructureFilters]) ? ' (filtered)' : ''}
        </span>
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(c.key, null)}
            style={{ fontSize: 12, fontWeight: 700, color: T.red, background: '#FBE7E9', border: '1px solid #F3C4C8', borderRadius: 20, padding: '3px 10px', cursor: 'pointer' }}>
            {c.label} ✕
          </button>
        ))}
        {chips.length > 0 && (
          <button type="button" onClick={() => setFilters({})} style={{ fontSize: 12, color: T.dim, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
        )}
      </div>

      {loading && data.total_leads === 0 ? (
        <div style={{ color: T.dim, fontSize: 13 }}>Loading…</div>
      ) : (
        <TileGrid id="crm-reports-lead-structure-dims" perRow={2} h={10} style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {dims.map((d) => {
            const max = d.rows.reduce((m, r) => Math.max(m, r.lead_count), 0);
            return (
              <div key={d.title} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', background: T.card }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: T.dim, marginBottom: 8 }}>{d.title}</div>
                {d.rows.length === 0 ? (
                  <div style={{ color: T.dim, fontSize: 12.5 }}>No data.</div>
                ) : (
                  d.rows.slice(0, 12).map((row) => (
                    <Bar
                      key={(row.id ?? row.name) + d.title}
                      row={row}
                      max={max}
                      showQty={d.showQty}
                      active={!!(d.filterKey && row.id && filters[d.filterKey] === row.id)}
                      onClick={d.filterKey && row.id ? () => setFilter(d.filterKey!, filters[d.filterKey!] === row.id ? null : row.id!) : undefined}
                    />
                  ))
                )}
              </div>
            );
          })}
        </TileGrid>
      )}
    </div>
  );
}
