# MiniCloud design system — THE COLD VAULT

Recorded from the built world (seed `720c11a3`). Ground truth, not intention: everything
below is what `web/src/styles.css` and the five surfaces actually do.

## Mood

A chamber cut into rock. Your work is deposited, sealed under frost, and kept cold while
the power fails somewhere else. The only warm thing in the whole product is the light
falling in through the portal — and that light is load-bearing: amber means a thing has
left the cold and gone out into the open.

The register is dense and quiet because the vault's job is to be *read*. Expression lives
in the material (basalt, frost, worklight, stencil lettering) and in one drenched surface
(the portal), never in the way of a task.

**Anti-references**, inherited from PRODUCT.md and actively defended: enterprise NAS
dashboards, generic SaaS admin templates, and crypto/gamer RGB. The last one is the live
risk for a dark product — it is held off by keeping every category colour low-chroma and
letting exactly one warm accent exist.

## Colour — Drenched dark

Dark is not a theme here, it is the room. The use scene is "genuinely everywhere": a phone
in a dark room at 1am and a laptop by a window at noon. A basalt ground with frost-white
lettering carries enough contrast for daylight and emits little enough for the dark.
There is no light mode and no toggle; a cold store has one condition.

```
--rock          oklch(0.168 0.018 250)   page ground
--rock-deep     oklch(0.13  0.016 250)   aisle, sunken wells, the portal
--chamber       oklch(0.214 0.02  250)   panels, register, sheets
--chamber-2/3   oklch(0.258 / 0.30)      raised, hover
--rime          oklch(0.975 0.004 230)   primary text
--rime-2        oklch(0.815 0.016 235)   secondary text
--rime-3        oklch(0.685 0.018 240)   meta, register labels
--edge          oklch(0.335 0.022 250)   hairlines
--edge-bright   oklch(0.44  0.028 245)   control borders
--ice           oklch(0.83  0.105 200)   cold accent: focus, selection, sealed, links
--portal        oklch(0.80  0.145 72)    THE warm light: primary action, issued, live
--ok/--warn/--alarm                      status only, never decoration
```

Secondary text is tinted from the ground's own hue (250°), never neutral gray — that is
what keeps the chamber from reading as a NAS panel.

### Box labels

Four category colours, deliberately held at low chroma (0.068–0.095) and mid lightness so
sealed crates stay quiet and the portal amber remains the brightest thing on screen:

```
--lbl-files     oklch(0.60 0.068 205)    no band
--lbl-media     oklch(0.55 0.078 292)    vertical dash band
--lbl-projects  oklch(0.60 0.075 152)    dotted band
--lbl-apps      oklch(0.66 0.095 72)     45° hatch band
```

**Colour is never the only signal.** Every label also carries a 3px pattern band along the
foot of its crate, repeated in the key. This is the accessibility guarantee and the reason
the categories survive both CVD and a grayscale print.

## Type

One face, self-hosted, offline-safe: **Archivo** variable (`wdth 62–125`, `wght 400–700`),
two woff2 subsets in `web/public/fonts/`. No CDN — this app runs on a home server that may
have no internet.

One family, three voices, taken from the width axis:

- **Register lettering** (`.reg`): `font-stretch: 68%`, 600, uppercase, `letter-spacing:
  0.14em`, 0.66–0.75rem. Every label, column head, chamber name, condition readout. This is
  the stencil on the crate.
- **Display** (`h1–h4`): `font-stretch: 78%`, 700, tracking −0.015em.
- **Body / data**: `font-stretch: 100%`, 400–500, with `.num` adding tabular figures for
  every size, code, clock and quantity.

Real code and paths use the system mono stack — monospace for code, never as a costume.

**Filenames and prose never go uppercase.** The stencil voice is for labels the user reads
once; the things they scan for stay in sentence case at readable width.

## Surfaces

- **The portal** (`Welcome`) — the one drenched surface. Rock ground, a defined shaft of
  amber falling from above, the mark, and the depositor plates beneath it. Plates are cold
  metal: the depositor's colour sits at 20% over the plate plus a 5px band along the foot,
  so it identifies without becoming an avatar tile.
- **The chamber** (`Shell`) — a 214px aisle on the left (chambers with `CH·0n` numbers, the
  active one lit by a 1px amber doorway), and a **condition band** across the top of the
  work area carrying live capacity, sealed, free, last deposit, issued count and time. The
  band is the instrument you glance at; it is why this app can be "checked" without reading.
- **The rack** (`Home`) — storage as a 12×5 shelf elevation. One slot is 1/60th of the pool,
  so occupancy is *counted*, not estimated off a curve. Refuses the donut and the
  big-number-plus-supporting-stats template.
- **The register** (`Files`) — a ruled drawing-schedule table: mark, description, accession,
  mass, deposited. Hairlines, no cards, no nesting.
- **The issue desk** (`Launch`) — accessions lifted out of cold storage. `Issued` (amber,
  anyone) vs `Held` (ice, depositors only) as drafted stamps plus a lamp — two signals.
- **The terms** (`Settings`) — a deposit agreement in numbered clauses. Clause numbers are
  kept because in an agreement the number *is* how you refer to it. Clause 01 is the master
  key, carrying an amber wash, because losing that file is the one failure the product
  cannot undo.

Radii are near-square: 3px controls, 5px panels. Nothing in a cold store is rounded.

## Motion

**One authored moment: the chamber opens.** On each chamber change the contents clear from
frost — `blur(7px) → 0` with a 10px rise, 460ms on an exponential ease-out, staggered 55ms
across the first four blocks (`.opens > *`). It reaches past transform and opacity, as the
craft floor asks, and it happens once per navigation rather than on every section.

Everything else is state, not entrance: keypad press, lamp breathe, row hover, dot fill,
progress. Progress animates `transform: scaleX()`, never `width`.

`prefers-reduced-motion: reduce` removes the entrance entirely and collapses all
transitions; the admission log still clears on its timer.

## Components

Buttons (portal / quiet / alarm, plus `-sm`), inputs with hint and error rows, the keypad,
depositor plate, condition readout, rack slot, register entry, stamp, lamp, icon button,
picker, sheet (modal, used only where a task needs protected focus), deposit manifest,
day-book log entry, clause, and the frosted loading fill.

Every control ships default / hover / focus-visible / active / disabled. Focus is a 2px
ice outline at 2px offset, everywhere, never removed.

**Icons are drawn**, not typed: `components/Icons.tsx`, one 24-unit grid, 1.6 stroke, square
caps and miter joins — cut like stencils. There is no emoji anywhere in the interface.

## Voice

The vault's nouns are used where they are *more* accurate than the generic word, and
dropped where they would obstruct: a folder is a shelf, removing something puts it on the
thaw shelf (it really is a 30-day recovery window), serving really is issuing something out
of cold storage. Error messages, buttons and hints stay plain: "Deposit failed — {reason}",
"Withdraw a copy", "At least 6 characters." The greeting is untouched product truth and
still greets by name, including the late-night "Moonlight, {name} 🌙".
