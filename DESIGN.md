# DESIGN.md

Direction for LEG DAY. This file records the direction the build already follows, so
the rules in `antislop.md` have something to filter against. If any line here does not
match what you want, change it here first and the build follows.

## What this is

An arcade cabinet that happens to be a web page. You are Squeektoshi's legs: the wheel
turns at the cadence the chain publishes, and you tap the power arc to keep the shift
alive. One screen, no scroll, no wallet.

## Identity

The room, not the dashboard. A hamster wheel is a physical object with a rim, spokes, a
hub and a hub that squeaks. The interface borrows that object instead of drawing a chart
about it: the wheel is the board, the arc is the target, the torque bar is how much run
is left in his legs.

Motif: **the rim**. One circle, one arc, one marker. Every readout is a thin rule under
a circle, never a card, never a panel with a shadow.

## Palette

| Role | Value | Why |
|---|---|---|
| Paper | `#f5f5f7` | A daylight room. This is not a dark terminal product, so it does not get a dark theme. |
| Ink | `#17171b` | Text and the marker. Nearly black, never pure black. |
| Accent blue | `#4460cf` | The power arc, the only accent. One accent, used at the one moment that matters. |
| Cream | `#fdfbc8` | The landing pad behind the arc. It is a material, not a fourth accent: it only ever marks where to land. |
| Live green | `#1b7849` | State: he is running, settlement is paying. |
| Ghost gold | `#84660f` | State: he is asleep, the tempo is replayed, no settlement. |
| Miss red | `#b03a2e` | State: a miss, or the endpoint is unreachable. |

The three state colours are a status system, not decoration. Each one appears only on
the chip, the flash line, or the torque bar, never as a background wash. Neutrals carry
everything else, so the page reads as paper with one blue instrument on it.

## Typography

| Face | Where | Why |
|---|---|---|
| Barlow Condensed 600 | Score numerals, the wordmark, section titles | An arena scoreboard is condensed and loud. Numbers have to be legible from across a room. |
| IBM Plex Mono 400 | Telemetry values, labels, buttons | The numbers come off a machine endpoint, so they are set in a machine face. This is a readout, not a terminal costume: there is no fake window and no typed-out command. |
| Quicksand 600 | Prose only (tagline, how-it-works, result note) | Soft, round, small. It is the hamster's voice, and it never touches a number. |

Uppercase labels with `0.12em` to `0.16em` tracking are used on HUD labels only, at 9 to
10px, because that is what a physical control panel does. No uppercase headline anywhere.

## Dials

**ENERGY 2 / RHYTHM 2 / MOTION 2**

- ENERGY 2: the page says hello with a large circle and a two-word wordmark, not with a
  hero, a subtitle, two buttons and a screenshot.
- RHYTHM 2: one composition, held. The board is the page. The only rhythm break is the
  thin rule that separates the readout strip from the wheel.
- MOTION 2: motion exists only where it carries meaning. The marker moves because the
  wheel moves. Bars transition at `0.12s` linear because they are a gauge. Nothing
  fades up, floats, scales or bounces on entry.

## Non-negotiables

1. **Never claim live when it is not live.** When the hamster is idle or the reading is
   stale, the arcade says GHOST SHIFT and refuses to pay a settlement bonus. Honesty is
   the product.
2. **No numbers that are not measured.** Every figure on screen comes from
   `/v1/status` or from this browser's own saved shifts. Nothing is estimated.
3. **No wallet, no signature, no token.** The footer says so, and the code has no
   wallet code to disable.
4. **Light only.** A dark version would break the daylight-room idea, so no toggle is
   shipped. If a dark mode is ever wanted, it is a new direction, not a filter pass.
