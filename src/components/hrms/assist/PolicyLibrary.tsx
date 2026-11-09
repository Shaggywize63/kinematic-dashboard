'use client';
// Policies library: the list on the left, the selected policy on the right with its text, version history and publish button.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, KeyValue, Note, ProgressBar, T, useIsCompact } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { ackRows, ackSummary, audienceOf, currentVersion } from '../../../lib/hrms/assist/policies';
import type { Policy, PolicyState } from '../../../lib/hrms/assist/types';
import PublishModal from './PublishModal';

export const rateTone = (rate: number | null) => (rate == null ? 'neutral' : rate >= 90 ? 'ok' : rate >= 60 ? 'warn' : 'red') as 'ok' | 'warn' | 'red' | 'neutral';

export default function PolicyLibrary({ db, state, selectedId, onSelect, onCompare, onGoAck }: {
  db: HrmsDb; state: PolicyState; selectedId: string; onSelect: (id: string) => void; onCompare: (policyId: string, from: string, to: string) => void; onGoAck: (policyId: string) => void;
}) {
  const narrow = useIsCompact(960);
  const [publishing, setPublishing] = useState(false);
  const p = state.policies.find((x) => x.id === selectedId) ?? state.policies[0]!;
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(280px, 340px) minmax(0, 1fr)', alignItems: 'start' }}>
      <div role="list" aria-label="Policies" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {state.policies.map((x) => {
          const v = currentVersion(x);
          const s = ackSummary(ackRows(db, x, state.acks, state.reminders, PREVIEW_TODAY));
          const on = x.id === p.id;
          return (
            <div role="listitem" key={x.id}>
              <button type="button" data-testid={`policy-card-${x.id}`} aria-pressed={on} onClick={() => onSelect(x.id)} style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: T.text, background: on ? T.raised : T.card,
                border: `1px solid ${on ? T.borderStrong : T.border}`, borderLeft: `3px solid ${on ? T.red : T.border}`, borderRadius: T.radius.md, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 14.5 }}>{x.title}</b>
                  <Badge tone="neutral" mono>v{v.version}</Badge>
                </span>
                <span style={{ fontSize: 12.5, color: T.dim }}>Effective {fmtDate(v.effectiveFrom)} · {x.owner}</span>
                {s.rate == null ? <span style={{ fontSize: 12.5, color: T.mute }}>No acknowledgement needed</span> : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1 }}><ProgressBar pct={s.rate} tone={rateTone(s.rate)} height={5} /></span>
                    <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.rate)}%</span>
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <Detail key={`${p.id}:${currentVersion(p).version}`} db={db} state={state} p={p} onPublish={() => setPublishing(true)} onCompare={onCompare} onGoAck={onGoAck} />
      {publishing && <PublishModal db={db} policy={p} onClose={() => setPublishing(false)} onPublished={() => undefined} />}
    </div>
  );
}

function Detail({ db, state, p, onPublish, onCompare, onGoAck }: {
  db: HrmsDb; state: PolicyState; p: Policy; onPublish: () => void; onCompare: (policyId: string, from: string, to: string) => void; onGoAck: (policyId: string) => void;
}) {
  const cur = currentVersion(p);
  const [view, setView] = useState(cur.version);
  const shown = p.versions.find((v) => v.version === view) ?? cur;
  const s = ackSummary(ackRows(db, p, state.acks, state.reminders, PREVIEW_TODAY));
  const audience = audienceOf(db, p).length;
  const upcoming = cur.effectiveFrom > PREVIEW_TODAY;
  return (
    <Card padding={20} style={{ minWidth: 0 }}>
      <div data-testid="policy-detail" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 20, color: T.text }}>{p.title}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span data-testid="policy-version"><Badge tone="info" mono>Current v{cur.version}</Badge></span>
              {upcoming && <Badge tone="warn">Starts {fmtDate(cur.effectiveFrom)}</Badge>}
              <Badge tone="neutral">{p.category}</Badge>
            </div>
          </div>
          <Button variant="primary" onClick={onPublish} data-testid="publish-open">Publish a new version</Button>
        </div>
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{p.summary}</div>
        <KeyValue columns={3} rows={[
          { label: 'Owner', value: p.owner },
          { label: 'Effective from', value: fmtDate(cur.effectiveFrom) },
          { label: 'Published', value: `${fmtDate(cur.publishedOn)} by ${cur.publishedBy}` },
          { label: 'Applies to', value: p.audience.kind === 'all' ? `Everyone (${audience} people)` : `${p.audience.ids.map((id) => db.departments.find((d) => d.id === id)?.name ?? id).join(', ')} (${audience} people)` },
          { label: 'Acknowledgement', value: cur.requiresAck ? 'Required' : 'Not required for this version' },
        ]} />

        {cur.requiresAck && s.rate != null && (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span><b>{s.acknowledged}</b> of {s.acknowledged + s.pending} have acknowledged v{cur.version}</span>
              <span style={{ color: T.dim }}>{s.pending} pending{s.pending ? `, ${s.avgDaysPending} days on average` : ''}</span>
            </div>
            <ProgressBar pct={s.rate} tone={rateTone(s.rate)} />
            <div><Button size="sm" onClick={() => onGoAck(p.id)}>See who is pending</Button></div>
          </div>
        )}

        <section aria-label="Policy text">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, color: T.text }}>Text of version {shown.version}{shown.version === cur.version ? ' (current)' : ''}</h3>
          </div>
          <div data-testid="policy-text" tabIndex={0} style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: T.text, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 16, maxHeight: 440, overflow: 'auto', overflowWrap: 'anywhere' }}>{shown.text}</div>
        </section>

        {p.legal.length > 0 && (
          <section aria-label="Legal references" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, color: T.text }}>Legal references</h3>
            {p.legal.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0 }}><ConfidenceBadge level={l.confidence} /></span><span>{l.text}</span>
              </div>
            ))}
            <Note tone="warn">These references are for orientation, not legal advice. Confirm them with your advisor before relying on them.</Note>
          </section>
        )}

        <section aria-label="Version history">
          <CardTitle>Version history</CardTitle>
          <ol data-testid="version-history" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...p.versions].reverse().map((v, idx, arr) => {
              const older = arr[idx + 1];
              return (
                <li key={v.version} data-testid={`version-${v.version}`} style={{ border: `1px solid ${v.version === shown.version ? T.borderStrong : T.border}`, borderRadius: T.radius.md, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge tone={v.version === cur.version ? 'info' : 'neutral'} mono>v{v.version}</Badge>
                    {v.version === cur.version && <Badge tone="ok">Current</Badge>}
                    <span style={{ fontSize: 13, color: T.dim }}>Effective {fmtDate(v.effectiveFrom)} · published {fmtDate(v.publishedOn)} by {v.publishedBy}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: T.text }}>{v.changeSummary}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="sm" onClick={() => setView(v.version)} aria-pressed={v.version === shown.version}>View this text</Button>
                    {older && <Button size="sm" onClick={() => onCompare(p.id, older.version, v.version)} aria-label={`Compare v${older.version} with v${v.version}`}>Compare with v{older.version}</Button>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Card>
  );
}
