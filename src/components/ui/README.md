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
