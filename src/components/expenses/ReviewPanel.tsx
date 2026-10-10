'use client';
// The approver's review of one claim: go through every line, approve or reject
// each (a rejected line must carry a remark), then approve the claim or reject
// it as a whole (which also needs a remark). The claimant sees every remark.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Badge, Button, Input, T } from '../ui';
import { Decision, DecisionResult, ExpenseClaim, FormRules, expensesApi } from '../../lib/expensesApi';
import { Field, LineSummary, Panel, RemarkDialog, errText, money } from './kit';

interface LineState { decision: Decision; note: string }

export default function ReviewPanel({ claim, rules, onDone }: { claim: ExpenseClaim; rules?: FormRules; onDone: (r: DecisionResult) => void }) {
  const items = useMemo(() => claim.items ?? [], [claim.items]);
  const [lines, setLines] = useState<Record<string, LineState>>(() => Object.fromEntries(items.map((i) => [i.id, { decision: 'approved' as Decision, note: '' }])));
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const set = (id: string, p: Partial<LineState>) => setLines((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const rejected = items.filter((i) => lines[i.id]?.decision === 'rejected');
  const approvedTotal = useMemo(
    () => items.filter((i) => lines[i.id]?.decision !== 'rejected').reduce((s, i) => s + Number(i.amount || 0), 0),
    [items, lines],
  );
  const allRejected = items.length > 0 && rejected.length === items.length;
  const missing = rejected.filter((i) => !lines[i.id]?.note.trim());
  const partial = rejected.length > 0 && !allRejected;

  const send = async (decision: Decision, remark: string) => {
    setBusy(true);
    try {
      // Approving: send every line's decision. Rejecting the whole claim: every line takes the
      // overall remark, except those where the reviewer already wrote a remark of their own.
      const own = (id: string) => (lines[id].decision === 'rejected' ? lines[id].note.trim() : '');
      const body = {
        decision,
        note: remark || undefined,
        items: decision === 'approved'
          ? items.map((i) => ({ id: i.id, decision: lines[i.id].decision, note: own(i.id) || undefined }))
          : items.filter((i) => own(i.id)).map((i) => ({ id: i.id, decision: 'rejected' as Decision, note: own(i.id) })),
      };
      const r = await expensesApi.decideClaim(claim.id, body);
      toast.success(
        decision === 'rejected' ? 'Claim rejected — the remark has been sent to the claimant'
          : r.data.escalated ? 'Approved — sent to the next manager for sign-off'
            : partial ? `Partly approved: ${money(r.data.approved_amount ?? approvedTotal, claim.currency)}` : 'Claim approved',
      );
      setRejecting(false);
      onDone(r.data);
    } catch (e) { toast.error(errText(e, 'Could not record the decision')); }
    finally { setBusy(false); }
  };

  const approve = () => {
    if (missing.length) { setShowErrors(true); toast.error('Add a remark for each rejected line'); return; }
    send('approved', note.trim());
  };

  return (
    <Panel title="Review" padding={20}
      aside={<Badge tone={partial ? 'warn' : 'neutral'}>{partial ? `${rejected.length} of ${items.length} lines rejected` : `${items.length} ${items.length === 1 ? 'line' : 'lines'}`}</Badge>}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it, idx) => {
          const st = lines[it.id];
          const rej = st.decision === 'rejected';
          return (
            <div key={it.id} style={{ borderTop: idx ? `1px solid ${T.border}` : 0 }}>
              <LineSummary item={{ ...it, decision: null, decision_note: null }} currency={claim.currency} rules={rules} also={items.map((x) => x.category)} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 12 }}>
                <div role="group" aria-label="Decision for this line" style={{ display: 'inline-flex', gap: 6 }}>
                  <Button size="sm" variant={rej ? 'secondary' : 'primary'} icon={<Check size={14} strokeWidth={2} />} onClick={() => set(it.id, { decision: 'approved' })}>Approve</Button>
                  <Button size="sm" variant={rej ? 'danger' : 'secondary'} icon={<X size={14} strokeWidth={2} />} onClick={() => set(it.id, { decision: 'rejected' })}>Reject</Button>
                </div>
                {rej && (
                  <Field style={{ flex: 1, minWidth: 220 }} error={showErrors && !st.note.trim() ? 'A remark is needed to reject this line' : undefined}>
                    <Input value={st.note} invalid={showErrors && !st.note.trim()} autoFocus onChange={(e) => set(it.id, { note: e.target.value })}
                      placeholder="Why is this line rejected? (the claimant will see this)" maxLength={1000} aria-label="Remark for the rejected line" />
                  </Field>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 6, paddingTop: 16, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Note to the claimant" hint="Optional when approving.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved — please attach the missing receipt next time" maxLength={1000} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: T.mute }}>{partial ? 'You will approve' : 'Claimed'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.heading, fontVariantNumeric: 'tabular-nums', color: T.text }}>
              {money(partial ? approvedTotal : claim.total_amount, claim.currency)}
              {partial && <span style={{ fontSize: 13, fontWeight: 500, color: T.mute }}> of {money(claim.total_amount, claim.currency)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="danger" disabled={busy} icon={<X size={15} strokeWidth={2} />} onClick={() => setRejecting(true)}>Reject claim</Button>
            <Button variant="primary" disabled={busy || allRejected} icon={<Check size={15} strokeWidth={2} />} onClick={approve}>
              {busy ? 'Saving…' : partial ? 'Approve selected' : 'Approve claim'}
            </Button>
          </div>
        </div>
        {allRejected && <div style={{ fontSize: 12.5, color: T.mute }}>Every line is rejected — use “Reject claim” and explain why.</div>}
      </div>

      {rejecting && (
        <RemarkDialog title="Reject this claim" confirmLabel="Reject claim" busy={busy} label="Reason for rejecting"
          placeholder="Tell them what is wrong and what to fix, e.g. “Receipt is unreadable — please upload a clearer photo.”"
          intro={<>{claim.user_name || 'The claimant'} will see this remark in the app and can fix the claim and resubmit it.</>}
          footnote="The claimant is notified with this reason and can edit and resubmit."
          onCancel={() => setRejecting(false)} onConfirm={(remark) => send('rejected', remark)} />
      )}
    </Panel>
  );
}
