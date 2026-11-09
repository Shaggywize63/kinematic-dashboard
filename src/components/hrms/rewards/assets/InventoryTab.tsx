'use client';
// Inventory: every asset with search, filters, a CSV download, and the detail view that holds the actions.

import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, SearchBox, T, Toolbar, downloadRows, type Col } from '../../ui';
import { Select } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { ASSET_TYPES, CONDITION_LABEL, STATUS_LABEL, bookValue, typeLabel, warrantyDaysLeft } from '../../../../lib/hrms/rewards/engines';
import type { Asset, AssetStatus, AssetType, RewardsState } from '../../../../lib/hrms/rewards/types';
import { AddAssetModal, AssetDetailModal } from './AssetModals';
import { ConditionPill, StatusPill, WarrantyCell, deptNameOf, holderOf } from './shared';

export default function InventoryTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<AssetType | ''>('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [warranty, setWarranty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return st.assets.items.filter((a) => {
      if (type && a.type !== type) return false;
      if (status && a.status !== status) return false;
      if (warranty) { const left = warrantyDaysLeft(a, PREVIEW_TODAY); if (left == null || left < 0 || left > 60 || a.status === 'retired' || a.status === 'lost') return false; }
      if (!needle) return true;
      const h = holderOf(db, a);
      return `${a.tag} ${a.make} ${a.model} ${a.serial} ${h ? fullName(h) : ''}`.toLowerCase().includes(needle);
    });
  }, [st.assets.items, db, q, type, status, warranty]);

  const cols: Col<Asset>[] = [
    { key: 'tag', label: 'Tag', nowrap: true, sortValue: (a) => a.tag, render: (a) => <button type="button" onClick={() => setOpenId(a.id)} aria-label={`Open ${a.tag}`} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.info, cursor: 'pointer' }}>{a.tag}</button> },
    { key: 'item', label: 'Item', sortValue: (a) => `${a.make} ${a.model}`.toLowerCase(), render: (a) => (<div><div style={{ fontWeight: 600 }}>{a.make} {a.model}</div><div style={{ fontSize: 12, color: T.mute }}>{typeLabel(a.type)} · {a.serial}</div></div>) },
    { key: 'bought', label: 'Purchased', nowrap: true, sortValue: (a) => a.purchaseDate, render: (a) => (<div><div>{fmtDate(a.purchaseDate)}</div><div style={{ fontSize: 12, color: T.mute }}>{inr(a.cost)}</div></div>) },
    { key: 'book', label: 'Book value', align: 'right', nowrap: true, sortValue: (a) => bookValue(a, PREVIEW_TODAY), render: (a) => inr(bookValue(a, PREVIEW_TODAY)) },
    { key: 'warranty', label: 'Warranty ends', nowrap: true, sortValue: (a) => a.warrantyEnd ?? '9999', render: (a) => <WarrantyCell a={a} /> },
    { key: 'cond', label: 'Condition', sortValue: (a) => a.condition, render: (a) => <ConditionPill c={a.condition} /> },
    { key: 'status', label: 'Status', nowrap: true, sortValue: (a) => a.status, render: (a) => <StatusPill status={a.status} /> },
    { key: 'holder', label: 'Held by', sortValue: (a) => { const h = holderOf(db, a); return h ? fullName(h).toLowerCase() : ''; }, render: (a) => { const h = holderOf(db, a); return h ? (<div><div>{fullName(h)}</div><div style={{ fontSize: 12, color: T.mute }}>{deptNameOf(db, h.id)}</div></div>) : <span style={{ color: T.mute }}>—</span>; } },
  ];

  function exportCsv() {
    downloadRows('assets.csv',
      ['Tag', 'Type', 'Make', 'Model', 'Serial', 'Purchase date', 'Cost (INR)', 'Book value (INR)', 'Warranty ends', 'Condition', 'Status', 'Held by', 'Department'],
      rows.map((a) => { const h = holderOf(db, a); return [a.tag, typeLabel(a.type), a.make, a.model, a.serial, a.purchaseDate, a.cost, bookValue(a, PREVIEW_TODAY), a.warrantyEnd ?? '', CONDITION_LABEL[a.condition], STATUS_LABEL[a.status], h ? fullName(h) : '', h ? deptNameOf(db, h.id) ?? '' : '']; }));
  }

  const filtersOn = !!(q || type || status || warranty);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search tag, item, serial or holder" width={300} />
        <Select aria-label="Filter by type" value={type} style={{ width: 160 }} onChange={(e) => setType(e.target.value as AssetType | '')}>
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select aria-label="Filter by status" value={status} style={{ width: 150 }} onChange={(e) => setStatus(e.target.value as AssetStatus | '')}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as AssetStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, minHeight: 36, cursor: 'pointer' }}>
          <input type="checkbox" checked={warranty} onChange={(e) => setWarranty(e.target.checked)} style={{ width: 16, height: 16 }} />
          Warranty ends in 60 days
        </label>
        {filtersOn && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setType(''); setStatus(''); setWarranty(false); }}>Clear filters</Button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button style={{ height: 40 }} onClick={exportCsv} disabled={!rows.length}>Download CSV</Button>
          <Button variant="primary" style={{ height: 40 }} onClick={() => setAdding(true)}>Add asset</Button>
        </div>
      </Toolbar>
      <div data-testid="asset-count" style={{ fontSize: 13, color: T.dim }}>Showing {rows.length} of {st.assets.items.length} assets</div>
      <DataTable columns={cols} rows={rows} minWidth={1060} onRowClick={(a) => setOpenId(a.id)}
        empty={filtersOn ? 'No asset matches these filters.' : <>No assets in the register yet. Use <Badge>Add asset</Badge> to start.</>} />
      {openId && <AssetDetailModal db={db} st={st} assetId={openId} onClose={() => setOpenId(null)} />}
      {adding && <AddAssetModal onClose={() => setAdding(false)} />}
    </div>
  );
}
