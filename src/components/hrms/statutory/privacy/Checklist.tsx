'use client';
// DPDP readiness checklist. Statuses are worked out from the sample data and worded honestly: "Partly" and "Not built"
// are normal answers for a preview. The dates are as reported and need confirming with counsel.

import { useEffect, useState } from 'react';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { diffDays, fmtDate } from '../../../../lib/hrms/format';
import { fetchAccessLog, useLiveStatus } from '../../../../lib/hrms/live/store';
import { Badge, Card, CardTitle, Note, T, useIsCompact, type Tone } from '../../ui';
import { DPDP_DATES, READY_LABEL, readinessItems, type ReadyStatus } from './model';

const TONE: Record<ReadyStatus, Tone> = { in_place: 'ok', partial: 'warn', not_built: 'red' };

export default function Checklist({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const live = useLiveStatus();
  const liveMode = live.source === 'live';

  // In live mode the local access log stays empty (the Access tab reads the server), so the count must come from the server
  // too — the same fetch the Access tab uses. null means "not known yet" (loading or failed): the item then shows a neutral
  // state instead of a misleading "0 entries". Sample mode never fetches and keeps reading the local collection.
  const [serverAccessCount, setServerAccessCount] = useState<number | null>(null);
  useEffect(() => {
    if (!liveMode) { setServerAccessCount(null); return undefined; }
    let cancelled = false;
    setServerAccessCount(null);
    fetchAccessLog()
      .then((r) => { if (!cancelled) setServerAccessCount(r.length); })
      .catch(() => { if (!cancelled) setServerAccessCount(null); });   // leave it unknown → neutral, never a misleading 0
    return () => { cancelled = true; };
  }, [liveMode, live.inputsVersion]);

  const items = readinessItems(db, liveMode ? { accessLogCount: serverAccessCount } : undefined);
  const n = (s: ReadyStatus) => items.filter((i) => i.status === s).length;
  const toFirst = diffDays(PREVIEW_TODAY, DPDP_DATES.firstProvisions);
  const toCore = diffDays(PREVIEW_TODAY, DPDP_DATES.coreDuties);
  const when = (d: number) => (d > 0 ? `in ${d} ${d === 1 ? 'day' : 'days'}` : d === 0 ? 'today' : `${-d} days ago`);

  return (
    <Card>
      <CardTitle right={<span style={{ fontSize: 12.5, color: T.mute }}>{n('in_place')} in place · {n('partial')} partly · {n('not_built')} not built</span>}>
        DPDP readiness
      </CardTitle>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {items.map((i) => (
          <div key={i.key} data-testid={`ready-${i.key}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{i.title}</div>
              <Badge tone={TONE[i.status]} dot>{READY_LABEL[i.status]}</Badge>
            </div>
            <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>{i.detail}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Note tone="warn">
          Dates as reported: the first provisions from <b>{fmtDate(DPDP_DATES.firstProvisions)}</b> ({when(toFirst)}) and the core duties from <b>{fmtDate(DPDP_DATES.coreDuties)}</b> ({when(toCore)}).
          These come from press summaries, not the notification, so confirm them, and what each duty means for HR data, with counsel. This checklist is a working aid, not legal advice.
        </Note>
      </div>
    </Card>
  );
}
