'use client';
import { Badge } from '../ui';
import { fmtDate } from '../../../lib/hrms/format';
import { TODAY } from '../../../lib/hrms/workforce/store';
import { licenceToday, type ContractorMonth } from '../../../lib/hrms/workforce/contractEngine';

const LICENCE_TONE = { valid: 'ok', expiring: 'warn', expired: 'red', not_started: 'warn' } as const;

export function licenceBadge(c: { licenceFrom: string; licenceTo: string }) {
  const l = licenceToday(c, TODAY);
  const text = l.state === 'valid' ? `Licence valid to ${fmtDate(c.licenceTo)}` : l.state === 'expiring' ? `Licence ends ${fmtDate(c.licenceTo)}` : l.state === 'expired' ? `Licence expired ${fmtDate(c.licenceTo)}` : `Licence starts ${fmtDate(c.licenceFrom)}`;
  return <Badge tone={LICENCE_TONE[l.state]} dot>{text}</Badge>;
}

export function decisionBadge(r: ContractorMonth) {
  if (!r.decision) return <Badge dot>No decision yet</Badge>;
  return r.decision.decision === 'cleared' ? <Badge tone="ok" dot>Cleared to pay</Badge> : <Badge tone="red" dot>On hold</Badge>;
}
