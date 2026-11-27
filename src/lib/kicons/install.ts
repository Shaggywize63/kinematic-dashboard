'use client';
import { useSyncExternalStore } from 'react';
import { getDesignSnapshot, subscribeDesign } from '../designStore';
import { renderGlyph, type KIconProps } from './engine';
import { BINDINGS } from './bindings';
import { GLYPHS } from './glyphs';
import { TARGETS } from './targets';

/**
 * Swaps lucide's drawings for the designed family — everywhere, with no change at any call site.
 *
 * lucide icons are `forwardRef` components: React calls `Icon.render(props, ref)` every time one renders. This
 * patches `render` on each icon in the binding table so that, while the new design is on, it draws the Kinematic
 * glyph instead; while it is off (or for any icon without a glyph) the original `render` runs untouched. That reaches
 * the icons the app passes around as values — `icon={Phone}`, nav registries, config tables — which a call-site
 * rewrite could not. The state is read through useSyncExternalStore, so flipping the header toggle re-renders
 * every icon in place with no remount; on the server and in the first client render it reads "off", so hydration
 * always matches.
 *
 * It degrades safely: anything that doesn't look like a lucide forwardRef (a future lucide release, say) is left
 * alone, and patching is idempotent (Fast Refresh re-runs this module).
 */
const FORWARD_REF = Symbol.for('react.forward_ref');
const PATCHED = Symbol.for('kinematic.kicon');

const isOn = () => getDesignSnapshot().enabled;
const isOff = () => false;

type PatchableIcon = { $$typeof?: symbol; render?: (props: KIconProps, ref: unknown) => unknown; [PATCHED]?: true };

/** Patch every bound lucide icon. Returns how many were patched by THIS call (0 when already installed). */
export function installKIcons(): number {
  let patched = 0;
  for (const [exportName, target] of Object.entries(TARGETS)) {
    const id = BINDINGS[exportName];
    const glyph = id ? GLYPHS[id] : undefined;
    const icon = target as PatchableIcon | undefined;
    if (!glyph || !icon || icon.$$typeof !== FORWARD_REF || typeof icon.render !== 'function' || icon[PATCHED]) continue;

    const original = icon.render;
    icon.render = function kiconRender(props: KIconProps, ref: unknown) {
      // A forwardRef render function IS a component render, so a hook is legal here.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const on = useSyncExternalStore(subscribeDesign, isOn, isOff);
      return on ? renderGlyph(glyph, id, props, ref as never) : original(props, ref);
    };
    icon[PATCHED] = true;
    patched += 1;
  }
  return patched;
}

installKIcons();
