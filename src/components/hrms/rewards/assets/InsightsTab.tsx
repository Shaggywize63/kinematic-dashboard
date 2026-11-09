'use client';
// Insights: warranties ending soon, ageing assets, and cost by department.

import { useMemo, useState } from 'react';
import { Badge, Card, CardTitle, DataTable, T, type Col } from '../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { agedAssets, ageLabel, bookValue, costByDepartment, typeInfo, typeLabel, warrantyDaysLeft, warrantyExpiring } from '../../../../lib/hrms/rewards/engines';
import type { Asset, RewardsState } from '../../../../lib/hrms/rewards/types';
import { BarRows, Muted } from '../common';
import { AssetDetailModal } from './AssetModals';
import { deptNameOf, holderOf } from './shared';

export default function InsightsTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const items = st.assets.items;
  const soon = useMemo(() => warrantyExpiring(items, PREVIEW_TODAY, 60), [items]);
  const aged = useMemo(() => agedAssets(items, PREVIEW_TODAY, 4), [items]);
  const dept = useMemo(() => costByDepartment(items, (id) => deptNameOf(db, id), PREVIEW_TODAY), [items, db]);

  const link = (a: Asset) => <button type="button" onClick={() => setOpenId(a.id)} aria-label={`Open ${a.tag}`} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.info, cursor: 'pointer' }}>{a.tag}</button>;
  const holder = (a: Asset) => { const h = holderOf(db, a); return h ? fullName(h) : <span style={{ color: T.mute }}>In {a.status === 'in_stock' ? 'stock' : 'repair'}</span>; };

  const warrantyCols: Col<Asset>[] = [
    { key: 'tag', label: 'Tag', render: link, nowrap: true },
    { key: 'item', label: 'Item', render: (a) => `${a.make} ${a.model}` },
    { key: 'holder', label: 'Held by', render: holder },
    { key: 'ends', label: 'Warranty ends', nowrap: true, render: (a) => <span>{fmtDate(a.warrantyEnd)} <Badge tone="warn">{warrantyDaysLeft(a, PREVIEW_TODAY)} days</Badge></span> },
  ];
  const agedCols: Col<Asset>[] = [
    { key: 'tag', label: 'Tag', render: link, nowrap: true },
    { key: 'item', label: 'Item', render: (a) => (<div><div>{a.make} {a.model}</div><div style={{ fontSize: 12, color: T.mute }}>{typeLabel(a.type)}, {typeInfo(a.type).lifeYears}-year life</div></div>) },
    { key: 'holder', label: 'Held by', render: holder },
    { key: 'age', label: 'Age', nowrap: true, render: (a) => ageLabel(a, PREVIEW_TODAY) },
    { key: 'book', label: 'Book value', align: 'right', nowrap: true, render: (a) => inr(bookValue(a, PREVIEW_TODAY)) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle right={<Badge tone={soon.length ? 'warn' : 'ok'}>{soon.length}</Badge>}>Warranty ending in 60 days</CardTitle>
        <div data-testid="warranty-soon"><DataTable columns={warrantyCols} rows={soon} minWidth={560} empty="No warranty ends in the next 60 days." /></div>
        <Muted style={{ marginTop: 8 }}>Counted from {fmtDate(PREVIEW_TODAY)}. Retired and lost assets are left out.</Muted>
      </Card>
      <Card>
        <CardTitle right={<Badge tone={aged.length ? 'warn' : 'ok'}>{aged.length}</Badge>}>Assets older than 4 years</CardTitle>
        <div data-testid="aged-assets"><DataTable columns={agedCols} rows={aged} minWidth={620} empty="No asset is older than 4 years." /></div>
        <Muted style={{ marginTop: 8 }}>Age is counted from the purchase date. These are candidates to review for replacement, not a replacement order.</Muted>
      </Card>
      <Card>
        <CardTitle>Cost by department</CardTitle>
        <BarRows testId="cost-by-dept" rows={dept.map((d) => ({ key: d.name, label: d.name, value: d.cost, sub: `${d.count} ${d.count === 1 ? 'asset' : 'assets'}` }))} format={inr} />
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, fontSize: 13.5 }}>
            <thead><tr>{['Department', 'Assets', 'Cost', 'Book value today'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {dept.map((d) => (
                <tr key={d.name}>
                  <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}` }}>{d.name}</td>
                  <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{d.count}</td>
                  <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{inr(d.cost)}</td>
                  <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{inr(d.book)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Muted style={{ marginTop: 8 }}>By the department of the person holding the asset. Assets in stock or in repair are grouped as &quot;Not issued&quot;. Lost and retired assets are left out.</Muted>
      </Card>
      {openId && <AssetDetailModal db={db} st={st} assetId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
