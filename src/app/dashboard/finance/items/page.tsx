'use client';
import { FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, FormGrid, Input, Select, Textarea, T, useIsCompact } from '../../../../components/ui';
import { Col, DataTable, FinancePage, Modal, Pager, SearchBox, Toolbar, fail, inr, useConfirm, useDebounced } from '../../../../components/finance/ui';
import { ErrorNote, RadioGroup, RupeeInput, usePage, useRemote } from '../../../../components/finance/masterBits';
import { num } from '../../../../lib/financeFormat';
import { FinanceItem, ItemInput, financeApi } from '../../../../lib/financeApi';

const LIMIT = 50;
const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
const UNITS = ['pcs', 'nos', 'kg', 'g', 'litre', 'metre', 'box', 'set', 'hour', 'day', 'month'];

export default function ItemsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'goods' | 'service'>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = usePage(`${q}|${type}|${status}`);
  const [editing, setEditing] = useState<FinanceItem | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  const { data, loading, error, reload } = useRemote(
    () => financeApi.items.list({ q, item_type: type, status, page, limit: LIMIT }),
    [q, type, status, page],
  );
  const rows = data?.data ?? [];

  const toggleActive = async (it: FinanceItem) => {
    setBusyId(it.id);
    try {
      await financeApi.items.update(it.id, { is_active: !it.is_active });
      toast.success(it.is_active ? 'Item marked inactive' : 'Item marked active');
      reload();
    } catch (e) { fail(e); }
    setBusyId(null);
  };
  const remove = async (it: FinanceItem) => {
    const ok = await ask({ title: 'Delete item?', danger: true, confirmLabel: 'Delete', message: `“${it.name}” will be removed from your item list. Existing invoices and quotes keep their copy of the line.` });
    if (!ok) return;
    setBusyId(it.id);
    try {
      await financeApi.items.remove(it.id);
      toast.success('Item deleted');
      reload();
    } catch (e) { fail(e); }
    setBusyId(null);
  };

  const columns: Col<FinanceItem>[] = [
    {
      key: 'name', label: 'Name', nowrap: false, render: (it) => (
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 600 }}>{it.name}</div>
          {it.description && <div style={{ fontSize: 12, color: T.mute, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.description}</div>}
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (it) => (it.item_type === 'service' ? 'Service' : 'Goods') },
    { key: 'hsn', label: 'HSN/SAC', render: (it) => it.hsn_sac || '—' },
    { key: 'unit', label: 'Unit', render: (it) => it.unit || '—' },
    { key: 'rate', label: 'Rate', align: 'right', render: (it) => inr(it.selling_price) },
    { key: 'gst', label: 'GST %', align: 'right', render: (it) => (it.tax_preference === 'exempt' ? 'Exempt' : `${num(it.gst_rate)}%`) },
    { key: 'status', label: 'Status', render: (it) => (it.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>) },
    {
      key: 'actions', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span>, align: 'right', render: (it) => (
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setEditing(it)} aria-label={`Edit ${it.name}`}>Edit</Button>
          <Button size="sm" disabled={busyId === it.id} onClick={() => toggleActive(it)} aria-label={`${it.is_active ? 'Mark inactive' : 'Mark active'}: ${it.name}`}>{it.is_active ? 'Mark inactive' : 'Mark active'}</Button>
          <Button size="sm" variant="danger" disabled={busyId === it.id} onClick={() => remove(it)} aria-label={`Delete ${it.name}`}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <FinancePage title="Items" description="Goods and services you sell, with HSN/SAC and GST rate."
      actions={<Button variant="primary" onClick={() => setEditing('new')}>+ New</Button>}>
      {dialog}
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search name or HSN/SAC" />
        <Select aria-label="Item type" value={type} onChange={(e) => setType(e.target.value as typeof type)} style={{ width: 150 }}>
          <option value="all">All types</option><option value="goods">Goods</option><option value="service">Service</option>
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ width: 150 }}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </Select>
      </Toolbar>
      {error && <ErrorNote message={error} onRetry={reload} />}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <DataTable<FinanceItem> columns={columns} rows={rows} loading={loading}
          empty={q || type !== 'all' || status !== 'all' ? 'No items match these filters.' : 'No items yet. Click “+ New” to add one.'}
          onRowClick={(it) => setEditing(it)} />
        <Pager page={page} limit={LIMIT} total={data?.pagination?.total ?? rows.length} onPage={setPage} />
      </Card>
      {editing && (
        <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </FinancePage>
  );
}

function ItemModal({ item, onClose, onSaved }: { item: FinanceItem | null; onClose: () => void; onSaved: () => void }) {
  const narrow = useIsCompact(900);
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const [name, setName] = useState(item?.name ?? '');
  const [itemType, setItemType] = useState<'goods' | 'service'>(item?.item_type ?? 'goods');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [hsn, setHsn] = useState(item?.hsn_sac ?? '');
  const [taxPref, setTaxPref] = useState<'taxable' | 'exempt'>(item?.tax_preference ?? 'taxable');
  const [gst, setGst] = useState<number>(item ? num(item.gst_rate, 18) : 18);
  const [price, setPrice] = useState(item ? String(item.selling_price ?? '') : '');
  const [desc, setDesc] = useState(item?.description ?? '');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [busy, setBusy] = useState(false);

  const exempt = taxPref === 'exempt';
  const rates = GST_RATES.includes(gst) ? GST_RATES : [...GST_RATES, gst].sort((a, b) => a - b);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (price.trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0) e.price = 'Enter a selling price of 0 or more';
    setErrors(e);
    if (e.name || e.price) return;
    const body: ItemInput = {
      name: name.trim(), item_type: itemType, unit: unit.trim(), hsn_sac: hsn.trim(), tax_preference: taxPref,
      gst_rate: exempt ? 0 : gst, selling_price: num(price), description: desc.trim(),
    };
    setBusy(true);
    try {
      if (item) await financeApi.items.update(item.id, body); else await financeApi.items.create(body);
      toast.success(item ? 'Item updated' : 'Item created');
      onSaved();
    } catch (err) { fail(err); setBusy(false); }
  };

  return (
    <Modal title={item ? 'Edit Item' : 'New Item'} onClose={() => { if (!busy) onClose(); }} width={600}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form={fid('form')} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </>}>
      <form id={fid('form')} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Name" required htmlFor={fid('name')} error={errors.name}>
          <Input id={fid('name')} value={name} invalid={!!errors.name} autoFocus autoComplete="off" maxLength={200}
            onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} />
        </Field>
        <RadioGroup legend="Type" value={itemType} onChange={setItemType} options={[{ value: 'goods', label: 'Goods' }, { value: 'service', label: 'Service' }]} />
        <FormGrid narrow={narrow}>
          <Field label="Unit" htmlFor={fid('unit')}>
            <Input id={fid('unit')} list={fid('units')} value={unit} onChange={(e) => setUnit(e.target.value)} autoComplete="off" maxLength={30} />
            <datalist id={fid('units')}>{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
          <Field label={itemType === 'service' ? 'SAC' : 'HSN Code'} htmlFor={fid('hsn')} hint="HSN for goods, SAC for services.">
            <Input id={fid('hsn')} value={hsn} onChange={(e) => setHsn(e.target.value)} autoComplete="off" maxLength={20} inputMode="numeric" />
          </Field>
          <RadioGroup legend="Tax Preference" value={taxPref} onChange={setTaxPref} options={[{ value: 'taxable', label: 'Taxable' }, { value: 'exempt', label: 'Exempt' }]} />
          <Field label="GST Rate" htmlFor={fid('gst')} hint={exempt ? 'Exempt items carry no GST.' : undefined}>
            <Select id={fid('gst')} value={String(exempt ? 0 : gst)} disabled={exempt} onChange={(e) => setGst(Number(e.target.value))}>
              {rates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </Field>
        </FormGrid>
        <Field label="Selling Price" required htmlFor={fid('price')} error={errors.price}>
          <RupeeInput id={fid('price')} value={price} invalid={!!errors.price} placeholder="0.00"
            onChange={(e) => { setPrice(e.target.value); setErrors((x) => ({ ...x, price: undefined })); }} />
        </Field>
        <Field label="Description" htmlFor={fid('desc')}>
          <Textarea id={fid('desc')} value={desc} rows={3} maxLength={1000} onChange={(e) => setDesc(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
