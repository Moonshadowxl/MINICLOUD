# MiniCloud design system

## Mood
"White crystal at dawn over deep water" — a bright, precise, cool-white surface with real
depth coming from one committed cobalt. The PS5 dashboard feeling: spacious, calm,
confident, personal. At late night (after 22:00) the Welcome aurora deepens toward
midnight blue — a moment, not a theme.

## Color (OKLCH; strategy: Restrained, Welcome screen may go Committed)
- `--bg`:        oklch(1 0 0)                 — pure white content surface
- `--surface`:   oklch(0.975 0.006 230)       — sidebar/panels, cool second neutral
- `--ink`:       oklch(0.20 0.02 230)         — primary text
- `--ink-soft`:  oklch(0.45 0.02 230)         — secondary text (≥4.5:1 on bg)
- `--line`:      oklch(0.90 0.01 230)         — hairlines
- `--brand`:     oklch(0.45 0.09 230)         — cobalt: primary actions, selection, focus
- `--brand-ink`: oklch(0.38 0.09 230)         — cobalt for text on white (≥4.5:1)
- `--brand-soft`:oklch(0.94 0.02 230)         — selected-row/hover tint
- `--ok`:        oklch(0.55 0.12 155)  · `--warn`: oklch(0.62 0.13 75) · `--danger`: oklch(0.5 0.19 25)
- Category colors (chart + badges): files cobalt 230°, media violet 300°, projects teal 180°,
  apps amber 75° — same L/C family (0.55 / 0.10) so no slice shouts.

## Type
One family: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`. Fixed rem scale,
ratio 1.2: 12.8 / 14 (body) / 16.8 / 20 / 24 / 29 / 35. Wordmark only: 800 italic,
letter-spacing -0.03em, rendered "MINICLOUD" with a slight slant (per sketch) — never
used for UI labels.

## Surfaces
- App shell: white content + `--surface` sidebar, 1px `--line` divider. No cards-for-everything;
  prefer full-width rows with hairlines. Radius: 10px controls, 14px panels.
- Welcome screen: full-viewport cool aurora (radial cobalt glow on white; after 22:00 the
  glow deepens to midnight). Profile tiles are the ONE glass moment in the app.

## Motion
150–250ms, ease-out-quart. State only: tile focus scale (1.04), PIN dot fill, page
crossfade 150ms, upload progress. `prefers-reduced-motion`: crossfades.

## Components
Buttons (solid cobalt primary / ghost secondary), text inputs, PIN pad, profile tile,
file row, breadcrumbs, donut chart, progress bar, badge (public/private), toast.
Every control ships default/hover/focus-visible/active/disabled/loading. Skeletons for
loading lists; empty states teach ("Drop a folder here — even a whole repo").
