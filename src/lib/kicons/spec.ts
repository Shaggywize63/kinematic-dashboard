/**
 * The Kinematic icon language — the few numbers every glyph is built on. Change them here and the whole
 * family changes together.
 *
 *  - 24 x 24 grid. Glyphs with a plate are drawn in a 17.5px "live box" from 2.5 to 20 (centre 11.25), so the
 *    offset plate below pushes their visual centre of mass to exactly 12. Glyphs WITHOUT a plate (plain marks:
 *    plus, check, arrows) are drawn centred on 12 directly — the renderer applies the half-offset itself.
 *  - The grid is shown through a slightly tighter window (`VIEW`), an optical scale-up of ~8% so the family
 *    holds its own beside other icon sets at 14–18px, where fine detail is what gets lost.
 *  - One stroke weight (1.6 on the grid), round caps and joins. Callers' `strokeWidth` props are deliberately
 *    ignored: a family with one weight is what makes it read as designed rather than assembled.
 *  - DUOTONE PLATE: the principal volume, filled at low opacity and nudged diagonally — like a misregistered
 *    print — so each glyph has body without a heavy fill.
 *  - NODE: one solid dot per glyph (the brand mark's anchored disc). It takes `--k-node`, which the active nav
 *    item sets to brand red; everywhere else it is the icon's own colour.
 */
export const VIEWBOX = 24;
/** The viewBox window: [min, size]. Both axes. */
export const VIEW = { min: 0.9, size: 22.2 } as const;
export const STROKE = 1.6;
export const PLATE_OFFSET = 1.5;
export const PLATE_OPACITY = 0.16;
export const NODE_R = 1.65;

/** A designed glyph: stroked line work, an optional translucent plate, an optional signature node. */
export interface Glyph {
  /** SVG path data, stroked. */
  line: string;
  /** SVG path data, filled (translucent) and offset. Usually the main closed volume of `line`. */
  plate?: string;
  /** The signature node's centre. */
  node?: readonly [number, number];
}
