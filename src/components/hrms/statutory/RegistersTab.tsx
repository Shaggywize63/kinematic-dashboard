'use client';
// Statutory registers (muster roll, wage register, overtime register, leave register), each built on demand from the
// sample data, and an inspection pack that says what exists, what range it covers and what is missing.

import { useMemo, useState } from 'react';
import type { HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate, fmtMonth } from '../../../lib/hrms/format';
import { Field, Select } from '../../ui';
import { Badge, Button, Card, CardTitle, Note, T, downloadRows, useIsCompact } from '../ui';
import { PREVIEW_MONTH, REGISTERS, inspectionStatus, monthsIn, toCsv, type RegisterScope } from './builders';
import { downloadZip } from './files';
import { Muted, Stack } from './parts';

export default function RegistersTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const firstMonth = useMemo(() => db.attendance.map((a) => a.month).sort()[0] ?? PREVIEW_MONTH, [db.attendance]);
  const [entityId, setEntityId] = useState('all');
  const [from, setFrom] = useState(firstMonth);
  const [to, setTo] = useState(PREVIEW_MONTH);
  const [generated, setGenerated] = useState<Record<string, number>>({});

  const monthChoices = useMemo(() => monthsIn(firstMonth < from ? firstMonth : from, PREVIEW_MONTH), [firstMonth, from]);
  const scope: RegisterScope = { entityId, from: from <= to ? from : to, to: from <= to ? to : from };
  const built = useMemo(() => REGISTERS.map((r) => ({ reg: r, out: r.build(db, scope) })), [db, entityId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = useMemo(() => inspectionStatus(db, scope), [db, entityId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const keep = db.retention.find((r) => /muster|attendance/i.test(r.dataset));
  const scopeLabel = `${entityId === 'all' ? 'all entities' : db.entities.find((e) => e.id === entityId)?.name ?? ''}, ${fmtMonth(scope.from)} to ${fmtMonth(scope.to)}`;
  const fileSuffix = `${entityId === 'all' ? 'all' : entityId}_${scope.from}_${scope.to}`;
  const exists = status.filter((s) => s.exists).length;

  return (
    <Stack>
      <Card padding={16}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Legal entity" style={{ width: narrow ? '100%' : 260 }}>
            <Select aria-label="Register entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="all">All entities</option>
              {db.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="From month" style={{ width: narrow ? 'calc(50% - 7px)' : 160 }}>
            <Select aria-label="Registers from month" value={from} onChange={(e) => setFrom(e.target.value)}>
              {monthChoices.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </Select>
          </Field>
          <Field label="To month" style={{ width: narrow ? 'calc(50% - 7px)' : 160 }}>
            <Select aria-label="Registers to month" value={to} onChange={(e) => setTo(e.target.value)}>
              {monthChoices.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </Select>
          </Field>
          <Muted style={{ paddingBottom: 9 }}>The same scope applies to every register and to the inspection pack.</Muted>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        {built.map(({ reg, out }) => (
          <Card key={reg.key} padding={18} className="hrms-register">
            <div data-testid={`register-${reg.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{reg.title}</h2>
                <Badge tone={out.rows.length ? 'info' : 'neutral'}>{out.rows.length} {out.rows.length === 1 ? 'row' : 'rows'}</Badge>
              </div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5, flex: 1 }}>{reg.blurb}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" disabled={out.rows.length === 0} aria-label={`Generate ${reg.title}`} style={{ minHeight: 40 }}
                  onClick={() => { downloadRows(`${reg.file}_${fileSuffix}.csv`, out.header, out.rows); setGenerated((g) => ({ ...g, [reg.key]: out.rows.length })); }}>
                  Generate CSV
                </Button>
                {generated[reg.key] != null && <span role="status" style={{ fontSize: 12.5, color: T.ok }}>Generated {generated[reg.key]} rows</span>}
                {out.rows.length === 0 && <span style={{ fontSize: 12.5, color: T.mute }}>No data in this scope.</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle right={
          <Button variant="primary" disabled={exists === 0} aria-label="Download all registers" style={{ minHeight: 40 }}
            onClick={() => {
              const files = built.filter(({ out }) => out.rows.length > 0).map(({ reg, out }) => ({ name: `${reg.file}.csv`, content: toCsv(out.header, out.rows) }));
              const index = [
                'Inspection pack (preview, sample data)',
                `Prepared on ${fmtDate(PREVIEW_TODAY)} for ${scopeLabel}.`,
                '',
                ...status.map((s) => `${s.title}: ${s.exists ? `${s.rows} rows, ${s.range}` : 'not available'}${s.missing.length ? `. Missing: ${s.missing.join(' ')}` : ''}`),
                '',
                keep ? `Retention rule on file: ${keep.dataset}, ${keep.keepYears} years (${keep.basis}). To be confirmed with counsel.` : 'No retention rule on file for registers.',
              ].join('\n');
              downloadZip(`inspection-pack_${fileSuffix}.zip`, [...files, { name: 'README.txt', content: index }]);
            }}>
            Download all (zip)
          </Button>
        }>
          Inspection pack
        </CardTitle>
        <Muted style={{ marginTop: -6, marginBottom: 14 }}>
          What an inspector could be shown for {scopeLabel}. Registers are built from the sample data when you ask; nothing is stored. The zip holds one CSV for each register that has data and a README listing the gaps.
        </Muted>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {status.map((s, i) => (
            <div key={s.key} data-testid={`pack-${s.key}`} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '200px 1fr', gap: narrow ? 6 : 16, padding: '12px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{s.title}</div>
                <div style={{ marginTop: 4 }}><Badge tone={s.exists ? 'ok' : 'red'} dot>{s.exists ? 'Available' : 'Missing'}</Badge></div>
              </div>
              <div style={{ fontSize: 13, color: T.dim, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>{s.exists ? `${s.rows} rows · ${s.range}` : s.range}</div>
                {s.missing.length > 0
                  ? <ul style={{ margin: 0, paddingLeft: 16, color: T.warn }}>{s.missing.map((m, k) => <li key={k}>{m}</li>)}</ul>
                  : <div style={{ color: T.mute }}>Nothing missing for this scope.</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Note tone="warn">
            Retention: registers are to be kept for {keep ? keep.keepYears : 5} years (as reported). {keep ? `The rule on file reads “${keep.basis}”.` : ''} This is not legal advice, so confirm the period and the form of each register with counsel.
          </Note>
        </div>
      </Card>
    </Stack>
  );
}
