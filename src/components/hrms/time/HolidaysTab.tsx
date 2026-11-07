'use client';
// Holiday lists per state and year: a table, a year calendar, add / edit / remove, copy to another state or year,
// and a flag on any date that two holidays share.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, DataTable, EmptyState, Modal, Note, Stat, StatGrid, Toolbar, T, useIsCompact, type Col } from '../ui';
import { FormGrid, Segmented, Select } from '../../ui';
import type { Holiday, HolidayList, HrmsDb } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { fmtDate, fmtMonthLong } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { remove, upsert } from '../../../lib/hrms/actions';
import { INDIAN_STATES } from '../org/states';
import { BlockedDialog, ConfirmDialog } from '../org/Confirm';
import { CheckField, SelectField, TextField, focusFirstInvalid, primaryStyle } from '../org/formKit';
import { DAYS, duplicateDates, holidayCounts, monthWeeks, shiftToYear, sortHolidays, validateHoliday, validateHolidayList, weekdayIndex, type HolidayForm, type HolidayListForm } from './timeLogic';

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const;
interface HRow { id: string; h: Holiday; index: number; dup: boolean }

export function HolidaysTab({ db }: { db: HrmsDb }) {
  const lists = [...db.holidayLists].sort((a, b) => a.state.localeCompare(b.state) || a.year - b.year);
  const [listId, setListId] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [holidayModal, setHolidayModal] = useState<{ index?: number; date?: string } | null>(null);
  const [listModal, setListModal] = useState<{ copyFrom?: string } | null>(null);
  const [confirmHoliday, setConfirmHoliday] = useState<number | null>(null);
  const [confirmList, setConfirmList] = useState<HolidayList | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; body: string } | null>(null);

  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const usedBy = list ? db.locations.filter((l) => l.holidayListId === list.id) : [];

  if (!list) {
    return (
      <>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
          <EmptyState title="No holiday lists yet" description="Create a list for each state you operate in. Locations pick the list that matches their state."
            action={<Button variant="primary" style={primaryStyle} onClick={() => setListModal({})}>Create a holiday list</Button>} />
        </div>
        {listModal && <ListModal db={db} lists={lists} copyFrom={listModal.copyFrom} onClose={() => setListModal(null)} onCreated={(id) => { setListId(id); setListModal(null); }} />}
      </>
    );
  }

  const counts = holidayCounts(list.holidays);
  const dups = duplicateDates(list.holidays);
  const rows: HRow[] = sortHolidays(list.holidays).map((h) => ({ id: `${h.date}|${h.name}|${list.holidays.indexOf(h)}`, h, index: list.holidays.indexOf(h), dup: dups.has(h.date) }));

  const askDeleteList = () => {
    if (usedBy.length) setBlocked({ title: `Cannot delete ${list.name}`, body: `${list.name} is the holiday list of ${usedBy.map((l) => l.name).join(', ')}. Pick another list for ${usedBy.length === 1 ? 'that location' : 'those locations'} first.` });
    else setConfirmList(list);
  };
  const removeHoliday = (index: number) => {
    const next = list.holidays.filter((_, i) => i !== index);
    upsert('holidayLists', { ...list, holidays: next });
    toast.success('Holiday removed');
  };

  const cols: Col<HRow>[] = [
    { key: 'date', label: 'Date', nowrap: true, sortValue: (r) => r.h.date, render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(r.h.date)} <span style={{ color: T.mute }}>{DAYS[weekdayIndex(r.h.date)]}</span></span> },
    { key: 'name', label: 'Holiday', sortValue: (r) => r.h.name.toLowerCase(), render: (r) => <span style={{ fontWeight: 600 }}>{r.h.name}</span> },
    { key: 'type', label: 'Type', sortValue: (r) => (r.h.optional ? 1 : 0), render: (r) => <Badge tone={r.h.optional ? 'warn' : 'info'}>{r.h.optional ? 'Optional' : 'Fixed'}</Badge> },
    { key: 'flags', label: 'Checks', render: (r) => (r.dup ? <Badge tone="red" dot>Duplicate date</Badge> : <span style={{ color: T.mute, fontSize: 12.5 }}>OK</span>) },
    {
      key: 'actions', label: <span style={srOnly}>Actions</span>, align: 'right', nowrap: true, render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="sm" onClick={() => setHolidayModal({ index: r.index })} aria-label={`Edit ${r.h.name}`}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmHoliday(r.index)} aria-label={`Remove ${r.h.name}`}>Remove</Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <Select aria-label="Holiday list" value={list.id} onChange={(e) => setListId(e.target.value)} style={{ width: 240 }}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Segmented<'list' | 'calendar'> value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
        <div style={{ flex: 1 }} />
        <Button onClick={() => setListModal({ copyFrom: list.id })}>Copy list</Button>
        <Button onClick={() => setListModal({})}>New list</Button>
        <Button variant="danger" onClick={askDeleteList} aria-label={`Delete list ${list.name}`}>Delete list</Button>
        <Button variant="primary" style={primaryStyle} onClick={() => setHolidayModal({})}>Add holiday</Button>
      </Toolbar>

      <StatGrid min={150}>
        <Stat label="Fixed holidays" value={counts.fixed} hint="Everyone gets these off" />
        <Stat label="Optional holidays" value={counts.optional} hint="Employees choose from these" />
        <Stat label="Total" value={counts.total} hint={`${list.state}, ${list.year}`} />
        <Stat label="Duplicate dates" value={counts.duplicates} tone={counts.duplicates ? 'red' : 'ok'} hint={counts.duplicates ? 'Two holidays share a date' : 'No clashes'} />
      </StatGrid>
      <div style={{ fontSize: 13, color: T.dim }}>
        {usedBy.length ? <>Used by {usedBy.map((l) => l.name).join(', ')}.</> : <>No location uses this list yet. Pick it on a location under Organisation.</>}
      </div>

      {view === 'list' ? (
        <DataTable columns={cols} rows={rows} minWidth={680} empty="No holidays in this list yet. Add the first one, or copy another list to start from it." />
      ) : (
        <YearCalendar list={list} onPick={(date) => {
          const index = list.holidays.findIndex((h) => h.date === date);
          setHolidayModal(index >= 0 ? { index } : { date });
        }} />
      )}

      {holidayModal && <HolidayModal list={list} index={holidayModal.index} presetDate={holidayModal.date} onClose={() => setHolidayModal(null)} onRemove={(i) => { setHolidayModal(null); setConfirmHoliday(i); }} />}
      {listModal && <ListModal db={db} lists={lists} copyFrom={listModal.copyFrom} onClose={() => setListModal(null)} onCreated={(id) => { setListId(id); setListModal(null); }} />}
      {confirmHoliday != null && list.holidays[confirmHoliday] && (
        <ConfirmDialog title="Remove holiday" confirmLabel="Remove holiday" onCancel={() => setConfirmHoliday(null)} onConfirm={() => { removeHoliday(confirmHoliday); setConfirmHoliday(null); }}>
          Remove <b>{list.holidays[confirmHoliday]!.name}</b> ({fmtDate(list.holidays[confirmHoliday]!.date)}) from {list.name}?
        </ConfirmDialog>
      )}
      {confirmList && (
        <ConfirmDialog title="Delete holiday list" confirmLabel="Delete list" onCancel={() => setConfirmList(null)}
          onConfirm={() => { remove('holidayLists', confirmList.id); toast.success(`${confirmList.name} deleted`); setConfirmList(null); setListId(''); }}>
          Delete <b>{confirmList.name}</b> and its {confirmList.holidays.length} holiday{confirmList.holidays.length === 1 ? '' : 's'}? No location uses it.
        </ConfirmDialog>
      )}
      {blocked && <BlockedDialog title={blocked.title} onClose={() => setBlocked(null)}>{blocked.body}</BlockedDialog>}
    </div>
  );
}

// ───────────────────────────── calendar ─────────────────────────────
function YearCalendar({ list, onPick }: { list: HolidayList; onPick: (date: string) => void }) {
  const narrow = useIsCompact(700);
  const dups = duplicateDates(list.holidays);
  const byDate = new Map<string, Holiday[]>();
  list.holidays.forEach((h) => byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]));
  return (
    <Card padding={narrow ? 12 : 16}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontSize: 12.5, color: T.dim }} aria-label="Calendar legend">
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ ...swatch, background: T.infoWash, border: `1px solid ${T.info}` }} /> Fixed holiday</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ ...swatch, border: `1px dashed ${T.warn}` }} /> Optional holiday</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ ...swatch, border: `2px solid ${T.red}` }} /> Duplicate date</span>
        <span>Sundays are dimmed. Click a day to add or edit a holiday.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' : 'repeat(auto-fill, minmax(250px, 1fr))', gap: 18 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const mm = String(m).padStart(2, '0');
          const inMonth = sortHolidays(list.holidays.filter((h) => h.date.startsWith(`${list.year}-${mm}`)));
          return (
            <section key={m} aria-label={fmtMonthLong(`${list.year}-${mm}`)} data-testid={`month-${mm}`}>
              <h3 style={{ margin: '0 0 6px', fontFamily: T.heading, fontSize: 13.5, fontWeight: 700, color: T.text }}>{fmtMonthLong(`${list.year}-${mm}`)}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {DAYS.map((d) => <div key={d} aria-hidden style={{ textAlign: 'center', fontSize: 10.5, color: T.mute, padding: '2px 0' }}>{d[0]}</div>)}
                {monthWeeks(list.year, m).flat().map((date, i) => {
                  if (!date) return <div key={`b${i}`} />;
                  const hs = byDate.get(date) ?? [];
                  const fixed = hs.some((h) => !h.optional);
                  const optional = hs.length > 0 && !fixed;
                  const dup = dups.has(date);
                  const sunday = weekdayIndex(date) === 6;
                  const day = Number(date.slice(8));
                  return (
                    <button key={date} type="button" onClick={() => onPick(date)} data-testid={`day-${date}`}
                      aria-label={hs.length ? `${fmtDate(date)}, ${hs.map((h) => `${h.name}${h.optional ? ' (optional)' : ''}`).join(' and ')}${dup ? ', duplicate date' : ''}. Edit` : `${fmtDate(date)}, no holiday. Add one`}
                      title={hs.length ? hs.map((h) => h.name).join(', ') : undefined}
                      style={{
                        minHeight: 32, borderRadius: 6, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                        background: fixed ? T.infoWash : 'transparent', color: fixed ? T.info : optional ? T.warn : sunday ? T.mute : T.text, fontWeight: hs.length ? 700 : 400,
                        border: dup ? `2px solid ${T.red}` : fixed ? `1px solid ${T.info}` : optional ? `1px dashed ${T.warn}` : '1px solid transparent',
                        textDecoration: date === PREVIEW_TODAY ? 'underline' : 'none',
                      }}>{day}</button>
                  );
                })}
              </div>
              {inMonth.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 12.5, color: T.dim, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {inMonth.map((h, i) => (
                    <li key={`${h.date}-${i}`}><span style={{ fontVariantNumeric: 'tabular-nums', color: T.text }}>{Number(h.date.slice(8))}</span> {h.name}{h.optional ? ' (optional)' : ''}{dups.has(h.date) ? ' (duplicate date)' : ''}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
const swatch = { display: 'inline-block', width: 16, height: 16, borderRadius: 4 } as const;

// ───────────────────────────── holiday modal ─────────────────────────────
function HolidayModal({ list, index, presetDate, onClose, onRemove }: { list: HolidayList; index?: number; presetDate?: string; onClose: () => void; onRemove: (i: number) => void }) {
  const current = index != null ? list.holidays[index] : undefined;
  const [f, setF] = useState<HolidayForm>({ date: current?.date ?? presetDate ?? '', name: current?.name ?? '', optional: current?.optional ?? false });
  const [tried, setTried] = useState(false);
  const formId = 'holiday-form';
  const { errors, warning } = validateHoliday(f, list, index);
  const shown = (k: keyof HolidayForm) => (tried ? errors[k] : undefined);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const h: Holiday = { date: f.date, name: f.name.trim(), optional: f.optional };
    const holidays = index != null ? list.holidays.map((x, i) => (i === index ? h : x)) : [...list.holidays, h];
    upsert('holidayLists', { ...list, holidays });
    toast.success(index != null ? `${h.name} updated` : `${h.name} added to ${list.name}`);
    onClose();
  };

  return (
    <Modal title={current ? `Edit ${current.name}` : `Add holiday to ${list.name}`} onClose={onClose} width={480}
      footer={<>
        {index != null && <Button variant="danger" style={{ marginRight: 'auto' }} onClick={() => onRemove(index)}>Remove</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form={formId} style={primaryStyle}>{current ? 'Save changes' : 'Add holiday'}</Button>
      </>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TextField label="Date" required type="date" value={f.date} onChange={(v) => setF((p) => ({ ...p, date: v }))} error={shown('date')} min={`${list.year}-01-01`} max={`${list.year}-12-31`} />
        <TextField label="Holiday name" required value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} error={shown('name')} autoComplete="off" />
        <CheckField label="Optional holiday" checked={f.optional} onChange={(v) => setF((p) => ({ ...p, optional: v }))} hint="Employees pick a limited number of optional holidays" />
        {warning && <div role="status"><Note tone="warn">{warning}</Note></div>}
      </form>
    </Modal>
  );
}

// ───────────────────────────── new / copy list modal ─────────────────────────────
function ListModal({ db, lists, copyFrom, onClose, onCreated }: { db: HrmsDb; lists: HolidayList[]; copyFrom?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const narrow = useIsCompact(700);
  const source = lists.find((l) => l.id === copyFrom);
  const nextYear = (source?.year ?? Number(PREVIEW_TODAY.slice(0, 4))) + 1;
  const [f, setF] = useState<HolidayListForm>({ state: source?.state ?? '', year: String(nextYear), name: source ? `${source.state} ${nextYear}` : '', copyFrom: copyFrom ?? '' });
  const [nameTouched, setNameTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const formId = 'holiday-list-form';
  const errors = validateHolidayList(f, lists);
  const shown = (k: keyof HolidayListForm) => (tried ? errors[k] : undefined);
  const from = lists.find((l) => l.id === f.copyFrom);

  const patch = (p: Partial<HolidayListForm>) => setF((prev) => {
    const next = { ...prev, ...p };
    if (!nameTouched && ('state' in p || 'year' in p)) next.name = next.state ? `${next.state} ${next.year}` : '';
    return next;
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) { focusFirstInvalid(formId); return; }
    const year = Number(f.year);
    const holidays = from ? from.holidays.map((h) => ({ ...h, date: shiftToYear(h.date, year) })) : [];
    const created: HolidayList = { id: uid('hol'), name: f.name.trim(), state: f.state, year, holidays };
    upsert('holidayLists', created);
    toast.success(from ? `Copied ${holidays.length} holiday${holidays.length === 1 ? '' : 's'} from ${from.name}. Check the festival dates.` : `${created.name} created`);
    onCreated(created.id);
  };

  return (
    <Modal title={copyFrom ? `Copy ${source?.name ?? 'list'}` : 'New holiday list'} onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={formId} style={primaryStyle}>{from ? 'Create copy' : 'Create list'}</Button></>}>
      <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SelectField label="Start from" value={f.copyFrom} onChange={(v) => patch({ copyFrom: v })}>
          <option value="">An empty list</option>
          {lists.map((l) => <option key={l.id} value={l.id}>Copy of {l.name} ({l.holidays.length} holidays)</option>)}
        </SelectField>
        <FormGrid narrow={narrow}>
          <SelectField label="State" required value={f.state} onChange={(v) => patch({ state: v })} error={shown('state')}>
            <option value="">Choose a state</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectField>
          <TextField label="Year" required type="number" min={2000} max={2100} value={f.year} onChange={(v) => patch({ year: v })} error={shown('year')} />
        </FormGrid>
        <TextField label="List name" required value={f.name} onChange={(v) => { setNameTouched(true); patch({ name: v }); }} error={shown('name')} autoComplete="off" />
        {from && <Note tone="warn">The copy keeps the same calendar dates. Festivals such as Diwali, Holi and Eid fall on different days each year, so check every date after copying.{from.state !== f.state && f.state ? ` State holidays of ${from.state} may not apply in ${f.state}.` : ''}</Note>}
        {db.locations.length > 0 && <div style={{ fontSize: 12.5, color: T.mute }}>After creating the list, choose it on a location under Organisation to use it.</div>}
      </form>
    </Modal>
  );
}
