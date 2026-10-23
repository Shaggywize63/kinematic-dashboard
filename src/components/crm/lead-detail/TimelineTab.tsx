'use client';
import { useMemo, useState } from 'react';
import type { LeadUpdate } from '../../../lib/crmApi';
import type { ConversationRow } from '../../../lib/conversationsApi';
import { Button, Card, T } from '../../ui';
import Composer from './Composer';
import { ActivityRow, InsightRow, NoteRow } from './FeedItems';
import SectionCard from './SectionCard';
import { useActivityActions } from './useActivityActions';
import { activityWhen, dayKey, dayLabel, isActionable, type DetailActivity } from './format';

type Filter = 'all' | 'notes' | 'calls' | 'meetings' | 'tasks' | 'messages';
const FILTER_LABEL: Record<Filter, string> = { all: 'All', notes: 'Notes', calls: 'Calls', meetings: 'Meetings', tasks: 'Tasks', messages: 'Messages' };
const PAGE = 25;

type HistoryItem =
  | { kind: 'note'; id: string; at: string; update: LeadUpdate }
  | { kind: 'activity'; id: string; at: string; activity: DetailActivity }
  | { kind: 'insight'; id: string; at: string; conv: ConversationRow };

function matches(f: Filter, it: HistoryItem | { kind: 'activity'; activity: DetailActivity }): boolean {
  if (f === 'all') return true;
  if (it.kind === 'note') return f === 'notes';
  if (it.kind === 'insight') return f === 'calls';
  const t = it.activity.type;
  switch (f) {
    case 'notes': return t === 'note';
    case 'calls': return t === 'call';
    case 'meetings': return t === 'meeting';
    case 'tasks': return t === 'task';
    case 'messages': return t === 'email' || t === 'sms' || t === 'whatsapp';
    default: return true;
  }
}

/** Composer, what's coming up, and one chronological record of everything that happened on the lead. */
export default function TimelineTab({
  leadId, leadCampaign, activities, updates, updatesLoading, conversations, me,
  onAddNote, onEditNote, onDeleteNote, onActivitiesChanged,
}: {
  leadId: string;
  leadCampaign: string | null;
  activities: DetailActivity[];
  updates: LeadUpdate[];
  updatesLoading: boolean;
  conversations: ConversationRow[];
  me: { id: string | null; isAdmin: boolean };
  onAddNote: (body: string) => Promise<boolean>;
  onEditNote: (id: string, body: string) => Promise<boolean>;
  onDeleteNote: (id: string) => Promise<void>;
  onActivitiesChanged: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const { busyId, setStatus, remove } = useActivityActions(onActivitiesChanged);

  const upcomingAll = useMemo(() => {
    const t = (a: DetailActivity) => (a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY);
    return activities.filter(isActionable).sort((a, b) => t(a) - t(b));
  }, [activities]);

  const historyAll = useMemo<HistoryItem[]>(() => {
    const out: HistoryItem[] = [];
    updates.forEach((u) => out.push({ kind: 'note', id: `n-${u.id}`, at: u.created_at, update: u }));
    activities.filter((a) => !isActionable(a)).forEach((a) => out.push({ kind: 'activity', id: `a-${a.id}`, at: activityWhen(a), activity: a }));
    conversations.forEach((c) => out.push({ kind: 'insight', id: `c-${c.id}`, at: c.created_at, conv: c }));
    return out.filter((i) => !Number.isNaN(new Date(i.at).getTime())).sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [updates, activities, conversations]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, notes: 0, calls: 0, meetings: 0, tasks: 0, messages: 0 };
    const bump = (it: HistoryItem | { kind: 'activity'; activity: DetailActivity }) => {
      c.all += 1;
      (['notes', 'calls', 'meetings', 'tasks', 'messages'] as const).forEach((f) => { if (matches(f, it)) c[f] += 1; });
    };
    upcomingAll.forEach((a) => bump({ kind: 'activity', activity: a }));
    historyAll.forEach(bump);
    return c;
  }, [upcomingAll, historyAll]);

  const upcoming = upcomingAll.filter((a) => matches(filter, { kind: 'activity', activity: a }));
  const history = historyAll.filter((i) => matches(filter, i));
  const visible = history.slice(0, shown);

  // Group by IST day; items are already newest-first.
  const groups = useMemo(() => {
    const g: Array<{ key: string; items: HistoryItem[] }> = [];
    visible.forEach((it) => {
      const k = dayKey(it.at);
      const last = g[g.length - 1];
      if (last && last.key === k) last.items.push(it); else g.push({ key: k, items: [it] });
    });
    return g;
  }, [visible]);

  const overdue = upcomingAll.filter((a) => a.due_at && new Date(a.due_at).getTime() < Date.now()).length;
  const myId = me.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding={16}>
        <Composer leadId={leadId} latestUpdate={updates[0] ?? null} onSubmit={onAddNote} />
      </Card>

      {upcoming.length > 0 && (
        <SectionCard title="Up next" count={upcoming.length} accent={overdue > 0 ? T.red : T.info} aside={overdue > 0 ? <span style={{ fontSize: 12, fontWeight: 650, color: T.red }}>{overdue} overdue</span> : undefined}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {upcoming.map((a, i) => (
              <ActivityRow
                key={a.id}
                a={a}
                upcoming
                last={i === upcoming.length - 1}
                leadCampaign={leadCampaign}
                busy={busyId === a.id}
                onStatus={(s) => setStatus(a, s)}
                onDelete={() => remove(a)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="History"
        count={history.length}
        aside={
          counts.all > 0 ? (
            <div role="group" aria-label="Filter the timeline" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(FILTER_LABEL) as Filter[]).filter((f) => f === 'all' || counts[f] > 0).map((f) => {
                const on = filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setFilter(f); setShown(PAGE); }}
                    className="km-chip"
                    style={{ height: 26, padding: '0 10px', borderRadius: 999, border: `1px solid ${on ? T.text : T.border}`, background: on ? T.text : 'transparent', color: on ? T.card : T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    {FILTER_LABEL[f]}<span style={{ fontFamily: T.mono, fontSize: 10.5, opacity: 0.7 }}>{counts[f]}</span>
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      >
        {updatesLoading && history.length === 0 ? (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <i className="km-skel" style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <i className="km-skel" style={{ height: 12, width: '45%' }} />
                  <i className="km-skel" style={{ height: 44, width: '100%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: '22px 8px', textAlign: 'center', color: T.dim, fontSize: 13.5 }}>
            {counts.all === 0
              ? 'Nothing logged yet. Add an update above or log a call — it will build the lead’s story here, and feed the next-best-action suggestions.'
              : `No ${FILTER_LABEL[filter].toLowerCase()} in the history yet.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map((g) => (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, whiteSpace: 'nowrap' }}>{dayLabel(g.key)}</span>
                  <span aria-hidden style={{ flex: 1, height: 1, background: T.border }} />
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {g.items.map((it, i) => {
                    const last = i === g.items.length - 1;
                    if (it.kind === 'note') {
                      const u = it.update;
                      return (
                        <NoteRow
                          key={it.id}
                          u={u}
                          last={last}
                          canEdit={!!myId && u.author_id === myId}
                          canDelete={(!!myId && u.author_id === myId) || me.isAdmin}
                          onEdit={(body) => onEditNote(u.id, body)}
                          onDelete={() => onDeleteNote(u.id)}
                        />
                      );
                    }
                    if (it.kind === 'insight') return <InsightRow key={it.id} c={it.conv} last={last} />;
                    const a = it.activity;
                    return (
                      <ActivityRow
                        key={it.id}
                        a={a}
                        last={last}
                        leadCampaign={leadCampaign}
                        busy={busyId === a.id}
                        onStatus={(s) => setStatus(a, s)}
                        onDelete={() => remove(a)}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
            {history.length > shown && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, history.length - shown)} more</Button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

