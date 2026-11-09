'use client';
// Recognition: a public kudos wall, counts by team per month and the company values. Public praise by choice, so
// names are shown; there is no leaderboard and nothing is sorted by who has received the most.

import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, CardTitle, T, useIsCompact } from '../../ui';
import { Field, Select, Textarea } from '../../../ui';
import { addMonths, fmtDate, fmtMonth } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { giveKudos } from '../../../../lib/hrms/people/engagementActions';
import { kudosByMonth } from '../../../../lib/hrms/people/engagementEngine';
import { TEAMS } from '../../../../lib/hrms/people/teams';
import { isLearner } from '../../../../lib/hrms/people/learningEngine';
import type { EngagementState } from '../../../../lib/hrms/people/types';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { FormModal, Muted, Stack, ROW_TH } from '../shared';
import type { EngagementView } from './view';

const DOT = ['var(--px-1)', 'var(--px-2)', 'var(--px-3)', 'var(--px-4)', 'var(--mute)'];

function GiveModal({ db, st, onClose }: { db: HrmsDb; st: EngagementState; onClose: () => void }) {
  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <FormModal title="Give recognition" confirmLabel="Post to the wall" onClose={onClose}
      onConfirm={() => {
        const r = giveKudos(to, value, msg);
        if (!r.ok) return r.error;
        toast.success('Posted to the wall.');
        return null;
      }}>
      <Stack gap={12}>
        <Muted>Recognition is public: everyone can see it, with names. Say what the person did and why it mattered.</Muted>
        <Field label="Who are you thanking?" htmlFor="kudos-to">
          <Select id="kudos-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a colleague</option>
            {db.employees.filter(isLearner).map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </Select>
        </Field>
        <Field label="Which value does it show?" htmlFor="kudos-value">
          <Select id="kudos-value" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose a value</option>
            {st.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="What did they do?" htmlFor="kudos-msg"><Textarea id="kudos-msg" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
      </Stack>
    </FormModal>
  );
}

export default function RecognitionTab({ db, st, ev }: { db: HrmsDb; st: EngagementState; ev: EngagementView }) {
  const narrow = useIsCompact(900);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const thisMonth = PREVIEW_TODAY.slice(0, 7);
  const months = [-3, -2, -1, 0].map((d) => addMonths(thisMonth, d));
  const counts = kudosByMonth(st.kudos, db.employees, TEAMS, months);
  const valueIdx = new Map(st.values.map((v, i) => [v.id, i]));
  const feed = st.kudos.filter((k) => filter === 'all' || k.valueId === filter);

  return (
    <Stack gap={16}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <Muted>Public thanks, by choice. Names are shown. There is no leaderboard.</Muted>
        <Button variant="primary" onClick={() => setOpen(true)}>Give recognition</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '100%' : 'repeat(2, minmax(0, 1fr))', gap: 14, alignItems: 'start' }}>
        <Card>
          <CardTitle right={
            <Select aria-label="Filter by value" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }}>
              <option value="all">All values</option>
              {st.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          }>Kudos wall</CardTitle>
          <div data-testid="kudos-feed" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {feed.length === 0 && <Muted>No recognition for this value yet.</Muted>}
            {feed.map((k) => {
              const v = st.values.find((x) => x.id === k.valueId);
              const idx = valueIdx.get(k.valueId) ?? 4;
              return (
                <div key={k.id} data-testid="kudos-item" style={{ display: 'flex', gap: 10 }}>
                  <Avatar name={ev.name(k.toId)} size={34} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, color: T.text }}><b>{k.fromName}</b> thanked <b>{ev.name(k.toId)}</b></div>
                    <div style={{ fontSize: 14, color: T.text, margin: '2px 0 6px', lineHeight: 1.5 }}>{k.message}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: T.mute, flexWrap: 'wrap' }}>
                      <Badge><span style={{ width: 8, height: 8, borderRadius: 999, background: DOT[idx], display: 'inline-block' }} />{v?.name ?? k.valueId}</Badge>
                      <span>{fmtDate(k.on)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Stack gap={14}>
          <Card className="px-viz">
            <CardTitle>Recognitions received, by team and month</CardTitle>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="kudos-counts" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: T.mute }}>Month</th>
                    {TEAMS.map((t) => <th key={t.id} scope="col" style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, color: T.mute }}>{t.name}</th>)}
                    <th scope="col" style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, color: T.mute }}>All</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.month} data-testid={`kudos-month-${c.month}`}>
                      <th scope="row" style={{ ...ROW_TH, textAlign: 'left', padding: '7px 8px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}`, fontWeight: 600 }}>{fmtMonth(c.month)}</th>
                      {TEAMS.map((t) => <td key={t.id} style={{ textAlign: 'right', padding: '7px 8px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' }}>{c.counts[t.id] ?? 0}</td>)}
                      <td style={{ textAlign: 'right', padding: '7px 8px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}`, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Muted style={{ marginTop: 8 }}>Counted by the team of the person who was thanked. Teams are in a fixed order, not ranked.</Muted>
          </Card>
          <Card>
            <CardTitle>Our values</CardTitle>
            <div data-testid="values-legend" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {st.values.map((v, i) => (
                <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: DOT[i], marginTop: 5, flexShrink: 0 }} />
                  <div><div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{v.name}</div><div style={{ fontSize: 12.5, color: T.dim }}>{v.blurb}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </Stack>
      </div>
      {open && <GiveModal db={db} st={st} onClose={() => setOpen(false)} />}
    </Stack>
  );
}
