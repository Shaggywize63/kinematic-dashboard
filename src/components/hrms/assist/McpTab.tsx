'use client';
// HR assistant, "Ask Kinematic (MCP)" tab: a design preview of how the same HR data could be offered to an AI assistant
// through the Model Context Protocol. There is no MCP server. The "Try a tool" form runs the same engine locally.

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Note, T, useIsCompact, type Col } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDateTime, fullName } from '../../../lib/hrms/format';
import { policyRefs } from '../../../lib/hrms/assist/policies';
import { MCP_NEVER_EXPOSED, MCP_TOOLS, runTool, toolByName } from '../../../lib/hrms/assist/mcp';
import { PERSONAS, logMcpCall, personaWho, setPersona } from '../../../lib/hrms/assist/store';
import type { AssistState, McpLogEntry, PolicyState } from '../../../lib/hrms/assist/types';
import { CodeBlock, CopyButton, Labelled, SimNote, textAreaStyle } from './shared';

export default function McpTab({ db, assist, policy }: { db: HrmsDb; assist: AssistState; policy: PolicyState }) {
  const narrow = useIsCompact(800);
  const [tool, setTool] = useState(MCP_TOOLS[0]!.name as string);
  const [args, setArgs] = useState(JSON.stringify(MCP_TOOLS[0]!.example, null, 2));
  const [out, setOut] = useState<{ text: string; outcome: 'ok' | 'denied' | 'error' } | null>(null);
  const who = personaWho(assist.persona);
  const t = toolByName(tool)!;
  useEffect(() => { setArgs(JSON.stringify(t.example, null, 2)); setOut(null); }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    let parsed: unknown;
    try { parsed = args.trim() ? JSON.parse(args) : {}; } catch {
      setOut({ text: 'The arguments are not valid JSON. Check the quotes and commas.', outcome: 'error' });
      return;
    }
    const r = runTool(db, who, tool, parsed, { leaveRequests: assist.leaveRequests, policies: policyRefs(policy.policies) });
    setOut({ text: JSON.stringify(r.result, null, 2), outcome: r.outcome });
    logMcpCall({ client: 'Try a tool (this page)', employeeId: who.employeeId, role: who.role, tool, args: JSON.stringify(parsed), outcome: r.outcome, records: r.records, note: r.note });
  };

  const nameOf = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : id; };
  const logCols: Col<McpLogEntry>[] = [
    { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at), nowrap: true },
    { key: 'client', label: 'Client', render: (r) => r.client, nowrap: true },
    { key: 'as', label: 'On behalf of', render: (r) => `${nameOf(r.employeeId)} (${r.role})`, nowrap: true },
    { key: 'tool', label: 'Tool', render: (r) => <code style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.tool}</code>, nowrap: true },
    { key: 'args', label: 'Arguments', render: (r) => <code style={{ fontFamily: T.mono, fontSize: 12 }}>{r.args}</code> },
    { key: 'outcome', label: 'Result', render: (r) => <Badge tone={r.outcome === 'ok' ? 'ok' : r.outcome === 'denied' ? 'red' : 'warn'} dot>{r.outcome === 'ok' ? 'Allowed' : r.outcome === 'denied' ? 'Denied' : 'Error'}</Badge>, nowrap: true },
    { key: 'records', label: 'Records', align: 'right', render: (r) => r.records },
    { key: 'note', label: 'Note', render: (r) => <span style={{ color: T.dim, display: 'inline-block', minWidth: 260 }}>{r.note ?? ''}</span> },
  ];
  const roleCols = useMemo(() => (['employee', 'manager', 'hr'] as const), []);

  return (
    <div data-testid="mcp-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SimNote testid="mcp-preview" title="DESIGN PREVIEW">
        This is a design for how the same data could be shared with an AI assistant through the Model Context Protocol (MCP). It is not a live MCP server. No server is running and no AI assistant is connected.
        The “Try a tool” form below calls the same local rules as the chat, so you can see what each role would get back.
      </SimNote>

      <Card padding={16}>
        <CardTitle>How it would work</CardTitle>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: T.text, lineHeight: 1.5 }}>
          <li>An employee connects an AI assistant to Kinematic and signs in as themselves.</li>
          <li>The assistant is told only about the tools that person&apos;s role may use.</li>
          <li>Each call runs the same checks as the chat: own data for employees, direct reports for managers, anyone for HR, and never other people&apos;s pay.</li>
          <li>Every call is written to an audit log, including the ones that were denied.</li>
        </ol>
      </Card>

      <Card padding={16}>
        <CardTitle>Tools</CardTitle>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
          {MCP_TOOLS.map((x) => {
            const schema = JSON.stringify(x.inputSchema, null, 2);
            return (
              <div key={x.name} data-testid={`mcp-tool-${x.name}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 700, color: T.text }}>{x.name}</code>
                  <CopyButton text={schema} label={`Copy the input schema of ${x.name}`} testid={`copy-${x.name}`} />
                </div>
                <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.5 }}>{x.description}</div>
                <CodeBlock maxHeight={200}>{schema}</CodeBlock>
              </div>
            );
          })}
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>Permission scope each tool needs, by role</CardTitle>
        <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
          <table data-testid="mcp-scopes" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>{['Tool', 'Employee', 'Manager', 'HR'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, background: T.panel, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {MCP_TOOLS.map((x) => (
                <tr key={x.name}>
                  <td style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}` }}><code style={{ fontFamily: T.mono, fontSize: 12.5 }}>{x.name}</code></td>
                  {roleCols.map((r) => (
                    <td key={r} style={{ padding: '9px 12px', borderTop: `1px solid ${T.border}`, fontSize: 13 }}>
                      {x.scopes[r] === 'none' ? <Badge tone="red">Not allowed</Badge> : <code style={{ fontFamily: T.mono, fontSize: 12 }}>{x.scopes[r]}</code>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>Never exposed</CardTitle>
        <ul data-testid="mcp-never" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
          {MCP_NEVER_EXPOSED.map((n) => (
            <li key={n.what} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: T.text }}>{n.what}</div>
              <div style={{ fontSize: 13, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>{n.why}</div>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding={16}>
        <CardTitle right={<Badge tone="warn" mono>SIMULATION</Badge>}>Try a tool</CardTitle>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Labelled label="On behalf of" htmlFor="mcp-persona">
              <Select id="mcp-persona" value={assist.persona} onChange={(e) => setPersona(e.target.value)}>
                {PERSONAS.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.label}</option>)}
              </Select>
            </Labelled>
            <Labelled label="Tool" htmlFor="mcp-tool">
              <Select id="mcp-tool" data-testid="mcp-tool" value={tool} onChange={(e) => setTool(e.target.value)}>
                {MCP_TOOLS.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </Select>
            </Labelled>
            <Labelled label="Arguments (JSON)" htmlFor="mcp-args">
              <textarea id="mcp-args" data-testid="mcp-args" value={args} onChange={(e) => setArgs(e.target.value)} rows={7} spellCheck={false} style={{ ...textAreaStyle, fontFamily: T.mono, fontSize: 13 }} />
            </Labelled>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={run} data-testid="mcp-run">Run locally</Button>
              <Button onClick={() => setArgs(JSON.stringify(t.example, null, 2))}>Reset arguments</Button>
            </div>
            <div style={{ fontSize: 12.5, color: T.mute }}>Try asking for another person&apos;s payslip, for example <code style={{ fontFamily: T.mono }}>{'{"employee_id":"emp_7"}'}</code> on get_payslip_summary, to see a denial.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>Result</div>
            {out ? (
              <>
                <div><Badge tone={out.outcome === 'ok' ? 'ok' : out.outcome === 'denied' ? 'red' : 'warn'} dot>{out.outcome === 'ok' ? 'Allowed' : out.outcome === 'denied' ? 'Denied' : 'Error'}</Badge></div>
                <CodeBlock testid="mcp-result" maxHeight={360}>{out.text}</CodeBlock>
              </>
            ) : <div style={{ fontSize: 13.5, color: T.dim }}>Press “Run locally”. The result appears here as the JSON a client would receive.</div>}
          </div>
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>Audit log of calls</CardTitle>
        <div style={{ fontSize: 13, color: T.dim, marginBottom: 10 }}>The first rows are sample history. Calls from the form above are added at the top.</div>
        <div data-testid="mcp-log">
          <DataTable columns={logCols} rows={assist.mcpLog} minWidth={1200} empty="No calls yet." />
        </div>
      </Card>
      <Note>Nothing on this tab changes any HR record. The only thing stored is the audit log above, in this browser.</Note>
    </div>
  );
}
