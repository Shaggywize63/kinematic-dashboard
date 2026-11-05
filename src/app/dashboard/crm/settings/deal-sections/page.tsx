'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { crmSettings } from '../../../../../lib/crmApi';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { usePageTitle } from '../../../../../lib/pageTitle';
import {
  buildDealSectionsConfig, DEAL_SECTION_HINT, emptyDealSectionValues, extractDealSections, MAX_SECTION_LABEL,
  moveDealSection, resolveDealSections, type DealSectionKey, type ResolvedDealSection,
} from '../../../../../lib/sparkDealSections';
import DealSections from '../../../../../components/crm/spark/DealSections';
import { Button, Card, EmptyState, Eyebrow, Input, PageHeader, T } from '../../../../../components/ui';
import { apiErrorText } from '../../../../../lib/sparkAccounts';

// Settings -> Deal sections (Spark & Ray): choose which of the four deal sections show on the deal create / edit /
// detail pages, rename them and put them in order. Saved as crm_settings.config.deal_sections; the deal forms
// read it, so a disabled section is hidden there and its fields are not sent.

const same = (a: ResolvedDealSection[], b: ResolvedDealSection[]) => JSON.stringify(buildDealSectionsConfig(a)) === JSON.stringify(buildDealSectionsConfig(b));

export default function DealSectionsSettingsPage() {
  usePageTitle('Deal sections');
  // Read after mount: the gate looks at localStorage.
  const [spark, setSpark] = useState<boolean | null>(null);
  useEffect(() => { setSpark(isB2bClientActive()); }, []);
  const [list, setList] = useState<ResolvedDealSection[]>(() => resolveDealSections(undefined));
  const [saved, setSaved] = useState<ResolvedDealSection[]>(() => resolveDealSections(undefined));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!spark) { setLoading(false); return; }
    let off = false;
    crmSettings.get()
      .then((s) => { if (off) return; const r = resolveDealSections(extractDealSections(s?.data)); setList(r); setSaved(r); })
      .catch((e) => { if (!off) toast.error(apiErrorText(e, 'Failed to load deal sections')); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [spark]);

  const dirty = !same(list, saved);
  const patch = (key: DealSectionKey, p: Partial<ResolvedDealSection>) => setList((l) => l.map((s) => (s.key === key ? { ...s, ...p } : s)));
  // A blank label means "use the default name" (what the forms show and what is stored).
  const previewList = useMemo(() => list.map((s) => ({ ...s, label: s.label.trim() || s.defaultLabel })), [list]);
  const previewValues = useMemo(() => emptyDealSectionValues(), []);

  const save = async () => {
    setSaving(true);
    try {
      // The settings config is shallow-merged, so the whole deal_sections object is sent.
      await crmSettings.update({ config: { deal_sections: buildDealSectionsConfig(list) } });
      setSaved(list);
      toast.success('Deal sections saved');
    } catch (e) {
      toast.error(apiErrorText(e, 'Save failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      <PageHeader
        eyebrow={<Link href="/dashboard/crm/settings" style={{ color: 'inherit', textDecoration: 'none' }}>Settings</Link>}
        title="Deal sections"
        description="Choose which sections appear on deals, rename them and set their order. A disabled section is hidden on the deal form and detail, and its fields are not saved."
        actions={<Button variant="primary" onClick={save} disabled={!spark || !dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>}
      />

      {spark === false && (
        <Card>
          <EmptyState
            title="Deal sections apply to Spark & Ray"
            description="Switch the client picker to Spark & Ray to configure its deal sections. Other clients keep the standard deal form."
          />
        </Card>
      )}

      {spark && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
          <Card>
            <Eyebrow>Sections</Eyebrow>
            <ol data-testid="deal-section-list" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((s, i) => (
                <li key={s.key} data-testid={`deal-section-row-${s.key}`} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, opacity: s.enabled ? 1 : 0.65 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute, minWidth: 18 }}>{i + 1}</span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.text, cursor: 'pointer' }}>
                      <input type="checkbox" role="switch" aria-label={`Enable ${s.defaultLabel}`} checked={s.enabled} onChange={(e) => patch(s.key, { enabled: e.target.checked })} />
                      {s.enabled ? 'Shown' : 'Hidden'}
                    </label>
                    <span style={{ flex: 1 }} />
                    <Button size="sm" aria-label={`Move ${s.defaultLabel} up`} disabled={i === 0} onClick={() => setList((l) => moveDealSection(l, s.key, -1))} icon={<ArrowUp size={14} strokeWidth={1.8} />} />
                    <Button size="sm" aria-label={`Move ${s.defaultLabel} down`} disabled={i === list.length - 1} onClick={() => setList((l) => moveDealSection(l, s.key, 1))} icon={<ArrowDown size={14} strokeWidth={1.8} />} />
                  </div>
                  <Input aria-label={`Label for ${s.defaultLabel}`} value={s.label} maxLength={MAX_SECTION_LABEL} onChange={(e) => patch(s.key, { label: e.target.value })} placeholder={s.defaultLabel} />
                  <div style={{ fontSize: 12, color: T.mute }}>{DEAL_SECTION_HINT[s.key]}{s.label.trim() && s.label.trim() !== s.defaultLabel ? ` Default name: ${s.defaultLabel}.` : ' Leave the name blank to use the default.'}</div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <Eyebrow>Live preview</Eyebrow>
            <div style={{ fontSize: 12, color: T.mute, margin: '6px 0 12px' }}>How the deal form lays these out (inputs are disabled here).</div>
            {loading ? <div style={{ color: T.dim, fontSize: 13 }}>Loading…</div> : (
              <div data-testid="deal-sections-preview">
                <fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                  {list.some((s) => s.enabled)
                    ? <DealSections sections={previewList} values={{ ...previewValues, trial_required: true }} onChange={() => undefined} users={[]} />
                    : <div style={{ color: T.dim, fontSize: 13 }}>Every section is hidden — the deal form shows none of them.</div>}
                </fieldset>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
