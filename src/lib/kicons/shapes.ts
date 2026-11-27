/** Path builders for authoring glyphs: every one returns SVG path data in the 24-grid. */

const n = (v: number) => String(Math.round(v * 100) / 100);

/** Closed rounded rectangle. */
export function rr(x: number, y: number, w: number, h: number, r = 3): string {
  const k = Math.min(r, w / 2, h / 2);
  return `M${n(x + k)} ${n(y)}h${n(w - 2 * k)}a${n(k)} ${n(k)} 0 0 1 ${n(k)} ${n(k)}v${n(h - 2 * k)}a${n(k)} ${n(k)} 0 0 1 -${n(k)} ${n(k)}h-${n(w - 2 * k)}a${n(k)} ${n(k)} 0 0 1 -${n(k)} -${n(k)}v-${n(h - 2 * k)}a${n(k)} ${n(k)} 0 0 1 ${n(k)} -${n(k)}z`;
}

/** Closed circle. */
export function ci(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 -${n(2 * r)} 0z`;
}

/** Open polyline through points. */
export function pl(...pts: Array<[number, number]>): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join('');
}

/** Closed polygon through points. */
export function pg(...pts: Array<[number, number]>): string {
  return `${pl(...pts)}z`;
}

/** A round dot drawn as a zero-length stroke (so it takes the stroke weight, not the node style). */
export function dt(x: number, y: number): string {
  return `M${n(x)} ${n(y)}h.01`;
}

/** Join path fragments. */
export const j = (...parts: string[]) => parts.join('');

// ── trigonometric builders ───────────────────────────────────────────────────

/** A point on a circle; angles in degrees, 0° = 3 o'clock, increasing clockwise on screen. */
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/** Open arc from `a0` to `a1` degrees, clockwise on screen. */
export function ar(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const sweep = (((a1 - a0) % 360) + 360) % 360;
  return `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
}

/** `count` short radial ticks between radii r0 and r1 (spokes, rays). */
export function ticks(cx: number, cy: number, r0: number, r1: number, count: number, phase = 0): string {
  return Array.from({ length: count }, (_, i) => {
    const deg = phase + (360 / count) * i;
    return pl(polar(cx, cy, r0, deg), polar(cx, cy, r1, deg));
  }).join('');
}

/** A closed gear outline: `teeth` teeth between radii r0 (valley) and r1 (tip); round joins soften the corners. */
export function gear(cx: number, cy: number, teeth: number, r0: number, r1: number, baseDeg: number, tipDeg: number): string {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < teeth; k++) {
    const a = (360 / teeth) * k;
    pts.push(polar(cx, cy, r0, a - baseDeg), polar(cx, cy, r1, a - tipDeg), polar(cx, cy, r1, a + tipDeg), polar(cx, cy, r0, a + baseDeg));
  }
  return pg(...pts);
}

/** A closed star with `points` points between radii r1 (tips) and r0 (inner). */
export function star(cx: number, cy: number, r1: number, r0: number, points = 5, rot = -90): string {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < points * 2; k++) pts.push(polar(cx, cy, k % 2 === 0 ? r1 : r0, rot + (180 / points) * k));
  return pg(...pts);
}
