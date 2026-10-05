'use client';
// Create or edit an expense claim. Receipts are uploaded straight from this form
// (and read by OCR to pre-fill the line), and the policy is checked live as the
// lines change, so problems show up before anyone presses Submit.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, FileText, MapPin, Plus, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { Badge, Button, Card, FormGrid, IconButton, Input, Select, T, useIsCompact } from '../ui';
import {
  CATEGORIES, CATEGORY_LABELS, ClaimItem, ClaimItemInput, ClaimCheck, ExpenseClaim, ItemCategory, MyPolicy, expensesApi,
} from '../../lib/expensesApi';
import {
  ExpensesShell, Field, Panel, PolicyFindings, ReceiptViewer, RejectionBanner, RECEIPT_ACCEPT, RECEIPT_MAX_BYTES,
  errText, money, prepareReceipt, todayIso,
} from './kit';

interface Line {
  key: number;
  id?: string;
  category: ItemCategory;
  item_date: string;
  amount: string;
  description: string;
  merchant: string;
  from_location: string;
  to_location: string;
  distance_km: string;
  receipt_url: string;
  receipt_view: string | null;
  receipt_name: string;
  ai_extracted: Record<string, unknown> | null;
  uploading?: boolean;
  suggesting?: boolean;
  scanNote?: string | null;
}

const n = (v: string) => (v.trim() === '' ? NaN : Number(v));
const pos = (v: string) => Number.isFinite(n(v)) && n(v) > 0;

function fromItem(it: ClaimItem, key: number): Line {
  return {
    key, id: it.id, category: it.category, item_date: it.item_date ?? todayIso(),
    amount: it.amount ? String(it.amount) : '', description: it.description ?? '', merchant: it.merchant ?? '',
    from_location: it.from_location ?? '', to_location: it.to_location ?? '', distance_km: it.distance_km != null ? String(it.distance_km) : '',
    receipt_url: it.receipt_url ?? '', receipt_view: it.receipt_signed_url ?? null, receipt_name: it.receipt_url ? 'Receipt' : '',
    ai_extracted: it.ai_extracted ?? null,
  };
}

const blank = (key: number, category: ItemCategory = 'food'): Line => ({
  key, category, item_date: todayIso(), amount: '', description: '', merchant: '', from_location: '', to_location: '',
  distance_km: '', receipt_url: '', receipt_view: null, receipt_name: '', ai_extracted: null,
});

const isFilled = (l: Line) => !!(l.amount.trim() || l.distance_km.trim() || l.merchant.trim() || l.description.trim() || l.receipt_url || l.from_location.trim() || l.to_location.trim());
const isValid = (l: Line) => (l.category === 'mileage' ? pos(l.amount) || pos(l.distance_km) : pos(l.amount));

function toInput(l: Line): ClaimItemInput {
  const mileage = l.category === 'mileage';
  return {
    ...(l.id ? { id: l.id } : {}),
    category: l.category,
    item_date: l.item_date || null,
    description: l.description.trim() || null,
    amount: pos(l.amount) ? n(l.amount) : null,
    distance_km: mileage && pos(l.distance_km) ? n(l.distance_km) : null,
    from_location: mileage ? l.from_location.trim() || null : null,
    to_location: mileage ? l.to_location.trim() || null : null,
    merchant: mileage ? null : l.merchant.trim() || null,
    receipt_url: l.receipt_url || null,
    ai_extracted: l.ai_extracted,
  };
}

export default function ClaimEditor({ claimId }: { claimId?: string }) {
  const router = useRouter();
  const narrow = useIsCompact(1000);
  const seq = useRef(1);
  const nextKey = () => seq.current++;

  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [blank(0)]);
  const [claim, setClaim] = useState<ExpenseClaim | null>(null);
  const [policy, setPolicy] = useState<MyPolicy | null>(null);
  const [loading, setLoading] = useState(!!claimId);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [check, setCheck] = useState<ClaimCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  // Once a draft has been created from this form, further saves update it rather than creating a second one.
  const savedId = useRef<string | undefined>(claimId);

  // ── load ──
  useEffect(() => { expensesApi.myPolicy().then((r) => setPolicy(r.data)).catch(() => undefined); }, []);
  useEffect(() => {
    if (!claimId) return;
    let off = false;
    expensesApi.getClaim(claimId).then((r) => {
      if (off) return;
      const c = r.data;
      if (!['draft', 'submitted', 'rejected'].includes(c.status)) { router.replace(`/dashboard/expenses/${claimId}`); return; }
      setClaim(c);
      setTitle(c.title ?? '');
      setLines((c.items?.length ? c.items : []).map((it) => fromItem(it, nextKey())).concat(c.items?.length ? [] : [blank(nextKey())]));
    }).catch((e) => { toast.error(errText(e, 'Could not load the claim')); router.replace('/dashboard/expenses'); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [claimId, router]);

  // ── lines ──
  const patch = useCallback((key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l))), []);
  const addLine = () => setLines((ls) => [...ls, blank(nextKey(), ls[ls.length - 1]?.category === 'mileage' ? 'food' : ls[ls.length - 1]?.category ?? 'food')]);
  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? [blank(nextKey())] : ls.filter((l) => l.key !== key)));

  const rate = policy?.mileage_rate ?? 0;
  const currency = policy?.currency ?? claim?.currency ?? 'INR';
  const lineAmount = (l: Line) => (pos(l.amount) ? n(l.amount) : l.category === 'mileage' && pos(l.distance_km) ? Math.round(n(l.distance_km) * rate * 100) / 100 : 0);
  const total = useMemo(() => lines.reduce((s, l) => s + lineAmount(l), 0), [lines, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const filled = useMemo(() => lines.filter(isFilled), [lines]);

  // ── live policy check ──
  const checkKey = useMemo(() => JSON.stringify(filled.filter(isValid).map(toInput)), [filled]);
  const checkSeq = useRef(0);
  useEffect(() => {
    const items: ClaimItemInput[] = JSON.parse(checkKey);
    if (!items.length) { setCheck(null); return; }
    const mine = ++checkSeq.current;
    setChecking(true);
    const t = setTimeout(() => {
      expensesApi.checkClaim({ items, claim_id: savedId.current })
        .then((r) => { if (mine === checkSeq.current) setCheck(r.data); })
        .catch(() => { if (mine === checkSeq.current) setCheck(null); })
        .finally(() => { if (mine === checkSeq.current) setChecking(false); });
    }, 650);
    return () => clearTimeout(t);
  }, [checkKey]);

  // Findings are indexed by position among the lines that were checked.
  const checkedKeys = useMemo(() => filled.filter(isValid).map((l) => l.key), [filled]);
  const findingsFor = (key: number) => {
    const idx = checkedKeys.indexOf(key);
    return idx < 0 ? [] : (check?.violations ?? []).filter((v) => v.item_id === String(idx));
  };
  const generalFindings = (check?.violations ?? []).filter((v) => !v.item_id || !/^\d+$/.test(v.item_id));
  const blocking = !!check?.blocking;

  // ── receipts ──
  const attach = async (key: number, file: File) => {
    patch(key, { uploading: true });
    try {
      const ready = await prepareReceipt(file);
      if (ready.size > RECEIPT_MAX_BYTES) throw new Error('That file is larger than 10 MB');
      const { data: up } = await expensesApi.uploadReceipt(ready, ready.name);
      const s = up.scan;
      setLines((ls) => ls.map((l) => {
        if (l.key !== key) return l;
        const fresh = !l.amount.trim() && !l.merchant.trim();
        const read = s && (s.amount != null || s.merchant);
        return {
          ...l, uploading: false, receipt_url: up.url, receipt_view: up.signed_url, receipt_name: ready.name,
          ai_extracted: s ? (s as unknown as Record<string, unknown>) : l.ai_extracted,
          amount: l.amount.trim() ? l.amount : s?.amount != null ? String(s.amount) : '',
          merchant: l.merchant.trim() ? l.merchant : s?.merchant ?? '',
          item_date: fresh && s?.txn_date ? s.txn_date : l.item_date,
          category: fresh && s?.category && l.category !== 'mileage' ? s.category : l.category,
          scanNote: read ? `Read from the receipt: ${[s?.amount != null ? money(s.amount, s.currency || currency) : null, s?.merchant].filter(Boolean).join(' · ')}. Check it looks right.` : null,
        };
      }));
      toast.success(s?.amount != null ? 'Receipt attached and read' : 'Receipt attached');
    } catch (e) {
      patch(key, { uploading: false });
      toast.error(errText(e, 'Could not upload the receipt'));
    }
  };
  const clearReceipt = (key: number) => patch(key, { receipt_url: '', receipt_view: null, receipt_name: '', scanNote: null, ai_extracted: null });

  // ── GPS mileage ──
  const suggestMileage = async (l: Line) => {
    if (!l.item_date) { toast.error('Pick the date first'); return; }
    patch(l.key, { suggesting: true });
    try {
      const { data: m } = await expensesApi.mileage(`${l.item_date}T00:00:00.000Z`, `${l.item_date}T23:59:59.999Z`);
      if (!m.distance_km) { patch(l.key, { suggesting: false }); toast.message('No GPS trail was recorded for that day'); return; }
      patch(l.key, { suggesting: false, distance_km: String(m.distance_km), amount: String(m.suggested_amount), description: l.description || `${m.distance_km} km from your GPS trail` });
      toast.success(`${m.distance_km} km · ${money(m.suggested_amount, m.currency)}`);
    } catch (e) {
      patch(l.key, { suggesting: false });
      toast.error(errText(e, 'Could not work out the mileage'));
    }
  };

  // ── save / submit ──
  const persist = async (): Promise<string | null> => {
    if (!filled.length) { toast.error('Add at least one expense'); return null; }
    const bad = lines.findIndex((l) => isFilled(l) && !isValid(l));
    if (bad >= 0) { toast.error(`Expense ${bad + 1} needs an amount${lines[bad].category === 'mileage' ? ' or a distance' : ''}`); return null; }
    if (lines.some((l) => l.uploading)) { toast.error('Wait for the receipt to finish uploading'); return null; }
    const body = { title: title.trim() || null, items: filled.map(toInput) };
    if (savedId.current) { await expensesApi.updateClaim(savedId.current, body); return savedId.current; }
    const r = await expensesApi.createClaim(body);
    savedId.current = r.data.id;
    return r.data.id;
  };

  const saveDraft = async () => {
    setBusy('save');
    try {
      const id = await persist();
      if (id) { toast.success(claim && claim.status !== 'draft' ? 'Changes saved' : 'Draft saved'); router.push(`/dashboard/expenses/${id}`); }
    } catch (e) { toast.error(errText(e, 'Could not save the claim')); }
    finally { setBusy(null); }
  };

  const submit = async () => {
    setBusy('submit');
    let id: string | null = null;
    try {
      id = await persist();
      if (!id) return;
      await expensesApi.submitClaim(id);
      toast.success(claim?.status === 'rejected' ? 'Resubmitted for approval' : 'Submitted for approval');
      router.push(`/dashboard/expenses/${id}`);
    } catch (e) {
      toast.error(errText(e, 'Could not submit the claim'));
      // The lines were saved; send them to the editable draft so nothing is re-typed or duplicated.
      if (id && !claimId) router.replace(`/dashboard/expenses/${id}/edit`);
    } finally { setBusy(null); }
  };

  const status = claim?.status ?? 'draft';
  const heading = claimId ? (status === 'rejected' ? 'Fix and resubmit' : 'Edit claim') : 'New expense claim';

  if (loading) return <ExpensesShell title={heading} tab="mine"><Card style={{ color: T.mute, fontSize: 14 }}>Loading…</Card></ExpensesShell>;

  const policyAside = <PolicyCard policy={policy} currency={currency} />;
  const summary = (
    <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute }}>Claim total</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', color: T.text, marginTop: 2 }}>{money(total, currency)}</div>
        <div style={{ fontSize: 12.5, color: T.mute }}>{filled.length} {filled.length === 1 ? 'expense' : 'expenses'}</div>
      </div>

      {checking && !check && <div style={{ fontSize: 12.5, color: T.mute }}>Checking against your policy…</div>}
      {check && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {check.violations.length === 0 ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.ok }}><ShieldCheck size={16} strokeWidth={1.8} />Within policy{check.would_auto_approve ? ' — will be approved automatically' : ''}.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: blocking ? T.red : T.warn }}>
                {blocking ? 'Fix these before you can submit' : `${check.violations.length} ${check.violations.length === 1 ? 'thing' : 'things'} the approver will notice`}
              </div>
              <PolicyFindings flags={check.violations} compact />
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {status === 'submitted' ? (
          <Button variant="primary" disabled={!!busy || blocking} onClick={saveDraft}>{busy === 'save' ? 'Saving…' : 'Save changes'}</Button>
        ) : (
          <>
            <Button variant="primary" disabled={!!busy || blocking} onClick={submit}>{busy === 'submit' ? 'Submitting…' : status === 'rejected' ? 'Resubmit for approval' : 'Submit for approval'}</Button>
            <Button disabled={!!busy} onClick={saveDraft}>{busy === 'save' ? 'Saving…' : 'Save as draft'}</Button>
          </>
        )}
        <Button variant="ghost" disabled={!!busy} onClick={() => router.push(claimId ? `/dashboard/expenses/${claimId}` : '/dashboard/expenses')}>Cancel</Button>
      </div>
    </Card>
  );

  return (
    <ExpensesShell title={heading} tab="mine" description={status === 'submitted' ? 'Changes re-run the policy check and go to the same approver.' : undefined}>
      {claim && <RejectionBanner claim={claim} />}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card padding={20}>
            <Field label="Title" hint="Optional — helps your approver, e.g. “Client visit, Pune”.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="What is this claim for?" />
            </Field>
          </Card>

          {lines.map((l, i) => (
            <LineCard key={l.key} index={i} line={l} policy={policy} currency={currency} removable={lines.length > 1 || isFilled(l)}
              findings={findingsFor(l.key)}
              onChange={(p) => patch(l.key, p)} onRemove={() => removeLine(l.key)}
              onAttach={(f) => attach(l.key, f)} onClearReceipt={() => clearReceipt(l.key)} onView={(u) => setViewing(u)}
              onSuggest={() => suggestMileage(l)} />
          ))}

          {generalFindings.length > 0 && <Card padding={16}><PolicyFindings flags={generalFindings} /></Card>}

          <div><Button icon={<Plus size={16} strokeWidth={1.7} />} onClick={addLine}>Add another expense</Button></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: narrow ? 'static' : 'sticky', top: 16 }}>
          {summary}
          {policyAside}
        </div>
      </div>
      {viewing && <ReceiptViewer url={viewing} onClose={() => setViewing(null)} />}
    </ExpensesShell>
  );
}

// ── one expense line ────────────────────────────────────────────────────────
function LineCard({ index, line: l, policy, currency, removable, findings, onChange, onRemove, onAttach, onClearReceipt, onView, onSuggest }: {
  index: number; line: Line; policy: MyPolicy | null; currency: string; removable: boolean;
  findings: ClaimCheck['violations'];
  onChange: (p: Partial<Line>) => void; onRemove: () => void; onAttach: (f: File) => void; onClearReceipt: () => void;
  onView: (url: string) => void; onSuggest: () => void;
}) {
  const wide = !useIsCompact(640);
  const mileage = l.category === 'mileage';
  const allowed = CATEGORIES.filter((c) => c === l.category || policy?.rules?.categories?.[c]?.enabled !== false);
  const worst = findings.some((f) => f.blocking || f.severity === 'high') ? T.red : findings.length ? T.warn : T.border;

  return (
    <Card padding={0} style={{ borderColor: findings.length ? worst : undefined, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.mute, minWidth: 18 }}>{index + 1}</span>
        <Select aria-label="Category" value={l.category} onChange={(e) => onChange({ category: e.target.value as ItemCategory })} style={{ width: 150 }}>
          {allowed.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </Select>
        <Input aria-label="Date" type="date" value={l.item_date} max={todayIso()} onChange={(e) => onChange({ item_date: e.target.value })} style={{ width: 160 }} />
        <div style={{ flex: 1 }} />
        {removable && <IconButton label="Remove this expense" onClick={onRemove}><Trash2 size={16} strokeWidth={1.6} /></IconButton>}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mileage ? (
          <>
            <FormGrid narrow={!wide}>
              <Field label="From"><Input value={l.from_location} onChange={(e) => onChange({ from_location: e.target.value })} placeholder="Starting point" /></Field>
              <Field label="To"><Input value={l.to_location} onChange={(e) => onChange({ to_location: e.target.value })} placeholder="Destination" /></Field>
              <Field label="Distance (km)" required>
                <Input inputMode="decimal" value={l.distance_km} onChange={(e) => onChange({ distance_km: e.target.value })} placeholder="0" />
              </Field>
              <Field label={`Amount (${currency})`} hint={policy?.mileage_rate ? `Left blank, it is worked out at ${money(policy.mileage_rate, currency)} per km.` : undefined}>
                <Input inputMode="decimal" value={l.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder="Automatic" />
              </Field>
            </FormGrid>
            <div><Button size="sm" icon={<MapPin size={14} strokeWidth={1.7} />} disabled={l.suggesting} onClick={onSuggest}>{l.suggesting ? 'Reading your trail…' : 'Fill from my GPS trail'}</Button></div>
          </>
        ) : (
          <FormGrid narrow={!wide}>
            <Field label="Merchant"><Input value={l.merchant} onChange={(e) => onChange({ merchant: e.target.value })} placeholder="Where was it spent?" /></Field>
            <Field label={`Amount (${currency})`} required>
              <Input inputMode="decimal" value={l.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder="0" />
            </Field>
          </FormGrid>
        )}

        <Field label="Notes"><Input value={l.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Optional" maxLength={500} /></Field>

        {!mileage && <ReceiptSlot line={l} onAttach={onAttach} onClear={onClearReceipt} onView={onView} />}
        {l.scanNote && <div style={{ fontSize: 12.5, color: T.info }}>{l.scanNote}</div>}
        {findings.length > 0 && <PolicyFindings flags={findings} compact />}
      </div>
    </Card>
  );
}

function ReceiptSlot({ line: l, onAttach, onClear, onView }: { line: Line; onAttach: (f: File) => void; onClear: () => void; onView: (u: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (f?: File | null) => { if (f) onAttach(f); };
  const hidden = <input ref={input} type="file" accept={RECEIPT_ACCEPT} style={{ display: 'none' }} onChange={(e) => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />;
  const isImg = !!l.receipt_view && !/\.(pdf|heic|heif)(\?|#|$)/i.test(l.receipt_view);

  if (l.uploading) {
    return <div style={{ padding: '14px 16px', border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, fontSize: 13.5, color: T.dim }}>Uploading and reading the receipt…</div>;
  }
  if (l.receipt_url) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: T.panel }}>
        <div style={{ width: 52, height: 52, borderRadius: T.radius.sm, overflow: 'hidden', background: 'var(--s3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mute }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {isImg ? <img src={l.receipt_view!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FileText size={22} strokeWidth={1.5} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.receipt_name || 'Receipt'}</div>
          <div style={{ fontSize: 12, color: T.mute }}>Receipt attached</div>
        </div>
        {l.receipt_view && <Button size="sm" icon={<Eye size={14} strokeWidth={1.7} />} onClick={() => onView(l.receipt_view!)}>View</Button>}
        <Button size="sm" onClick={() => input.current?.click()}>Replace</Button>
        <IconButton label="Remove receipt" onClick={onClear}><X size={16} strokeWidth={1.6} /></IconButton>
        {hidden}
      </div>
    );
  }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: T.radius.md, border: `1px dashed ${drag ? T.red : T.borderStrong}`, background: drag ? T.redWash : 'transparent', flexWrap: 'wrap' }}>
      <Upload size={20} strokeWidth={1.5} style={{ color: T.mute, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Attach the receipt</div>
        <div style={{ fontSize: 12.5, color: T.mute }}>Drop a photo or PDF here. We read the amount and merchant for you.</div>
      </div>
      <Button size="sm" onClick={() => input.current?.click()}>Choose file</Button>
      {hidden}
    </div>
  );
}

function PolicyCard({ policy, currency }: { policy: MyPolicy | null; currency: string }) {
  if (!policy) return null;
  const cats = policy.rules?.categories;
  const caps = cats ? CATEGORIES.filter((c) => cats[c]?.enabled !== false && cats[c]?.per_day_limit != null) : [];
  const off = cats ? CATEGORIES.filter((c) => cats[c]?.enabled === false) : [];
  const row = (k: string, v: string) => (
    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: T.dim }}>{k}</span><span style={{ color: T.text, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
  return (
    <Panel title="Your policy" aside={policy.name ? <Badge>{policy.name}</Badge> : undefined} padding={18}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {policy.mileage_rate > 0 && row('Mileage', `${money(policy.mileage_rate, currency)} / km`)}
        {policy.require_receipt_over >= 0 && row('Receipt needed over', money(policy.require_receipt_over, currency))}
        {policy.auto_approve_under > 0 && row('Auto-approved up to', money(policy.auto_approve_under, currency))}
        {policy.escalate_over != null && row('Needs a second approver over', money(policy.escalate_over, currency))}
        {policy.rules?.max_claim_amount != null && row('Largest claim', money(policy.rules.max_claim_amount, currency))}
        {caps.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute }}>Daily limits</div>
            {caps.map((c) => row(CATEGORY_LABELS[c], money(cats![c].per_day_limit, currency)))}
          </div>
        )}
        {off.length > 0 && <div style={{ fontSize: 12.5, color: T.mute, marginTop: 4 }}>Not reimbursed: {off.map((c) => CATEGORY_LABELS[c]).join(', ')}.</div>}
        {policy.rules?.enforcement === 'block' && <div style={{ fontSize: 12.5, color: T.warn, marginTop: 4 }}>A claim that breaks these rules can’t be submitted.</div>}
      </div>
    </Panel>
  );
}
