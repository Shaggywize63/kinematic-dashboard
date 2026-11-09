'use client';
// Pay-run checks: look for odd numbers in a pay run before it is frozen. Pick an entity and a month, see what the
// checks found, review each finding with a note. The checks never block a run; they inform whoever freezes it.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Select } from '../../../ui';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmptyState, Modal, Note, ProgressBar, SearchBox, Stat, StatGrid, Toolbar, T, useIsCompact, type Col } from '../../ui';
import type { HrmsDb, PayRun } from '../../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDateTime, fmtMonth, fmtMonthLong, fullName } from '../../../../lib/hrms/format';
import { CHECK_INFO, PAYCHECK_RULES, checkLabel, draftTarget, regularRuns, reviewKey, reviewState, runPayChecks, summarise } from '../../../../lib/hrms/paychecks/engine';
import type { CheckCoverage, Finding, ReviewState } from '../../../../lib/hrms/paychecks/types';
import { markReviewed, payChecksStore, prepareDraft, reopenFinding, type PayChecksState } from '../../../../lib/hrms/paychecks/store';
import { Bullets, Facts, LinkButton, NoteField, SeverityBadge } from '../shared';

const PREVIEW_MONTH = PREVIEW_TODAY.slice(0, 7);
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', computed: 'Computed', frozen: 'Frozen', paid: 'Paid' };

/** Reads ?entity= and ?month= after mount (never during render, so server and client agree). */
function useScopeParams(): [{ entity: string | null; month: string | null }, (p: { entity?: string | null; month?: string | null }) => void] {
  const [scope, setScope] = useState<{ entity: string | null; month: string | null }>({ entity: null, month: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setScope({ entity: q.get('entity'), month: q.get('month') });
  }, []);
  const set = (p: { entity?: string | null; month?: string | null }) => {
    setScope((s) => {
      const next = { entity: p.entity !== undefined ? p.entity : s.entity, month: p.month !== undefined ? p.month : s.month };
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(next)) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
      window.history.replaceState(null, '', url.toString());
      return next;
    });
  };
  return [scope, set];
}

export default function PayChecksView({ db, store }: { db: HrmsDb; store: PayChecksState }) {
  const narrow = useIsCompact(760);
  const [scope, setScope] = useScopeParams();
  const [sev, setSev] = useState('all');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [reviewing, setReviewing] = useState<Finding | null>(null);
  const [busy, setBusy] = useState(false);

  const entityId = db.entities.some((e) => e.id === scope.entity) ? scope.entity! : db.entities[0]!.id;
  const entity = db.entities.find((e) => e.id === entityId)!;
  const runs = useMemo(() => regularRuns(db, entityId), [db, entityId]);
  const defaultRun = runs.find((r) => r.payslips.length > 0) ?? runs[0];
  const run: PayRun | undefined = runs.find((r) => r.month === scope.month) ?? defaultRun;
  const target = useMemo(() => draftTarget(db, entityId, PREVIEW_MONTH), [db, entityId]);
  const result = useMemo(() => (run ? runPayChecks(db, run) : null), [db, run]);

  const nameOf = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : id; };
  const findings = result?.findings ?? [];
  const key = (f: Finding) => reviewKey(entityId, f.month, f.id);
  const stateOf = (f: Finding): ReviewState => reviewState(store.reviews[key(f)], f);
  const sum = summarise(findings, store.reviews, entityId, run?.month ?? '');
  const pct = sum.total ? (sum.reviewed / sum.total) * 100 : 0;

  const shown = findings.filter((f) => {
    if (sev !== 'all' && (sev === 'look' ? f.severity === 'info' : f.severity !== sev)) return false;
    if (kind !== 'all' && f.kind !== kind) return false;
    if (status !== 'all' && (status === 'open' ? stateOf(f) === 'reviewed' : stateOf(f) !== status)) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !`${f.title} ${f.employeeIds.map(nameOf).join(' ')} ${f.lines.join(' ')}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const prepare = () => {
    setBusy(true);
    try {
      const r = prepareDraft(entityId);
      if (r.ok) { setScope({ month: r.month }); toast.success(`${r.created ? 'Prepared' : 'Recomputed'} the ${fmtMonthLong(r.month)} draft for ${entity.name}`); }
      else toast.error(r.error);
    } finally { setBusy(false); }
  };

  const existing = target.existing;
  const prepareLabel = existing ? `Recompute the ${fmtMonthLong(target.month)} draft` : 'Prepare a draft for the next month';
  const lastClosed = target.after;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div data-testid="paychecks-advisory"><Note>
        <b>These checks never block a run.</b> They show whoever freezes it what looks odd, with the numbers behind each point. You decide what to do. Nothing here changes a payslip.
      </Note></div>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 220px) auto', gap: 12, alignItems: 'end' }}>
          <Field label="Legal entity" htmlFor="pc-entity">
            <Select id="pc-entity" aria-label="Legal entity" value={entityId} onChange={(e) => setScope({ entity: e.target.value, month: null })}>
              {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Pay run" htmlFor="pc-month">
            <Select id="pc-month" aria-label="Pay run month" value={run?.month ?? ''} onChange={(e) => setScope({ month: e.target.value })} disabled={!runs.length}>
              {runs.length === 0 && <option value="">No run yet</option>}
              {runs.map((r) => <option key={r.id} value={r.month}>{fmtMonth(r.month)} ({STATUS_LABEL[r.status] ?? r.status})</option>)}
            </Select>
          </Field>
          <Button variant="primary" style={{ height: 36 }} disabled={busy} onClick={prepare} data-testid="prepare-draft">{prepareLabel}</Button>
        </div>
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>
          {existing
            ? `The ${fmtMonthLong(target.month)} draft exists (${(STATUS_LABEL[existing.status] ?? existing.status).toLowerCase()}). Recomputing picks up changes made since, such as new adjustments or loss of pay.`
            : `Creates ${fmtMonthLong(target.month)} for ${entity.name} and computes it with the same engine as Payroll, then compares it with ${lastClosed ? fmtMonthLong(lastClosed.month) : 'the last run'}.`}
        </div>
      </Card>

      {!run || !result ? (
        <Card><EmptyState title="No pay run for this entity yet" description="Prepare a draft to create the first run and check it." action={<Button variant="primary" onClick={prepare}>{prepareLabel}</Button>} /></Card>
      ) : !result.computed ? (
        <Card>
          <EmptyState title={`The ${fmtMonthLong(run.month)} run has no payslips yet`}
            description="It is a draft that was never computed, so there is nothing to check. Compute it here or in Payroll."
            action={<Button variant="primary" disabled={busy} onClick={prepare}>{prepareLabel}</Button>} />
        </Card>
      ) : (
        <>
          <div data-testid="run-context" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', fontSize: 13.5, color: T.dim }}>
            <span style={{ color: T.text, fontWeight: 600 }}>{entity.name}, {fmtMonthLong(run.month)}</span>
            <Badge tone={run.status === 'paid' ? 'ok' : run.status === 'frozen' ? 'warn' : 'info'} dot>{STATUS_LABEL[run.status] ?? run.status}</Badge>
            <span>{result.payslips} payslips</span>
            <span>{result.prevMonth ? `compared with ${fmtMonthLong(result.prevMonth)} (${result.prevPayslips} payslips)` : 'no earlier run to compare with'}</span>
            <LinkButton href={`/dashboard/hrms/payroll/runs/${run.id}`} label={`Open the ${fmtMonthLong(run.month)} run in Payroll`}>Open this run in Payroll</LinkButton>
          </div>

          <StatGrid min={170}>
            <Stat label="Findings" value={<span data-testid="stat-total">{sum.total}</span>} hint={sum.total === 0 ? 'Nothing to look at' : `${result.coverage.length} checks ran`} tone={sum.total ? undefined : 'ok'} />
            <Stat label="Need a look" value={<span data-testid="stat-look">{sum.needLook}</span>} tone={sum.needLook ? 'warn' : 'ok'} hint="Warnings and high" />
            <Stat label="For information" value={<span data-testid="stat-info">{sum.info}</span>} tone="info" hint="Explained or minor" />
            <Stat label="Reviewed" value={<span data-testid="stat-reviewed">{sum.reviewed}</span>} tone={sum.total && sum.reviewed === sum.total ? 'ok' : undefined} hint={`of ${sum.total}`} />
          </StatGrid>

          {sum.total > 0 && (
            <div data-testid="review-progress" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.dim, gap: 12, flexWrap: 'wrap' }}>
                <span><b style={{ color: T.text }}>{sum.reviewed} of {sum.total}</b> findings reviewed</span>
                <span>{sum.reviewed === sum.total ? 'All reviewed. Freezing is your call.' : `${sum.total - sum.reviewed} still open${sum.changed ? `, ${sum.changed} changed since they were reviewed` : ''}`}</span>
              </div>
              <ProgressBar pct={pct} tone={sum.reviewed === sum.total ? 'ok' : 'info'} height={8} />
            </div>
          )}

          {sum.total === 0 ? (
            <Card padding={0}>
              <EmptyState icon={<span aria-hidden style={{ fontSize: 20 }}>✓</span>} title="0 findings"
                description={`Nothing in the ${fmtMonthLong(run.month)} run for ${entity.name} needs a second look. The list below shows what was checked.`} />
            </Card>
          ) : (
            <>
              <Toolbar>
                <Select aria-label="Severity" value={sev} onChange={(e) => setSev(e.target.value)} style={{ width: narrow ? '100%' : 190 }}>
                  <option value="all">All severities</option><option value="look">Need a look</option>
                  <option value="high">High</option><option value="warning">Warning</option><option value="info">For information</option>
                </Select>
                <Select aria-label="Check" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: narrow ? '100%' : 230 }}>
                  <option value="all">All checks</option>
                  {CHECK_INFO.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
                </Select>
                <Select aria-label="Review status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: narrow ? '100%' : 180 }}>
                  <option value="all">Open and reviewed</option><option value="open">Not reviewed</option><option value="reviewed">Reviewed</option><option value="changed">Changed since review</option>
                </Select>
                <SearchBox value={q} onChange={setQ} placeholder="Search person or text" />
              </Toolbar>
              <div role="status" style={{ fontSize: 12.5, color: T.mute }}>Showing {shown.length} of {findings.length} findings</div>
              {shown.length === 0 ? (
                <Card><EmptyState title="No finding matches these filters" description="Clear a filter to see the rest." action={<Button onClick={() => { setSev('all'); setKind('all'); setStatus('all'); setQ(''); }}>Clear filters</Button>} /></Card>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {shown.map((f) => (
                    <FindingCard key={f.id} f={f} state={stateOf(f)} review={store.reviews[key(f)]} nameOf={nameOf} onReview={() => setReviewing(f)}
                      onReopen={() => { reopenFinding(key(f)); toast.success('Reopened'); }} />
                  ))}
                </ul>
              )}
            </>
          )}

          <CoverageCard coverage={result.coverage} prevMonth={result.prevMonth} />
        </>
      )}

      <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.55 }}>
        The checks never block a run. They inform the person who freezes it. Moves above {PAYCHECK_RULES.swingPct}% are looked at; the limit is company policy and read-only in this preview.
        Figures that rest on a statutory table (minimum wage, the PF and ESI ceilings) carry a confidence tag and need confirming with your advisor.
      </div>

      {reviewing && run && (
        <ReviewModal f={reviewing} name={nameOf(reviewing.employeeIds[0]!)} onClose={() => setReviewing(null)}
          onSave={(note) => {
            const r = markReviewed(key(reviewing), reviewing.signature, note);
            if (r.ok) { toast.success('Marked as reviewed'); setReviewing(null); }
            return r.ok ? null : r.error;
          }} />
      )}
    </div>
  );
}
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>{label}</label>
      {children}
    </div>
  );
}

function FindingCard({ f, state, review, nameOf, onReview, onReopen }: {
  f: Finding; state: ReviewState; review?: PayChecksState['reviews'][string]; nameOf: (id: string) => string; onReview: () => void; onReopen: () => void;
}) {
  return (
    <li data-testid={`finding-${f.id}`} data-state={state} style={{ listStyle: 'none' }}>
      <Card padding={16} style={{ opacity: state === 'reviewed' ? 0.86 : 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <SeverityBadge severity={f.severity} />
            <Badge tone="neutral">{checkLabel(f.kind)}</Badge>
            {f.confidence && <ConfidenceBadge level={f.confidence} />}
            {state === 'reviewed' && <Badge tone="ok" dot>Reviewed</Badge>}
            {state === 'changed' && <Badge tone="warn" dot>Changed since reviewed</Badge>}
          </div>
          <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>{f.title}</h3>
          <Bullets items={f.lines} />
          <Facts items={f.facts} />
          {review && state !== 'open' && (
            <div style={{ fontSize: 13, color: T.dim, borderLeft: `3px solid ${state === 'reviewed' ? T.ok : T.warn}`, paddingLeft: 10, lineHeight: 1.5 }}>
              {state === 'changed' && <div style={{ color: T.warn, fontWeight: 600 }}>The numbers changed after this was reviewed. Look again.</div>}
              <div><b style={{ color: T.text }}>{review.by}</b> on {fmtDateTime(review.at)}: {review.note}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {f.employeeIds.map((id) => (
                <LinkButton key={id} href={`/dashboard/hrms/employees/${id}`} label={`Open employee ${nameOf(id)}`}>Open {nameOf(id)}</LinkButton>
              ))}
            </div>
            {state === 'reviewed'
              ? <Button size="sm" onClick={onReopen} aria-label={`Reopen: ${f.title}`}>Reopen</Button>
              : <Button size="sm" variant="primary" onClick={onReview} aria-label={`Mark reviewed: ${f.title}`}>{state === 'changed' ? 'Review again' : 'Mark reviewed'}</Button>}
          </div>
        </div>
      </Card>
    </li>
  );
}

function ReviewModal({ f, name, onClose, onSave }: { f: Finding; name: string; onClose: () => void; onSave: (note: string) => string | null }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ok = note.trim().length >= 3;
  const submit = () => { if (!ok) { setErr('Add a short note so the next person knows what you decided.'); return; } setErr(onSave(note)); };
  return (
    <Modal title="Mark as reviewed" onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} onClick={submit}>Save review</Button></>}>
      <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}><b>{f.title}</b><div style={{ color: T.dim, marginTop: 4 }}>Reviewing does not change the payslip. It records that a person looked, and what they decided about {name}.</div></div>
      <NoteField id="pc-note" label="What did you decide?" required value={note} onChange={(v) => { setNote(v); setErr(null); }}
        placeholder="For example: Confirmed with the sales head, the bonus is right." hint={ok ? undefined : 'A short note is needed before you can save.'} />
      {err && <div role="alert" style={{ fontSize: 12.5, color: T.red }}>{err}</div>}
    </Modal>
  );
}

function CoverageCard({ coverage, prevMonth }: { coverage: CheckCoverage[]; prevMonth?: string }) {
  const cols: Col<CheckCoverage & { id: string }>[] = [
    { key: 'label', label: 'Check', render: (c) => <b>{c.label}</b>, nowrap: true },
    { key: 'looks', label: 'What it looks at', render: (c) => <span style={{ color: T.dim }}>{c.looksAt}{c.note && <div style={{ color: T.mute, fontSize: 12.5, marginTop: 2 }}>{c.note}</div>}</span> },
    { key: 'examined', label: 'Looked at', align: 'right', render: (c) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.examined} <span style={{ color: T.mute, fontSize: 12 }}>{c.unit}</span></span> },
    { key: 'found', label: 'Findings', align: 'right', render: (c) => <span data-testid={`coverage-found-${c.kind}`} style={{ fontVariantNumeric: 'tabular-nums', color: c.found ? T.warn : T.ok, fontWeight: 600 }}>{c.found}</span> },
  ];
  return (
    <div data-testid="coverage-card"><Card>
      <CardTitle>What was checked</CardTitle>
      <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12 }}>
        Every check runs on every run, even when it finds nothing. {prevMonth ? `Comparisons are against ${fmtMonthLong(prevMonth)}.` : 'There is no earlier run, so the comparison checks are skipped.'}
      </div>
      <DataTable columns={cols} rows={coverage.map((c) => ({ ...c, id: c.kind }))} minWidth={720} />
    </Card></div>
  );
}

