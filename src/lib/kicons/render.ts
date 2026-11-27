import { NODE_R, PLATE_OFFSET, PLATE_OPACITY, STROKE, VIEW, type Glyph } from './spec';

/**
 * The SVG for a glyph as a string — the single definition of how the family is drawn (the React engine renders
 * the same layers). Pure, so the contact sheet and the tests can use it without React or a DOM.
 */
export function glyphMarkup(g: Glyph, color = 'currentColor'): string {
  const plate = g.plate
    ? `<path d="${g.plate}" transform="translate(${PLATE_OFFSET} ${PLATE_OFFSET})" fill="${color}" fill-opacity="${PLATE_OPACITY}" stroke="none"/>`
    : '';
  const node = g.node
    ? `<circle cx="${g.node[0]}" cy="${g.node[1]}" r="${NODE_R}" stroke="none" style="fill:var(--k-node, ${color})"/>`
    : '';
  // No plate → nothing pulls the visual centre back from 11.25 to 12, so centre the artwork itself.
  const shift = g.plate ? '' : ` transform="translate(${PLATE_OFFSET / 2} ${PLATE_OFFSET / 2})"`;
  return `${plate}<g${shift}><path d="${g.line}"/>${node}</g>`;
}

export function glyphSvg(g: Glyph, size = 24, color = 'currentColor', extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${VIEW.min} ${VIEW.min} ${VIEW.size} ${VIEW.size}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" ${extra}>${glyphMarkup(g, color)}</svg>`;
}
