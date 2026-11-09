'use client';
// Edit the plan: planned headcount for every plan line (department at a location) and month, plus the planned average
// CTC per head for each department. Saved changes are what the Recruitment page reads as approved headcount.

import { useState } from 'react';
import { Button, Modal, Note, T } from '../ui';
import { Input, Select } from '../../ui';
import { fmtMonth, inrShort } from '../../../lib/hrms/format';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { HiringState } from '../../../lib/hrms/hiring/types';
import { FY_END, fiscalMonths } from '../../../lib/hrms/hiring/engines';
import { addPlanLine, savePlanCells, setAvgCtc } from '../../../lib/hrms/hiring/store';
import { Row, report, subtle, toast } from './shared';

export default function EditPlanModal({ db, st, onClose }: { db: HrmsDb; st: HiringState; onClose: () => void }) {
  const months = fiscalMonths();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [ctc, setCtc] = useState<Record<string, string>>({});
  const [dep, setDep] = useState('');
  const [loc, setLoc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const key = (lineId: string, m: string) => `${lineId}@${m}`;
  const valueOf = (lineId: string, m: string) => draft[key(lineId, m)] ?? String(st.plan.lines.find((l) => l.id === lineId)?.months[m] ?? 0);
  const changes = Object.entries(draft).flatMap(([k, v]) => {
    const [lineId, m] = k.split('@') as [string, string];
    const was = st.plan.lines.find((l) => l.id === lineId)?.months[m] ?? 0;
    return v.trim() !== '' && Number(v) !== was ? [{ lineId, month: m, value: Number(v) }] : [];
  });
  const ctcChanges = db.departments.filter((d) => ctc[d.id] != null && Number(ctc[d.id]!.replace(/,/g, '')) !== (st.plan.avgCtc[d.id] ?? 0));
  const nothing = changes.length === 0 && ctcChanges.length === 0;
  const lineLabel = (id: string) => { const l = st.plan.lines.find((x) => x.id === id)!; return `${db.departments.find((d) => d.id === l.departmentId)?.name} · ${db.locations.find((x) => x.id === l.locationId)?.name}`; };

  const save = () => {
    if (changes.length) { const r = savePlanCells(changes); if (!r.ok) { setErr(r.error); return; } }
    for (const d of ctcChanges) { const r = setAvgCtc(d.id, Number(ctc[d.id]!.replace(/,/g, ''))); if (!r.ok) { setErr(r.error); return; } }
    toast.success('Plan saved. Recruitment will use the new approved headcount.');
    onClose();
  };

  return (
    <Modal title="Edit the workforce plan" width={1040} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={nothing} onClick={save}>Save plan</Button></>}>
      <div data-testid="edit-plan" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={subtle}>One row for each department at a location. Type the planned headcount for each month. The {fmtMonth(FY_END)} column is the year-end number that sets how many seats an opening may ask for.</div>
        <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%' }}>
            <thead><tr>
              <th scope="col" style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: T.panel, minWidth: 200 }}>Plan line</th>
              {months.map((m) => <th key={m} scope="col" style={{ ...th, background: m === FY_END ? T.infoWash : T.panel }}>{fmtMonth(m).slice(0, 3)}{m.endsWith('-01') ? ` ${m.slice(2, 4)}` : ''}</th>)}
            </tr></thead>
            <tbody>
              {st.plan.lines.map((l) => (
                <tr key={l.id}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 600, position: 'sticky', left: 0, background: T.card }}>{lineLabel(l.id)}</th>
                  {months.map((m) => (
                    <td key={m} style={{ ...td, background: m === FY_END ? T.infoWash : undefined }}>
                      <Input aria-label={`${lineLabel(l.id)}, ${fmtMonth(m)}`} inputMode="numeric" value={valueOf(l.id, m)} onChange={(e) => { setDraft((d) => ({ ...d, [key(l.id, m)]: e.target.value.replace(/[^0-9]/g, '') })); setErr(null); }}
                        style={{ width: 54, height: 32, padding: '0 6px', textAlign: 'center', fontFamily: T.mono }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 13.5, color: T.text }}>Add a plan line</b>
          <Row>
            <div style={{ width: 200 }}><Select aria-label="New line department" value={dep} onChange={(e) => setDep(e.target.value)}><option value="">Department</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
            <div style={{ width: 220 }}><Select aria-label="New line location" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Location</option>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div>
            <Button disabled={!dep || !loc} onClick={() => { if (report(addPlanLine(dep, loc), 'Plan line added, starting from the people already there.')) { setDep(''); setLoc(''); } }}>Add line</Button>
          </Row>
          <div style={subtle}>A new line starts at the headcount already there or joining, so it does not begin as a gap. Then change the months you want.</div>
        </div>

        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontSize: 13.5, color: T.text }}>Planned average CTC per head</b>
          <div style={subtle}>Annual rupees. The budget view multiplies the planned headcount by this to get the planned spend.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {db.departments.map((d) => (
              <label key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: T.dim }}>
                {d.name} <span style={{ color: T.mute }}>now {inrShort(st.plan.avgCtc[d.id] ?? 0)}</span>
                <Input aria-label={`Average CTC, ${d.name}`} inputMode="numeric" value={ctc[d.id] ?? String(st.plan.avgCtc[d.id] ?? '')} onChange={(e) => { setCtc((c) => ({ ...c, [d.id]: e.target.value })); setErr(null); }} />
              </label>
            ))}
          </div>
        </div>
        {err && <Note tone="red">{err}</Note>}
      </div>
    </Modal>
  );
}
const th: React.CSSProperties = { padding: '8px 6px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap', background: T.panel };
const td: React.CSSProperties = { padding: '5px 6px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, textAlign: 'center' };
