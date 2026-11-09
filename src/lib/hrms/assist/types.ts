// Types for the assistant, policies and org chart pages. Pure data shapes: no React, no storage.

import type { Gender, Id, ISODate, Month } from '../types';
import type { Confidence } from '../rules';

// ───────────────────────────── assistant ─────────────────────────────
export type Role = 'employee' | 'manager' | 'hr';
export interface Who { employeeId: Id; role: Role }

export type IntentId =
  | 'greeting' | 'help' | 'thanks'
  | 'leave_balance' | 'apply_leave' | 'team_leave' | 'attendance'
  | 'payslip_summary' | 'payslip_download' | 'salary_date' | 'pf_uan' | 'tax_tds'
  | 'holidays' | 'who_manager' | 'my_team' | 'shift_today' | 'policy'
  | 'unknown';

export type Subject =
  | { kind: 'self' }
  | { kind: 'person'; id: Id }
  | { kind: 'team' }
  | { kind: 'all' };

export interface Slots {
  subject: Subject;
  /** Names in the text that could be more than one person. The engine asks instead of guessing. */
  ambiguous?: string[];
  month?: Month;
  /** Set when the text said "next holiday" or similar rather than a month. */
  holidayNext?: boolean;
  leaveCode?: string;
  from?: ISODate;
  to?: ISODate;
  days?: number;
  half?: boolean;
  policyId?: Id;
}

export interface LeaveDraft {
  employeeId: Id;
  leaveTypeId: Id;
  leaveCode: string;
  leaveName: string;
  from: ISODate;
  to: ISODate;
  days: number;
  half: boolean;
  reason: string;
  approverId?: Id;
}

export type ChatAction =
  | { kind: 'confirm_leave'; label: string; draft: LeaveDraft }
  | { kind: 'dismiss'; label: string }
  | { kind: 'download_payslip'; label: string; employeeId: Id; month: Month }
  | { kind: 'open_page'; label: string; href: string };

export type Outcome = 'answered' | 'refused' | 'unknown' | 'needs_info';

export interface EngineResult {
  intent: IntentId;
  /** 0 to 1. A rough guide to how clearly the text matched, not a probability. */
  confidence: number;
  outcome: Outcome;
  /** Plain text. Rupees are written with inr(). */
  answer: string;
  /** Which records the engine read to build the answer. Shown to the person as chips. */
  usedData: string[];
  actions?: ChatAction[];
  /** The reason, when the question was outside the person's role. */
  refused?: string;
  /** Quick replies the person can tap next. */
  suggestions: string[];
  /** Whose data the answer is about. */
  subjectId?: Id;
  /** Set when pay data about someone other than the asker was shown, so the screen can write an access-log row. */
  sensitive?: { employeeId: Id; field: string };
  slots: Slots;
}

export interface PolicyRef { id: Id; title: string; version: string; effectiveFrom: ISODate; summary: string; keywords: string[] }

export interface AssistLeaveRequest {
  id: Id;
  employeeId: Id;
  leaveTypeId: Id;
  leaveCode: string;
  from: ISODate;
  to: ISODate;
  days: number;
  half: boolean;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  via: 'whatsapp' | 'voice' | 'mcp' | 'seed';
}

export interface AssistOptions {
  /** Defaults to PREVIEW_TODAY. */
  today?: ISODate;
  policies?: PolicyRef[];
  leaveRequests?: AssistLeaveRequest[];
  /** What the last bot answer was waiting for, so a short reply like "tomorrow" continues the leave request. */
  prev?: { intent: IntentId; slots: Slots };
  /** Over MCP, other people's pay is refused for every role. */
  channel?: 'chat' | 'voice' | 'mcp';
}

export interface StoredResult {
  intent: IntentId;
  outcome: Outcome;
  usedData: string[];
  records: number;
  refused?: string;
  actions?: ChatAction[];
  /** Once an action has been used or dismissed it is not offered again. */
  actionState?: 'done' | 'dismissed';
  suggestions?: string[];
  slots?: Slots;
}
export interface ChatMessage {
  id: Id;
  from: 'user' | 'bot' | 'system';
  text: string;
  at: string;
  result?: StoredResult;
}

export interface McpLogEntry {
  id: Id;
  at: string;
  client: string;
  employeeId: Id;
  role: Role;
  tool: string;
  args: string;
  outcome: 'ok' | 'denied' | 'error';
  records: number;
  note?: string;
}

export interface AssistState {
  version: number;
  persona: Id;
  conversations: Record<Id, ChatMessage[]>;
  leaveRequests: AssistLeaveRequest[];
  mcpLog: McpLogEntry[];
  lastVoice: { lang: string; idx: number } | null;
}

// ───────────────────────────── policies ─────────────────────────────
export type PolicyAudience = { kind: 'all' } | { kind: 'departments'; ids: Id[] };

export interface PolicyVersion {
  version: string;
  effectiveFrom: ISODate;
  publishedOn: ISODate;
  publishedBy: string;
  changeSummary: string;
  requiresAck: boolean;
  text: string;
}
export interface LegalRef { text: string; confidence: Confidence }
export interface Policy {
  id: Id;
  title: string;
  category: string;
  owner: string;
  summary: string;
  audience: PolicyAudience;
  keywords: string[];
  legal: LegalRef[];
  /** Oldest first. The last one is the current version. */
  versions: PolicyVersion[];
}
export interface PolicyAck { policyId: Id; version: string; employeeId: Id; at: ISODate }
export interface PolicyReminder { id: Id; policyId: Id; version: string; employeeId: Id; at: string; by: string }

export interface IcMember { id: Id; role: 'presiding' | 'member' | 'external'; employeeId?: Id; name?: string; org?: string; gender?: Gender }
export interface IcCommittee { constitutedOn: ISODate; tenureEnds: ISODate; members: IcMember[] }
export type PoshNature = 'verbal' | 'written_online' | 'physical' | 'other';
export type PoshStatus = 'received' | 'inquiry' | 'report_submitted' | 'closed';
export interface PoshCase {
  /** Like POSH-2026-003. The only identifier. No names and no details are kept in this preview, by design. */
  id: string;
  receivedOn: ISODate;
  nature: PoshNature;
  status: PoshStatus;
  closedOn?: ISODate;
  outcome?: 'action_taken' | 'no_action';
}
export interface PoshSession { id: Id; date: ISODate; title: string; mode: 'in_person' | 'online'; attendees: Id[] }
export interface PoshState { committee: IcCommittee; cases: PoshCase[]; sessions: PoshSession[] }

export interface PolicyState {
  version: number;
  policies: Policy[];
  acks: PolicyAck[];
  reminders: PolicyReminder[];
  posh: PoshState;
  log: { at: string; by: string; action: string }[];
}

// ───────────────────────────── org chart ─────────────────────────────
export interface Vacancy { id: Id; title: string; managerId: Id; departmentId?: Id; locationId?: Id; targetMonth?: Month; note?: string }
export interface OrgPrefs { collapsed: Id[]; showExited: boolean; view: 'chart' | 'list'; groupBy: 'department' | 'location' }
export interface OrgState { version: number; vacancies: Vacancy[]; prefs: OrgPrefs; log: { at: string; by: string; action: string }[] }
