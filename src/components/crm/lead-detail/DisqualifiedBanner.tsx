'use client';
import { RotateCcw } from 'lucide-react';
import { Button, Eyebrow, T } from '../../ui';
import { fmtIST } from './format';

/** Lifecycle banner: why a lead was closed out (lost_reason + disqualified_at), with the way back. */
export default function DisqualifiedBanner({
  outcome, lostReason, disqualifiedAt, onReopen, reopening,
}: {
  outcome: 'unqualified' | 'lost';
  lostReason: string | null;
  disqualifiedAt: string | null;
  onReopen: () => void;
  reopening: boolean;
}) {
  const lost = outcome === 'lost';
  return (
    <div role="status" style={{ background: lost ? T.redWash : T.warnWash, border: `1px solid ${lost ? T.red : T.warn}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <Eyebrow style={{ color: lost ? T.red : T.warn }}>{lost ? 'Lead marked as lost' : 'Lead disqualified'}</Eyebrow>
        {lostReason && <div style={{ color: T.text, marginTop: 4, fontSize: 13.5 }}>Reason: {lostReason}</div>}
        {disqualifiedAt && <div style={{ color: T.dim, marginTop: 2, fontSize: 12.5, fontFamily: T.mono }}>{fmtIST(disqualifiedAt)}</div>}
      </div>
      <Button onClick={onReopen} disabled={reopening} icon={<RotateCcw size={15} strokeWidth={1.8} />}>{reopening ? 'Re-opening…' : 'Re-open lead'}</Button>
    </div>
  );
}
