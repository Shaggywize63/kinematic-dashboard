'use client';
// One filing on the autopilot: due label, readiness, blockers, and the checklist behind the readiness figure.

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, ProgressBar, StatusBadge, T } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { KIND_LABEL, LATE_NOTE, type Check, type Readiness } from '../../../lib/hrms/control/autopilot';
import { fullName } from '../../../lib/hrms/format';
import { Conf, Muted, Row } from './parts';

export function CheckList({ checks, onManual, employees }: { checks: Check[]; onManual: (id: string, v: boolean) => void; employees: HrmsDb['employees'] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {checks.map((c) => (
        <li key={c.id} data-testid={`check-${c.id}`} data-passed={c.passed ? 'yes' : 'no'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {c.kind === 'manual' ? (
            <input type="checkbox" aria-label={c.label} checked={c.passed} onChange={(e) => onManual(c.id, e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--info)', flex: '0 0 auto' }} />
          ) : (
            <span aria-hidden style={{ width: 18, height: 18, borderRadius: 999, flex: '0 0 auto', marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: c.passed ? T.okWash : c.severity === 'blocker' ? T.redWash : T.warnWash, color: c.passed ? T.ok : c.severity === 'blocker' ? T.red : T.warn }}>{c.passed ? '✓' : '!'}</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}>
              {c.label}
              {!c.passed && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: c.severity === 'blocker' ? T.red : T.warn }}>{c.kind === 'manual' ? 'Confirm by hand' : c.severity === 'blocker' ? 'Blocker' : 'Warning'}</span>}
              {c.kind === 'manual' && c.passed && <span style={{ marginLeft: 8, fontSize: 11.5, color: T.ok }}>Confirmed</span>}
            </div>
            {c.detail && <Muted>{c.detail}</Muted>}
            {c.people.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12.5, color: T.dim, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {c.people.slice(0, 6).map((p) => <li key={p.employeeId}><PersonLink employees={employees} id={p.employeeId} href={p.href} /> {p.note}</li>)}
                {c.people.length > 6 && <li>and {c.people.length - 6} more</li>}
              </ul>
            )}
            {c.link && <div style={{ marginTop: 4 }}><Link href={c.link.href} style={{ fontSize: 12.5, color: T.info }}>{c.link.label}</Link></div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PersonLink({ id, href, employees }: { id: string; href: string; employees: HrmsDb['employees'] }) {
  const e = employees.find((x) => x.id === id);
  return <Link href={href} style={{ color: T.text, fontWeight: 600 }}>{e ? fullName(e) : id}</Link>;
}

export default function AutoCard({ db, r, onManual, onPrepare, onFile }: {
  db: HrmsDb; r: Readiness; onManual: (checkId: string, v: boolean) => void; onPrepare: () => void; onFile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = r.task;
  const entity = db.entities.find((e) => e.id === t.entityId);
  const tone = r.blockers.length ? 'red' : r.pct < 100 ? 'warn' : 'ok';
  const firstBlocker = r.blockers.flatMap((b) => b.people.length ? b.people.map((p) => `${(db.employees.find((e) => e.id === p.employeeId) ? fullName(db.employees.find((e) => e.id === p.employeeId)!) : p.employeeId)}`) : [b.detail ?? b.label]).slice(0, 3);
  return (
    <div data-testid={`task-${t.id}`}>
      <Card padding={18}>
        <Row gap={8} style={{ marginBottom: 8 }}>
          <Badge tone="neutral" mono>{t.law}</Badge>
          <StatusBadge status={r.status} label={r.dueLabel} />
          <span style={{ fontSize: 12.5, color: T.dim }}>{entity?.name}{t.state ? `, ${t.state}` : ''}</span>
        </Row>
        <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>{t.name}</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <ProgressBar pct={r.pct} tone={tone} height={8} />
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 5 }} data-testid={`readiness-${t.id}`}>
              Readiness {r.pct}%: {r.passed} of {r.total} checks pass{r.blockers.length ? `, ${r.blockers.length} ${r.blockers.length === 1 ? 'blocker' : 'blockers'}` : ''}
            </div>
          </div>
          <div style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, color: tone === 'red' ? T.red : tone === 'warn' ? T.warn : T.ok, fontVariantNumeric: 'tabular-nums' }}>{r.pct}%</div>
        </div>
        {r.facts.length > 0 && (
          <Row gap={14} style={{ marginTop: 10 }}>
            {r.facts.map((f) => <span key={f.label} style={{ fontSize: 12.5, color: T.dim }}>{f.label}: <b style={{ color: T.text }}>{f.value}</b></span>)}
          </Row>
        )}
        {r.blockers.length > 0 && (
          <div role="note" style={{ marginTop: 10, padding: '8px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }} data-testid={`blockers-${t.id}`}>
            Blocking: {firstBlocker.join(', ')}{r.blockers.reduce((n, b) => n + Math.max(1, b.people.length), 0) > 3 ? ' and more' : ''}
          </div>
        )}
        {r.notes.map((n) => <Muted key={n} style={{ marginTop: 8 }}>{n}</Muted>)}
        <Row gap={8} style={{ marginTop: 14 }}>
          <Button size="sm" variant="primary" onClick={onPrepare} data-testid={`prepare-${t.id}`} aria-label={`Prepare: ${t.name}`}>Prepare</Button>
          <Button size="sm" onClick={onFile} data-testid={`file-${t.id}`} aria-label={`Mark filed: ${t.name}`}>Mark filed</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={`checks-${t.id}`} aria-label={`${open ? 'Hide' : 'Show'} the checklist: ${t.name}`}>{open ? 'Hide checklist' : 'Checklist'}</Button>
        </Row>
        {open && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CheckList checks={r.checks} onManual={onManual} employees={db.employees} />
            <div style={{ background: T.raised, borderRadius: T.radius.md, padding: '10px 12px' }}>
              <Row gap={8}><b style={{ fontSize: 13, color: T.text }}>If it is late</b><Conf level="indicative" /></Row>
              <div style={{ fontSize: 13, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>{LATE_NOTE[r.kind]}</div>
              <Muted style={{ marginTop: 4 }}>This is general guidance, not advice. Confirm {KIND_LABEL[r.kind].toLowerCase()} rules with your advisor.</Muted>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
