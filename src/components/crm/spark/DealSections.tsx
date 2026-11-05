'use client';
import { useEffect, useState, type ReactNode } from 'react';
import api from '../../../lib/api';
import { crmSettings } from '../../../lib/crmApi';
import { buildFieldHelpers, extractFieldOverrides, type FieldHelpers } from '../../../lib/crmFieldOverrides';
import { formatINR } from '../../../lib/formatCurrency';
import {
  computeFinalPrice, extractDealSections, enabledDealSections, resolveDealSections, TRIAL_RESULT_LABEL,
  type DealSectionErrors, type DealSectionValues, type ResolvedDealSection, type TrialResult,
} from '../../../lib/sparkDealSections';
import UserSearchSelect, { type UserOption } from '../shared/UserSearchSelect';

/**
 * The admin's deal-section config (Settings -> Deal sections) plus the built-in field overrides, from one
 * GET /crm/settings. Until it loads — or if it fails — every section is on and every field shows.
 */
export function useDealSections(enabled: boolean): { sections: ResolvedDealSection[]; loaded: boolean; fields: FieldHelpers } {
  const [sections, setSections] = useState<ResolvedDealSection[]>(() => resolveDealSections(undefined));
  const [fields, setFields] = useState<FieldHelpers>(() => buildFieldHelpers({}, 'deal'));
  const [loaded, setLoaded] = useState(!enabled);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    crmSettings.get()
      .then((s) => { if (!off) { setSections(resolveDealSections(extractDealSections(s?.data))); setFields(buildFieldHelpers(extractFieldOverrides(s?.data), 'deal')); } })
      .catch(() => { /* keep the defaults */ })
      .finally(() => { if (!off) setLoaded(true); });
    return () => { off = true; };
  }, [enabled]);
  return { sections, loaded, fields };
}

/** The org's people for the approval dropdowns — the same assignable-users source the owner / assignee pickers use. */
export function useAssignableUsers(enabled: boolean, known: UserOption[] = []): UserOption[] {
  const [users, setUsers] = useState<UserOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    (api.getUsers({ limit: '500', scope: 'assignable' }) as Promise<{ data?: Array<{ id: string; name?: string; full_name?: string; email?: string }> }>)
      .then((r) => { if (!off) setUsers((r?.data || []).map((x) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' }))); })
      .catch(() => { if (!off) setUsers([]); });
    return () => { off = true; };
  }, [enabled]);
  // Already-picked people stay selectable (and named) even when the directory omits them.
  const extra = known.filter((k) => k.id && !users.some((u) => u.id === k.id));
  return extra.length ? [...users, ...extra] : users;
}

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const errStyle: React.CSSProperties = { fontSize: 11, color: '#ef4444', marginTop: 2 };

function Box({ label, error, children, wide }: { label: string; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={lbl}>{label}</span>
      {children}
      {error && <span role="alert" style={errStyle}>{error}</span>}
    </div>
  );
}

const PEOPLE: Array<{ key: 'technical_approval_by' | 'prepared_by' | 'checked_by' | 'supervisor_id'; label: string }> = [
  { key: 'technical_approval_by', label: 'Technical approval given by' },
  { key: 'prepared_by', label: 'Prepared by' },
  { key: 'checked_by', label: 'Checked by' },
  { key: 'supervisor_id', label: 'Supervisor name' },
];

/**
 * Spark & Ray deal form sections (create + edit): Quotation, Pricing, Product trial, Approvals & people, in the
 * order the admin set, each hidden when disabled. Built-in field overrides (hide / relabel) still apply per field.
 * `quotationExtra` renders inside the Quotation section (the create form puts the product-lines editor there).
 */
export default function DealSections({
  sections, values, onChange, users, errors = {}, fields, quotationExtra,
}: {
  sections: ResolvedDealSection[];
  values: DealSectionValues;
  onChange: (patch: Partial<DealSectionValues>) => void;
  users: UserOption[];
  errors?: DealSectionErrors;
  fields?: Pick<FieldHelpers, 'isHidden' | 'labelFor'>;
  quotationExtra?: ReactNode;
}) {
  const hidden = (k: string) => !!fields?.isHidden(k);
  const L = (k: string, d: string) => (fields ? fields.labelFor(k, d) : d);
  const final = computeFinalPrice(values.pricing_quoted, values.pricing_discount_pct);

  const body = (s: ResolvedDealSection): ReactNode => {
    switch (s.key) {
      case 'quotation':
        return (
          <>
            {!hidden('quotation_no') && (
              <div style={grid}>
                <Box label={L('quotation_no', 'Quotation number')}>
                  <input aria-label="Quotation number" value={values.quotation_no} onChange={(e) => onChange({ quotation_no: e.target.value })} placeholder="e.g. QT-2026-014" maxLength={60} style={inp} />
                </Box>
              </div>
            )}
            {quotationExtra}
          </>
        );
      case 'pricing':
        return (
          <div style={grid}>
            {!hidden('pricing_quoted') && (
              <Box label={L('pricing_quoted', 'Quoted price (INR)')} error={errors.pricing_quoted}>
                <input aria-label="Quoted price" type="number" step="any" value={values.pricing_quoted} onChange={(e) => onChange({ pricing_quoted: e.target.value })} style={inp} />
              </Box>
            )}
            {!hidden('pricing_discount_pct') && (
              <Box label={L('pricing_discount_pct', 'Discount %')} error={errors.pricing_discount_pct}>
                <input aria-label="Discount %" type="number" step="any" value={values.pricing_discount_pct} onChange={(e) => onChange({ pricing_discount_pct: e.target.value })} style={inp} />
              </Box>
            )}
            {!hidden('pricing_final') && (
              <Box label={L('pricing_final', 'Final price (INR)')}>
                <input aria-label="Final price" data-testid="pricing-final" readOnly value={final === null ? '' : String(final)} placeholder="Quoted less discount" title="Computed: quoted price less the discount" style={{ ...inp, opacity: 0.85 }} />
              </Box>
            )}
            {!hidden('pricing_valid_till') && (
              <Box label={L('pricing_valid_till', 'Valid till')}>
                <input aria-label="Valid till" type="date" value={values.pricing_valid_till} onChange={(e) => onChange({ pricing_valid_till: e.target.value })} style={inp} />
              </Box>
            )}
          </div>
        );
      case 'product_trial':
        return (
          <div style={grid}>
            {!hidden('trial_required') && (
              <Box label={L('trial_required', 'Trial needed?')}>
                <select aria-label="Trial needed" value={values.trial_required ? 'yes' : 'no'} onChange={(e) => onChange({ trial_required: e.target.value === 'yes' })} style={inp}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Box>
            )}
            {values.trial_required && (
              <>
                {!hidden('trial_start') && (
                  <Box label={L('trial_start', 'Trial start')}>
                    <input aria-label="Trial start" type="date" value={values.trial_start} onChange={(e) => onChange({ trial_start: e.target.value })} style={inp} />
                  </Box>
                )}
                {!hidden('trial_end') && (
                  <Box label={L('trial_end', 'Trial end')} error={errors.trial_end}>
                    <input aria-label="Trial end" type="date" value={values.trial_end} onChange={(e) => onChange({ trial_end: e.target.value })} style={inp} />
                  </Box>
                )}
                {!hidden('trial_result') && (
                  <Box label={L('trial_result', 'Trial result')}>
                    <select aria-label="Trial result" value={values.trial_result} onChange={(e) => onChange({ trial_result: e.target.value as TrialResult })} style={inp}>
                      <option value="">—</option>
                      {Object.entries(TRIAL_RESULT_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </Box>
                )}
                {!hidden('trial_notes') && (
                  <Box label={L('trial_notes', 'Trial notes')} wide>
                    <textarea aria-label="Trial notes" rows={3} value={values.trial_notes} onChange={(e) => onChange({ trial_notes: e.target.value })} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} />
                  </Box>
                )}
              </>
            )}
          </div>
        );
      case 'approvals':
        return (
          <div style={grid}>
            {PEOPLE.filter((p) => !hidden(p.key)).map((p) => (
              <Box key={p.key} label={L(p.key, p.label)}>
                <UserSearchSelect ariaLabel={p.label} options={users} value={values[p.key]} onChange={(id) => onChange({ [p.key]: id })} placeholder="Select a person…" emptyLabel="None" />
              </Box>
            ))}
          </div>
        );
    }
  };

  return (
    <div data-testid="deal-sections" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {enabledDealSections(sections).map((s) => (
        <section key={s.key} data-testid={`deal-section-${s.key}`} aria-label={s.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--s2)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>{s.label}</div>
          {body(s)}
        </section>
      ))}
    </div>
  );
}

// ── Read-only (deal detail) ───────────────────────────────────────────────

const dash = '—';
const fmtDay = (v: unknown): string => {
  if (typeof v !== 'string' || !v) return dash;
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const money = (v: unknown): string => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? dash : formatINR(Number(v)));
const txt = (v: unknown): string => (v === null || v === undefined || v === '' ? dash : String(v));

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

/** Read-only display of the enabled Spark sections on the deal detail page (people shown by their *_name). */
export function DealSectionsView({ deal, sections, fields }: {
  deal: Record<string, unknown>;
  sections: ResolvedDealSection[];
  fields?: Pick<FieldHelpers, 'isHidden' | 'labelFor'>;
}) {
  const hidden = (k: string) => !!fields?.isHidden(k);
  const L = (k: string, d: string) => (fields ? fields.labelFor(k, d) : d);
  const rows = (s: ResolvedDealSection): Array<[string, string, string]> => {
    switch (s.key) {
      case 'quotation': return [['quotation_no', 'Quotation no.', txt(deal.quotation_no)]];
      case 'pricing': {
        const disc = deal.pricing_discount_pct;
        return [
          ['pricing_quoted', 'Quoted price', money(deal.pricing_quoted)],
          ['pricing_discount_pct', 'Discount %', disc === null || disc === undefined || disc === '' ? dash : `${Number(disc)}%`],
          ['pricing_final', 'Final price', money(deal.pricing_final)],
          ['pricing_valid_till', 'Valid till', fmtDay(deal.pricing_valid_till)],
        ];
      }
      case 'product_trial': {
        const on = deal.trial_required === true;
        const base: Array<[string, string, string]> = [['trial_required', 'Trial needed', on ? 'Yes' : 'No']];
        if (!on) return base;
        const r = typeof deal.trial_result === 'string' ? deal.trial_result : '';
        return [
          ...base,
          ['trial_start', 'Trial start', fmtDay(deal.trial_start)],
          ['trial_end', 'Trial end', fmtDay(deal.trial_end)],
          ['trial_result', 'Trial result', r ? (TRIAL_RESULT_LABEL[r] || r) : dash],
          ['trial_notes', 'Trial notes', txt(deal.trial_notes)],
        ];
      }
      case 'approvals': return [
        ['technical_approval_by', 'Technical approval given by', txt(deal.technical_approval_by_name)],
        ['prepared_by', 'Prepared by', txt(deal.prepared_by_name)],
        ['checked_by', 'Checked by', txt(deal.checked_by_name)],
        ['supervisor_id', 'Supervisor name', txt(deal.supervisor_id_name)],
      ];
    }
  };
  const shown = enabledDealSections(sections)
    .map((s) => ({ s, r: rows(s).filter(([k]) => !hidden(k)) }))
    .filter(({ r }) => r.length > 0);
  if (shown.length === 0) return null;
  return (
    <div data-testid="deal-sections-view" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {shown.map(({ s, r }) => (
        <div key={s.key} data-testid={`deal-section-view-${s.key}`} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{s.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {r.map(([k, label, value]) => <ReadRow key={k} label={L(k, label)} value={value} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
