'use client';
import Link from 'next/link';
import { AlertTriangle, ShieldAlert, ShieldCheck, Info, ExternalLink, type LucideIcon } from 'lucide-react';
import { Badge, T, type Tone } from '../ui';
import { InlineIcon } from '../ui/PageIcon';
import type { ForensicFinding, Severity } from '../../lib/expenseForensics';

const SEV_TONE: Record<Severity, Tone> = { info: 'info', warn: 'warn', high: 'red' };
const SEV_LABEL: Record<Severity, string> = { info: 'Info', warn: 'Review', high: 'High risk' };
const SEV_ICON: Record<Severity, LucideIcon> = { info: Info, warn: AlertTriangle, high: ShieldAlert };
const RANK: Record<Severity, number> = { info: 0, warn: 1, high: 2 };

export function worstOf(findings: ForensicFinding[] | null | undefined): Severity | null {
  if (!findings || !findings.length) return null;
  return findings.reduce<Severity>((w, f) => (RANK[f.severity] > RANK[w] ? f.severity : w), 'info');
}

/** Compact risk chip for list rows: worst severity + count, or "Clear". */
export function RiskBadge({ findings }: { findings?: ForensicFinding[] | null }) {
  const worst = worstOf(findings);
  if (!worst) return <Badge tone="ok"><InlineIcon icon={ShieldCheck} size={12} />Clear</Badge>;
  const n = findings!.length;
  return <Badge tone={SEV_TONE[worst]}><InlineIcon icon={SEV_ICON[worst]} size={12} />{SEV_LABEL[worst]}{n > 1 ? ` · ${n}` : ''}</Badge>;
}

const travelHref = (date?: string | null, userId?: string | null) =>
  date && userId ? `/dashboard/travel-report?date=${date}&user_id=${userId}` : null;

/**
 * The manager's forgery/forensics highlights for a claim: each finding with its
 * severity and a plain-language explanation, cross-person findings linking to the
 * other rep's claim and that day's travel report, and a link to this claim's day.
 */
export function ForensicHighlights({ findings, date, userId }: { findings: ForensicFinding[]; date?: string | null; userId?: string | null }) {
  if (!findings.length) return <div style={{ fontSize: 13, color: T.mute, display: 'flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={ShieldCheck} size={14} style={{ color: T.ok }} />No forgery signals — this claim looks clean.</div>;
  const ownTravel = travelHref(date, userId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {findings.map((f, i) => {
        const Icon = SEV_ICON[f.severity] ?? Info;
        const color = f.severity === 'high' ? T.red : f.severity === 'warn' ? T.warn : T.info;
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon size={16} strokeWidth={1.9} style={{ color, flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{f.title}</span>
                <Badge tone={SEV_TONE[f.severity]}>{SEV_LABEL[f.severity]}</Badge>
              </div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5, marginTop: 2 }}>{f.detail}</div>
              {f.involved && f.involved.length > 0 && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 }}>
                  {f.involved.map((p) => {
                    const t = travelHref(date, p.user_id);
                    return (
                      <span key={p.claim_id} style={{ display: 'inline-flex', gap: 12, fontSize: 12.5 }}>
                        <Link href={`/dashboard/expenses/${p.claim_id}`} style={{ color: T.info }}>Open {p.user_name || 'their'} claim →</Link>
                        {t && <Link href={t} style={{ color: T.info }}>Their travel day →</Link>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {ownTravel && (
        <Link href={ownTravel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.info, marginTop: 2, fontWeight: 600 }}>
          <ExternalLink size={14} /> View this day’s travel report
        </Link>
      )}
    </div>
  );
}
