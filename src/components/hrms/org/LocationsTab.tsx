'use client';
// Work locations: which legal entity, state and city each one belongs to, the HRA metro flag and its holiday list.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, ConfidenceBadge, DataTable, Modal, SearchBox, Toolbar, T, useIsCompact, type Col } from '../ui';
import { Select, FormGrid } from '../../ui';
import type { HrmsDb, Id, Location } from '../../../lib/hrms/types';
import { newId } from '../../../lib/hrms/db';
import { whenSynced } from '../../../lib/hrms/live/store';
import { HRA_METROS, isMetroCity, rowOn } from '../../../lib/hrms/rules';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate } from '../../../lib/hrms/format';
import { remove, upsert } from '../../../lib/hrms/actions';
import { INDIAN_STATES } from './states';
import { usageOf, usageText, validateName } from './orgLogic';
import { BlockedDialog, ConfirmDialog } from './Confirm';
import { CheckField, SelectField, TextField, focusFirstInvalid, primaryStyle, srOnly } from './formKit';

interface LocForm { name: string; entityId: string; state: string; city: string; address: string; metro: boolean; holidayListId: string }
const blank = (entityId: string): LocForm => ({ name: '', entityId, state: '', city: '', address: '', metro: false, holidayListId: '' });

export function LocationsTab({ db }: { db: HrmsDb }) {
  const [q, setQ] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [modal, setModal] = useState<{ edit?: Location } | null>(null);
  const [confirm, setConfirm] = useState<Location | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const entityName = (id: Id) => db.entities.find((e) => e.id === id)?.name ?? '—';
  const listName = (id?: Id) => db.holidayLists.find((h) => h.id === id)?.name;
  const rows = db.locations.filter((l) => {
    if (entityFilter !== 'all' && l.entityId !== entityFilter) return false;
    const hay = `${l.name} ${l.city} ${l.state} ${entityName(l.entityId)}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const askRemove = (l: Location) => {
    const u = usageOf(db.employees, 'locationId', l.id);
    if (u.total > 0) setBlocked({ title: `Cannot remove ${l.name}`, body: `${usageText(u)} are assigned to ${l.name}. Move them to another location first, then remove it.` });
    else setConfirm(l);
  };

  const cols: Col<Location>[] = [
    { key: 'name', label: 'Location', sortValue: (l) => l.name.toLowerCase(), render: (l) => <div><div style={{ fontWeight: 600 }}>{l.name}</div>{l.address && <div style={{ fontSize: 12, color: T.mute }}>{l.address}</div>}</div> },
    { key: 'entity', label: 'Legal entity', sortValue: (l) => entityName(l.entityId), render: (l) => entityName(l.entityId) },
    { key: 'city', label: 'City and state', sortValue: (l) => `${l.state} ${l.city}`, render: (l) => <div><div>{l.city}</div><div style={{ fontSize: 12, color: T.mute }}>{l.state}</div></div> },
    { key: 'metro', label: 'Metro (HRA)', sortValue: (l) => (l.metro ? 1 : 0), render: (l) => <Badge tone={l.metro ? 'info' : 'neutral'}>{l.metro ? 'Metro, 50%' : 'Non-metro, 40%'}</Badge> },
    { key: 'holiday', label: 'Holiday list', sortValue: (l) => listName(l.holidayListId) ?? '', render: (l) => (listName(l.holidayListId) ? <Link href="/dashboard/hrms/time?tab=holidays" style={{ color: T.info, textDecoration: 'none' }}>{listName(l.holidayListId)}</Link> : <span style={{ color: T.mute }}>None</span>) },
    { key: 'people', label: 'People', align: 'right', sortValue: (l) => usageOf(db.employees, 'locationId', l.id).current, render: (l) => usageOf(db.employees, 'locationId', l.id).current },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (l) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setModal({ edit: l })} aria-label={`Edit ${l.name}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => askRemove(l)} aria-label={`Remove ${l.name}`}>Remove</Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search locations" />
        <Select aria-label="Filter by legal entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} style={{ width: 230 }}>
          <option value="all">All legal entities</option>
          {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <div style={{ flex: 1 }} />
        <Button variant="primary" style={primaryStyle} onClick={() => setModal({})} disabled={db.entities.length === 0} title={db.entities.length === 0 ? 'Add a legal entity first' : undefined}>Add location</Button>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={780}
        empty={db.locations.length === 0 ? 'No locations yet. Add the offices, stores and warehouses where people work.' : 'No location matches this search.'} />
      <div style={{ fontSize: 12.5, color: T.mute }}>Metro locations get the 50% HRA exemption rate in the tax calculation, the rest 40%. The default comes from the dated metro list in the statutory rules.</div>

      {modal && <LocationModal db={db} edit={modal.edit} defaultEntityId={entityFilter !== 'all' ? entityFilter : db.entities[0]?.id ?? ''} onClose={() => setModal(null)} />}
      {confirm && (
        <ConfirmDialog title="Remove location" confirmLabel="Remove location" onCancel={() => setConfirm(null)}
          onConfirm={() => { const gone = confirm.name; remove('locations', confirm.id); whenSynced((ok) => { if (ok) toast.success(`${gone} removed`); }); setConfirm(null); }}>
          Remove <b>{confirm.name}</b> ({confirm.city}, {confirm.state})? No employees are assigned to it.
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

function LocationModal({ db, edit, defaultEntityId, onClose }: { db: HrmsDb; edit?: Location; defaultEntityId: string; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [f, setF] = useState<LocForm>(edit
    ? { name: edit.name, entityId: edit.entityId, state: edit.state, city: edit.city, address: edit.address ?? '', metro: edit.metro, holidayListId: edit.holidayListId ?? '' }
    : blank(defaultEntityId));
  const [metroTouched, setMetroTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const formId = 'location-form';

  const staff = edit ? usageOf(db.employees, 'locationId', edit.id) : { total: 0, current: 0, exited: 0 };
  const errors: Partial<Record<keyof LocForm, string>> = {};
  const nameErr = validateName(f.name, db.locations.filter((l) => l.id !== edit?.id).map((l) => l.name), 'Location');
  if (nameErr) errors.name = nameErr;
  if (!f.entityId) errors.entityId = 'Choose the legal entity';
  else if (edit && f.entityId !== edit.entityId && staff.total > 0) errors.entityId = `${usageText(staff)} work here and belong to ${db.entities.find((e) => e.id === edit.entityId)?.name}. Move them before changing the entity.`;
  if (!f.state) errors.state = 'Choose a state';
  if (!f.city.trim()) errors.city = 'City is required';
  const shown = (k: keyof LocForm) => (tried ? errors[k] : undefined);

  const suggested = f.city.trim() ? isMetroCity(f.city.trim(), PREVIEW_TODAY) : false;
  const metroRow = rowOn(HRA_METROS, PREVIEW_TODAY);
  const lists = db.holidayLists.filter((h) => h.state === f.state || h.id === f.holidayListId);

  const setCity = (city: string) => setF((p) => ({ ...p, city, metro: metroTouched || !city.trim() ? p.metro : isMetroCity(city.trim(), PREVIEW_TODAY) }));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const loc: Location = {
      id: edit?.id ?? newId('loc'), name: f.name.trim(), entityId: f.entityId, state: f.state, city: f.city.trim(), address: f.address.trim() || undefined,
      metro: f.metro, holidayListId: f.holidayListId || undefined,
    };
    upsert('locations', loc);
    whenSynced((ok) => { if (ok) toast.success(edit ? `${loc.name} updated` : `${loc.name} added`); });
    onClose();
  };

  return (
    <Modal title={edit ? `Edit ${edit.name}` : 'Add location'} onClose={onClose} width={640}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{edit ? 'Save changes' : 'Add location'}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <TextField label="Location name" required value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} error={shown('name')} autoComplete="off" />
          <SelectField label="Legal entity" required value={f.entityId} onChange={(v) => setF((p) => ({ ...p, entityId: v }))} error={shown('entityId')}>
            <option value="">Choose an entity</option>
            {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </SelectField>
          <SelectField label="State" required value={f.state} onChange={(v) => setF((p) => ({ ...p, state: v, holidayListId: p.holidayListId && db.holidayLists.find((h) => h.id === p.holidayListId)?.state === v ? p.holidayListId : '' }))} error={shown('state')}>
            <option value="">Choose a state</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectField>
          <TextField label="City" required value={f.city} onChange={setCity} error={shown('city')} autoComplete="off" />
        </FormGrid>
        <TextField label="Address" value={f.address} onChange={(v) => setF((p) => ({ ...p, address: v }))} placeholder="Street, area" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <CheckField label="Metro city for HRA" checked={f.metro} onChange={(v) => { setMetroTouched(true); setF((p) => ({ ...p, metro: v })); }} />
          <div style={{ fontSize: 12.5, color: T.dim, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 28 }}>
            <span>{f.city.trim() ? `${f.city.trim()} ${suggested ? 'is' : 'is not'} on the metro list in force on ${fmtDate(PREVIEW_TODAY)}.` : 'Type the city to get a suggestion.'}</span>
            <ConfidenceBadge level={metroRow.confidence} />
          </div>
          <div style={{ fontSize: 12, color: T.mute, marginLeft: 28 }}>Metro list: {metroRow.value.join(', ')}.</div>
        </div>
        <SelectField label="Holiday list" value={f.holidayListId} onChange={(v) => setF((p) => ({ ...p, holidayListId: v }))}
          hint={f.state && lists.length === 0 ? `There is no holiday list for ${f.state} yet. Create one under Time and leave, Holidays.` : undefined}>
          <option value="">None</option>
          {lists.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </SelectField>
      </form>
    </Modal>
  );
}
