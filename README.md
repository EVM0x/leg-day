# LEG DAY

An arcade game where you are Squeektoshi's legs.

Squeekchain publishes the cadence of the wheel in the room: how many thousandths of a revolution per minute it is turning, whether it is running, how far it has travelled, and how full the current block is. LEG DAY turns that feed into a rhythm game. The marker on the wheel turns at his real speed. You tap when it crosses the power arc. Every clean tap is a step. Torque is the clock: it winds up on a hit and bleeds away every second, and when it empties the shift is over.

When he is asleep, the game says so and drops into a **GHOST SHIFT**: it replays the last cadence it saw live, and ghost steps never bank a settlement bonus. Nothing about the score pretends to be live when it is not.

## Play

Open the site and tap. No wallet, no account, no download.

- **Tap / click / space**: step. Perfect taps hold the combo, loose taps break it.
- **Power arc**: narrows as he speeds up. The arc you see is the arc you hit.
- **Torque**: the shift ends when it reaches zero.
- **Block fill**: the bar is the block being mined right now. When a block closes during a live shift you bank one step per ten combo.

## What it reads

Every five seconds, from `https://api.squeekchain.com/v1/status`:

| field | use |
| --- | --- |
| `measurement.rpmMilli` | cadence of the marker |
| `measurement.coreStatus` | live or ghost |
| `measurement.freshness` | whether the reading is still fresh |
| `measurement.distanceMm` | distance readout |
| `builder.anchor.blockHeight` | block number, and settlement triggers |
| `builder.anchor.blockProgress` | block fill bar, in units of 1e9 |

If the API is unreachable the game keeps playing on a ghost tempo and labels itself OFFLINE. It never fabricates a live reading.

## Running it

Static files, no build step, no dependencies:

```
python3 -m http.server 8080
```

## Layout

```
index.html   markup, HUD, how-it-works sheet
style.css    light bench palette, Barlow Condensed / IBM Plex Mono / Quicksand
game.js      polling, wheel state machine, scoring, canvas rendering
DESIGN.md    the visual direction: palette, type, dials, and the reasons for them
```

Scores are kept in `localStorage` under `legday.shifts.v1`, in the player's browser only.

## Status

Testnet toy. No tokens, no wallet connection, nothing to buy or sign.
