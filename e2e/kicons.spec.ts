import { test, expect } from '@playwright/test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Lucide from 'lucide-react';
import { CORE, GLYPHS } from '../src/lib/kicons/glyphs';
import { MARKS } from '../src/lib/kicons/glyphs-marks';
import { OBJECTS } from '../src/lib/kicons/glyphs-objects';
import { BUSINESS } from '../src/lib/kicons/glyphs-business';
import { EXTRA } from '../src/lib/kicons/glyphs-extra';
import { BINDINGS } from '../src/lib/kicons/bindings';
import { TARGETS } from '../src/lib/kicons/targets';
import { renderGlyph } from '../src/lib/kicons/engine';
import { glyphSvg } from '../src/lib/kicons/render';
import { installKIcons } from '../src/lib/kicons/install';

/**
 * Contract test for the designed icon family (src/lib/kicons). What matters: every glyph is well-formed, every
 * glyph is reachable from some lucide name and every bound name really exists in the installed lucide, the
 * generated targets file has not drifted from the binding table, the drawing honours what call sites pass, and —
 * the safety property — with the new design OFF (the server render, the first client render, every other
 * account) an icon draws exactly what lucide always drew.
 */

const FORWARD_REF = Symbol.for('react.forward_ref');
const PATCHED = Symbol.for('kinematic.kicon');
const lucide = Lucide as unknown as Record<string, { $$typeof?: symbol; render?: unknown; [k: symbol]: unknown }>;

test.describe('glyph data', () => {
  test('the family is large enough to matter', () => {
    expect(Object.keys(GLYPHS).length).toBeGreaterThanOrEqual(150);
  });

  test('glyph ids are unique across the chunks — no definition silently shadows another', () => {
    const chunks = { CORE, MARKS, OBJECTS, BUSINESS, EXTRA };
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [chunk, glyphs] of Object.entries(chunks)) {
      for (const id of Object.keys(glyphs)) {
        if (seen.has(id)) clashes.push(`${id} (${seen.get(id)} and ${chunk})`);
        else seen.set(id, chunk);
      }
    }
    expect(clashes).toEqual([]);
    expect(Object.keys(GLYPHS).length).toBe(seen.size);
  });

  test('every glyph has well-formed path data and an in-bounds node', () => {
    const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;
    for (const [id, g] of Object.entries(GLYPHS)) {
      expect(g.line.length, `${id}: empty line`).toBeGreaterThan(0);
      expect(PATH.test(g.line), `${id}: line has unexpected characters`).toBe(true);
      expect(g.line.includes('NaN'), `${id}: NaN in line`).toBe(false);
      if (g.plate !== undefined) {
        expect(PATH.test(g.plate), `${id}: plate has unexpected characters`).toBe(true);
        expect(g.plate.includes('NaN'), `${id}: NaN in plate`).toBe(false);
      }
      if (g.node) {
        expect(g.node.every((v) => Number.isFinite(v) && v >= 0 && v <= 24), `${id}: node out of bounds`).toBe(true);
      }
    }
  });
});

test.describe('binding table', () => {
  test('every binding points at a glyph that exists', () => {
    for (const [name, id] of Object.entries(BINDINGS)) expect(GLYPHS[id], `${name} → ${id}`).toBeTruthy();
  });

  test('every glyph is reachable from at least one lucide name (no orphan art)', () => {
    const used = new Set(Object.values(BINDINGS));
    const orphans = Object.keys(GLYPHS).filter((id) => !used.has(id));
    expect(orphans).toEqual([]);
  });

  test('every bound name is a real lucide forwardRef icon in the installed version', () => {
    for (const name of Object.keys(BINDINGS)) {
      const c = lucide[name];
      expect(c, `${name} is not exported by lucide-react`).toBeTruthy();
      expect(c.$$typeof, `${name} is not a forwardRef`).toBe(FORWARD_REF);
      expect(typeof c.render, `${name} has no render`).toBe('function');
    }
  });

  test('the generated targets file matches the table, and holds the real lucide objects', () => {
    expect(Object.keys(TARGETS).sort()).toEqual(Object.keys(BINDINGS).sort());
    for (const name of Object.keys(TARGETS)) expect(TARGETS[name], name).toBe(lucide[name]);
  });
});

test.describe('drawing', () => {
  const html = (id: string, props: Record<string, unknown> = {}) => renderToStaticMarkup(renderGlyph(GLYPHS[id], id, props));

  test('honours size, colour, className and passthrough attributes, and ignores strokeWidth', () => {
    const out = html('phone', { size: 40, color: 'red', className: 'x', 'aria-hidden': true, 'data-testid': 't', strokeWidth: 5 });
    expect(out).toContain('width="40"');
    expect(out).toContain('height="40"');
    expect(out).toContain('stroke="red"');
    expect(out).toContain('class="lucide lucide-phone kicon x"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('data-testid="t"');
    expect(out).toContain('stroke-width="1.6"');           // the family weight, not the caller's 5
    expect(out).not.toContain('stroke-width="5"');
  });

  test('a glyph with a plate draws the offset translucent plate and the node in --k-node', () => {
    const out = html('map-pin', { color: 'blue' });
    expect(out).toContain('transform="translate(1.5 1.5)"');
    expect(out).toContain('fill="blue"');
    expect(out).toContain('fill-opacity="0.16"');
    expect(out).toContain('<circle');
    expect(out).toContain('fill:var(--k-node, blue)');
  });

  test('a plain mark (no plate) is re-centred instead', () => {
    const out = html('plus');
    expect(out).toContain('transform="translate(0.75 0.75)"');
    expect(out).not.toContain('fill-opacity');
  });

  test('defaults to currentColor at 24px, and appends children', () => {
    const out = renderToStaticMarkup(renderGlyph(GLYPHS.check, 'check', { children: React.createElement('title', null, 'ok') }));
    expect(out).toContain('width="24"');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('<title>ok</title>');
  });

  test('the string renderer (contact sheet) and the React renderer draw the same paths', () => {
    const paths = (s: string) => [...s.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).sort();
    for (const id of ['home', 'users', 'settings', 'bar-chart', 'plus', 'refresh']) {
      expect(paths(html(id)), id).toEqual(paths(glyphSvg(GLYPHS[id])));
    }
  });
});

test.describe('the swap', () => {
  test('is installed on every bound icon, once', () => {
    installKIcons();
    expect(installKIcons()).toBe(0);                       // idempotent: Fast Refresh re-runs the module
    for (const name of Object.keys(BINDINGS)) expect(lucide[name][PATCHED], name).toBe(true);
    // aliases are separate lucide objects and are all covered
    for (const alias of ['CheckCircle2', 'CircleCheck', 'CheckCircle']) expect(lucide[alias][PATCHED], alias).toBe(true);
  });

  test('an icon with no glyph is never touched', () => {
    expect(lucide.Gem[PATCHED]).toBeUndefined();
    expect(lucide.Swords[PATCHED]).toBeUndefined();
  });

  test('with the new design OFF an icon draws exactly what lucide always drew (also under server rendering)', () => {
    installKIcons();
    const out = renderToStaticMarkup(React.createElement(Lucide.Phone, { size: 14 }));
    expect(out).toContain('class="lucide lucide-phone"');
    expect(out).toContain('stroke-width="2"');
    expect(out).toContain('M22 16.92v3a2 2 0 0 1-2.18 2');   // lucide's own path
    expect(out).not.toContain('kicon');
  });

  test('an unbound icon renders untouched', () => {
    const out = renderToStaticMarkup(React.createElement(Lucide.Gem, { size: 14 }));
    expect(out).toContain('class="lucide lucide-gem"');
    expect(out).not.toContain('kicon');
  });
});
