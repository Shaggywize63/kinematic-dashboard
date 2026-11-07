'use client';
import { useEffect, useRef, useState } from 'react';
import { crmAccounts, crmContacts, crmDeals, crmLeads } from '../../../lib/crmApi';

export type LinkedEntityType = '' | 'lead' | 'contact' | 'deal' | 'account';
export interface LinkedEntity { type: LinkedEntityType; id: string; label: string }

const TYPES: Array<{ value: LinkedEntityType; label: string }> = [
  { value: '', label: '— None —' },
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'Contact' },
  { value: 'deal', label: 'Deal' },
  { value: 'account', label: 'Account' },
];

type Option = { id: string; label: string };

/** The record an activity row is linked to (lead, else contact, deal, account) with the name the API stamped on it. */
export function linkedEntityOf(a: Record<string, any>): LinkedEntity {
  if (a.lead_id)    return { type: 'lead',    id: a.lead_id,    label: a.lead_name || '' };
  if (a.contact_id) return { type: 'contact', id: a.contact_id, label: a.contact_name || '' };
  if (a.deal_id)    return { type: 'deal',    id: a.deal_id,    label: a.deal_name || '' };
  if (a.account_id) return { type: 'account', id: a.account_id, label: a.account_name || '' };
  return { type: '', id: '', label: '' };
}

async function fetchOptions(type: LinkedEntityType, q: string): Promise<Option[]> {
  const params = q ? { q } : undefined;
  if (type === 'lead') {
    const r = await crmLeads.list(params);
    return (r.data || []).map((x: any) => {
      const name = [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Lead';
      return { id: x.id, label: x.phone ? `${name} · ${x.phone}` : name };
    });
  }
  if (type === 'contact') {
    const r = await crmContacts.list(params);
    return (r.data || []).map((x: any) => ({ id: x.id, label: x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Contact' }));
  }
  if (type === 'deal') {
    const r = await crmDeals.list(params);
    return (r.data || []).map((x: any) => ({ id: x.id, label: x.title || x.name || 'Deal' }));
  }
  if (type === 'account') {
    const r = await crmAccounts.list(params);
    return (r.data || []).map((x: any) => ({ id: x.id, label: x.name || 'Account' }));
  }
  return [];
}

async function fetchLabel(type: LinkedEntityType, id: string): Promise<string> {
  try {
    if (type === 'lead')    { const x = (await crmLeads.get(id)).data as any;    return x ? ([x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Lead') : ''; }
    if (type === 'contact') { const x = (await crmContacts.get(id)).data as any; return x ? (x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Contact') : ''; }
    if (type === 'deal')    { const x = (await crmDeals.get(id)).data as any;    return x ? (x.title || x.name || 'Deal') : ''; }
    if (type === 'account') { const x = (await crmAccounts.get(id)).data as any; return x ? (x.name || 'Account') : ''; }
  } catch { /* the id stays linked; the label just falls back to the type name */ }
  return '';
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 9, fontSize: 13,
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };

/**
 * "Linked entity" picker for an activity: choose Lead / Contact / Deal / Account, then search and pick the record.
 * Controlled by `value`; `onChange` fires with the new link (type '' = none). A label that is missing (the row had
 * no stamped name) is fetched so the box never shows a bare id.
 */
export default function LinkedEntityField({ value, onChange }: { value: LinkedEntity; onChange: (v: LinkedEntity) => void }) {
  const [search, setSearch] = useState(value.label);
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = async (type: LinkedEntityType, q: string) => {
    if (!type) { setOptions([]); return; }
    const mine = ++seq.current;
    setLoading(true);
    try { const o = await fetchOptions(type, q); if (mine === seq.current) setOptions(o); }
    catch { if (mine === seq.current) setOptions([]); }
    finally { if (mine === seq.current) setLoading(false); }
  };

  // The current link has no name yet (older row): look it up once.
  useEffect(() => {
    if (!value.type || !value.id || value.label) return;
    let off = false;
    fetchLabel(value.type, value.id).then((label) => {
      if (off || !label) return;
      setSearch(label);
      onChange({ ...value, label });
    });
    return () => { off = true; };
  }, [value.type, value.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickType = (type: LinkedEntityType) => {
    setSearch(''); setOptions([]);
    onChange({ type, id: '', label: '' });
    if (type) load(type, '');
  };

  return (
    <div role="group" aria-label="Linked entity" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
      <div>
        <label style={lbl} htmlFor="linked-entity-type">Linked entity</label>
        <select id="linked-entity-type" value={value.type} onChange={(e) => pickType(e.target.value as LinkedEntityType)} style={input}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {value.type && (
        <div>
          <label style={lbl} htmlFor="linked-entity-search">{`Search ${value.type[0].toUpperCase()}${value.type.slice(1)}`}</label>
          <div style={{ position: 'relative' }}>
            <input
              id="linked-entity-search"
              value={search}
              autoComplete="off"
              placeholder={`Type to search ${value.type}s…`}
              onChange={(e) => { setSearch(e.target.value); setOpen(true); onChange({ type: value.type, id: '', label: '' }); load(value.type, e.target.value); }}
              onFocus={() => { setOpen(true); if (!options.length) load(value.type, ''); }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              style={input}
            />
            {value.id && <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>✓</div>}
            {open && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 50, marginTop: 2 }}>
                {loading ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>
                  : options.length === 0 ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No results</div>
                  : options.slice(0, 20).map((o) => (
                    <div
                      key={o.id}
                      role="option"
                      aria-selected={o.id === value.id}
                      onMouseDown={() => { setSearch(o.label); setOpen(false); onChange({ type: value.type, id: o.id, label: o.label }); }}
                      style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', background: o.id === value.id ? 'var(--s2)' : 'transparent' }}
                    >{o.label}</div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
