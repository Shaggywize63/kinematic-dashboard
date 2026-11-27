'use client';
import { useNewDesign } from '../../lib/useNewDesign';
import { T } from '../ui';

/**
 * Classic ⇄ New switch for the dashboard header. Rendered only for accounts that have access to the new design
 * (see lib/newDesign.ts) — everyone else sees nothing, so a staged rollout never shows a control that does nothing.
 */
export default function DesignToggle() {
  const { available, enabled, setEnabled } = useNewDesign();
  if (!available) return null;

  const seg = (on: boolean): React.CSSProperties => ({
    height: 24, padding: '0 10px', border: 0, borderRadius: 999, fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit',
    background: on ? T.text : 'transparent', color: on ? T.card : T.dim,
  });

  return (
    <div data-testid="design-toggle" role="group" aria-label="Interface design" title="Switch between the classic and the new design"
      style={{ display: 'inline-flex', padding: 2, border: `1px solid ${T.border}`, borderRadius: 999, flexShrink: 0 }}>
      <button type="button" aria-pressed={!enabled} onClick={() => setEnabled(false)} style={seg(!enabled)}>Classic</button>
      <button type="button" aria-pressed={enabled} onClick={() => setEnabled(true)} style={seg(enabled)}>New</button>
    </div>
  );
}
