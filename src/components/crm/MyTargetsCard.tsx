'use client';
/**
 * "My targets" on the CRM home: the rep's own Sales / Collection progress for the month, with a button to log
 * an order or a payment. Only for clients that have the rupee targets switched on — for everyone else (types
 * empty, or the call failing) this renders nothing at all.
 */
import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { IndianRupee } from 'lucide-react';
import { crmTargets } from '../../lib/crmApi';
import { useTargetTypes } from '../../lib/useTargetTypes';
import { MAX_RUPEES, MAX_RUPEES_LABEL, fmtRupees, groupRupeeInput, parseRupeeInput } from '../../lib/rupees';
import type { TargetKind, TargetProgress, TargetType } from '../../types/crm';
import { Button, Card, Eyebrow, Field, Input, T, Textarea } from '../ui';
import { Modal } from '../finance/ui';

const LOG_LABEL: Record<TargetKind, string> = { sales: 'Log sale', collection: 'Log collection' };
const LOGGED: Record<TargetKind, string> = { sales: 'Sale logged', collection: 'Collection logged' };

const day = (d?: string) => {
  const dt = d ? new Date(`${d}T00:00:00`) : null;
  return dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
};

export default function MyTargetsCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { types } = useTargetTypes();
  const [progress, setProgress] = useState<TargetProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const [logging, setLogging] = useState<TargetType | null>(null);
  const on = types.length > 0;

  const load = useCallback(async () => {
    try { setProgress((await crmTargets.progress())?.data ?? null); setFailed(false); }
    catch { setFailed(true); }
  }, []);
  useEffect(() => { if (on) load(); }, [on, load, refreshKey]);

  if (!on) return null;

  const month = progress ? `${day(progress.period_start)} – ${day(progress.period_end)}` : 'This month';
  return (
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Eyebrow>My targets</Eyebrow>
          <span style={{ fontSize: 12.5, color: T.mute }}>{month}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {types.map((t) => (
            <Button key={t.key} size="sm" icon={<IndianRupee size={14} strokeWidth={1.7} />} onClick={() => setLogging(t)}>{LOG_LABEL[t.key]}</Button>
          ))}
        </div>
      </div>

      {failed && !progress ? (
        <div style={{ fontSize: 13, color: T.dim }}>Couldn’t load your progress just now. You can still log an entry.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {(progress?.types ?? types.map((t) => ({ key: t.key, label: t.label, target: null, achieved: 0, pct: null as number | null }))).map((p) => (
            <ProgressRow key={p.key} label={p.label} target={p.target} achieved={p.achieved} pct={p.pct} loading={!progress} />
          ))}
        </div>
      )}

      {logging && (
        <LogEntryModal type={logging} onClose={() => setLogging(null)} onLogged={() => { setLogging(null); load(); }} />
      )}
    </Card>
  );
}

function ProgressRow({ label, target, achieved, pct, loading }: { label: string; target: number | null; achieved: number; pct: number | null; loading: boolean }) {
  const hasTarget = target != null && target > 0;
  const w = Math.max(0, Math.min(100, pct ?? 0));
  const done = hasTarget && achieved >= (target as number);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</span>
        {hasTarget && !loading && <span style={{ fontFamily: T.mono, fontSize: 12, color: done ? T.ok : T.dim }}>{pct ?? 0}%</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: loading ? T.mute : T.text, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : fmtRupees(achieved)}</span>
        <span style={{ fontSize: 12.5, color: T.dim }}>{loading ? '' : hasTarget ? `of ${fmtRupees(target)}` : 'no target set'}</span>
      </div>
      {hasTarget && (
        <div style={{ height: 6, borderRadius: 99, background: T.rule, overflow: 'hidden' }}>
          <div role="presentation" style={{ width: `${w}%`, height: '100%', background: done ? T.ok : T.red, borderRadius: 99, transition: 'width .3s' }} />
        </div>
      )}
    </div>
  );
}

function LogEntryModal({ type, onClose, onLogged }: { type: TargetType; onClose: () => void; onLogged: () => void }) {
  const uid = useId();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const value = parseRupeeInput(amount);
  const over = value != null && value > MAX_RUPEES;
  const valid = value != null && value > 0 && !over;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      // No date: the server files it under today (IST). No dealer picker yet — `lead_id` is optional.
      await crmTargets.entries.create({ kind: type.key, amount: value as number, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(LOGGED[type.key]);
      onLogged();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Could not log that');
      setBusy(false);
    }
  };

  return (
    <Modal title={LOG_LABEL[type.key]} onClose={onClose} width={440}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Amount (₹)" required htmlFor={`${uid}-amount`} error={over ? `Up to ${MAX_RUPEES_LABEL}` : undefined}
          hint={`Counts towards your ${type.label.toLowerCase()} this month.`}>
          <Input id={`${uid}-amount`} autoFocus inputMode="decimal" placeholder="0" value={amount} invalid={over}
            onChange={(e) => setAmount(groupRupeeInput(e.target.value, true))} />
        </Field>
        <Field label="Note" htmlFor={`${uid}-note`} hint="Optional — the dealer, the order, anything that helps.">
          <Textarea id={`${uid}-note`} value={note} maxLength={500} style={{ minHeight: 64 }} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
