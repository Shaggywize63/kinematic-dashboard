'use client';
import { useEffect, useState } from 'react';
import { useNewDesign } from '../../lib/useNewDesign';
import { useTileEditing } from '../../lib/useTileEditing';
import { getStoredUser } from '../../lib/auth';
import { buttonStyle } from '../ui';

/**
 * The page-wide controls for the movable tiles (components/ui/TileBoard.tsx). They live in the header, show only in the
 * New design, and only on a page that has at least one tile board.
 *
 *   • "Arrange tiles"      — start moving / resizing.
 *   • "Reset to default"   — put every tile on THIS page back where it started. Offered outside edit mode too, but only
 *                            while the page has actually been rearranged.
 *   • "Reset all pages"    — the same for every page (all of this user's saved tile layouts). Asks to be clicked twice.
 */
export default function TileEditControls() {
  const { enabled } = useNewDesign();
  const { boards, editing, customized, setEditing, resetAll, resetEverywhere } = useTileEditing();
  const [confirmAll, setConfirmAll] = useState(false);

  // The "are you sure" state lapses on its own, and never survives leaving edit mode.
  useEffect(() => {
    if (!confirmAll) return;
    const t = setTimeout(() => setConfirmAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmAll]);
  useEffect(() => { if (!editing) setConfirmAll(false); }, [editing]);

  if (!enabled || boards === 0) return null;

  const wrap = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 } as const;
  const nowrap = { whiteSpace: 'nowrap' } as const;

  if (!editing) {
    return (
      <div style={wrap}>
        {customized > 0 && (
          <button type="button" data-testid="tiles-reset-outside" onClick={resetAll} title="Put the tiles on this page back where they started"
            style={{ ...buttonStyle('ghost', 'sm'), ...nowrap }}>
            Reset to default
          </button>
        )}
        <button type="button" data-testid="tiles-customize" onClick={() => setEditing(true)} title="Move and resize the tiles on this page"
          style={{ ...buttonStyle('secondary', 'sm'), ...nowrap }}>
          Arrange tiles
        </button>
      </div>
    );
  }

  const onAll = () => {
    if (!confirmAll) { setConfirmAll(true); return; }
    resetEverywhere(getStoredUser()?.id);
    setConfirmAll(false);
  };

  return (
    <div data-testid="tile-edit-controls" title="Drag a tile's bar to move it · drag its corner to resize" style={wrap}>
      <button type="button" data-testid="tiles-reset" onClick={resetAll} title="Put the tiles on this page back where they started" style={{ ...buttonStyle('ghost', 'sm'), ...nowrap }}>
        Reset to default
      </button>
      <button type="button" data-testid="tiles-reset-all" onClick={onAll}
        title={confirmAll ? 'Click again to put the tiles on every page back to default' : 'Put the tiles on every page back to default'}
        style={{ ...buttonStyle(confirmAll ? 'danger' : 'ghost', 'sm'), ...nowrap }}>
        {confirmAll ? 'Click again to confirm' : 'Reset all pages'}
      </button>
      <button type="button" data-testid="tiles-done" onClick={() => setEditing(false)} style={{ ...buttonStyle('primary', 'sm'), ...nowrap }}>Done</button>
    </div>
  );
}
