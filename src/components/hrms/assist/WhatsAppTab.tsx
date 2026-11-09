'use client';
// HR assistant, WhatsApp tab: a phone-shaped chat that runs the rule-based engine, with a panel showing which records
// each answer read, an audit line per answer, and the message templates HR could send. A SIMULATION: nothing is sent.

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, CardTitle, ConfidenceBadge, Note, T, downloadText, useIsCompact } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { ask, INTENT_LABEL, payslipAsText } from '../../../lib/hrms/assist/engine';
import { policyRefs } from '../../../lib/hrms/assist/policies';
import { MSG_TEMPLATES, renderTemplate } from '../../../lib/hrms/assist/templates';
import {
  PERSONAS, addChatMessage, assistStore, clearChat, confirmLeave, dismissAction, logSensitiveRead, personaWho, setPersona, toStored,
} from '../../../lib/hrms/assist/store';
import type { ChatAction, ChatMessage, AssistState, PolicyState, StoredResult } from '../../../lib/hrms/assist/types';
import { InfoChip, QuickChip, hhmm } from './shared';

const ROLE_NOTE: Record<string, string> = {
  employee: 'Employee: you can ask about your own data only.',
  manager: 'Manager: your own data, plus leave and attendance of your direct reports. Never their pay.',
  hr: 'HR: anyone. Reading someone else\'s pay is written to the access log.',
};

export default function WhatsAppTab({ db, assist, policy }: { db: HrmsDb; assist: AssistState; policy: PolicyState }) {
  const narrow = useIsCompact(1000);
  const personaId = assist.persona;
  const who = personaWho(personaId);
  const me = db.employees.find((e) => e.id === personaId)!;
  const msgs = useMemo(() => assist.conversations[personaId] ?? [], [assist.conversations, personaId]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Settle a reply that is still "being typed" when the person switches away or leaves the page, so no question is left unanswered.
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const f = pending.current; pending.current = null; f?.();
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPicked(null); return () => flush(); }, [personaId]);

  // A cleared chat starts again with a typing indicator and then the greeting.
  useEffect(() => {
    if (msgs.length > 0 || typing || timer.current) return;
    setTyping(true);
    const f = () => {
      const r = ask(db, who, 'hi', { leaveRequests: assistStore.get().leaveRequests });
      addChatMessage(personaId, { from: 'bot', text: r.answer, result: toStored(r) });
      setTyping(false);
    };
    pending.current = f;
    timer.current = setTimeout(() => { timer.current = null; pending.current = null; f(); }, 700);
  }, [msgs.length, typing, personaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, typing]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || typing) return;
    const prevMsg = [...msgs].reverse().find((m) => m.from === 'bot')?.result;
    const prev = prevMsg && prevMsg.outcome === 'needs_info' && prevMsg.slots ? { intent: prevMsg.intent, slots: prevMsg.slots } : undefined;
    addChatMessage(personaId, { from: 'user', text: t });
    setDraft('');
    setTyping(true);
    const f = () => {
      const r = ask(db, who, t, { leaveRequests: assistStore.get().leaveRequests, policies: policyRefs(policy.policies), prev });
      if (r.sensitive) logSensitiveRead(r.sensitive.employeeId, r.sensitive.field);
      const m = addChatMessage(personaId, { from: 'bot', text: r.answer, result: toStored(r) });
      setPicked(m.id);
      setTyping(false);
    };
    pending.current = f;
    timer.current = setTimeout(() => { timer.current = null; pending.current = null; f(); }, 650);
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(draft); };

  const runAction = (m: ChatMessage, a: ChatAction) => {
    if (a.kind === 'confirm_leave') {
      confirmLeave(personaId, m.id, a.draft);
      const approver = a.draft.approverId ? db.employees.find((e) => e.id === a.draft.approverId) : undefined;
      addChatMessage(personaId, {
        from: 'bot',
        text: `Done. I recorded your ${a.draft.leaveName} request for ${a.draft.days} ${a.draft.days === 1 ? 'day' : 'days'} (${fmtDate(a.draft.from)}${a.draft.to !== a.draft.from ? ` to ${fmtDate(a.draft.to)}` : ''}) as pending${approver ? ` with ${fullName(approver)}` : ' with HR'}. Your balance changes only after approval. This is a simulation: nobody was notified.`,
        result: { intent: 'apply_leave', outcome: 'answered', usedData: ['Leave requests (assistant)'], records: 1, suggestions: ['Leave balance', 'Who is on leave in my team?'] },
      });
      toast.success('Leave request recorded as pending');
    } else if (a.kind === 'dismiss') {
      dismissAction(personaId, m.id);
    } else if (a.kind === 'download_payslip') {
      const f = payslipAsText(db, a.employeeId, a.month);
      if (f) downloadText(f.filename, f.text); else toast.error('That payslip is no longer available');
    }
  };

  const botMsgs = msgs.filter((m) => m.from === 'bot' && m.result);
  const sel = botMsgs.find((m) => m.id === picked) ?? botMsgs[botMsgs.length - 1];
  const lastBotId = [...msgs].reverse().find((m) => m.from === 'bot')?.id;

  return (
    <div data-testid="whatsapp-tab" style={{ display: 'grid', gap: 18, gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(340px, 420px) minmax(0, 1fr)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="chat-persona" style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>Chatting as</label>
          <Select id="chat-persona" data-testid="chat-persona" value={personaId} onChange={(e) => setPersona(e.target.value)}>
            {PERSONAS.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.label}</option>)}
          </Select>
          <div style={{ fontSize: 12.5, color: T.dim }}>{ROLE_NOTE[who.role]}</div>
        </div>

        <div data-testid="phone" style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 26, overflow: 'hidden', background: T.card, boxShadow: '0 12px 30px -18px rgba(0,0,0,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: T.raised, borderBottom: `1px solid ${T.border}` }}>
            <Avatar name="Kinematic HR" size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Kinematic HR</div>
              <div data-testid="chat-status" style={{ fontSize: 12, color: T.dim }}>{typing ? 'typing…' : 'Simulation · fixed rules'}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { flush(); clearChat(personaId); }} aria-label="Clear this chat">Clear</Button>
          </div>
          <div ref={logRef} role="log" aria-live="polite" aria-label="Chat messages" data-testid="chat-log" tabIndex={0} style={{ height: 'min(460px, 62vh)', overflowY: 'auto', padding: 12, background: T.panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.map((m) => (
              <Bubble key={m.id} m={m} selected={sel?.id === m.id} isLast={m.id === lastBotId && !typing} onPick={() => setPicked(m.id)}
                onAction={(a) => runAction(m, a)} onChip={send} />
            ))}
            {typing && (
              <div data-testid="typing" aria-label="The assistant is typing" style={{ alignSelf: 'flex-start', background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: T.mute, animation: `pulse 1.1s ${i * 0.18}s infinite` }} />)}
              </div>
            )}
          </div>
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${T.border}`, background: T.card }}>
            <input data-testid="chat-input" aria-label="Message the assistant" className="km-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message, English or Hinglish"
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 999, padding: '0 14px', border: `1px solid ${T.border}`, background: T.field, color: T.text, fontFamily: 'inherit', fontSize: 14 }} />
            <Button type="submit" variant="primary" data-testid="chat-send" disabled={typing || !draft.trim()} title={typing ? 'Wait for the reply' : !draft.trim() ? 'Type a message first' : undefined} style={{ height: 40, borderRadius: 999 }}>Send</Button>
          </form>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Card padding={16}>
          <CardTitle>What the assistant looked at</CardTitle>
          <LookedAt result={sel?.result} />
        </Card>
        <Card padding={16}>
          <CardTitle>Audit trail</CardTitle>
          <Audit db={db} personaId={personaId} msgs={msgs} />
        </Card>
        <Card padding={16}>
          <CardTitle right={<ConfidenceBadge level="reported" />}>Message templates</CardTitle>
          <div style={{ fontSize: 13, color: T.dim, marginBottom: 12 }}>
            Notifications HR could send. The sample is filled in for {fullName(me)}. Nothing is sent. In the live product, WhatsApp requires business-started messages to use templates it has approved first (reported, confirm with your WhatsApp provider).
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MSG_TEMPLATES.map((t) => {
              const r = renderTemplate(t, { db, employee: me, requests: assist.leaveRequests, policies: policy.policies, acks: policy.acks, reminders: policy.reminders, today: PREVIEW_TODAY });
              return (
                <div key={t.id} data-testid={`template-${t.id}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div><b style={{ fontSize: 14 }}>{t.name}</b> <span style={{ fontSize: 12.5, color: T.mute }}>· {t.when}</span></div>
                    <Button size="sm" onClick={() => { addChatMessage(personaId, { from: 'system', text: `Template sample, not sent: ${r.text}` }); toast.success('Sample added to the chat'); }}>Preview in chat</Button>
                  </div>
                  <div style={{ background: T.okWash, color: T.text, borderRadius: 12, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5 }}>{r.text}</div>
                  {r.note && <div style={{ fontSize: 12.5, color: T.mute }}>{r.note}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ m, selected, isLast, onPick, onAction, onChip }: {
  m: ChatMessage; selected: boolean; isLast: boolean; onPick: () => void; onAction: (a: ChatAction) => void; onChip: (t: string) => void;
}) {
  if (m.from === 'system') {
    return <div style={{ alignSelf: 'center', maxWidth: '92%', textAlign: 'center', fontSize: 12, color: T.dim, background: T.warnWash, borderRadius: 10, padding: '6px 10px' }}>{m.text}</div>;
  }
  const mine = m.from === 'user';
  const r = m.result;
  const actions = r?.actions?.filter((a) => !(r.actionState && (a.kind === 'confirm_leave' || a.kind === 'dismiss')));
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <div data-testid={mine ? 'msg-user' : 'msg-bot'} style={{
        background: mine ? T.okWash : T.card, color: T.text, border: `1px solid ${selected && !mine ? T.info : T.border}`, borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '8px 12px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>
        {m.text}
        <div style={{ fontSize: 11, color: T.mute, textAlign: 'right', marginTop: 2 }}>{hhmm(m.at)}</div>
      </div>
      {!mine && r && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {r.refused && <Badge tone="red">Outside your role</Badge>}
          <button type="button" onClick={onPick} aria-pressed={selected} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 12, color: selected ? T.info : T.mute, cursor: 'pointer', textDecoration: 'underline' }}>
            {selected ? 'Showing the records it read' : `Show the ${r.records} record${r.records === 1 ? '' : 's'} it read`}
          </button>
        </div>
      )}
      {!mine && actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {actions.map((a, i) => {
            if (a.kind === 'open_page') return <Link key={i} href={a.href} className="km-btn" data-variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 10px', borderRadius: 6, border: `1px solid ${T.borderStrong}`, fontSize: 12.5, fontWeight: 600, color: T.text, textDecoration: 'none', background: T.card }}>{a.label}</Link>;
            return <Button key={i} size="sm" variant={a.kind === 'confirm_leave' ? 'primary' : 'secondary'} onClick={() => onAction(a)} data-testid={`action-${a.kind}`}>{a.label}</Button>;
          })}
        </div>
      )}
      {!mine && r?.actionState && <span style={{ fontSize: 12, color: T.mute }}>{r.actionState === 'done' ? 'Done' : 'Dismissed'}</span>}
      {!mine && isLast && r?.suggestions && r.suggestions.length > 0 && (
        <div data-testid="quick-replies" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {r.suggestions.slice(0, 5).map((s) => <QuickChip key={s} onClick={() => onChip(s)}>{s}</QuickChip>)}
        </div>
      )}
    </div>
  );
}

function LookedAt({ result }: { result?: StoredResult }) {
  if (!result) return <div style={{ fontSize: 13.5, color: T.dim }}>Ask something. This panel lists the records behind each answer.</div>;
  const tone = result.outcome === 'answered' ? 'ok' : result.outcome === 'refused' ? 'red' : result.outcome === 'needs_info' ? 'info' : 'warn';
  return (
    <div data-testid="used-data" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone="neutral" mono>{INTENT_LABEL[result.intent]}</Badge>
        <Badge tone={tone} dot>{{ answered: 'Answered', refused: 'Refused', unknown: 'Not understood', needs_info: 'Needs more detail' }[result.outcome]}</Badge>
      </div>
      {result.usedData.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{result.usedData.map((u) => <InfoChip key={u} testid="used-chip">{u}</InfoChip>)}</div>
      ) : <div style={{ fontSize: 13.5, color: T.dim }}>No records were read. Nothing was guessed.</div>}
      {result.refused && <Note tone="warn">Why it was refused: {result.refused}</Note>}
      <div style={{ fontSize: 12.5, color: T.mute }}>Use “Show the records it read” under any reply to see what was behind it.</div>
    </div>
  );
}

function Audit({ db, personaId, msgs }: { db: HrmsDb; personaId: string; msgs: ChatMessage[] }) {
  const who = personaWho(personaId);
  const name = fullName(db.employees.find((e) => e.id === personaId)!);
  const rows = msgs.filter((m) => m.from === 'bot' && m.result).slice(-12).reverse();
  if (!rows.length) return <div style={{ fontSize: 13.5, color: T.dim }}>No answers yet.</div>;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((m) => {
        const r = m.result!;
        return (
          <li key={m.id} data-testid="audit-line" style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {hhmm(m.at)} · {name} ({who.role}) · {INTENT_LABEL[r.intent]} · {r.outcome === 'refused' ? 'refused' : r.outcome === 'unknown' ? 'not understood' : r.outcome === 'needs_info' ? 'asked for detail' : 'answered'} · read {r.records} record{r.records === 1 ? '' : 's'}
          </li>
        );
      })}
    </ol>
  );
}
