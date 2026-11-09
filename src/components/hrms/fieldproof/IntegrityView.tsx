'use client';
// Integrity checks: advisory flags found in field evidence, with the people's right of reply and a human decision.
// Counts are by flag, never by person. Nobody is ranked or scored.

import { useMemo, useState } from 'react';
import { Select } from '../../ui';
import { Badge, Button, Card, CardTitle, DataTable, Note, SearchBox, Toolbar, T, useIsCompact, type Col } from '../ui';
import type { Employee } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import type { FieldEvidence, FlagType } from '../../../lib/hrms/field/types';
import { FLAG_LABEL, integrityFlags } from '../../../lib/hrms/field/engines';
import type { FieldState } from '../../../lib/hrms/field/store';
import { FLAG_STATUSES, NO_FILTERS, SEVERITIES, STATUS_LABEL, filterFlags, flagStats, mergeFlags, ruleRows, type FlagRow } from '../../../lib/hrms/fieldproof/flags';
import FlagModal, { STATUS_TONE } from './FlagModal';
import { MiniStat, SeverityBadge, SEVERITY_LABEL, SEVERITY_TONE } from './shared';

export default function IntegrityView({ ev, state, people }: { ev: FieldEvidence; state: FieldState; people: Employee[] }) {
  const narrow = useIsCompact(760);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const flags = useMemo(() => integrityFlags(ev), [ev]);
  const nameOf = (id: string) => { const e = people.find((x) => x.id === id); return e ? fullName(e) : id; };
  const rows = useMemo(() => mergeFlags(flags, state.flagReviews, nameOf), [flags, state.flagReviews]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => filterFlags(rows, filters, nameOf), [rows, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = flagStats(rows);
  const involved = useMemo(() => Array.from(new Set(flags.flatMap((f) => f.involves))).sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [flags]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = openId ? rows.find((r) => r.id === openId) : undefined;
  const set = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const cols: Col<FlagRow>[] = [
    { key: 'sev', label: 'Severity', render: (r) => <SeverityBadge severity={r.severity} />, sortValue: (r) => SEVERITIES.indexOf(r.severity), nowrap: true },
    { key: 'what', label: 'What the check found', render: (r) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: T.text }}>{r.title}</div>
        <div style={{ fontSize: 12.5, color: T.mute }}>{FLAG_LABEL[r.type]}</div>
      </div>
    ), sortValue: (r) => r.title },
    { key: 'who', label: 'People', render: (r) => <span style={{ color: T.dim }}>{r.involves.map(nameOf).join(', ')}</span> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortValue: (r) => r.date, nowrap: true },
    { key: 'status', label: 'Status', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>{r.replied && <Badge tone="neutral">Replied</Badge>}</span>, sortValue: (r) => r.status, nowrap: true },
    { key: 'act', label: 'Action', align: 'right', render: (r) => (
      <Button size="sm" variant={r.status === 'open' ? 'primary' : 'secondary'} aria-label={`Review: ${r.title}`} onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>{r.status === 'open' ? 'Review' : 'View'}</Button>
    ) },
  ];
  const ruleCols: Col<ReturnType<typeof ruleRows>[number] & { id: string }>[] = [
    { key: 'check', label: 'Check', render: (r) => <b>{FLAG_LABEL[r.type]}</b>, nowrap: true },
    { key: 'looks', label: 'What it looks for', render: (r) => <span style={{ color: T.dim }}>{r.looksAt}</span> },
    { key: 'thr', label: 'Threshold used', render: (r) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{r.thresholds.map((t) => <span key={t.label} style={{ fontSize: 13 }}><span style={{ color: T.mute }}>{t.label}: </span>{t.value}</span>)}</div>
    ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div data-testid="integrity-advisory">
        <Note tone="warn"><b>Flags are advisory.</b> They never change pay or attendance on their own. A person reviews each one, and the employee can reply before anything is decided.</Note>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1.35fr', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 6 }}>By severity</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {SEVERITIES.map((s) => <MiniStat key={s} testId={`sev-${s}`} label={SEVERITY_LABEL[s]} value={stats.bySeverity[s]} tone={SEVERITY_TONE[s]} />)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 6 }}>By status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {FLAG_STATUSES.map((s) => <MiniStat key={s} testId={`status-${s}`} label={STATUS_LABEL[s]} value={stats.byStatus[s]} tone={STATUS_TONE[s]} />)}
          </div>
        </div>
      </div>

      <Toolbar>
        <Select aria-label="Type" value={filters.type} onChange={(e) => set('type', e.target.value)} style={{ width: narrow ? '100%' : 210 }}>
          <option value="all">All types</option>
          {(Object.keys(FLAG_LABEL) as FlagType[]).map((t) => <option key={t} value={t}>{FLAG_LABEL[t]}</option>)}
        </Select>
        <Select aria-label="Severity" value={filters.severity} onChange={(e) => set('severity', e.target.value)} style={{ width: narrow ? '100%' : 170 }}>
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} style={{ width: narrow ? '100%' : 160 }}>
          <option value="all">All statuses</option>
          {FLAG_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Person" value={filters.person} onChange={(e) => set('person', e.target.value)} style={{ width: narrow ? '100%' : 200 }}>
          <option value="all">Everyone</option>
          {involved.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
        </Select>
        <SearchBox value={filters.q} onChange={(v) => set('q', v)} placeholder="Search the flags" />
      </Toolbar>
      <div role="status" data-testid="flag-count" style={{ fontSize: 12.5, color: T.mute }}>Showing {shown.length} of {rows.length} flags{filtered && <> · <button type="button" onClick={() => setFilters(NO_FILTERS)} style={{ border: 0, background: 'none', color: T.info, cursor: 'pointer', font: 'inherit', padding: 0 }}>Clear filters</button></>}</div>

      <DataTable columns={cols} rows={shown} minWidth={820} onRowClick={(r) => setOpenId(r.id)}
        empty={rows.length ? 'No flag matches these filters.' : 'No flags. Nothing in the evidence looks odd.'} />

      <Card>
        <CardTitle>What each check looks for</CardTitle>
        <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12 }}>These are the limits the checks use today. They are company policy, not law, and can be tuned. They are read-only in this preview, so every flag you see is explained by a number you can read here.</div>
        <div data-testid="rules-card"><DataTable columns={ruleCols} rows={ruleRows(ev).map((r) => ({ ...r, id: r.type }))} minWidth={720} /></div>
      </Card>

      {open && <FlagModal ev={ev} row={open} people={people} onClose={() => setOpenId(null)} />}
    </div>
  );
}
