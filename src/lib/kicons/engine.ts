import { createElement, type ForwardedRef, type ReactElement, type SVGProps } from 'react';
import { NODE_R, PLATE_OFFSET, PLATE_OPACITY, STROKE, VIEW, type Glyph } from './spec';

/** The props lucide icons accept — what callers already pass. */
export interface KIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  color?: string;
  /** Accepted for compatibility and ignored: the family has one weight (see spec.ts). */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

/**
 * Draw a glyph as a React element — the same layers as `glyphMarkup` (render.ts): offset plate, line work, node.
 * Honours the props every lucide call site passes (size, color, className, style, aria-*, data-*, children, ref),
 * so swapping the drawing never needs a call site to change.
 */
export function renderGlyph(glyph: Glyph, id: string, props: KIconProps, ref?: ForwardedRef<SVGSVGElement>): ReactElement {
  const { size = 24, color = 'currentColor', className, children, strokeWidth: _w, absoluteStrokeWidth: _a, ...rest } = props;
  void _w; void _a;

  const plate = glyph.plate
    ? createElement('path', { key: 'plate', d: glyph.plate, transform: `translate(${PLATE_OFFSET} ${PLATE_OFFSET})`, fill: color, fillOpacity: PLATE_OPACITY, stroke: 'none' })
    : null;
  const node = glyph.node
    ? createElement('circle', { key: 'node', cx: glyph.node[0], cy: glyph.node[1], r: NODE_R, stroke: 'none', style: { fill: `var(--k-node, ${color})` } })
    : null;
  // No plate → nothing pulls the visual centre back from 11.25 to 12, so centre the artwork itself.
  const shift = glyph.plate ? undefined : `translate(${PLATE_OFFSET / 2} ${PLATE_OFFSET / 2})`;

  return createElement(
    'svg',
    {
      ref,
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: `${VIEW.min} ${VIEW.min} ${VIEW.size} ${VIEW.size}`,
      fill: 'none',
      stroke: color,
      strokeWidth: STROKE,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ['lucide', `lucide-${id}`, 'kicon', className].filter(Boolean).join(' '),
      ...rest,
    },
    plate,
    createElement('g', { key: 'g', transform: shift }, createElement('path', { d: glyph.line }), node),
    children,
  );
}
