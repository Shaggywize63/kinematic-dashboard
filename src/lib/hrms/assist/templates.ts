// Message templates HR could send over WhatsApp, and a renderer that fills them from the sample data.
// Nothing is sent. In the live product, business-initiated WhatsApp messages need templates approved by WhatsApp first.

import type { Employee, HrmsDb, ISODate } from '../types';
import { fmtDate, fmtMonth, fullName } from '../format';
import { PREVIEW_TODAY } from '../seed';
import { releasedSlips } from './engine';
import { currentVersion, personView } from './policies';
import type { AssistLeaveRequest, Policy, PolicyAck, PolicyReminder } from './types';

export type TemplateId = 'payslip_ready' | 'leave_approved' | 'document_pending' | 'policy_ack';
export interface MsgTemplate { id: TemplateId; name: string; when: string; body: string }

export const MSG_TEMPLATES: MsgTemplate[] = [
  { id: 'payslip_ready', name: 'Payslip ready', when: 'After a pay run is frozen', body: 'Hi {name}, your payslip for {month} is ready. Open the Kinematic app to view or download it. It has no amounts in this message, for your privacy.' },
  { id: 'leave_approved', name: 'Leave approved', when: 'When a manager approves a request', body: 'Hi {name}, your {type} for {dates} was approved by {approver}. Enjoy the break.' },
  { id: 'document_pending', name: 'Document pending', when: 'When a required document is still missing', body: 'Hi {name}, we still need your {document} to complete your records. Please upload it in the app by {due}.' },
  { id: 'policy_ack', name: 'Policy to acknowledge', when: 'After a new policy version is published', body: 'Hi {name}, the {policy} policy (version {version}) has changed. Please read it and tap "I have read this" in the app.' },
];

export interface RenderInput {
  db: HrmsDb;
  employee: Employee;
  requests: AssistLeaveRequest[];
  policies: Policy[];
  acks: PolicyAck[];
  reminders: PolicyReminder[];
  today?: ISODate;
}
export interface Rendered { text: string; note?: string }

/** Fill a template for one person. When there is no real record to use (nothing pending, no request), a stated sample value is used. */
export function renderTemplate(t: MsgTemplate, i: RenderInput): Rendered {
  const today = i.today ?? PREVIEW_TODAY;
  const name = i.employee.firstName;
  const fill = (vars: Record<string, string>) => t.body.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
  switch (t.id) {
    case 'payslip_ready': {
      const s = releasedSlips(i.db, i.employee.id)[0];
      return { text: fill({ name, month: s ? fmtMonth(s.slip.month) : 'October 2026' }), note: s ? undefined : 'No released payslip for this person, so a sample month is used.' };
    }
    case 'leave_approved': {
      const r = i.requests.filter((x) => x.employeeId === i.employee.id && x.status !== 'cancelled').sort((a, b) => b.from.localeCompare(a.from))[0];
      const mgr = i.employee.reportingToId && i.employee.reportingToId !== i.employee.id ? i.db.employees.find((e) => e.id === i.employee.reportingToId) : undefined;
      const dates = r ? (r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} to ${fmtDate(r.to)}`) : '10 Nov 2026 to 11 Nov 2026';
      return {
        text: fill({ name, type: r ? `${r.leaveCode} request` : 'casual leave request', dates, approver: mgr ? fullName(mgr) : 'your manager' }),
        note: r ? (r.status === 'approved' ? undefined : 'This request is still pending. The message would go out only after approval.') : 'This person has no leave request, so sample dates are used.',
      };
    }
    case 'document_pending': {
      const d = i.employee.documents.find((x) => x.status === 'pending' || x.status === 'rejected');
      return { text: fill({ name, document: d ? d.name : 'cancelled cheque', due: fmtDate(addDaysIso(today, 7)) }), note: d ? undefined : 'No document is pending for this person, so a sample document is used.' };
    }
    case 'policy_ack': {
      const pending = personView(i.db, i.policies, i.acks, i.reminders, i.employee.id, today).find((x) => x.row.status === 'pending');
      const p = pending?.policy ?? i.policies[0];
      return { text: fill({ name, policy: p ? p.title : 'Travel & expense', version: p ? currentVersion(p).version : '2.1' }), note: pending ? undefined : 'Nothing is pending for this person, so the first policy is used as a sample.' };
    }
  }
}

function addDaysIso(d: ISODate, n: number): ISODate {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
