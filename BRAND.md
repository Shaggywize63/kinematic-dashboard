# Kinematic Brand Identity — Dashboard

> Brand Identity Guidelines · v1.0 · 2026

This dashboard implements the Kinematic visual system for B2B field force management. The full guidelines live in the brand portal; this file documents how the system is wired into the codebase.

## Color tokens

### Primary palette
| Token       | Hex       | Usage                                    |
|-------------|-----------|------------------------------------------|
| `--k-red`   | `#D01E2C` | Brand red — CTAs, the mark, never body   |
| `--k-ink`   | `#0A0E1A` | Primary type, the mark, dark UI surfaces |
| `--k-paper` | `#FFFFFF` | Default light surface                    |

### Secondary palette
| Token       | Hex       | Usage                                       |
|-------------|-----------|---------------------------------------------|
| `--k-navy`  | `#0E1A2E` | Dark-mode product surface, hero panels      |
| `--k-stone` | `#FAFAFB` | Off-white cards, alternating rows           |
| `--k-rule`  | `#E4E6EB` | Borders, dividers, low-emphasis strokes     |

### Functional palette (product UI only — never marketing)
| Token         | Hex       | Usage                          |
|---------------|-----------|--------------------------------|
| `--k-success` | `#0A8A4E` | Confirmations, ECC achievements |
| `--k-caution` | `#C97A00` | Warnings, pending, breach alerts |
| `--k-info`    | `#0066FF` | Information messages, links     |

**60-30-10 rule** — In any layout, target 60% white/stone, 30% ink, 10% red. Red is a spice, not a sauce.

## Typography

| Role            | Family              | When                                                  |
|-----------------|---------------------|-------------------------------------------------------|
| Display, H1–H3  | Manrope             | All headings, hero, section openers, the wordmark     |
| Body, UI        | Inter               | Default body, paragraphs, dense data tables, forms    |
| Eyebrow / data  | JetBrains Mono      | ALL CAPS labels, version IDs, code, KPI tag rails     |

Body is always Inter at 14–16 px. **Never** bold body text — use weight 500 or italics. **Never** centre-align body. **Never** set headlines in ALL CAPS — that register is reserved for JetBrains Mono eyebrow labels.

## Logo system

The Kinematic mark is a kinematic chain: one red disc anchored, two black satellite discs in coordinated orbit. It always pairs with the Manrope ExtraBold wordmark. Five approved variants only — Primary, Reverse, Mono Black, Mono White, Knockout.

Mark assets live in `public/`:
- `favicon.svg` — favicon (mark on white rounded square)
- `logo-mark.svg` — primary mark
- `logo-mark-reverse.svg` — reverse for dark surfaces
- `logo-wordmark.svg` — full mark + wordmark lockup

**Clearspace** = diameter of one satellite disc. Never violate.

## Voice

Direct. Operational. Quietly confident. Numbers do the boasting. Avoid: *empower, leverage, world-class, best-in-breed, revolutionary, synergistic*. Use: *field executive* (never *manpower*), *team*, *check in*, *effective contact*, *beat / route*, *supervisor*.

## Accessibility

All approved foreground/background pairs hit WCAG AA at 16 px. Never set body type in red. Never use functional palette colors in marketing layouts.

## Asset library

Source of truth: `brand.kinematic.app`. Approval: `design@kinematic.app`.
