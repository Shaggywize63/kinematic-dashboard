'use client';
import { useNewDesign } from '../../lib/useNewDesign';
import { useTileEditing } from '../../lib/useTileEditing';
import { buttonStyle } from '../ui';

/**
 * The one "Arrange tiles" control for the page's movable tiles (components/ui/TileBoard.tsx). Lives in the
 * header; shown only in the new design, and only on a page that has at least one tile board.
 */
export default function TileEditControls() {
  const { enabled } = useNewDesign();
  const { boards, editing, setEditing, resetAll } = useTileEditing();
  if (!enabled || boards === 0) return null;

  if (!editing) {
    return (
      <button type="button" data-testid="tiles-customize" onClick={() => setEditing(true)} title="Move and resize the tiles on this page"
        style={{ ...buttonStyle('secondary', 'sm'), flexShrink: 0, whiteSpace: 'nowrap' }}>
        Arrange tiles
      </button>
    );
  }
  return (
    <div data-testid="tile-edit-controls" title="Drag a tile's bar to move it · drag its corner to resize" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button type="button" data-testid="tiles-reset" onClick={resetAll} style={{ ...buttonStyle('ghost', 'sm'), whiteSpace: 'nowrap' }}>Reset layout</button>
      <button type="button" data-testid="tiles-done" onClick={() => setEditing(false)} style={{ ...buttonStyle('primary', 'sm'), whiteSpace: 'nowrap' }}>Done</button>
    </div>
  );
}
