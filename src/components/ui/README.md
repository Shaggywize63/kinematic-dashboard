# Dashboard UI system

The web dashboard uses one visual system (Attio/Linear-clean, inside the
Kinematic brand). Tokens live in `src/app/globals.css`; the primitives in
this folder are how pages consume them. Inline styles stay the convention —
the primitives are just the inline styles you no longer have to retype.

## Tokens (CSS variables)

| Role | Light | Dark | Use |
|---|---|---|---|
| `--canvas` (`--bg`) | stone `#FAFAFB` | navy `#0E1A2E` | page ground |
| `--panel` (`--s1`) | white | `#0A0F1D` | sidebar, header |
| `--card` (`--s2`) | white | `#0E1420` | cards, tables, popovers, modals |
| `--field` | white | `#131B2A` | inputs |
| `--s3` | `#F1F5F9` | `#131B2A` | hover rows, chips, raised blocks |
| `--s4` | `#E2E8F0` | `#1A2438` | rules, keycaps, progress tracks |
| `--border` / `--border-l` | `#E4E6EB` / `#CBD5E1` | `#1E2D45` / `#253650` | hairlines / stronger borders |
| `--text` / `--dim` / `--mute` | ink / `#64748B` / `#94A3B8` | `#E8EDF8` / `#7A8BA0` / `#55657D` | body / secondary / tertiary |
| `--red` + `--red-w` | brand red + 8% wash | red + 16% wash | THE action colour, unread dots, required marks |
| `--info` + `--info-w` | `#0066FF` | `#4D9DFF` | links, focus ring, informational |
| `--ok` / `--warn` + washes | success / caution | lifted | semantic state |
| `--ring` | blue 22% | blue 28% | focus ring |
| `--shadow-pop` | soft | deep | popovers, modals |

`--primary` = `--red`, `--accent` = `--info`. Never hard-code a hex for
something a token covers; never use a colour that only works in one theme.

## Type

- Headings: Manrope (`var(--font-manrope)`), 700, `-0.01em`. Page title 22px,
  section/card title 15–17px.
- Body: Inter 13.5–14px, 400/500. Never bold body text, never red body text.
- Eyebrows / IDs / numbers / times: JetBrains Mono 10.5–12px (`Eyebrow`,
  `T.mono`), eyebrows uppercase with `0.08em` tracking in `--mute`.

## Shape and density

Radii 6 (controls) / 8 (tiles, chips, inner blocks) / 12 (cards) / 999 (pills).
Spacing 4 · 8 · 12 · 16 · 20 · 24 · 32. Controls: inputs 36px, buttons 34px
(`sm` 30px), icon buttons 32px, chips 28px. Sidebar 240px, header 56px.

## Primitives (`import { … } from '@/components/ui'`)

- `PageHeader` — title + description + right-aligned actions. Every page
  starts with one. Pages name the breadcrumb tail with `usePageTitle('…')`
  from `lib/pageTitle`.
- `Card` (`cardStyle`) — the surface. `padding={0}` for tables/lists.
- `Section` — mono eyebrow + one-line hint + content, hairline above (not on
  `first`). `FormGrid` — 2-column form grid (`narrow` → 1).
- `Field` + `Input` / `Select` / `Textarea` — label (`labelStyle`), required
  mark (`requiredMark`), hint/error. Controls carry `className="km-input"`
  for the focus ring; pass `invalid` for the red border.
- `Button` — `primary` (red, one per view), `secondary` (default),
  `ghost`, `danger`; `size="sm"`; `icon`; `href` renders a Link.
  `IconButton` — 32px ghost square for toolbars.
- `Badge` — status pills (`tone`: neutral / info / ok / warn / red);
  `Chip` — outlined scope chip; `Segmented` — B2B/B2C-style switch.
- `EmptyState`, `Avatar`, `Eyebrow`, `useIsCompact(bp)` for the `narrow`
  convention.
- Icons: lucide-react, 16–18px, `strokeWidth={1.6}`. Nav icons come from
  the registry in `icons.tsx` (`NavIcon name="…"`). No emoji as icons.

## Rules that are not optional

- Built-in lead / contact / deal / account fields stay gated through
  `isHidden` / `labelFor` / `requiredFor` at every render site.
- Both themes, always: screenshot light and dark before calling it done.
- Tables: header cells mono eyebrows, 12px vertical padding, entity names as
  `km-entity-link`, wrap the table in `overflow-x: auto`.
- Keep the logic; move only the presentation. Fetches, params, refetch deps,
  city scope, client scope, exports — untouched.

## The New design: Aurora + movable tiles

The dashboard has two designs, **Classic** and **New**, switched per user from the header (`lib/newDesign.ts` is the rollout
gate; `html[data-design="new"]` is the hook CSS keys off). Classic must never change because of New.

**Aurora** (`app/aurora.css`) is the New design's look: frosted panes over a slow red / indigo / teal sky
(`components/shared/AuroraSky.tsx`). It works by re-pointing the tokens above (`--card`, `--s1…s4`, `--border`, `--text…`)
at glass values under `html[data-design="new"]`, so a page that already uses tokens needs nothing. Things a token can't
express are CSS rules: the sky, frosted sidebar/top bar, the glass edge on cards, solid panes for menus/dialogs, and the
tinted-glass icon chips (`.km-lz`, set `--tint` inline).
- `Card` carries `.km-card`; hand-built panels that spread `cardStyle` are caught by attribute selectors on their inline
  background + card-sized radius. **Those selectors must list both spellings** (`background: var(--card)` and
  `background:var(--card)`): server-rendered inline styles have no spaces, client-rendered ones do.
- Anything that sits over content (menus, dialogs, sticky bars) must stay a solid frosted pane, never see-through.

**Movable / resizable tiles** — wrap a grid of cards in `TileGrid` (one line; Classic renders the original `<div>`):

```tsx
<TileGrid id="finance-home-kpis" perRow={4} h={3} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
  {cards}
</TileGrid>
```
`id` is the saved-layout key (unique per page; layouts are stored per user in this browser). Each direct child is a tile,
identified by its `key`, `data-tile`, `label` or `title`. The header's **Arrange tiles** button (and the hover "Arrange" pill
on any tile) switches every board on the page into edit mode: drag a tile's bar, drag its corner, or use the ¼ ⅓ ½ Full
and − + buttons. Use `TileBoard` directly only when tiles need bespoke sizing.

**Aurora charts** (`components/charts/AuroraCharts.tsx`): `AttendanceAurora` (a ring with one tick per person, gaps between status
groups, the rate in the middle, a status list and a footer of facts — each fact only when the API sends it), `AuroraArea` (a smoothed area
with a crosshair readout, hover or ← →) and `CardHead` (the tinted-glass heading). Every recharts chart is themed from one place:
`lib/chartTheme.tsx` plus the `recharts` rules at the bottom of `app/aurora.css` (quiet grid, muted axes, glass tooltips, ringed pie slices).
Status colours are `--au-good / --au-warn / --au-neutral / --au-crit`.

**Aurora donut** (`components/charts/AuroraDonut.tsx`): every pie / donut / ring in the New design is one `AuroraDonut` — rounded-cap arcs with
small gaps and a glow in each slice's colour over a quiet track, the total (or the hovered slice) in Manrope numerals in the middle, and a legend
(dot, label, caption, count, percent) where hovering a slice or a row dims the rest. At a call site wrap it, never replace the original:
`<NewDesignSwap classic={<the original chart/>}><AuroraDonut data={[{ label, value, color? }]} /></NewDesignSwap>` — Classic keeps rendering
exactly what it did. `max` + `inline` make a score/progress ring; `fill` fits a fixed-height widget body; `onSliceClick` makes rows buttons.
