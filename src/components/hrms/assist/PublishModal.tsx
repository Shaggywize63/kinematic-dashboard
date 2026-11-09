'use client';
// Publish a new version of a policy: what changed, when it starts, whether people must acknowledge it, and the new text.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Modal, Note, T } from '../ui';
import { Field, Input } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { audienceOf, currentVersion, lineDiff, nextVersionLabel, validatePublish, type PublishDraft } from '../../../lib/hrms/assist/policies';
import { publishPolicy } from '../../../lib/hrms/assist/store';
import type { Policy } from '../../../lib/hrms/assist/types';
import { DiffLines, DiffStatsBadges } from './DiffView';
import { textAreaStyle } from './shared';

export default function PublishModal({ db, policy, onClose, onPublished }: { db: HrmsDb; policy: Policy; onClose: () => void; onPublished: (version: string) => void }) {
  const cur = currentVersion(policy);
  const [d, setD] = useState<PublishDraft>({ changeSummary: '', effectiveFrom: PREVIEW_TODAY, requiresAck: true, text: cur.text, bump: 'minor' });
  const [touched, setTouched] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const errors = validatePublish(policy, d, PREVIEW_TODAY);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof PublishDraft>(k: K, v: PublishDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const audience = audienceOf(db, policy).length;
  const lines = useMemo(() => lineDiff(cur.text, d.text), [cur.text, d.text]);
  const label = nextVersionLabel(policy, d.bump);

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const r = publishPolicy(policy.id, d, db);
    toast.success(d.requiresAck ? `Published v${r.version}. ${r.reset} ${r.reset === 1 ? 'person has' : 'people have'} to acknowledge it again.` : `Published v${r.version}. No acknowledgement needed.`);
    onPublished(r.version);
    onClose();
  };

  return (
    <Modal title={`Publish a new version of ${policy.title}`} onClose={onClose} width={720}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} data-testid="publish-confirm">Publish v{label}</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim }}>Current version is v{cur.version}. Older versions stay on record and can be compared.</div>
      <Field label="What changed" required htmlFor="pub-summary" error={show('changeSummary')} hint="One or two plain sentences. People see this when they are asked to acknowledge.">
        <textarea id="pub-summary" data-testid="pub-summary" rows={2} value={d.changeSummary} onChange={(e) => set('changeSummary', e.target.value)} aria-invalid={!!show('changeSummary')} style={textAreaStyle} />
      </Field>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
        <Field label="Effective from" required htmlFor="pub-date" error={show('effectiveFrom')}>
          <Input id="pub-date" type="date" min={PREVIEW_TODAY} value={d.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} invalid={!!show('effectiveFrom')} />
        </Field>
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6, padding: 0 }}>Size of the change</legend>
          {([['minor', `Small edit (v${nextVersionLabel(policy, 'minor')})`], ['major', `Big change (v${nextVersionLabel(policy, 'major')})`]] as const).map(([v, l]) => (
            <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: T.text, cursor: 'pointer' }}>
              <input type="radio" name="bump" checked={d.bump === v} onChange={() => set('bump', v)} style={{ width: 16, height: 16 }} /> {l}
            </label>
          ))}
        </fieldset>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: T.text, cursor: 'pointer' }}>
        <input type="checkbox" data-testid="pub-ack" checked={d.requiresAck} onChange={(e) => set('requiresAck', e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span>People must acknowledge this version<br /><span style={{ fontSize: 12.5, color: T.dim }}>{d.requiresAck ? `Acknowledgements reset for ${audience} ${audience === 1 ? 'person' : 'people'} this policy applies to.` : 'Earlier acknowledgements stay as they are.'}</span></span>
      </label>
      <Field label="Policy text" required htmlFor="pub-text" error={show('text')}>
        <textarea id="pub-text" data-testid="pub-text" rows={11} value={d.text} onChange={(e) => set('text', e.target.value)} aria-invalid={!!show('text')} style={{ ...textAreaStyle, fontSize: 13.5 }} />
      </Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DiffStatsBadges lines={lines} />
          <Button size="sm" onClick={() => setShowDiff((x) => !x)} aria-expanded={showDiff}>{showDiff ? 'Hide the changes' : 'Show the changes'}</Button>
        </div>
        {showDiff && <DiffLines lines={lines} changesOnly testid="publish-diff" />}
      </div>
      <Note>Check legal references and any numbers with your advisor before you publish. This preview does not give legal advice.</Note>
    </Modal>
  );
}
