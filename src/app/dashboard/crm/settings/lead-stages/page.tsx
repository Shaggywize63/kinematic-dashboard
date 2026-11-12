'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { usePageTitle } from '../../../../../lib/pageTitle';
import { apiErrorText } from '../../../../../lib/sparkAccounts';
import {
  BUILTIN_STAGES, MAX_STAGE_LABEL, STAGE_COLOR_RE, STAGE_FALLBACK_COLOR, STAGE_KIND_LABEL, STAGE_VALUE_RE, appendCombined, buildStatusesConfig,
  moveStage, resolveStages, slugifyStage, stagesSnapshot, validateStages, type StageDef, type StageKind,
} from '../../../../../lib/leadStages';
import LeadNumbersPanel from '../../../../../components/crm/spark/LeadNumbersPanel';
import { Badge, Button, Card, EmptyState, Eyebrow, Input, PageHeader, Select, T } from '../../../../../components/ui';

// Settings -> Lead Stages (connected-B2B / Spark & Ray): the stages a lead moves through (crm_settings.config.lead_statuses),
// the one-click "combined" Spark list, and the panel that numbers the leads that predate lead numbers. Every lead screen
// already reads this list (leads table, filter, detail, edit modal), so a stage added here shows up there with its name and colour.
// The existing stage editor did not exist elsewhere, so this page is where the list is edited.

interface Row extends StageDef { id: string }
let uid = 0;
const toRows = (list: readonly StageDef[]): Row[] => list.map((s) => ({ ...s, id: `stage-${++uid}` }));
const strip = (rows: readonly Row[]): StageDef[] => rows.map(({ value, label, color, kind }) => ({ value, label, color, kind }));

const KINDS: StageKind[] = ['open', 'won', 'lost', 'closed'];
const KIND_HINT: Record<StageKind, string> = {
  open: 'Still being worked',
  won: 'Counts as a win',
  lost: 'Counts as lost / dropped',
  closed: 'Deal finished, neither won nor lost',
};
const NEW_COLORS = ['#DB2777', '#0D9488', '#9333EA', '#EA580C', '#4F46E5', '#65A30D', '#CA8A04', '#0284C7'];

export default function LeadStagesSettingsPage() {
  usePageTitle('Lead stages');
  // Read after mount: the gate looks at localStorage.
  const [spark, setSpark] = useState<boolean | null>(null);
  useEffect(() => { setSpark(isB2bClientActive()); }, []);

  const [rows, setRows] = useState<Row[]>(() => toRows(BUILTIN_STAGES));
  const [savedSnap, setSavedSnap] = useState<string>(() => stagesSnapshot(BUILTIN_STAGES));
  // Whether the client has its own saved list (else the rows shown are the built-in stages every screen falls back to).
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // "Add a stage" form.
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newValueTouched, setNewValueTouched] = useState(false);
  const [newKind, setNewKind] = useState<StageKind>('open');
  const [addError, setAddError] = useState<string | null>(null);
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!spark) { setLoading(false); return; }
    let off = false;
    crmSettings.get()
      .then((s) => {
        if (off) return;
        const r = resolveStages(s?.data);
        const rr = toRows(r.stages);
        setRows(rr); setSavedSnap(stagesSnapshot(strip(rr))); setCustom(r.custom);
      })
      .catch((e) => { if (!off) toast.error(apiErrorText(e, 'Failed to load lead stages')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [spark]);

  const dirty = stagesSnapshot(strip(rows)) !== savedSnap;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const touch = () => { setErrors([]); setSaveError(null); setNote(null); };
  const patch = (id: string, p: Partial<StageDef>) => { setRows((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r))); touch(); };

  // Live per-row problems (shown under the row as the admin types; Save re-checks everything).
  const rowProblems = useMemo(() => {
    const keyCount = new Map<string, number>();
    const labelCount = new Map<string, number>();
    rows.forEach((r) => {
      keyCount.set(r.value, (keyCount.get(r.value) ?? 0) + 1);
      const k = r.label.trim().toLowerCase();
      if (k) labelCount.set(k, (labelCount.get(k) ?? 0) + 1);
    });
    return (r: Row): string[] => {
      const p: string[] = [];
      if (!r.label.trim()) p.push('Name is required.');
      else if ((labelCount.get(r.label.trim().toLowerCase()) ?? 0) > 1) p.push('Another stage has this name.');
      if (!STAGE_VALUE_RE.test(r.value)) p.push('Key must be lowercase letters, digits and underscores, starting with a letter.');
      else if ((keyCount.get(r.value) ?? 0) > 1) p.push('Another stage has this key.');
      if (!STAGE_COLOR_RE.test(r.color.trim())) p.push('Colour must be a #RRGGBB value.');
      return p;
    };
  }, [rows]);

  const addCombined = () => {
    const { added } = appendCombined(strip(rows));
    if (added.length === 0) { setNote('All the combined stages are already in your list. Nothing was added.'); return; }
    // Existing rows keep their identity (and place); the new ones go on the end.
    setRows((cur) => [...cur, ...toRows(added)]);
    setNote(`Added ${added.length} stage${added.length === 1 ? '' : 's'}: ${added.map((a) => a.label).join(', ')}. Save to keep them.`);
    setErrors([]); setSaveError(null);
  };

  const addOne = () => {
    const label = newLabel.trim();
    const value = (newValueTouched ? newValue : slugifyStage(label)).trim();
    if (!label) { setAddError('Give the stage a name.'); return; }
    if (!STAGE_VALUE_RE.test(value)) { setAddError('The key must be lowercase letters, digits and underscores, starting with a letter (like cold_call).'); return; }
    if (rows.some((r) => r.value === value)) { setAddError(`There is already a stage with the key "${value}".`); return; }
    if (rows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) { setAddError(`There is already a stage called "${label}".`); return; }
    const id = `stage-${++uid}`;
    setRows((l) => [...l, { id, value, label, color: NEW_COLORS[l.length % NEW_COLORS.length], kind: newKind }]);
    setNewLabel(''); setNewValue(''); setNewValueTouched(false); setNewKind('open'); setAddError(null); touch();
  };

  const save = async () => {
    const list = strip(rows);
    const errs = validateStages(list);
    setErrors(errs);
    if (errs.length > 0) { toast.error(errs[0]); return; }
    setSaving(true); setSaveError(null);
    try {
      // The settings config is shallow-merged, so only the lead_statuses list is sent (other config keys are untouched).
      await crmSettings.update({ config: { lead_statuses: buildStatusesConfig(list) } });
      setSavedSnap(stagesSnapshot(list)); setCustom(true); setNote(null);
      toast.success('Lead stages saved');
    } catch (e) {
      const msg = apiErrorText(e, 'Save failed');
      setSaveError(msg); toast.error(msg);
    } finally { setSaving(false); }
  };

  const discard = () => {
    if (!window.confirm('Discard your unsaved changes to the lead stages?')) return;
    crmSettings.get()
      .then((s) => { const r = resolveStages(s?.data); const rr = toRows(r.stages); setRows(rr); setSavedSnap(stagesSnapshot(strip(rr))); setCustom(r.custom); touch(); })
      .catch((e) => toast.error(apiErrorText(e, 'Could not reload')));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <PageHeader
        eyebrow={<Link href="/dashboard/crm/settings" style={{ color: 'inherit', textDecoration: 'none' }}>Settings</Link>}
        title="Lead stages"
        description="The stages a lead moves through, in order. Every lead screen (the list, filters, the lead page and the edit form) uses this list, with the names and colours set here."
        actions={(
          <>
            {dirty && <Badge tone="warn" dot><span data-testid="stages-unsaved">Unsaved changes</span></Badge>}
            <Button onClick={discard} disabled={!spark || !dirty || saving} icon={<RotateCcw size={14} strokeWidth={1.8} />}>Discard changes</Button>
            <Button variant="primary" onClick={save} disabled={!spark || !dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        )}
        compact
      />

      {spark === false && (
        <Card>
          <EmptyState
            title="Lead stages and numbers apply to Spark & Ray"
            description="Switch the client picker to Spark & Ray to manage its lead stages. Other clients keep their current stages."
          />
        </Card>
      )}

      {spark && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} strokeWidth={1.8} aria-hidden style={{ color: T.dim }} />
              <Eyebrow>Stages</Eyebrow>
            </div>
            {!loading && !custom && <span data-testid="stages-defaults-note" style={{ fontSize: 12, color: T.mute }}>No stages saved yet: these are the built-in stages. Save to keep them as your own list.</span>}
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <p data-testid="stages-combined-hint" style={{ margin: 0, fontSize: 13, color: T.dim, lineHeight: 1.5, maxWidth: 560 }}>
              Your existing stages are kept, so no lead loses its stage. Any stage from the combined list that is missing is added at the end, and you can remove the ones you do not use afterwards.
            </p>
            <Button onClick={addCombined} disabled={loading || saving} icon={<Plus size={14} strokeWidth={1.8} />}>Add the combined stage list</Button>
          </div>

          {note && <div role="status" data-testid="stages-note" style={{ marginTop: 10, fontSize: 12.5, color: T.dim }}>{note}</div>}

          {errors.length > 0 && (
            <ul data-testid="stages-errors" role="alert" style={{ margin: '12px 0 0', padding: '10px 14px 10px 28px', borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {saveError && (
            <div data-testid="stages-save-error" role="alert" style={{ margin: '12px 0 0', padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 12.5 }}>{saveError}</div>
          )}

          {loading ? <div style={{ color: T.dim, fontSize: 13, marginTop: 12 }}>Loading…</div> : (
            <ol data-testid="stage-list" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r, i) => {
                const validColor = STAGE_COLOR_RE.test(r.color.trim());
                const name = r.label.trim() || `stage ${i + 1}`;
                const problems = rowProblems(r);
                return (
                  <li key={r.id} data-testid="stage-row" data-value={r.value} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute, minWidth: 18 }}>{i + 1}</span>
                      <span aria-hidden data-testid="stage-swatch" data-color={validColor ? r.color.trim().toUpperCase() : STAGE_FALLBACK_COLOR} style={{ width: 16, height: 16, borderRadius: '50%', background: validColor ? r.color.trim() : STAGE_FALLBACK_COLOR, border: `1px solid ${T.border}`, flexShrink: 0 }} />
                      <Input
                        ref={(el) => { labelRefs.current[r.id] = el; }}
                        aria-label={`Name of stage ${i + 1}`}
                        data-testid="stage-label"
                        value={r.label}
                        maxLength={MAX_STAGE_LABEL}
                        invalid={!r.label.trim()}
                        placeholder="Stage name"
                        onChange={(e) => patch(r.id, { label: e.target.value })}
                        style={{ flex: '1 1 170px', minWidth: 140, width: 'auto' }}
                      />
                      <span data-testid="stage-key" title="Key (stored on each lead; it cannot be changed)" style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, minWidth: 90 }}>{r.value}</span>
                      {r.kind !== 'open' && <Badge tone={r.kind === 'won' ? 'ok' : r.kind === 'lost' ? 'red' : 'neutral'}><span data-testid="stage-flag">{STAGE_KIND_LABEL[r.kind]}</span></Badge>}
                      <Select
                        aria-label={`Counts as for ${name}`}
                        data-testid="stage-kind"
                        value={r.kind}
                        title={KIND_HINT[r.kind]}
                        onChange={(e) => patch(r.id, { kind: e.target.value as StageKind })}
                        style={{ width: 110 }}
                      >
                        {KINDS.map((k) => <option key={k} value={k}>{STAGE_KIND_LABEL[k]}</option>)}
                      </Select>
                      <input
                        type="color"
                        aria-label={`Colour of ${name}`}
                        data-testid="stage-color-picker"
                        value={validColor ? r.color.trim().toLowerCase() : '#6b7280'}
                        onChange={(e) => patch(r.id, { color: e.target.value.toUpperCase() })}
                        style={{ width: 34, height: 34, padding: 2, border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                      />
                      <Button size="sm" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => { setRows((l) => moveStage(l, i, -1)); touch(); }} icon={<ArrowUp size={14} strokeWidth={1.8} />} />
                      <Button size="sm" aria-label={`Move ${name} down`} disabled={i === rows.length - 1} onClick={() => { setRows((l) => moveStage(l, i, 1)); touch(); }} icon={<ArrowDown size={14} strokeWidth={1.8} />} />
                      <Button size="sm" variant="danger" aria-label={`Remove ${name}`} title="Remove from the list (leads already in it keep the key)" onClick={() => { setRows((l) => l.filter((x) => x.id !== r.id)); touch(); }} icon={<Trash2 size={14} strokeWidth={1.8} />} />
                    </div>
                    {problems.length > 0 && <div role="alert" data-testid="stage-problem" style={{ fontSize: 12, color: T.red }}>{problems.join(' ')}</div>}
                  </li>
                );
              })}
              {rows.length === 0 && <li style={{ fontSize: 13, color: T.dim }}>No stages. Add one below, or add the combined list.</li>}
            </ol>
          )}

          {!loading && (
            <div data-testid="add-stage" style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Eyebrow>Add a stage</Eyebrow>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input
                  aria-label="New stage name"
                  data-testid="new-stage-label"
                  value={newLabel}
                  maxLength={MAX_STAGE_LABEL}
                  placeholder="Stage name (e.g. Site visit)"
                  onChange={(e) => { setNewLabel(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } }}
                  style={{ flex: '1 1 200px', minWidth: 160, width: 'auto' }}
                />
                <Input
                  aria-label="New stage key"
                  data-testid="new-stage-value"
                  value={newValueTouched ? newValue : slugifyStage(newLabel)}
                  maxLength={64}
                  spellCheck={false}
                  placeholder="key"
                  onChange={(e) => { setNewValue(e.target.value.toLowerCase()); setNewValueTouched(true); setAddError(null); }}
                  style={{ width: 160, fontFamily: T.mono }}
                />
                <Select aria-label="New stage counts as" data-testid="new-stage-kind" value={newKind} onChange={(e) => setNewKind(e.target.value as StageKind)} style={{ width: 110 }}>
                  {KINDS.map((k) => <option key={k} value={k}>{STAGE_KIND_LABEL[k]}</option>)}
                </Select>
                <Button onClick={addOne} icon={<Plus size={14} strokeWidth={1.8} />}>Add stage</Button>
              </div>
              {addError && <div role="alert" data-testid="add-stage-error" style={{ fontSize: 12, color: T.red }}>{addError}</div>}
              <div style={{ fontSize: 12, color: T.mute }}>The key is what is stored on each lead, so it cannot be changed later. Rename a stage any time by editing its name.</div>
            </div>
          )}
        </Card>
      )}

      {spark && <LeadNumbersPanel />}
    </div>
  );
}
