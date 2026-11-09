'use client';
// Asset detail (facts, actions, immutable history), the issue / return / transfer / repair / lost / retire dialogs, and "Add asset".

import { useId, useMemo, useState } from 'react';
import { Badge, Button, KeyValue, Modal, Note, T, useIsCompact } from '../../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import {
  ASSET_TYPES, CONDITION_LABEL, EVENT_LABEL, ageLabel, bookValue, conditionWorse, duplicateIssue, typeInfo, typeLabel,
} from '../../../../lib/hrms/rewards/engines';
import {
  addAsset, assetName, backFromRepair, issueAsset, markLost, retireAsset, returnAsset, sendToRepair, transferAsset,
} from '../../../../lib/hrms/rewards/store';
import type { Asset, AssetCondition, AssetEvent, AssetStatus, AssetType, RewardsState } from '../../../../lib/hrms/rewards/types';
import { CheckRow, ConfirmModal, Muted, SimulationNote, report } from '../common';
import { CONDITIONS, ConditionPill, PersonSelect, StatusPill, WarrantyCell, holderOf, nameOf } from './shared';

export type ActionKind = 'issue' | 'return' | 'transfer' | 'repair' | 'repair_back' | 'lost' | 'retire';

const TITLE: Record<ActionKind, string> = {
  issue: 'Issue asset', return: 'Record return', transfer: 'Transfer asset', repair: 'Send for repair', repair_back: 'Back from repair', lost: 'Mark as lost', retire: 'Retire asset',
};

/** Condition recorded when the current holder received it, for the "worse than at issue" check. */
function conditionAtIssue(events: AssetEvent[], a: Asset): AssetCondition {
  const last = [...events].reverse().find((e) => e.assetId === a.id && (e.kind === 'issued' || e.kind === 'transferred') && e.condition);
  return last?.condition ?? a.condition;
}

export function ActionModal({ db, st, asset, kind, onClose }: { db: HrmsDb; st: RewardsState; asset: Asset; kind: ActionKind; onClose: () => void }) {
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const [personId, setPersonId] = useState('');
  const [condition, setCondition] = useState<AssetCondition | ''>(kind === 'issue' || kind === 'transfer' ? asset.condition : '');
  const [ack, setAck] = useState(false);
  const [text, setText] = useState('');
  const [next, setNext] = useState<'in_stock' | 'in_repair' | 'retired'>('in_stock');

  const holder = holderOf(db, asset);
  const dup = kind === 'issue' && personId ? duplicateIssue(st.assets.items, personId, asset) : undefined;
  const person = db.employees.find((e) => e.id === personId);
  const issuedCondition = useMemo(() => conditionAtIssue(st.assets.events, asset), [st.assets.events, asset]);
  const worse = kind === 'return' && condition && conditionWorse(condition, issuedCondition);
  const desc = `${asset.tag} ${asset.make} ${asset.model}`;

  function pickCondition(c: AssetCondition | '') {
    setCondition(c);
    if (kind === 'return' && c) setNext(c === 'damaged' || c === 'poor' ? 'in_repair' : 'in_stock');
  }

  let ready = true; let reason = '';
  if ((kind === 'issue' || kind === 'transfer') && !personId) { ready = false; reason = 'Choose who receives it.'; }
  else if ((kind === 'issue' || kind === 'transfer') && !ack) { ready = false; reason = 'The receiver must acknowledge receipt.'; }
  else if ((kind === 'return' || kind === 'repair_back') && !condition) { ready = false; reason = 'Record the condition first.'; }
  else if (kind === 'lost' && !text.trim()) { ready = false; reason = 'Say how it was lost.'; }

  function submit() {
    if (!ready) return;
    let ok = false;
    if (kind === 'issue') ok = report(issueAsset({ assetId: asset.id, personId, condition: condition as AssetCondition, ack, note: text }), `${asset.tag} issued to ${nameOf(db, personId)}.`);
    if (kind === 'transfer') ok = report(transferAsset({ assetId: asset.id, toId: personId, condition: condition as AssetCondition, ack, note: text }), `${asset.tag} transferred to ${nameOf(db, personId)}.`);
    if (kind === 'return') ok = report(returnAsset({ assetId: asset.id, condition: condition as AssetCondition, next, note: text }), `${asset.tag} recorded as returned.`);
    if (kind === 'repair') ok = report(sendToRepair(asset.id, text), `${asset.tag} sent for repair.`);
    if (kind === 'repair_back') ok = report(backFromRepair(asset.id, condition as AssetCondition, text), `${asset.tag} is back in stock.`);
    if (kind === 'lost') ok = report(markLost(asset.id, text), `${asset.tag} marked as lost.`);
    if (kind === 'retire') ok = report(retireAsset(asset.id, text), `${asset.tag} retired.`);
    if (ok) onClose();
  }

  const noteField = (
    <Field label={kind === 'lost' ? 'What happened' : 'Note'} required={kind === 'lost'} htmlFor={id('note')} hint={kind === 'lost' ? 'For example where and when, and whether a police complaint was filed.' : 'Optional.'}>
      <Textarea id={id('note')} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
    </Field>
  );

  return (
    <Modal title={TITLE[kind]} onClose={onClose} width={540}
      footer={(
        <>
          {!ready && <span style={{ flex: 1, minWidth: 160, alignSelf: 'center', fontSize: 12.5, color: T.dim }}>{reason}</span>}
          <Button style={{ height: 40 }} onClick={onClose}>Cancel</Button>
          <Button variant={kind === 'lost' ? 'danger' : 'primary'} style={{ height: 40 }} disabled={!ready} onClick={submit}>{TITLE[kind]}</Button>
        </>
      )}>
      <div style={{ fontSize: 13.5, color: T.dim }}>
        <b style={{ color: T.text }}>{desc}</b> · serial {asset.serial}{holder ? ` · held by ${nameOf(db, holder.id)}` : ''}
      </div>

      {(kind === 'issue' || kind === 'transfer') && (
        <>
          <Field label={kind === 'issue' ? 'Issue to' : 'Transfer to'} required htmlFor={id('who')}>
            <PersonSelect db={db} id={id('who')} label={kind === 'issue' ? 'Issue to' : 'Transfer to'} value={personId} onChange={setPersonId} exclude={kind === 'transfer' ? asset.holderId : undefined} />
          </Field>
          {dup && (
            <div role="alert" data-testid="duplicate-warning">
              <Note tone="warn"><b>{person ? nameOf(db, person.id) : 'This person'} already holds a {typeLabel(asset.type).toLowerCase()}:</b> {assetName(dup)}. Issuing a second one is allowed, but check it is meant. If it is a replacement, return the first one afterwards.</Note>
            </div>
          )}
          <FormGrid narrow>
            <Field label={kind === 'issue' ? 'Condition at issue' : 'Condition at handover'} required htmlFor={id('cond')}>
              <Select id={id('cond')} value={condition} onChange={(e) => pickCondition(e.target.value as AssetCondition)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
              </Select>
            </Field>
          </FormGrid>
          <div>
            <CheckRow checked={ack} onChange={setAck} testId="ack-check">
              I have received {desc} in working condition.
            </CheckRow>
            <Muted>{person ? `${nameOf(db, person.id)} acknowledges receipt.` : 'The receiver acknowledges receipt.'}</Muted>
          </div>
          <SimulationNote>In the live product the receiver ticks this in My HR. Here HR records it on their behalf, and there is no e-signature.</SimulationNote>
          {noteField}
        </>
      )}

      {kind === 'return' && (
        <>
          <Field label="Condition on return" required htmlFor={id('cond')} hint={`It was recorded as ${CONDITION_LABEL[issuedCondition].toLowerCase()} when it was issued.`}>
            <Select id={id('cond')} value={condition} onChange={(e) => pickCondition(e.target.value as AssetCondition)}>
              <option value="">Select the condition</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
            </Select>
          </Field>
          {worse && <Note tone="warn" >The condition is worse than when it was issued ({CONDITION_LABEL[issuedCondition]}). Write what changed in the note. This page does not decide any recovery.</Note>}
          <Field label="Where does it go next" htmlFor={id('next')}>
            <Select id={id('next')} value={next} onChange={(e) => setNext(e.target.value as typeof next)}>
              <option value="in_stock">Back in stock</option>
              <option value="in_repair">To repair</option>
              <option value="retired">Retire it</option>
            </Select>
          </Field>
          {noteField}
        </>
      )}

      {kind === 'repair_back' && (
        <>
          <Field label="Condition now" required htmlFor={id('cond')}>
            <Select id={id('cond')} value={condition} onChange={(e) => pickCondition(e.target.value as AssetCondition)}>
              <option value="">Select the condition</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
            </Select>
          </Field>
          {noteField}
        </>
      )}

      {(kind === 'repair' || kind === 'lost' || kind === 'retire') && (
        <>
          {kind === 'lost' && <Note tone="warn">This takes the asset off the usable list. The history stays, and it cannot be undone from here.</Note>}
          {noteField}
        </>
      )}
    </Modal>
  );
}

// ───────────────────────────── detail ─────────────────────────────

export function HistoryList({ db, events }: { db: HrmsDb; events: AssetEvent[] }) {
  if (!events.length) return <Muted>No history yet.</Muted>;
  return (
    <ol data-testid="asset-history" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {[...events].reverse().map((e, i) => (
        <li key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13 }}>
          <span style={{ color: T.dim, fontVariantNumeric: 'tabular-nums', flex: '0 0 92px' }}>{fmtDate(e.on)}</span>
          <span style={{ flex: '1 1 0', minWidth: 0, overflowWrap: 'anywhere' }}>
            <b>{EVENT_LABEL[e.kind]}</b>
            {e.fromId && e.toId ? ` from ${nameOf(db, e.fromId)} to ${nameOf(db, e.toId)}` : e.toId ? ` to ${nameOf(db, e.toId)}` : e.fromId ? ` by ${nameOf(db, e.fromId)}` : ''}
            {e.condition && <span style={{ color: T.dim }}> · {CONDITION_LABEL[e.condition].toLowerCase()}</span>}
            {e.ack && <span style={{ color: T.ok }}> · receipt acknowledged</span>}
            {e.note && <div style={{ color: T.dim, marginTop: 2 }}>{e.note}</div>}
            <div style={{ color: T.mute, fontSize: 12 }}>Recorded by {e.by}</div>
          </span>
        </li>
      ))}
    </ol>
  );
}

const ACTIONS_BY_STATUS: Record<AssetStatus, { kind: ActionKind; label: string; primary?: boolean }[]> = {
  in_stock: [{ kind: 'issue', label: 'Issue', primary: true }, { kind: 'repair', label: 'Send for repair' }, { kind: 'lost', label: 'Mark lost' }, { kind: 'retire', label: 'Retire' }],
  issued: [{ kind: 'return', label: 'Record return', primary: true }, { kind: 'transfer', label: 'Transfer' }, { kind: 'repair', label: 'Send for repair' }, { kind: 'lost', label: 'Mark lost' }],
  in_repair: [{ kind: 'repair_back', label: 'Back from repair', primary: true }, { kind: 'retire', label: 'Retire' }],
  lost: [],
  retired: [],
};

export function AssetDetailModal({ db, st, assetId, onClose }: { db: HrmsDb; st: RewardsState; assetId: string; onClose: () => void }) {
  const a = st.assets.items.find((x) => x.id === assetId);
  const [action, setAction] = useState<ActionKind | null>(null);
  if (!a) return null;
  const events = st.assets.events.filter((e) => e.assetId === a.id);
  const holder = holderOf(db, a);
  const acts = ACTIONS_BY_STATUS[a.status];
  return (
    <>
      <Modal title={`${a.tag}, ${a.make} ${a.model}`} onClose={onClose} width={680}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusPill status={a.status} /><ConditionPill c={a.condition} /><Badge>{typeLabel(a.type)}</Badge>
          {holder && <span style={{ fontSize: 13.5 }}>Held by <b>{nameOf(db, holder.id)}</b></span>}
        </div>
        <KeyValue columns={3} rows={[
          { label: 'Serial', value: <span style={{ fontFamily: T.mono, fontSize: 13 }}>{a.serial}</span> },
          { label: 'Purchased', value: `${fmtDate(a.purchaseDate)} (${ageLabel(a, PREVIEW_TODAY)} ago)` },
          { label: 'Cost', value: inr(a.cost) },
          { label: 'Book value today', value: `${inr(bookValue(a, PREVIEW_TODAY))} (${typeInfo(a.type).lifeYears}-year straight line)` },
          { label: 'Warranty', value: <WarrantyCell a={a} /> },
        ]} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {acts.map((x) => <Button key={x.kind} variant={x.primary ? 'primary' : 'secondary'} style={{ height: 40 }} onClick={() => setAction(x.kind)}>{x.label}</Button>)}
          {!acts.length && <Muted>{a.status === 'lost' ? 'A lost asset cannot be changed. The history below stays.' : 'A retired asset cannot be changed. The history below stays.'}</Muted>}
        </div>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: 13.5, fontFamily: T.heading }}>History</h3>
          <Muted style={{ marginBottom: 6 }}>Every issue, return and transfer is kept. Nothing here can be edited or deleted.</Muted>
          <HistoryList db={db} events={events} />
        </div>
      </Modal>
      {action && <ActionModal db={db} st={st} asset={a} kind={action} onClose={() => setAction(null)} />}
    </>
  );
}

// ───────────────────────────── add ─────────────────────────────
export function AddAssetModal({ onClose }: { onClose: () => void }) {
  const narrow = useIsCompact(700);
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const [type, setType] = useState<AssetType>('laptop');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [bought, setBought] = useState(PREVIEW_TODAY);
  const [cost, setCost] = useState('');
  const [warranty, setWarranty] = useState('12');
  const [cond, setCond] = useState<AssetCondition>('new');
  const [tried, setTried] = useState(false);

  const errs: Record<string, string> = {};
  if (!make.trim()) errs.make = 'Enter the make.';
  if (!model.trim()) errs.model = 'Enter the model.';
  if (!serial.trim()) errs.serial = 'Enter the serial number.';
  if (!(Number(cost) > 0)) errs.cost = 'Enter the cost in rupees.';
  if (!bought || bought > PREVIEW_TODAY) errs.bought = 'The date cannot be in the future.';
  const show = (k: string) => (tried ? errs[k] : undefined);

  function submit() {
    setTried(true);
    if (Object.keys(errs).length) return;
    const r = addAsset({ type, make, model, serial, purchaseDate: bought, cost: Number(cost), warrantyMonths: Number(warranty) || 0, condition: cond });
    if (report(r, r.ok ? `${r.tag} added to the register.` : '')) onClose();
  }
  return (
    <ConfirmModal title="Add asset" confirmLabel="Add to register" onConfirm={submit} onClose={onClose} width={600}>
      <FormGrid narrow={narrow}>
        <Field label="Type" required htmlFor={id('type')}>
          <Select id={id('type')} value={type} onChange={(e) => setType(e.target.value as AssetType)}>{ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        </Field>
        <Field label="Make" required htmlFor={id('make')} error={show('make')}><Input id={id('make')} value={make} invalid={!!show('make')} onChange={(e) => setMake(e.target.value)} /></Field>
        <Field label="Model" required htmlFor={id('model')} error={show('model')}><Input id={id('model')} value={model} invalid={!!show('model')} onChange={(e) => setModel(e.target.value)} /></Field>
        <Field label="Serial number" required htmlFor={id('serial')} error={show('serial')}><Input id={id('serial')} value={serial} invalid={!!show('serial')} onChange={(e) => setSerial(e.target.value)} /></Field>
        <Field label="Purchase date" required htmlFor={id('bought')} error={show('bought')}><Input id={id('bought')} type="date" value={bought} max={PREVIEW_TODAY} invalid={!!show('bought')} onChange={(e) => setBought(e.target.value)} /></Field>
        <Field label="Cost (₹)" required htmlFor={id('cost')} error={show('cost')}><Input id={id('cost')} inputMode="numeric" value={cost} invalid={!!show('cost')} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Warranty (months)" htmlFor={id('warranty')} hint="0 if none."><Input id={id('warranty')} inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Condition" htmlFor={id('cond')}>
          <Select id={id('cond')} value={cond} onChange={(e) => setCond(e.target.value as AssetCondition)}>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}</Select>
        </Field>
      </FormGrid>
      <Muted>The tag is generated. New assets start in stock and can be issued from their detail view.</Muted>
    </ConfirmModal>
  );
}

