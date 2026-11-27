'use client';
import { useNewDesign } from '../../lib/useNewDesign';

/**
 * The Aurora backdrop: three blurred colour fields drifting slowly behind the app (see app/aurora.css).
 * Rendered only while the New design is on, so Classic carries no extra layer. Purely decorative: it takes no
 * pointer events and is hidden from assistive tech. Mount once, inside the dashboard shell.
 */
export default function AuroraSky() {
  const { enabled } = useNewDesign();
  if (!enabled) return null;
  return (
    <div className="km-aurora" aria-hidden data-testid="aurora-sky">
      <i className="b1" /><i className="b2" /><i className="b3" />
    </div>
  );
}
