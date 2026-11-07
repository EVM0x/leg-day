# LEG DAY

An arcade game where you are Squeektoshi's legs.

Squeekchain publishes the cadence of the wheel in the room: how many thousandths of a revolution per minute it is turning, whether it is running, how far it has travelled, and how full the current block is. LEG DAY turns that feed into a rhythm game. The marker on the wheel turns at his real speed. You tap when it crosses the power arc. Every clean tap is a step. Torque is the clock: it winds up on a hit and bleeds away every second, and when it empties the shift is over.

When he is asleep, the game says so and drops into a **GHOST SHIFT**: it replays the last cadence it saw live, and ghost steps never bank a settlement bonus. Nothing about the score pretends to be live when it is not.

## Play

Live now: https://vm-0-13-ubuntu.tail1b7f8d.ts.net/legday/

Open the site and tap. No wallet, no account, no download.

- **Tap / click / space**: step. Perfect taps hold the combo, loose taps break it.
- **Power arc**: narrows as he speeds up. The arc you see is the arc you hit.
- **Torque**: the shift ends when it reaches zero.
- **NIGHT MODE**: one button flips the arcade between a daylight room and the same room after dark. Both themes are fully styled, and the choice is remembered.
- **Block fill**: the bar is the block being mined right now. When a block closes during a live shift you bank one step per ten combo.
- **VS GHOST**: every shift you play is recorded as a timeline of taps. The next shift races it in real time: the marks inside the wheel are the angles your ghost landed, and the gap counter tells you whether you are ahead. The results card hands you a code, and anyone who pastes it races your ghost, no server involved.
- **SOUND**: one tick per quarter turn, so the tempo you hear is the tempo he is running, plus a distinct hit sound per tap quality. Synthesised in the browser with WebAudio, so there is no audio file to download and nothing sampled.

## Racing someone else's ghost

A ghost is a list of `{t, a, q}`: milliseconds into the shift, the angle the marker was at, and whether the tap was clean. It packs into a base64 string of roughly 100 to 150 characters and is stored under `legday.ghost.v1`. Paste a code into the results card and that ghost becomes your rival. Only a better run of your own replaces your saved ghost, so the rival keeps getting harder, unless you paste one in deliberately.

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
style.css    chalk-paper palette, Big Shoulders Display / JetBrains Mono / Work Sans
audio.js     WebAudio ticks and hit tones, generated, no asset files
ghost.js     recording a shift, packing it into a code, decoding someone else's
game.js      polling, wheel state machine, scoring, canvas rendering
DESIGN.md    the visual direction: palette, type, dials, and the reasons for them
```

Scores are kept in `localStorage` under `legday.shifts.v1` and the rival ghost under `legday.ghost.v1`, in the player's browser only.

## What this is not

The CODE lane already has projects on the same feed. This one is not a dashboard, not a
prediction market, not a hold-and-bail game and not a race to spectate: the only thing it
does with the telemetry is set the tempo you have to tap. It reads `/v1/status` and nothing
else, it has no wallet code, and it pays nothing but a number in your own browser.

Of the eighteen projects on the board when this was built, none of them made a sound and none
of them kept a record of how you played. Those two gaps are the whole reason for the audio
and the ghost: the game now has a medium nobody used and a reason to come back that is not a
leaderboard.

## Status

Testnet toy. No tokens, no wallet connection, nothing to buy or sign.
