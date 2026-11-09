'use client';
// A plain SVG bar that shows where a person's booked revenue sits against the plan's band edges.
// Bands are drawn in one hue, lighter to darker as the rate rises; the first band (no pay) is neutral.

import { T } from '../ui';
import type { IncentivePlan } from '../../../lib/hrms/field/types';

export function BandBar({ plan, target, booked, whatIfBooked }: { plan: IncentivePlan; target: number; booked: number; whatIfBooked?: number }) {
  const attain = target ? (booked / target) * 100 : 0;
  const whatIf = whatIfBooked != null && target ? (whatIfBooked / target) * 100 : undefined;
  const lastEdge = Math.max(...plan.bands.map((b) => b.from));
  const domain = Math.max(lastEdge + 40, Math.ceil((Math.max(attain, whatIf ?? 0) + 8) / 10) * 10);
  const W = 640, H = whatIf != null ? 118 : 96, padX = 14, barY = 38, barH = 24;
  const x = (pct: number) => padX + (Math.min(pct, domain) / domain) * (W - 2 * padX);
  const clampLabel = (px: number) => Math.max(padX + 44, Math.min(W - padX - 44, px));
  const shades = [0.16, 0.3, 0.48, 0.62];
  let paying = -1;
  const desc = `Booked ${Math.round(attain)}% of target. ` + plan.bands.map((b) => `${b.from}% to ${b.to ?? 'no limit'}% pays ${(b.rate * 100).toFixed(1).replace(/\.0$/, '')}%`).join('; ') + '.';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} data-testid="band-bar" style={{ width: '100%', height: 'auto', maxWidth: 720, display: 'block' }}>
      {plan.bands.map((b, i) => {
        const x0 = x(b.from), x1 = x(b.to ?? domain);
        const isPaying = b.rate > 0;
        if (isPaying) paying++;
        return (
          <g key={i}>
            <rect x={x0 + 1} y={barY} width={Math.max(0, x1 - x0 - 2)} height={barH} rx={4}
              fill={isPaying ? T.info : T.rule} fillOpacity={isPaying ? shades[Math.min(paying, shades.length - 1)] : 1} />
            <text x={(x0 + x1) / 2} y={barY + barH / 2 + 4} textAnchor="middle" fontSize={11.5} fill={T.text}>
              {isPaying ? `pays ${(b.rate * 100).toFixed(1).replace(/\.0$/, '')}%` : 'no pay'}
            </text>
            <line x1={x0} x2={x0} y1={barY + barH} y2={barY + barH + 6} stroke={T.mute} strokeWidth={1} />
            <text x={x0} y={barY + barH + 19} textAnchor="middle" fontSize={11} fill={T.dim}>{b.from}%</text>
          </g>
        );
      })}
      <line x1={x(attain)} x2={x(attain)} y1={barY - 10} y2={barY + barH + 4} stroke={T.text} strokeWidth={2.5} />
      <path d={`M ${x(attain) - 5} ${barY - 14} L ${x(attain) + 5} ${barY - 14} L ${x(attain)} ${barY - 6} Z`} fill={T.text} />
      <text x={clampLabel(x(attain))} y={barY - 20} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text} stroke={T.card} strokeWidth={3} paintOrder="stroke">{`Booked ${Math.round(attain)}%`}</text>
      {whatIf != null && (
        <g>
          <line x1={x(whatIf)} x2={x(whatIf)} y1={barY - 4} y2={barY + barH + 30} stroke={T.warn} strokeWidth={2} strokeDasharray="4 3" />
          <text x={clampLabel(x(whatIf))} y={barY + barH + 44} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.warn} stroke={T.card} strokeWidth={3} paintOrder="stroke">{`What if ${Math.round(whatIf)}%`}</text>
        </g>
      )}
    </svg>
  );
}
