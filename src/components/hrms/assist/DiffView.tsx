'use client';
// A line diff between two versions of a policy: added lines in green, removed lines in red, unchanged lines plain.

import { useMemo, useState } from 'react';
import { Badge, Card, CardTitle, Note, T } from '../ui';
import { fmtDate as fmtDateSafe } from '../../../lib/hrms/format';
import { Select } from '../../ui';
import { diffStats, findVersion, lineDiff, type DiffLine } from '../../../lib/hrms/assist/policies';
import type { Policy } from '../../../lib/hrms/assist/types';
import { Labelled } from './shared';

export function DiffLines({ lines, changesOnly = false, testid = 'diff-view' }: { lines: DiffLine[]; changesOnly?: boolean; testid?: string }) {
  const shown = changesOnly ? lines.filter((l) => l.type !== 'same') : lines;
  if (!shown.length) return <div style={{ fontSize: 13.5, color: T.dim, padding: 12 }}>No lines changed between these two versions.</div>;
  return (
    <div data-testid={testid} role="table" aria-label="Line by line changes" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'auto', maxHeight: 460, background: T.card }}>
      {shown.map((l, i) => (
        <div key={i} role="row" data-diff={l.type} style={{
          display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', fontSize: 13.5, lineHeight: 1.55,
          background: l.type === 'add' ? T.okWash : l.type === 'del' ? T.redWash : 'transparent',
          color: l.type === 'same' ? T.dim : T.text,
        }}>
          <span aria-hidden style={{ textAlign: 'center', fontFamily: T.mono, color: l.type === 'add' ? T.ok : l.type === 'del' ? T.red : T.mute, userSelect: 'none' }}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</span>
          <span role="cell" style={{ padding: '1px 10px 1px 2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textDecoration: l.type === 'del' ? 'line-through' : undefined, textDecorationColor: T.red, minHeight: '1.55em' }}>
            {l.type === 'add' && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Added: </span>}
            {l.type === 'del' && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Removed: </span>}
            {l.text || ' '}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DiffStatsBadges({ lines }: { lines: DiffLine[] }) {
  const s = diffStats(lines);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="ok" mono><span data-testid="diff-added">{s.added}</span>&nbsp;added</Badge>
      <Badge tone="red" mono><span data-testid="diff-removed">{s.removed}</span>&nbsp;removed</Badge>
      <Badge tone="neutral" mono>{s.unchanged} unchanged</Badge>
    </div>
  );
}

export default function DiffTab({ policies, initial }: { policies: Policy[]; initial?: { policyId: string; from: string; to: string } }) {
  const [pid, setPid] = useState(initial?.policyId ?? policies.find((p) => p.versions.length > 1)?.id ?? policies[0]!.id);
  const p = policies.find((x) => x.id === pid) ?? policies[0]!;
  const vs = p.versions;
  const [from, setFrom] = useState(initial?.from ?? vs[Math.max(0, vs.length - 2)]!.version);
  const [to, setTo] = useState(initial?.to ?? vs[vs.length - 1]!.version);
  const [changesOnly, setChangesOnly] = useState(false);
  // Keep the version pickers valid when the policy changes.
  const fv = findVersion(p, from) ?? vs[Math.max(0, vs.length - 2)]!;
  const tv = findVersion(p, to) ?? vs[vs.length - 1]!;
  const lines = useMemo(() => lineDiff(fv.text, tv.text), [fv.text, tv.text]);

  const pick = (id: string) => {
    const np = policies.find((x) => x.id === id)!;
    setPid(id); setFrom(np.versions[Math.max(0, np.versions.length - 2)]!.version); setTo(np.versions[np.versions.length - 1]!.version);
  };

  return (
    <div data-testid="diff-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card padding={16}>
        <CardTitle>Compare two versions</CardTitle>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', marginBottom: 14 }}>
          <Labelled label="Policy" htmlFor="diff-policy">
            <Select id="diff-policy" value={p.id} onChange={(e) => pick(e.target.value)}>{policies.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
          </Labelled>
          <Labelled label="From version" htmlFor="diff-from">
            <Select id="diff-from" value={fv.version} onChange={(e) => setFrom(e.target.value)}>{vs.map((v) => <option key={v.version} value={v.version}>v{v.version} · from {fmtDateSafe(v.effectiveFrom)}</option>)}</Select>
          </Labelled>
          <Labelled label="To version" htmlFor="diff-to">
            <Select id="diff-to" value={tv.version} onChange={(e) => setTo(e.target.value)}>{vs.map((v) => <option key={v.version} value={v.version}>v{v.version} · from {fmtDateSafe(v.effectiveFrom)}</option>)}</Select>
          </Labelled>
        </div>
        {fv.version === tv.version ? <Note>Pick two different versions to see what changed.</Note> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <DiffStatsBadges lines={lines} />
              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: T.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} style={{ width: 16, height: 16 }} /> Show changed lines only
              </label>
            </div>
            <div style={{ fontSize: 13.5, color: T.dim }}><b style={{ color: T.text }}>What the author said changed in v{tv.version}:</b> {tv.changeSummary}</div>
            <DiffLines lines={lines} changesOnly={changesOnly} />
          </div>
        )}
      </Card>
    </div>
  );
}
