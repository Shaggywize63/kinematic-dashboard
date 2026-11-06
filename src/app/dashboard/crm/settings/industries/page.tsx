'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { usePageTitle } from '../../../../../lib/pageTitle';
import {
  HEX_COLOR, INDUSTRY_UNKNOWN_COLOR, MAX_INDUSTRY_NAME, MAX_SUB_INDUSTRY_NAME, buildIndustriesConfig, defaultIndustries,
  extractIndustries, invalidateIndustries, moveIndustry, resolveIndustries, validateIndustries, type IndustryDef,
} from '../../../../../lib/industries';
import { Badge, Button, Card, EmptyState, Eyebrow, Input, PageHeader, T } from '../../../../../components/ui';
import { apiErrorText } from '../../../../../lib/sparkAccounts';

// Settings -> Industries (Spark & Ray): the list of industries every dropdown, badge and map pin uses — name, colour
// and optional sub-industries — in display order. Saved whole as crm_settings.config.industries (the settings config
// is shallow-merged, so the full list is sent); "Reset to defaults" saves null so the built-in seven apply again.

interface Row { id: string; name: string; color: string; subs: string[]; draft: string }

// A starting palette for newly added industries (cycled), distinct from the built-in seven.
const NEW_COLORS = ['#DB2777', '#0D9488', '#9333EA', '#EA580C', '#4F46E5', '#65A30D', '#CA8A04', '#0284C7'];

let uid = 0;
const toRows = (list: readonly IndustryDef[]): Row[] => list.map((d) => ({ id: `ind-${++uid}`, name: d.name, color: d.color, subs: [...d.sub_industries], draft: '' }));
const toDefs = (rows: readonly Row[]): IndustryDef[] => rows.map((r) => ({ name: r.name, color: r.color, sub_industries: r.subs }));
const snapshot = (rows: readonly Row[]) => JSON.stringify(buildIndustriesConfig(toDefs(rows)));

export default function IndustriesSettingsPage() {
  usePageTitle('Industries');
  // Read after mount: the gate looks at localStorage.
  const [spark, setSpark] = useState<boolean | null>(null);
  useEffect(() => { setSpark(isB2bClientActive()); }, []);
  const [rows, setRows] = useState<Row[]>(() => toRows(defaultIndustries()));
  const [savedSnap, setSavedSnap] = useState<string>(() => snapshot(toRows(defaultIndustries())));
  // Whether the org has its own list stored (drives the "Using built-in defaults" note + the Reset button).
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!spark) { setLoading(false); return; }
    let off = false;
    crmSettings.get()
      .then((s) => {
        if (off) return;
        const stored = extractIndustries(s?.data);
        const r = toRows(resolveIndustries(s?.data));
        setRows(r); setSavedSnap(snapshot(r)); setCustom(Array.isArray(stored) && stored.length > 0);
      })
      .catch((e) => { if (!off) toast.error(apiErrorText(e, 'Failed to load industries')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [spark]);

  useEffect(() => { if (focusId) { nameRefs.current[focusId]?.focus(); setFocusId(null); } }, [focusId, rows]);

  // A half-typed sub-industry counts as a change (Save commits it).
  const dirty = snapshot(rows) !== savedSnap || rows.some((r) => r.draft.trim() !== '');
  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const patch = (id: string, p: Partial<Row>) => { setRows((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r))); setErrors([]); };
  const nameDup = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => { const k = r.name.trim().toLowerCase(); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); });
    return (r: Row) => (seen.get(r.name.trim().toLowerCase()) ?? 0) > 1;
  }, [rows]);

  const addSub = (id: string) => {
    const row = rows.find((r) => r.id === id);
    const v = row?.draft.trim();
    if (!row || !v) return;
    if (row.subs.some((s) => s.toLowerCase() === v.toLowerCase())) { toast.error(`"${v}" is already a sub-industry of ${row.name.trim() || 'this industry'}`); patch(id, { draft: '' }); return; }
    patch(id, { subs: [...row.subs, v], draft: '' });
  };

  const addIndustry = () => {
    const id = `ind-${++uid}`;
    setRows((l) => [...l, { id, name: '', color: NEW_COLORS[l.length % NEW_COLORS.length], subs: [], draft: '' }]);
    setErrors([]); setFocusId(id);
  };

  const remove = (r: Row) => {
    if (!window.confirm(`Delete the industry “${r.name.trim() || 'untitled'}”? Leads already using it keep the value but show in grey.`)) return;
    setRows((l) => l.filter((x) => x.id !== r.id)); setErrors([]);
  };

  const save = async () => {
    // Commit any half-typed sub-industry first so it is never silently lost.
    const withDrafts = rows.map((r) => {
      const v = r.draft.trim();
      return v && !r.subs.some((s) => s.toLowerCase() === v.toLowerCase()) ? { ...r, subs: [...r.subs, v], draft: '' } : { ...r, draft: '' };
    });
    const errs = validateIndustries(toDefs(withDrafts));
    setErrors(errs);
    if (errs.length > 0) { toast.error(errs[0]); return; }
    setSaving(true);
    try {
      // The settings config is shallow-merged, so the whole industries list is sent (other config keys are untouched).
      await crmSettings.update({ config: { industries: buildIndustriesConfig(toDefs(withDrafts)) } });
      invalidateIndustries();
      setRows(withDrafts); setSavedSnap(snapshot(withDrafts)); setCustom(true);
      toast.success('Industries saved');
    } catch (e) {
      toast.error(apiErrorText(e, 'Save failed'));
    } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm('Reset to the default industries? Your custom list, colours and sub-industries will be removed.')) return;
    setSaving(true);
    try {
      await crmSettings.update({ config: { industries: null } });
      invalidateIndustries();
      const r = toRows(defaultIndustries());
      setRows(r); setSavedSnap(snapshot(r)); setCustom(false); setErrors([]);
      toast.success('Industries reset to defaults');
    } catch (e) {
      toast.error(apiErrorText(e, 'Reset failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <PageHeader
        eyebrow={<Link href="/dashboard/crm/settings" style={{ color: 'inherit', textDecoration: 'none' }}>Settings</Link>}
        title="Industries"
        description="The industries a lead can be filed under. Each has a colour (used on badges and map pins) and optional sub-industries. The order here is the order in every dropdown and on the map legend."
        actions={(
          <>
            {dirty && <Badge tone="warn" dot><span data-testid="industries-unsaved">Unsaved changes</span></Badge>}
            <Button onClick={reset} disabled={!spark || saving || (!custom && !dirty)} icon={<RotateCcw size={14} strokeWidth={1.8} />}>Reset to defaults</Button>
            <Button variant="primary" onClick={save} disabled={!spark || !dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        )}
        compact
      />

      {spark === false && (
        <Card>
          <EmptyState
            title="Industries apply to Spark & Ray"
            description="Switch the client picker to Spark & Ray to manage its industries. Other clients keep their current Industry field."
          />
        </Card>
      )}

      {spark && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Eyebrow>Industries</Eyebrow>
            {!loading && !custom && <span data-testid="industries-defaults-note" style={{ fontSize: 12, color: T.mute }}>Using the built-in industries — edit and save to customise.</span>}
          </div>

          {errors.length > 0 && (
            <ul data-testid="industries-errors" role="alert" style={{ margin: '12px 0 0', padding: '10px 14px 10px 28px', borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {loading ? <div style={{ color: T.dim, fontSize: 13, marginTop: 12 }}>Loading…</div> : (
            <ol data-testid="industry-list" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((r, i) => {
                const validColor = HEX_COLOR.test(r.color.trim());
                const label = r.name.trim() || `industry ${i + 1}`;
                const dup = nameDup(r);
                return (
                  <li key={r.id} data-testid="industry-row" data-name={r.name} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute, minWidth: 18 }}>{i + 1}</span>
                      <span aria-hidden data-testid="industry-swatch" data-color={validColor ? r.color.trim().toUpperCase() : INDUSTRY_UNKNOWN_COLOR} style={{ width: 20, height: 20, borderRadius: '50%', background: validColor ? r.color.trim() : INDUSTRY_UNKNOWN_COLOR, border: `1px solid ${T.border}`, flexShrink: 0 }} />
                      <Input
                        ref={(el) => { nameRefs.current[r.id] = el; }}
                        aria-label={`Name of industry ${i + 1}`}
                        data-testid="industry-name"
                        value={r.name}
                        maxLength={MAX_INDUSTRY_NAME}
                        invalid={!r.name.trim() || dup}
                        placeholder="Industry name"
                        onChange={(e) => patch(r.id, { name: e.target.value })}
                        style={{ flex: '1 1 200px', minWidth: 160, width: 'auto' }}
                      />
                      <input
                        type="color"
                        aria-label={`Colour of ${label}`}
                        data-testid="industry-color-picker"
                        value={validColor ? r.color.trim().toLowerCase() : '#6b7280'}
                        onChange={(e) => patch(r.id, { color: e.target.value.toUpperCase() })}
                        style={{ width: 36, height: 36, padding: 2, border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                      />
                      <Input
                        aria-label={`Hex colour of ${label}`}
                        data-testid="industry-color-hex"
                        value={r.color}
                        maxLength={7}
                        invalid={!validColor}
                        placeholder="#RRGGBB"
                        spellCheck={false}
                        onChange={(e) => patch(r.id, { color: e.target.value.startsWith('#') || e.target.value === '' ? e.target.value : `#${e.target.value}` })}
                        style={{ width: 104, fontFamily: T.mono }}
                      />
                      <Button size="sm" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => { setRows((l) => moveIndustry(l, i, -1)); setErrors([]); }} icon={<ArrowUp size={14} strokeWidth={1.8} />} />
                      <Button size="sm" aria-label={`Move ${label} down`} disabled={i === rows.length - 1} onClick={() => { setRows((l) => moveIndustry(l, i, 1)); setErrors([]); }} icon={<ArrowDown size={14} strokeWidth={1.8} />} />
                      <Button size="sm" variant="danger" aria-label={`Delete ${label}`} onClick={() => remove(r)} icon={<Trash2 size={14} strokeWidth={1.8} />} />
                    </div>
                    {(!validColor || dup || !r.name.trim()) && (
                      <div role="alert" style={{ fontSize: 12, color: T.red }}>
                        {!r.name.trim() ? 'Name is required. ' : ''}{dup ? 'Another industry already has this name. ' : ''}{!validColor ? 'Colour must be a #RRGGBB hex value.' : ''}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: T.mute, marginRight: 4 }}>Sub-industries</span>
                      {r.subs.map((s) => (
                        <span key={s} data-testid="sub-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 10px', borderRadius: 999, fontSize: 12.5, background: 'var(--s3)', border: `1px solid ${T.border}`, color: T.text }}>
                          {s}
                          <button type="button" aria-label={`Remove sub-industry ${s}`} onClick={() => patch(r.id, { subs: r.subs.filter((x) => x !== s) })} style={{ border: 0, background: 'transparent', color: T.mute, cursor: 'pointer', display: 'inline-flex', padding: 2 }}>
                            <X size={13} strokeWidth={2} />
                          </button>
                        </span>
                      ))}
                      <input
                        className="km-input"
                        aria-label={`Add sub-industry to ${label}`}
                        data-testid="sub-input"
                        value={r.draft}
                        maxLength={MAX_SUB_INDUSTRY_NAME}
                        placeholder={r.subs.length ? 'Add another…' : 'Type a sub-industry, press Enter'}
                        onChange={(e) => patch(r.id, { draft: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(r.id); } else if (e.key === 'Backspace' && !r.draft && r.subs.length) patch(r.id, { subs: r.subs.slice(0, -1) }); }}
                        style={{ flex: '1 1 180px', minWidth: 150, height: 30, border: `1px dashed ${T.border}`, background: 'transparent', borderRadius: 999, padding: '0 12px', fontSize: 12.5, color: T.text, outline: 'none' }}
                      />
                    </div>
                    {r.subs.length === 0 && <div style={{ fontSize: 12, color: T.mute }}>No sub-industries: the lead&apos;s Sub-industry stays a free-text field for this industry.</div>}
                  </li>
                );
              })}
            </ol>
          )}

          {!loading && (
            <div style={{ marginTop: 12 }}>
              <Button onClick={addIndustry} icon={<Plus size={14} strokeWidth={1.8} />}>Add industry</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
