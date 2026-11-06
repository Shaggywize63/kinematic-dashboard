'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { crmActivities, crmProducts } from '../../../lib/crmApi';
import { isB2bClientActive } from '../../../lib/b2bClient';
import { ACTIVITY_OUTCOME_MAX, activityOutcomeError, apiErrorText, arr, normalizeFormSerialInput, outcomeForPatch, rows } from '../../../lib/sparkAccounts';
import type { Activity, Product } from '../../../types/crm';
import UserSearchSelect, { type UserOption } from '../shared/UserSearchSelect';
import { Select, T } from '../../ui';

// Spark & Ray (connected-B2B) activity controls: several assignees (the first is the Primary), the products the
// customer is interested in (from the shared catalogue) and the filled-form serial. Only rendered for that client.

export type ProductOption = { id: string; name: string };

/** The shared product catalogue (~13 rows), loaded once when `enabled`. Never throws; an empty list on failure. */
export function useProductCatalogue(enabled: boolean): ProductOption[] {
  const [rows, setRows] = useState<ProductOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    crmProducts.list({ limit: 200 })
      .then((r) => {
        if (off) return;
        setRows(arr<Product>(r?.data).filter((p) => p && p.is_active !== false).map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [enabled]);
  return rows;
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '3px 6px 3px 10px',
  borderRadius: 999, border: `1px solid ${T.border}`, background: 'var(--s3)', color: T.text, fontSize: 12.5, fontWeight: 600,
};
const xBtn: React.CSSProperties = {
  background: 'transparent', border: 0, padding: 2, color: T.dim, cursor: 'pointer', display: 'inline-flex', borderRadius: 999,
};

export function AssigneeChips({ users, value, onChange }: { users: UserOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'User';
  const remaining = users.filter((u) => !value.includes(u.id));
  const promote = (id: string) => onChange([id, ...value.filter((x) => x !== id)]);
  return (
    <div data-testid="assignee-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((id, i) => (
            <span key={id} data-testid="assignee-chip" style={chipStyle}>
              {nameOf(id)}
              {i === 0 ? (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, background: T.okWash, color: T.ok }}>Primary</span>
              ) : (
                <button type="button" onClick={() => promote(id)} title="Make primary" style={{ ...xBtn, fontSize: 10, fontWeight: 700, padding: '1px 6px', border: `1px solid ${T.border}` }}>Make primary</button>
              )}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Remove ${nameOf(id)}`} style={xBtn}><X size={13} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      {value.length < 20 && (
        <UserSearchSelect
          options={remaining}
          value=""
          onChange={(id) => { if (id && !value.includes(id)) onChange([...value, id]); }}
          placeholder={value.length ? 'Add another team member…' : 'Search team member…'}
          emptyLabel="Pick someone"
        />
      )}
    </div>
  );
}

export function ProductChips({ products, value, onChange }: { products: ProductOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name || 'Product';
  const remaining = products.filter((p) => !value.includes(p.id));
  return (
    <div data-testid="product-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((id) => (
            <span key={id} data-testid="product-chip" style={chipStyle}>
              {nameOf(id)}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Remove ${nameOf(id)}`} style={xBtn}><X size={13} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      <Select
        aria-label="Add product"
        value=""
        onChange={(e) => { const id = e.target.value; if (id && !value.includes(id)) onChange([...value, id]); }}
        disabled={remaining.length === 0}
      >
        <option value="">{remaining.length === 0 ? (products.length ? 'All products added' : 'No products in the catalogue') : 'Add a product…'}</option>
        {remaining.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </div>
  );
}

export function FormSerialInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        aria-label="Form serial"
        value={value}
        onChange={(e) => onChange(normalizeFormSerialInput(e.target.value))}
        placeholder="e.g. SRPR2627-12"
        autoComplete="off"
        spellCheck={false}
        className="km-input"
        data-invalid={error ? 'true' : undefined}
        style={{ height: 36, boxSizing: 'border-box', width: '100%', background: 'var(--field)', border: `1px solid ${error ? T.red : T.border}`, color: T.text, padding: '0 11px', borderRadius: 6, fontSize: 14, fontFamily: T.mono, outline: 'none' }}
      />
      {error && <div role="alert" data-testid="form-serial-error" style={{ fontSize: 12, color: T.red }}>{error}</div>}
    </div>
  );
}

/** Assignee / product / form-serial chips on an activity card or timeline row. Renders nothing for non-Spark rows. */
export function SparkActivityMeta({ a, style }: { a: Pick<Activity, 'assignees' | 'products' | 'form_ref_no'>; style?: React.CSSProperties }) {
  const assignees = rows<{ id: string; name: string }>(a.assignees);
  const products = rows<{ id: string; name: string }>(a.products);
  const ref = (a.form_ref_no ?? '').toString().trim();
  if (!assignees.length && !products.length && !ref) return null;
  const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' });
  return (
    <div data-testid="spark-activity-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, ...style }}>
      {assignees.map((u, i) => (
        <span key={u.id || i} style={pill('var(--s3)', T.text)} title={i === 0 ? 'Primary assignee' : 'Assignee'}>
          {u.name}{i === 0 && assignees.length > 1 ? ' · primary' : ''}
        </span>
      ))}
      {products.map((p, i) => <span key={p.id || i} style={pill(T.infoWash, T.info)} title="Product interested">{p.name}</span>)}
      {ref && <span style={{ ...pill(T.okWash, T.ok), fontFamily: T.mono }} title="Form serial">{ref}</span>}
    </div>
  );
}


// ── Activity Outcome (Spark) ────────────────────────────────────────────────

/**
 * The Outcome text area of the activity create / edit forms. Required (asterisk + inline error) only when the
 * activity is being logged / marked completed; optional while it is just scheduled.
 */
export function OutcomeField({ value, onChange, required, error }: { value: string; onChange: (v: string) => void; required: boolean; error?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor="activity-outcome" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
        Outcome{required ? <span aria-hidden style={{ color: '#ef4444', marginLeft: 3 }}>*</span> : <span style={{ textTransform: 'none', fontWeight: 400 }}> (optional until completed)</span>}
      </label>
      <textarea
        id="activity-outcome"
        aria-label="Outcome"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        rows={3}
        maxLength={ACTIVITY_OUTCOME_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What came out of this activity?"
        style={{ background: 'var(--s3)', border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`, color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
      />
      {error && <span role="alert" style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  );
}

/** "Outcome: …" on an activity row / card (Spark only; nothing when the row has none). */
export function SparkActivityOutcome({ a, style }: { a: Pick<Activity, 'outcome'>; style?: React.CSSProperties }) {
  const text = (a.outcome ?? '').toString().trim();
  if (!text || !isB2bClientActive()) return null;
  return (
    <div data-testid="activity-outcome" style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 700 }}>Outcome: </span>{text}
    </div>
  );
}

/**
 * "Company: <name>" on an activity row / card (Spark only). A link to the account when `company_id` is present,
 * plain text when only the name is known (the lead's company text); nothing when there is neither.
 */
export function SparkActivityCompany({ a, style }: { a: Pick<Activity, 'company_id' | 'company_name'>; style?: React.CSSProperties }) {
  const name = (a.company_name ?? '').toString().trim();
  if (!name || !isB2bClientActive()) return null;
  const id = (a.company_id ?? '').toString().trim();
  return (
    <div data-testid="activity-company" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, overflowWrap: 'anywhere', ...style }}>
      Company:{' '}
      {id ? (
        <Link href={`/dashboard/crm/accounts/${id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }} title={`Open ${name}`}>{name}</Link>
      ) : (
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>
      )}
    </div>
  );
}

/**
 * Spark: marking an activity completed asks for its Outcome first (required). Saves status + completed_at +
 * outcome in one PATCH, then calls `onDone`.
 */
export function CompleteActivityDialog({ activity, onClose, onDone }: { activity: Pick<Activity, 'id' | 'subject' | 'outcome'>; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState(activity.outcome || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const err = activityOutcomeError(outcome, true);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      await crmActivities.update(activity.id, { status: 'completed', completed_at: new Date().toISOString(), outcome: outcomeForPatch(outcome) } as never);
      onDone();
    } catch (e) {
      setError(apiErrorText(e, 'Could not complete the activity'));
      setBusy(false);
    }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 110 }}>
      <div role="dialog" aria-label="Complete activity" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Complete activity</div>
        {activity.subject && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{activity.subject}</div>}
        <OutcomeField value={outcome} onChange={(v) => { setOutcome(v); setError(null); }} required error={error} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#10b981', border: 'none', color: '#fff', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Mark complete'}</button>
        </div>
      </div>
    </div>
  );
}
