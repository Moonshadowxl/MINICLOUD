# MiniCloud design system

Recorded from the built world in `web/src/styles.css`, `web/src/icons.tsx` and the
five surfaces, not from intention. The direction contract this describes sits in
the `<body>` of `web/index.html` and survives the production build.

## Mood

**Cloud Atlas Plate.** Your files are a collection under observation, not rows in a
storage console. The product name is read as cloud *classification* — Luke Howard
and the WMO atlas — which is why capacity is reported as sky cover and the storage
categories are genera. The two things it refuses by name are the SaaS storage
dashboard (donut chart, card grid, gradient accent) and its predictable opposite,
the black hacker terminal.

The register is Restrained past the door, per PRODUCT.md, with the welcome screen
as the one committed moment. Light ground throughout: this is read on a phone at
night, a laptop in daylight, and a shared family machine, and it must not be a
dark theme that blinds one of them.

## Color (OKLCH)

Strategy: **Committed** — iron carries whole fields (the station header, modal and
palette heads, the upload tray, toasts) rather than tinting a neutral surface.

| Token | Value | Role |
|---|---|---|
| `--paper` | `oklch(0.982 0.004 220)` | plate stock. Cool, deliberately not cream |
| `--paper-lit` | `oklch(1 0 0)` | raised surfaces: rows, inputs, modals |
| `--plate` | `oklch(0.955 0.008 222)` | sidebar, palette footer |
| `--plate-deep` | `oklch(0.928 0.012 224)` | empty track of a bar |
| `--iron` | `oklch(0.34 0.055 245)` | the printing ink. Fields, primary action |
| `--iron-deep` | `oklch(0.26 0.055 248)` | headings, hover of the primary |
| `--iron-mid` | `oklch(0.50 0.058 244)` | file notation |
| `--iron-soft` / `--iron-wash` | `0.895` / `0.945` | selection and row hover |
| `--oxblood` | `oklch(0.475 0.155 27)` | correction ink — annotation, live, danger |
| `--ink` / `--ink-soft` / `--ink-dim` | `0.245` / `0.455` / `0.525` | text, three steps |
| `--rule` / `--rule-firm` | `0.878` / `0.800` | hairlines. The only dividers |

Genera (specimen rows), one L/C family so no category shouts:
`--g-files` 244° · `--g-media` 288° · `--g-projects` 192° · `--g-apps` 62°.

**Oxblood is reserved.** It marks annotation, live state and destructive action —
never decoration, and never a profile colour. Observer inks (`server/src/auth.ts`)
are a separate printed-plate set in one saturation family.

Every foreground/background pair is verified by `node scripts/check-contrast.mjs`,
which parses the tokens out of the stylesheet and exits non-zero on a regression.
Body and placeholder text clear 4.5:1; symbols clear 3:1.

## Type

Three voices, each with a job. All self-hosted via fontsource — no CDN and no
system fallback, since the app is offline-first and the nearest installed font is
a failure rather than a fallback.

- **EB Garamond** — the plate voice. `h1`, `h2`, the wordmark, empty-state
  headings, Latin binomials in italic. Never used for controls.
- **Atkinson Hyperlegible** — the operating voice. Navigation, buttons, labels,
  file names, body. Chosen because its letterforms disambiguate `l` / `I` / `1`,
  which matters in a list of file paths read at night.
- **JetBrains Mono Variable** — measurement only. Sizes, clocks, plate numbers,
  oktas, breadcrumbs, code. Never a costume for "technical".

Ladder, ratio ~1.2 off a 15px root. Nothing sets a raw rem size:

```
--t6 0.68   --t5 0.76   --t4 0.86   --t3 0.94   --t2 1.05
--t1 1.25   --d3 1.55   --d2 1.9    --d1 2.5
```

`.caption` is the plate's label voice: `--t6`, 700, `0.13em` tracking, uppercase.
It carries every field label, column head and section marker.

## Surfaces

No cards, anywhere. Structure is hairlines and full-bleed rows; radius is `2px` on
controls and panels, because a printed plate has corners. The signed-in shell is a
216px sidebar in `--plate` against `--paper` content. Under 820px the sidebar
becomes two rows — wordmark, search and avatar above, four equal nav cells below —
so every destination and the search entry stay on screen at rest.

Row hover bleeds to the page edge with `box-shadow: 0 0 0 34px` plus
`clip-path: inset(0 -34px)`, retuned to 18px at the mobile breakpoint.

## Notation

`web/src/icons.tsx` is authored, not sourced: one 24-unit field, 1.25 stroke, no
filled shapes except where fill carries meaning. There are no emoji in the UI.

- **Genera** — `Stratus` (files), `Cumulus` (media), `Cirrus` (projects),
  `Cumulonimbus` (apps: the one cloud that actually produces weather).
- **`SkyCover`** — the WMO station circle filled to its okta, with eight rim
  graticules so an empty circle still reads as a calibrated instrument, and a
  single mark for a trace under one eighth. This replaces the
  big-number-plus-progress-bar template.
- File and interface glyphs in the same grammar.

## Motion

One authored moment: the sky-cover circle and the extent bars settle to their true
reading once, on load, via composited `transform` — never `width`. Everything else
is state, 110–190ms, ease-out. The greeting splash runs 1.1s and is dismissible on
any key or pointer press. `prefers-reduced-motion` collapses all of it.

## Components

Buttons (iron primary / outline default / oxblood danger, each with hover, active
and disabled), inputs with an inset iron underline on focus, PIN pad with an
explicit confirm key, observer card, file row, breadcrumbs, specimen row,
sky-cover instrument, command palette, badge, toast, upload tray, skeletons.

`useModal` gives every dialog focus-in, a Tab trap and focus restore. `useAsk`
provides in-world confirm and prompt with an optional type-to-confirm gate; the
browser's `confirm()` and `prompt()` are not used anywhere.

Empty states teach rather than report emptiness: the zero-byte station offers
"Add your first files", and the file list explains that a whole repository can be
dropped in and what gets skipped.
