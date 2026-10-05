'use client';
// Shared building blocks for the Expenses pages: page shell with tabs, status and
// policy-check badges, the receipt viewer, the claim timeline, the remark dialog,
// and small formatting / file helpers.

import { cloneElement, isValidElement, ReactElement, ReactNode, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check, CircleDot, ExternalLink, FileText, Receipt, X } from 'lucide-react';
import { Badge, Button, Card, Field as BaseField, PageHeader, Textarea, T, Tone, useIsCompact } from '../ui';
import { Modal } from '../finance/ui';
import {
  CLAIM_STATUS_LABEL, ExpenseClaim, ExpenseFlag, ClaimApproval, ClaimItem, ClaimStatus, CATEGORY_LABELS, flagLabel,
} from '../../lib/expensesApi';

// ── formatting ──────────────────────────────────────────────────────────────
export function money(amount: number | string | null | undefined, currency = 'INR'): string {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The amount that is actually payable on a claim (approved amount once decided). */
export const payable = (c: Pick<ExpenseClaim, 'total_amount' | 'approved_amount' | 'status'>): number =>
  c.approved_amount != null && (c.status === 'approved' || c.status === 'reimbursed') ? Number(c.approved_amount) : Number(c.total_amount || 0);

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const errText = (e: unknown, fallback = 'Something went wrong') => (e instanceof Error && e.message ? e.message : fallback);

// ── who can do what ─────────────────────────────────────────────────────────
// Coarse role detection from the stored session. It only decides which tabs to
// show — the API enforces the real permissions and answers 403 for anyone else.
export function useExpenseRoles(): { canApprove: boolean; canAdmin: boolean; ready: boolean } {
  const [roles, setRoles] = useState({ canApprove: false, canAdmin: false, ready: false });
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kinematic_user');
      const u = raw ? JSON.parse(raw) : null;
      const role = String(u?.role || '').toLowerCase().trim().replace(/-/g, '_');
      const perms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
      const adminRoles = ['super_admin', 'admin', 'main_admin', 'master_admin', 'org_admin', 'sub_admin', 'client'];
      const managerRoles = [...adminRoles, 'program_manager', 'city_manager', 'supervisor', 'manager', 'hr'];
      const canAdmin = adminRoles.includes(role) || role.includes('admin') || perms.includes('settings');
      const canApprove = canAdmin || managerRoles.includes(role) || perms.includes('attendance') || perms.includes('users');
      setRoles({ canApprove, canAdmin, ready: true });
    } catch { setRoles({ canApprove: false, canAdmin: false, ready: true }); }
  }, []);
  return roles;
}

// ── page shell ──────────────────────────────────────────────────────────────
type TabKey = 'mine' | 'approvals' | 'all' | 'policies';

export function ExpensesShell({ title, description, actions, tab, children, maxWidth }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; tab?: TabKey; children: ReactNode; maxWidth?: number;
}) {
  const narrow = useIsCompact(900);
  const { canApprove, canAdmin } = useExpenseRoles();
  const tabs: Array<{ key: TabKey; href: string; label: string }> = [
    { key: 'mine', href: '/dashboard/expenses', label: 'My claims' },
    ...(canApprove ? [{ key: 'approvals' as TabKey, href: '/dashboard/expenses/approvals', label: 'Approvals' }, { key: 'all' as TabKey, href: '/dashboard/expenses/all', label: 'All claims' }] : []),
    ...(canAdmin ? [{ key: 'policies' as TabKey, href: '/dashboard/expenses/policies', label: 'Policies' }] : []),
  ];
  return (
    <div style={{ padding: narrow ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
      <PageHeader title={title} description={description} actions={actions} compact={narrow} />
      {tab && tabs.length > 1 && (
        <nav aria-label="Expenses" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <Link key={t.key} href={t.href} aria-current={on ? 'page' : undefined} style={{
                padding: '9px 14px', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
                color: on ? T.text : T.dim, borderBottom: `2px solid ${on ? T.red : 'transparent'}`, marginBottom: -1,
              }}>{t.label}</Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}

// ── badges ──────────────────────────────────────────────────────────────────
const STATUS_TONE: Record<ClaimStatus, Tone> = {
  draft: 'neutral', submitted: 'warn', approved: 'ok', rejected: 'red', reimbursed: 'info', cancelled: 'neutral',
};

export function ClaimStatusBadge({ status, partial }: { status: ClaimStatus; partial?: boolean }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{partial && status === 'approved' ? 'Partly approved' : CLAIM_STATUS_LABEL[status] ?? status}</Badge>;
}

export const isPartial = (c: Pick<ExpenseClaim, 'status' | 'approved_amount' | 'total_amount'>) =>
  (c.status === 'approved' || c.status === 'reimbursed') && c.approved_amount != null && Number(c.approved_amount) < Number(c.total_amount) - 0.005;

const SEVERITY_TONE: Record<ExpenseFlag['severity'], Tone> = { info: 'info', warn: 'warn', high: 'red' };

export function FlagBadge({ flag }: { flag: ExpenseFlag }) {
  return <span title={flag.detail}><Badge tone={SEVERITY_TONE[flag.severity] ?? 'warn'}>{flagLabel(flag.code)}</Badge></span>;
}

/** Policy findings as readable sentences. `blocking` ones are called out as must-fix. */
export function PolicyFindings({ flags, compact }: { flags: ExpenseFlag[]; compact?: boolean }) {
  if (!flags.length) return null;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {flags.map((f, i) => (
        <li key={`${f.code}-${f.item_id ?? ''}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: compact ? 12.5 : 13, color: T.dim, lineHeight: 1.4 }}>
          <AlertTriangle size={compact ? 14 : 15} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1, color: f.blocking || f.severity === 'high' ? T.red : T.warn }} />
          <span><strong style={{ color: T.text, fontWeight: 600 }}>{flagLabel(f.code)}.</strong> {f.detail}{f.blocking ? <em style={{ color: T.red, fontStyle: 'normal', fontWeight: 600 }}> Must be fixed to submit.</em> : null}</span>
        </li>
      ))}
    </ul>
  );
}

// ── receipts ────────────────────────────────────────────────────────────────
const isPdf = (u: string) => /\.pdf(\?|#|$)/i.test(u);

export function ReceiptViewer({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  return (
    <Modal title={title || 'Receipt'} onClose={onClose} width={880}
      footer={<><a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><Button icon={<ExternalLink size={15} strokeWidth={1.6} />}>Open in new tab</Button></a><Button onClick={onClose}>Close</Button></>}>
      <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--s3)', borderRadius: T.radius.md, minHeight: 200 }}>
        {isPdf(url)
          ? <iframe src={url} title="Receipt" style={{ width: '100%', height: '70vh', border: 0, borderRadius: T.radius.md }} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: T.radius.md }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
      </div>
      <div style={{ fontSize: 12, color: T.mute, marginTop: 10 }}>This link is private and expires after a few minutes. Reopen the claim for a fresh one.</div>
    </Modal>
  );
}

/** A compact "view receipt" control for a line; shows nothing when there is no receipt. */
export function ReceiptLink({ item, label = 'Receipt' }: { item: Pick<ClaimItem, 'receipt_url' | 'receipt_signed_url' | 'category' | 'merchant'>; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!item.receipt_url) return null;
  const url = item.receipt_signed_url;
  return (
    <>
      <button type="button" onClick={() => (url ? setOpen(true) : toast.error('This receipt link has expired — reload the claim'))}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: T.info, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        <Receipt size={14} strokeWidth={1.7} />{label}
      </button>
      {open && url && <ReceiptViewer url={url} title={`${CATEGORY_LABELS[item.category]}${item.merchant ? ` · ${item.merchant}` : ''}`} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── labelled field ──────────────────────────────────────────────────────────
/**
 * The design-system Field, with the label tied to its control so clicking the
 * label focuses it and screen readers announce it. The id is generated and given
 * to a single input/select/textarea (or a component that forwards `id`).
 */
export function Field({ children, htmlFor, ...rest }: { label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; style?: React.CSSProperties; htmlFor?: string }) {
  const auto = useId();
  let id = htmlFor;
  let child = children;
  if (isValidElement(children)) {
    const el = children as ReactElement<{ id?: string }>;
    const takesId = typeof el.type !== 'string' || ['input', 'select', 'textarea'].includes(el.type);
    if (takesId) { id = el.props.id ?? htmlFor ?? auto; child = cloneElement(el, { id }); }
  }
  return <BaseField {...rest} htmlFor={id}>{child}</BaseField>;
}

// ── remark dialog ───────────────────────────────────────────────────────────
/** Collects the remark that a rejection requires. The primary action stays disabled until one is written. */
export function RemarkDialog({ title, intro, label = 'Remark', placeholder, confirmLabel, required = true, busy, onCancel, onConfirm }: {
  title: string; intro?: ReactNode; label?: string; placeholder?: string; confirmLabel: string; required?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: (remark: string) => void;
}) {
  const [text, setText] = useState('');
  const ok = !required || text.trim().length > 0;
  return (
    <Modal title={title} onClose={onCancel} width={480}
      footer={<><Button onClick={onCancel} disabled={busy}>Cancel</Button><Button variant="primary" disabled={!ok || busy} onClick={() => onConfirm(text.trim())}>{busy ? 'Working…' : confirmLabel}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {intro && <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.5 }}>{intro}</div>}
        <Field label={label} required={required} hint={required ? 'The person who filed the claim will see this in their app.' : undefined}>
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}

/** The rejection reason, front and centre, on any claim that was rejected. */
export function RejectionBanner({ claim }: { claim: ExpenseClaim }) {
  if (claim.status !== 'rejected') return null;
  const by = claim.reviewer_name;
  return (
    <div role="alert" style={{ display: 'flex', gap: 12, padding: '14px 16px', background: T.redWash, borderRadius: T.radius.lg, border: `1px solid ${T.red}33` }}>
      <X size={18} strokeWidth={2} style={{ color: T.red, flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.red }}>Rejected{by ? ` by ${by}` : ''}{claim.reviewed_at ? ` · ${fmtDate(claim.reviewed_at)}` : ''}</div>
        <div style={{ fontSize: 14, color: T.text, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{claim.review_note || 'No remark was left.'}</div>
        <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>Fix the points above and resubmit — nothing else needs to be re-entered.</div>
      </div>
    </div>
  );
}

// ── timeline ────────────────────────────────────────────────────────────────
interface Step { key: string; tone: 'ok' | 'red' | 'warn' | 'mute'; title: ReactNode; when?: string | null; remark?: string | null; lines?: Array<{ text: string; note: string | null }> }

function stepsFor(claim: ExpenseClaim, approvals: ClaimApproval[]): Step[] {
  const out: Step[] = [{ key: 'created', tone: 'mute', title: 'Claim created', when: claim.created_at }];
  const rounds = Array.from(new Set(approvals.map((a) => a.round ?? 1)));
  const multi = rounds.length > 1 || (claim.submit_count ?? 1) > 1;
  let lastRound = 0;
  for (const a of approvals) {
    const r = a.round ?? 1;
    if (r !== lastRound) {
      lastRound = r;
      out.push({ key: `sub-${r}`, tone: 'mute', title: multi ? `Submitted${r > 1 ? ' again' : ''} (attempt ${r})` : 'Submitted for approval', when: r === rounds[rounds.length - 1] ? claim.submitted_at : undefined });
    }
    const who = a.approver_name || 'approver';
    const lvl = a.level > 1 ? ` (level ${a.level})` : '';
    const rejectedLines = (a.item_decisions ?? []).filter((d) => d.decision === 'rejected');
    if (a.status === 'pending') out.push({ key: a.id, tone: 'warn', title: `Waiting for ${who}${lvl}` });
    else out.push({
      key: a.id, tone: a.status === 'approved' ? 'ok' : 'red',
      title: `${a.status === 'approved' ? (rejectedLines.length ? 'Partly approved' : 'Approved') : 'Rejected'} by ${who}${lvl}`,
      when: a.decided_at, remark: a.note,
      lines: rejectedLines.map((d) => ({ text: `${CATEGORY_LABELS[d.category] ?? d.category} · ${money(d.amount, claim.currency)}`, note: d.note })),
    });
  }
  if (claim.auto_approved) out.push({ key: 'auto', tone: 'ok', title: 'Approved automatically under the policy', when: claim.reviewed_at });
  if (claim.status === 'cancelled') out.push({ key: 'cancel', tone: 'mute', title: 'Cancelled' });
  if (claim.reimbursed_at) out.push({ key: 'paid', tone: 'ok', title: `Reimbursed${claim.reimbursed_ref ? ` · ref ${claim.reimbursed_ref}` : ''}`, when: claim.reimbursed_at });
  return out;
}

export function ClaimTimeline({ claim }: { claim: ExpenseClaim }) {
  const steps = useMemo(() => stepsFor(claim, claim.approvals ?? []), [claim]);
  const color = { ok: T.ok, red: T.red, warn: T.warn, mute: T.mute } as const;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {steps.map((s, i) => (
        <li key={s.key} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', columnGap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color[s.tone] }}>
              {s.tone === 'ok' ? <Check size={16} strokeWidth={2.2} /> : s.tone === 'red' ? <X size={16} strokeWidth={2.2} /> : <CircleDot size={14} strokeWidth={2} />}
            </span>
            {i < steps.length - 1 && <span style={{ flex: 1, width: 1, background: T.border, minHeight: 14 }} />}
          </div>
          <div style={{ paddingBottom: 16, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{s.title}</div>
            {s.when && <div style={{ fontSize: 12, color: T.mute, marginTop: 1 }}>{fmtDateTime(s.when)}</div>}
            {s.remark && (
              <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--s3)', borderRadius: T.radius.sm, fontSize: 13, color: T.text, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {s.remark}
              </div>
            )}
            {s.lines && s.lines.length > 0 && (
              <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.lines.map((l, j) => (
                  <li key={j} style={{ fontSize: 12.5, color: T.dim }}><span style={{ color: T.red, fontWeight: 600 }}>Line rejected</span> · {l.text}{l.note ? <> — <span style={{ color: T.text }}>{l.note}</span></> : null}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── a line item, read-only ──────────────────────────────────────────────────
export function LineSummary({ item, currency }: { item: ClaimItem; currency: string }) {
  const detail = item.category === 'mileage'
    ? `${item.from_location || '—'} → ${item.to_location || '—'}${item.distance_km != null ? ` · ${item.distance_km} km` : ''}`
    : [item.merchant, item.description].filter(Boolean).join(' · ');
  const rejected = item.decision === 'rejected';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 16px', padding: '12px 0', alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{CATEGORY_LABELS[item.category]}</span>
          <span style={{ fontSize: 12.5, color: T.mute }}>{fmtDate(item.item_date)}</span>
          {item.flagged && <Badge tone="warn">Flagged</Badge>}
          {rejected && <Badge tone="red">Line rejected</Badge>}
          {item.decision === 'approved' && <Badge tone="ok">Approved</Badge>}
        </div>
        {detail && <div style={{ fontSize: 13, color: T.dim, marginTop: 2, overflowWrap: 'anywhere' }}>{detail}</div>}
        {rejected && item.decision_note && (
          <div style={{ marginTop: 6, fontSize: 13, color: T.text, padding: '6px 10px', background: T.redWash, borderRadius: T.radius.sm, overflowWrap: 'anywhere' }}>
            <strong style={{ color: T.red, fontWeight: 600 }}>Remark: </strong>{item.decision_note}
          </div>
        )}
        <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <ReceiptLink item={item} />
          {!item.receipt_url && item.category !== 'mileage' && <span style={{ fontSize: 12.5, color: T.mute, display: 'inline-flex', gap: 5, alignItems: 'center' }}><FileText size={13} strokeWidth={1.6} />No receipt</span>}
          {item.flagged && item.flag_reason && <span style={{ fontSize: 12.5, color: T.warn }}>{item.flag_reason}</span>}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: rejected ? T.mute : T.text, fontVariantNumeric: 'tabular-nums', textDecoration: rejected ? 'line-through' : undefined }}>
        {money(item.amount, currency)}
      </div>
    </div>
  );
}

export function Panel({ title, aside, children, padding = 20 }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; padding?: number }) {
  return (
    <Card padding={padding}>
      {(title || aside) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
          {aside}
        </div>
      )}
      {children}
    </Card>
  );
}

// ── receipt file prep ───────────────────────────────────────────────────────
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

/**
 * Phone photos are routinely 4–8 MB. Shrink big JPEG/PNG/WebP shots to a sensible
 * size in the browser before upload (faster, and well inside the server limit).
 * Anything else — PDF, HEIC, small images, or a browser that cannot decode the
 * file — is sent untouched.
 */
export async function prepareReceipt(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 700_000 || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';              // PNGs with transparency would turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
