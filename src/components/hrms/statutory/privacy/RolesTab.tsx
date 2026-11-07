'use client';
// Who can see or change which category of data. Read-only: the preview shows the proposed defaults, the real build
// enforces them on the server.

import { Badge, Card, CardTitle, Note, T, type Tone } from '../../ui';
import { Stack } from '../parts';

type Access = 'edit' | 'view' | 'none';
type Cell = { a: Access; scope?: string };
const ROLES = ['HR admin', 'Payroll admin', 'Manager', 'Employee'] as const;
const E = (scope?: string): Cell => ({ a: 'edit', scope });
const V = (scope?: string): Cell => ({ a: 'view', scope });
const N: Cell = { a: 'none' };

const MATRIX: { key: string; label: string; hint: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { key: 'personal', label: 'Personal details', hint: 'Name, contact, address, date of birth', cells: [E(), V(), V('team, work contact only'), E('own record')] },
  { key: 'ids', label: 'Statutory IDs', hint: 'PAN, Aadhaar last four, UAN, ESIC number', cells: [E('reveal asks for a reason'), V('reveal asks for a reason'), N, V('own record')] },
  { key: 'bank', label: 'Bank details', hint: 'Account number, IFSC', cells: [V('masked'), E('reveal asks for a reason'), N, V('own record, masked')] },
  { key: 'salary', label: 'Salary', hint: 'CTC, structure, payslips', cells: [V(), E(), N, V('own payslips')] },
  { key: 'attendance', label: 'Attendance and leave', hint: 'Punches, leave, regularisation', cells: [E(), V(), E('team, to approve'), V('own record')] },
  { key: 'location', label: 'Location', hint: 'Location trail during duty hours', cells: [V('field staff only'), N, V('team, duty hours only'), V('own trail')] },
];

const TONE: Record<Access, Tone> = { edit: 'info', view: 'ok', none: 'neutral' };
const WORD: Record<Access, string> = { edit: 'Can edit', view: 'Can view', none: 'No access' };

export default function RolesTab() {
  return (
    <Stack>
      <Note>Read-only in the preview. These are proposed defaults for discussion, not enforced yet: the real build checks them on the server for every request.</Note>
      <Card padding={0}>
        <div style={{ padding: '16px 18px 4px' }}>
          <CardTitle>Roles and data categories</CardTitle>
          <p style={{ margin: '-6px 0 12px', fontSize: 13.5, color: T.dim }}>
            <b style={{ color: T.text }}>Least privilege:</b> each role gets only the data its job needs, and anything sensitive is shown on request, with a reason, and logged.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="roles-matrix" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Access by role and data category</caption>
            <thead>
              <tr>
                <th scope="col" style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, background: T.panel, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>Data category</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, background: T.panel, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.key}>
                  <th scope="row" style={{ padding: '12px 18px', textAlign: 'left', borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{row.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 400, color: T.mute }}>{row.hint}</div>
                  </th>
                  {row.cells.map((c, i) => (
                    <td key={ROLES[i]} data-testid={`role-${row.key}-${i}`} style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' }}>
                      <Badge tone={TONE[c.a]}>{WORD[c.a]}</Badge>
                      {c.scope && <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>{c.scope}</div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}
