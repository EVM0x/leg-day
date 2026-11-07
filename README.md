# Squeek Leg Day

An arcade that runs on Squeekchain's own arithmetic. Squeektoshi's wheel produces work one
pass at a time, and work is counted in rounds of ten minutes. You close the rounds: his
running arrives as bursts, a round holds **10,000 work units**, and work never moves from
one round to the next. Pack what fits, let the rest go, and the round is priced at the
difficulty your own rounds set.

One page. No wallet, no sign-up, nothing to buy. https://squeeklegday.evm0x.com

## The four expressions it runs on

Quoted from the Squeekchain whitepaper, and the only maths in the game:

```
blockUnits += floor(w × 10^12 / D)
D_next      = floor((29 × D + floor(w × 1,000 / 40)) / 30)   when w >= 40
D_next      = D                                              when w <  40
height      = floor(blockUnits / 10^9)
```

`w` is the work a round held, `D` is difficulty: the work that 1,000 Squeek blocks cost. A
round holds at most 10,000 because ten minutes at the paper's minimum 60 ms between passes
is exactly 10,000. A passage past the cap is rejected, and unused room is lost when the
round closes, because work never moves between rounds.

Two consequences the game is built around:

- **Difficulty is a ratchet you turn yourself.** A heavy round pulls difficulty a thirtieth
  of the way toward the level where that round's work would have earned exactly 40 blocks,
  so round four pays less per unit than round one. That is the rule, not a penalty.
- **The remainder carries.** Every billion block units completes a block, so the fractional
  part of a round is not lost, it waits for the next round to push it over the line.

## Playing

- A **burst** is one unbroken run, so it carries a work count: 150 units is nine seconds,
  2,500 is two and a half minutes.
- **TAKE IT** (`space` / `enter`) adds it to the round. **LET IT PASS** (`↓` / `backspace`)
  drops it for good.
- A burst that does not fit is rejected and still leaves the chute.
- Each round offers 13,000 work against 10,000 of room, so about three bursts a round have
  to go. A round that lands exactly on 10,000 is **sealed**.
- A shift is four rounds. Score is Squeek blocks completed.

## What is real, and what is the arcade

Real: the round cap, the reject rule, the pricing, the difficulty ratchet, the block
boundary, the starting difficulty, the shift seed.

The arcade, and labelled as such on the page: the clock is compressed (a burst waits about
two seconds instead of ten minutes), and holder status buys **sight** — one burst of preview
— not score. Nothing here signs, spends, or holds anything, and no number on screen is a
chain balance. Block units are arithmetic, not a balance you own.

## Data

| Source | Used for |
|---|---|
| `api.squeekchain.com/v1/status` | difficulty to start at, cadence, core status, block height, distance |
| `SqueekCore.state()` on Sepolia, `0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4` | fallback for difficulty and block height when the API is silent |
| `api.squeekchain.com/v1/accounts/<address>` | holder tier, read from the browser |
| `community.squeekchain.com/v1/community/profiles/<code>` | holder tier by member code, via `api.php` because that host only sends CORS to squeekchain.com |

If both are silent the shift starts at the paper's floor of 1,000 and says so on screen
rather than inventing a number. With no chain reading at all the seed is marked `LOCAL`.

## Files

| File | What it is |
|---|---|
| `pack.js` | The rules. Pure functions, no DOM, no clock, no network: bursts, block units, difficulty, a shift state machine |
| `packer.js` | The page. Phase machine, painting, the burst clock, sheets, keyboard |
| `chain.js` | Polling and the seed, with the API's answers taking precedence over the contract's |
| `round.js` | Shift seed derivation and the 1200×630 result card |
| `audio.js` | Tones synthesised in the browser, so there are no audio files |
| `holder.js` | Reads a public profile and returns a tier |
| `api.php` | Server-side read of a member-code profile. Only needed for member codes |
| `DESIGN.md` | The direction this build follows |

`pack.js` is deliberately separable: `node` can load it and check the arithmetic without a
browser. That is how the reject path, the seal path, the ratchet and the block boundary were
verified before the page was wired to them.

## Running it

Static hosting is enough:

```
python3 -m http.server 8080
```

For member-code holder reads you need PHP in front of it:

```
php -S 127.0.0.1:8080
```

The game itself never needs a server.

## Credit

Built by [evm0x](https://evm0x.com). Rules and numbers belong to Squeekchain; the arcade
around them is this repo's.
