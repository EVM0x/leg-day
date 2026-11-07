# DESIGN.md

Direction for Squeek Leg Day. This file records the direction the build already follows, so
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
| Paper | `#e9ece2` | A chalk-green bench top, not a grey UI canvas and not cream. The room is a workshop, so the paper has a tint of the machine in it. |
| Ink | `#191c17` | Text and the marker. Nearly black, green-black rather than neutral. |
| Machine green | `#1c6b45` | The power arc, the live chip, the block bar. One accent, used at the one moment that matters. |
| Landing pad | `#d8e8bd` | The pale wedge behind the arc. It is a material, not a second accent: it only ever marks where to land. |
| Live green | `#1c6b45` | State: he is running, settlement is paying. |
| Ghost gold | `#6f5209` | State: he is asleep, the tempo is replayed, no settlement. |
| Miss red | `#a3301f` | State: a miss, or the endpoint is unreachable. |

The three state colours are a status system, not decoration. Each one appears only on
the chip, the flash line, or the torque bar, never as a background wash. Every text token
is checked against its own background: `--dim` 5.77:1, `--faint` 5.13:1, accent 5.42:1 on
paper, all clearing AA.

## Typography

| Face | Where | Why |
|---|---|---|
| Big Shoulders Display 800 / 600 | Score numerals, the wordmark, section titles | A plate stamped on a machine: tall, narrow, industrial. Numbers have to be legible from across a room. |
| JetBrains Mono 400 | Telemetry values, labels, buttons | The numbers come off a machine endpoint, so they are set in a machine face. This is a readout, not a terminal costume: there is no fake window and no typed-out command. |
| Work Sans 400 / 600 | Prose only (tagline, how-it-works, result note) | Quiet and plain. It is the hamster's voice, and it never touches a number. |

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

## Two rooms

| | DAY (default) | NIGHT |
|---|---|---|
| Ground | `#e9ece2` chalk-green paper | `#131713` night-garage black-green |
| Accent | `#1c6b45` | `#86dc9e`, the same green lifted until it clears AA on dark |
| Landing pad | pale lime `#d8e8bd` | dark moss `#26301c` |
| Why | A lit workshop with one instrument in it | The same workshop after hours, where the wheel is the only lit thing |

Day follows `prefers-color-scheme` on first visit, the toggle overrides it, and the
choice is remembered in `localStorage` under `legday.theme.v1`. The wheel is drawn on a
canvas, so its colours are tokens too (`--wheel-*`), never literals in the drawing code.

## Not someone else's build

The CODE lane already has entries that read the same `/v1/status` feed. Before shipping,
every one of them was opened and compared against this build, on four axes: what the
player does, what they can lose, what the page looks like, and what it is called.

| Their build | What it is | Why this is not it |
|---|---|---|
| Squeek Out | Hold-and-bail game with SQK and NFT-block rewards, wallet required | There is no stake here and nothing to bail from: the wheel is a timing target, the clock is torque, and the score is skill only. |
| Squeek race | Spectator race where hourly work units are split across five fictional hamsters | Nothing here is simulated and nothing is a race: the marker turns at the published cadence and you tap it. |
| Squeek or Sleep | Prediction market on each 10-minute round | No wagering, no rounds to call, no wallet signature. |
| Wheel Canvas | Generative art painted from wheel telemetry | The canvas here is a playfield with a hit window, not an artwork. |
| Hamster Tower | One floor per settled round, shared and endless | Block closes only bank a bonus inside an active shift, and they build nothing permanent. |
| Squeektoshi Live / Hamster Track | Read-only status dashboards | This is a game that happens to read the status, not a dashboard. |

Surface checks, since those are what make two sites feel like the same site: the type
stack (Big Shoulders Display / JetBrains Mono / Work Sans) is not used by any of the
eighteen projects on the board, and the palette is green on chalk paper, while the
closest neighbours are navy-and-gold, black-and-amber, white-and-red and cream-and-amber.
Radii are another tell: everything here is either square or a circle, with no 8/12/18px
card corners anywhere.

## The holder tier

A tier system is where a game like this usually stops being free. This one does not: the
lookup is opt-in, read-only, and buys difficulty rather than access.

- **Free stays free.** No shift is gated. A visitor with no profile gets the full arc and the
  same seed as everyone else on that block.
- **The tier is a handicap, not a pass.** LIGHT, HEAVY and PRIME each narrow the power arc,
  widen the drift and multiply the steps. Harder to play, worth more per step.
- **It is not only Squeeks.** Twenty holder collections, the builder badges and the three
  one-of-one trophies all carry weight, because a tier that counted one collection would be
  ignoring most of what a Squeekchain profile is. The status line names what it found rather
  than showing a bare number.
- **It is read-only on purpose.** No signature, so it cannot prove ownership. That is the
  design, not a hole: a claimed tier you do not hold only makes the game harder for you. The
  card says `TIER`, never `HOLDER`, so a shared screenshot never asserts a wallet it cannot
  back.
- **The badge is set in the accent colour at the top of the card**, right of the wordmark and
  clear of the dial, because the multiplier is the reason the score is that size.

The badge endpoint sends CORS headers only to `squeekchain.com`, so `api.php` proxies that one
read server-side. It is the only server-side code in the project, and it is deliberately the
dullest file in it: GET only, two hosts, two path shapes, nothing stored.

## Non-negotiables

1. **Never claim live when it is not live.** When the hamster is idle or the reading is
   stale, the arcade says GHOST SHIFT and refuses to pay a settlement bonus. Honesty is
   the product.
2. **No numbers that are not measured.** Every figure on screen comes from
   `/v1/status` or from this browser's own saved shifts. Nothing is estimated.
3. **No wallet connection, no signature, no token.** The footer says so, and the code has no
   wallet code to disable. The one address the page can accept is typed into HOLDER SHIFT for
   a read-only lookup, and it is never used to sign anything.
4. **Two rooms, one identity.** The arcade ships in two lights: **DAY** (chalk paper) and
   **NIGHT** (night-garage black-green). They are the same room at different hours, not a
   filter pass: the wheel, the arc, the landing pad and the one green accent survive both,
   and every text token is re-picked so it clears WCAG AA on its own background. The accent
   is lighter at night because `#1c6b45` fails on a dark ground; the landing pad becomes
   dark moss instead of pale lime for the same reason. A theme that breaks a single control
   is a defect, so both rooms are clicked through before shipping.
