# DESIGN.md

Direction for Squeek Leg Day. This file records the direction the build already follows, so
the rules in `antislop.md` have something to filter against. If any line here does not match
what you want, change it here first and the build follows.

## What this is

An instrument, not a dashboard. Squeektoshi's wheel produces work one pass at a time, and
work is counted in rounds of ten minutes. You are the one closing the rounds: his running
arrives as bursts, a round holds 10,000 work units, and work never moves between rounds. One
screen, no scroll, no wallet.

## Identity

A workshop bench with a measuring rule on it. The paper is a chalk green, the ink is
green-black, and the only bright thing in the room is the work that has actually been
counted.

Motif: **the rule and the stamp**. The round is drawn as a steel rule with ten major ticks,
one per thousand work units, because the whole whitepaper is about measuring a wheel. Every
number is set as if it were stamped onto a plate: uppercase, monospaced, tight to its rule.
Nothing floats, nothing glows, nothing is a card except the two sheets that interrupt play.

## Palette

| Role | Value | Why |
|---|---|---|
| Paper | `#e9ece2` | A chalk-green bench top, not a grey UI canvas and not cream. The room is a workshop, so the paper has a tint of the machine in it. |
| Ink | `#191c17` | Text and the fill. Nearly black, green-black rather than neutral. |
| Machine green | `#1c6b45` | Work that is packed, the live chip, the sealed round. One accent, spent only on the count. |
| Ghost gold | `#6f5209` | State: he is asleep, the difficulty is a replay, no settlement. |
| Miss red | `#a3301f` | State: a burst was rejected, or an endpoint is unreachable. |
| Rule line | `#c2c7b8` | The tick marks. They are a measuring scale, so they are drawn, not coloured. |

The three state colours are a status system, not decoration. Each appears only on the chip,
the flash line, or the burst plate. Every text token is checked against its own background:
`--ink` 14.4:1, `--dim` 5.77:1, `--faint` 5.13:1, the primary button 5.03:1 on paper, all
clearing AA. In dark theme the lowest ratio is 6.45:1.

## Typography

| Face | Where | Why |
|---|---|---|
| Big Shoulders Display 800 / 600 | Burst numerals, the score, the wordmark, sheet titles | A plate stamped on a machine: tall, narrow, industrial. The burst has to be readable at arm's length while a clock is running. |
| JetBrains Mono 400 / 600 | Every measured value, every label, every button | The numbers come off a machine endpoint, so they are set in a machine face, and tabular figures keep a live counter from jittering. This is a readout, not a terminal costume: there is no fake window, no prompt, no typed-out command. |
| Work Sans 400 | Sheet prose only | Long explanation needs a text face. It never appears in the play area, where every word is a label. |

**On the uppercase micro-labels** (R-06): `ROUND`, `PACKED`, `CAP`, `WORK UNITS` are set at
9–10px with 0.16em tracking. This is the one place tracking is deliberately wide, because
these labels sit under a scale where the eye needs them to read as a scale's engraving
rather than as prose. They are never more than three words, never a headline, and never
used to decorate a section that has no data under it.

## Layout

One composition held for the whole game: wordmark and controls on one line, the rule, the
chute, two actions, one flash line, one readout strip. The board is centred in whatever
height the viewport has left, so a tall screen gets air above and below the same block
instead of a void in the middle. The only break in the composition is a sheet, which covers
the screen because it is a different mode of attention.

Dials: **ENERGY 2 / RHYTHM 2 / MOTION 1**. Calm instrument, even spacing, almost no motion.

## Motion and elevation, and why

- **Shadow (R-12)**: exactly two elements carry one, the chute plate and a sheet card. Both
  are things that sit on top of the bench rather than in it. Nothing else floats.
- **Motion (R-19)**: three transitions exist and each answers a question. The fill width
  answers "how much of the round is gone", the burst clock answers "how long do I have", and
  the plate's press state answers "did that register". There is no entrance animation, no
  fade-up, no bounce, no confetti on a sealed round: the number is the reward.
- The clock is a `transform` on a single bar, so it runs on the compositor and never
  reflows the layout.

## What this refuses

- No wallet, no signature, no token, no purchase.
- No multiplier invented to make a tier feel rewarding. Holder status buys sight, and the
  copy says so in those words.
- No fake "live" claim: when the wheel is idle the chip says GHOST and the shift says it is
  a replay.
- No number on the page that a reader cannot recompute from the four expressions printed in
  HOW THIS WORKS.
