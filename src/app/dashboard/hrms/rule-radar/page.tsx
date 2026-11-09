'use client';
// Rule radar: changes in rules that affect Indian payroll, and what each one means for the sample company.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Select } from '../../../../components/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { Badge, Button, Card, CardTitle, EmptyState, HrmsPage, Loading, SearchBox, Stat, StatGrid, T, Toolbar, useIsCompact } from '../../../../components/hrms/ui';
import { RADAR_CATEGORIES, RADAR_STATUS_LABEL, buildRadarItems, computeImpacts, effectiveWithin, sortFeed, whenText, type RadarItem } from '../../../../lib/hrms/control/radar';
import { acknowledgeRadar, controlStore, createRadarTask, setRadarStatus } from '../../../../lib/hrms/control/store';
import type { ControlState, RadarStatus } from '../../../../lib/hrms/control/types';
import type { Confidence } from '../../../../lib/hrms/rules';
import RadarCard from '../../../../components/hrms/control/RadarCard';
import { DetailModal, TaskModal } from '../../../../components/hrms/control/RadarModals';
import { Conf, Muted, Row, Stack } from '../../../../components/hrms/control/parts';
import { fmtDate } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';

export default function RuleRadarPage() {
  const db = useHrmsDb();
  const state = controlStore.use();
  if (!db || !state) return <Loading />;
  return <Body db={db} state={state} />;
}

const DEFINITIONS: { level: Confidence; text: string }[] = [
  { level: 'verified', text: 'From the official text. Safe to rely on, after you check the date that applies to you.' },
  { level: 'reported', text: 'From reliable reporting. Confirm it against the notification before you rely on it.' },
  { level: 'indicative', text: 'A placeholder or an estimate. Never use it as the rule.' },
];

function Body({ db, state }: { db: HrmsDb; state: ControlState }) {
  const narrow = useIsCompact(900);
  const items = useMemo(() => buildRadarItems(), []);
  const impacts = useMemo(() => computeImpacts(db, items), [db, items]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [conf, setConf] = useState('all');
  const [detail, setDetail] = useState<RadarItem | null>(null);
  const [taskFor, setTaskFor] = useState<RadarItem | null>(null);

  const statusOf = (i: RadarItem): RadarStatus => state.radar[i.id]?.status ?? 'new';
  const soon = useMemo(() => effectiveWithin(items, 90), [items]);
  const feed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortFeed(items).filter((i) => (cat === 'all' || i.category === cat) && (status === 'all' || statusOf(i) === status) && (conf === 'all' || i.confidence === conf)
      && (!needle || `${i.title} ${i.summary} ${i.source} ${i.category}`.toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, cat, status, conf, state.radar]);
  const filtered = q || cat !== 'all' || status !== 'all' || conf !== 'all';
  const taskExists = (i: RadarItem) => { const t = state.radar[i.id]?.taskId; return !!t && db.compliance.some((c) => c.id === t); };
  const counts = { new: items.filter((i) => statusOf(i) === 'new').length, applied: items.filter((i) => statusOf(i) === 'applied').length };

  return (
    <HrmsPage
      eyebrow="HRMS · Control"
      title="Rule radar"
      description="Changes in the rules that affect Indian payroll, and what each one means for us. Each item says how far it can be trusted."
    >
      <Card>
        <CardTitle>How much to trust each item</CardTitle>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: T.text, lineHeight: 1.55 }} data-testid="honesty-note">
          Confidence labels are the honesty feature of this product. Every item carries one, so you can see what is checked and what is a guess.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          {DEFINITIONS.map((d) => (
            <div key={d.level} style={{ background: T.raised, borderRadius: T.radius.md, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><Conf level={d.level} /> <code style={{ fontFamily: T.mono, fontSize: 12.5, color: T.text, marginLeft: 6 }}>{d.level}</code></div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>{d.text}</div>
            </div>
          ))}
        </div>
        <Muted style={{ marginTop: 10 }}>The dates, sources and labels on rule items come from the rules tables in this module. Items marked sample advisory were written for this preview, carry placeholder dates and are always indicative. Confirm every item with your advisor.</Muted>
      </Card>

      <StatGrid min={170}>
        <Stat label="Items on the radar" value={items.length} hint={`${items.filter((i) => i.kind === 'sample').length} are sample advisories`} />
        <Stat label="New, not yet looked at" value={counts.new} tone={counts.new ? 'info' : undefined} />
        <Stat label="Effective in 90 days" value={soon.length} hint="From the preview date" tone={soon.length ? 'warn' : undefined} />
        <Stat label="Applied in config" value={counts.applied} tone="ok" />
      </StatGrid>

      <Card>
        <CardTitle right={<Muted>Next 90 days from {fmtDate(PREVIEW_TODAY)}</Muted>}>Effective in the next 90 days</CardTitle>
        <div data-testid="radar-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 10 }}>
          {soon.length === 0 && <Muted>Nothing takes effect in the next 90 days.</Muted>}
          {soon.map((i) => (
            <button key={i.id} type="button" onClick={() => setDetail(i)} data-testid={`strip-${i.id}`}
              style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', color: T.text }}>
              <div style={{ fontSize: 12, color: T.warn, fontWeight: 600 }}>{i.dateLabel === 'Placeholder date' ? 'Placeholder ' : ''}{fmtDate(i.effectiveOn)}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, lineHeight: 1.35 }}>{i.title}</div>
              <Row gap={6} style={{ marginTop: 6 }}><Badge tone="neutral" mono>{i.category}</Badge><Conf level={i.confidence} /></Row>
            </button>
          ))}
        </div>
      </Card>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search the radar" width={280} />
        <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 170 }}>
          <option value="all">All categories</option>
          {RADAR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 190 }}>
          <option value="all">All statuses</option>
          {(Object.keys(RADAR_STATUS_LABEL) as RadarStatus[]).map((s) => <option key={s} value={s}>{RADAR_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Confidence" value={conf} onChange={(e) => setConf(e.target.value)} style={{ width: 170 }}>
          <option value="all">All confidence</option>
          <option value="verified">Verified</option>
          <option value="reported">Reported</option>
          <option value="indicative">Indicative</option>
        </Select>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setCat('all'); setStatus('all'); setConf('all'); }}>Clear filters</Button>}
        <div style={{ marginLeft: 'auto' }} data-testid="radar-count"><Muted>Showing {feed.length} of {items.length}</Muted></div>
      </Toolbar>

      <Stack gap={12}>
        {feed.length === 0 && <Card><EmptyState title="Nothing matches these filters" description="Try a different category or clear the filters." action={<Button onClick={() => { setQ(''); setCat('all'); setStatus('all'); setConf('all'); }}>Clear filters</Button>} /></Card>}
        {feed.map((i) => (
          <RadarCard key={i.id} item={i} impact={impacts[i.id]!} state={state.radar[i.id]} taskExists={taskExists(i)}
            onAcknowledge={() => { acknowledgeRadar(i.id); toast.success('Acknowledged.'); }} onTask={() => setTaskFor(i)} onDetails={() => setDetail(i)} />
        ))}
      </Stack>

      {detail && (
        <DetailModal db={db} item={detail} impact={impacts[detail.id]!} state={state.radar[detail.id]}
          taskName={taskExists(detail) ? db.compliance.find((c) => c.id === state.radar[detail.id]!.taskId)?.name : undefined}
          onClose={() => setDetail(null)} onSave={(s, n) => setRadarStatus(detail.id, s, n)} />
      )}
      {taskFor && (
        <TaskModal db={db} item={taskFor} impact={impacts[taskFor.id]!} onClose={() => setTaskFor(null)}
          onCreate={(due) => { const t = createRadarTask(db, taskFor, impacts[taskFor.id]!, due); toast.success(`Task added, due ${fmtDate(t.dueOn)}.`); setTaskFor(null); }} />
      )}
    </HrmsPage>
  );
}
