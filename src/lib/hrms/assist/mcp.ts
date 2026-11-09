// Design preview of how the same HR data could be offered to an AI assistant through the Model Context Protocol (MCP).
// There is no MCP server here. This file holds the tool list, the JSON input schemas, the permission scope each role
// needs, and a local runner that calls the same engine the chat uses. Nothing leaves the browser.

import type { HrmsDb } from '../types';
import { execute, findPolicy } from './engine';
import type { AssistOptions, EngineResult, IntentId, Role, Slots, Who } from './types';

export type ToolName = 'get_leave_balance' | 'apply_leave_draft' | 'get_payslip_summary' | 'list_team_leave' | 'get_policy' | 'get_holidays';

export interface JsonSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'integer' | 'boolean'; description: string; enum?: string[]; pattern?: string; minimum?: number; maximum?: number }>;
  required?: string[];
  additionalProperties: false;
}
export interface McpTool {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  intent: IntentId;
  /** Permission scope each role needs. "none" means the tool is refused for that role. */
  scopes: Record<Role, string>;
  example: Record<string, unknown>;
}

const ISO = '^\\d{4}-\\d{2}-\\d{2}$';
const MONTH = '^\\d{4}-\\d{2}$';

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_leave_balance', title: 'Get leave balance', intent: 'leave_balance',
    description: 'Leave days available per leave type. Without employee_id it returns the caller\'s own balance.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        employee_id: { type: 'string', description: 'Employee id, for example emp_7. Managers: direct reports only. HR: anyone.' },
        leave_type: { type: 'string', description: 'Leave code to narrow the answer.', enum: ['CL', 'SL', 'EL', 'CO', 'LWP'] },
      },
    },
    scopes: { employee: 'leave:read:self', manager: 'leave:read:self, leave:read:reports', hr: 'leave:read:all' },
    example: { leave_type: 'CL' },
  },
  {
    name: 'apply_leave_draft', title: 'Prepare a leave request (draft)', intent: 'apply_leave',
    description: 'Checks dates, balance and holidays and returns a draft. It never submits. The person confirms in the app.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['from'],
      properties: {
        from: { type: 'string', description: 'First day, YYYY-MM-DD.', pattern: ISO },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD. Defaults to the first day.', pattern: ISO },
        leave_type: { type: 'string', description: 'Leave code. Chosen for the person if left out.', enum: ['CL', 'SL', 'EL', 'CO', 'LWP'] },
        half_day: { type: 'boolean', description: 'Half day. Only valid for a single day.' },
      },
    },
    scopes: { employee: 'leave:draft:self', manager: 'leave:draft:self', hr: 'leave:draft:self' },
    example: { from: '2026-11-10', to: '2026-11-11' },
  },
  {
    name: 'get_payslip_summary', title: 'Get payslip summary', intent: 'payslip_summary',
    description: 'Gross, deductions and net pay for one month, from a released pay run. Own payslip only over MCP.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the latest released month.', pattern: MONTH },
        employee_id: { type: 'string', description: 'Accepted but refused for any other person: other people\'s pay is never exposed over MCP.' },
      },
    },
    scopes: { employee: 'pay:read:self', manager: 'pay:read:self', hr: 'pay:read:self' },
    example: { month: '2026-10' },
  },
  {
    name: 'list_team_leave', title: 'List team leave', intent: 'team_leave',
    description: 'Leave booked in the next few days for a manager\'s direct reports, or for everyone when HR asks.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { window_days: { type: 'integer', description: 'How many days ahead to look.', minimum: 1, maximum: 31 } },
    },
    scopes: { employee: 'none', manager: 'leave:read:reports', hr: 'leave:read:all' },
    example: { window_days: 7 },
  },
  {
    name: 'get_policy', title: 'Look up a policy', intent: 'policy',
    description: 'Title, version, effective date and summary of the policy that matches a topic. Full text stays in the Policies page.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['topic'],
      properties: { topic: { type: 'string', description: 'A topic or policy name, for example "travel" or "work from home".' } },
    },
    scopes: { employee: 'policy:read', manager: 'policy:read', hr: 'policy:read' },
    example: { topic: 'travel' },
  },
  {
    name: 'get_holidays', title: 'Get holidays', intent: 'holidays',
    description: 'Public holidays on the caller\'s location list, for a month or the next two months.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { month: { type: 'string', description: 'Month as YYYY-MM.', pattern: MONTH } },
    },
    scopes: { employee: 'calendar:read', manager: 'calendar:read', hr: 'calendar:read' },
    example: { month: '2026-12' },
  },
];

export const MCP_NEVER_EXPOSED: { what: string; why: string }[] = [
  { what: 'Other people\'s pay (payslips, CTC, bank details)', why: 'Pay data stays in the Payroll module. Over MCP every role, including HR, can read only its own.' },
  { what: 'Full Aadhaar, full PAN, bank account numbers', why: 'Only the last four digits of Aadhaar are kept in this product. The others are masked or left out.' },
  { what: 'POSH complaint details and the names in a complaint', why: 'Visible only to Internal Committee members in the live product.' },
  { what: 'Medical notes and the reason for sick leave', why: 'Health information is not needed to answer a leave question.' },
  { what: 'Performance ratings and any score for a person', why: 'No ranking or scoring of individuals through an assistant.' },
  { what: 'Writes of any kind', why: 'Tools return drafts and answers. A person confirms every change inside the app.' },
];

export const toolByName = (n: string): McpTool | undefined => MCP_TOOLS.find((t) => t.name === n);

// ───────────────────────────── validation ─────────────────────────────
/** A small check of the arguments against the tool's JSON schema (required, type, enum, pattern, range, unknown keys). */
export function validateArgs(tool: McpTool, args: unknown): string[] {
  const errs: string[] = [];
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return ['Arguments must be a JSON object.'];
  const a = args as Record<string, unknown>;
  const props = tool.inputSchema.properties;
  for (const r of tool.inputSchema.required ?? []) if (a[r] === undefined || a[r] === '') errs.push(`"${r}" is required.`);
  for (const [k, v] of Object.entries(a)) {
    const p = props[k];
    if (!p) { errs.push(`"${k}" is not an argument of ${tool.name}.`); continue; }
    if (v === undefined) continue;
    if (p.type === 'string' && typeof v !== 'string') errs.push(`"${k}" must be a string.`);
    else if (p.type === 'boolean' && typeof v !== 'boolean') errs.push(`"${k}" must be true or false.`);
    else if (p.type === 'integer' && !(typeof v === 'number' && Number.isInteger(v))) errs.push(`"${k}" must be a whole number.`);
    else {
      if (p.enum && !p.enum.includes(String(v))) errs.push(`"${k}" must be one of ${p.enum.join(', ')}.`);
      if (p.pattern && typeof v === 'string' && !new RegExp(p.pattern).test(v)) errs.push(`"${k}" does not match the format ${p.pattern}.`);
      if (typeof v === 'number') {
        if (p.minimum !== undefined && v < p.minimum) errs.push(`"${k}" must be at least ${p.minimum}.`);
        if (p.maximum !== undefined && v > p.maximum) errs.push(`"${k}" must be at most ${p.maximum}.`);
      }
    }
  }
  return errs;
}

// ───────────────────────────── running a tool ─────────────────────────────
export interface McpCallResult {
  /** The shape of an MCP tools/call result. */
  result: { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError: boolean; _meta?: Record<string, unknown> };
  outcome: 'ok' | 'denied' | 'error';
  records: number;
  note?: string;
}

const errorResult = (text: string, code: string, outcome: McpCallResult['outcome']): McpCallResult => (
  { result: { content: [{ type: 'text', text }], isError: true, _meta: { code } }, outcome, records: 0, note: text }
);

export function runTool(db: HrmsDb, who: Who, toolName: string, args: unknown, opts: AssistOptions = {}): McpCallResult {
  const tool = toolByName(toolName);
  if (!tool) return errorResult(`Unknown tool "${toolName}".`, 'method_not_found', 'error');
  const errs = validateArgs(tool, args ?? {});
  if (errs.length) return errorResult(errs.join(' '), 'invalid_params', 'error');
  if (tool.scopes[who.role] === 'none') {
    return errorResult(`${tool.name} needs the manager or HR scope. Your role (${who.role}) does not have it.`, 'forbidden', 'denied');
  }
  const a = (args ?? {}) as Record<string, string | number | boolean | undefined>;
  const slots: Slots = { subject: { kind: 'self' } };
  if (tool.name === 'get_leave_balance' || tool.name === 'get_payslip_summary') {
    if (typeof a.employee_id === 'string' && a.employee_id !== who.employeeId) slots.subject = { kind: 'person', id: a.employee_id };
    if (typeof a.leave_type === 'string') slots.leaveCode = a.leave_type;
    if (typeof a.month === 'string') slots.month = a.month;
  }
  if (tool.name === 'apply_leave_draft') {
    slots.from = String(a.from); slots.to = typeof a.to === 'string' ? a.to : undefined;
    if (typeof a.leave_type === 'string') slots.leaveCode = a.leave_type;
    if (a.half_day === true) slots.half = true;
  }
  if (tool.name === 'list_team_leave') {
    slots.subject = who.role === 'hr' ? { kind: 'all' } : { kind: 'team' };
    slots.days = typeof a.window_days === 'number' ? a.window_days : 7;
  }
  if (tool.name === 'get_policy') slots.policyId = findPolicy(String(a.topic), opts.policies)?.id;
  if (tool.name === 'get_holidays' && typeof a.month === 'string') slots.month = a.month;

  const r: EngineResult = execute(db, who, tool.intent, slots, { ...opts, channel: 'mcp' });
  if (r.outcome === 'refused') return errorResult(r.refused ?? 'Refused.', 'forbidden', 'denied');
  if (tool.name === 'get_policy' && !slots.policyId) return errorResult(`No policy matches "${String(a.topic)}". Try a word like leave, travel, attendance or POSH.`, 'not_found', 'error');
  if (tool.name === 'apply_leave_draft') {
    const draft = r.actions?.find((x) => x.kind === 'confirm_leave');
    return {
      result: {
        content: [{ type: 'text', text: r.answer }],
        structuredContent: { intent: r.intent, status: draft ? 'draft_ready' : 'not_ready', submitted: false, draft: draft && draft.kind === 'confirm_leave' ? draft.draft : null, used_data: r.usedData },
        isError: false,
      },
      outcome: 'ok', records: r.usedData.length, note: 'Draft only. Nothing was submitted.',
    };
  }
  return {
    result: {
      content: [{ type: 'text', text: r.answer }],
      structuredContent: { intent: r.intent, outcome: r.outcome, used_data: r.usedData },
      isError: false,
    },
    outcome: 'ok', records: r.usedData.length,
  };
}

/** Role scope table for the page: one row per tool. */
export function scopeTable(): { tool: McpTool; cells: Record<Role, string> }[] {
  return MCP_TOOLS.map((tool) => ({ tool, cells: tool.scopes }));
}
