# Squeek Leg Day

An arcade game where you are Squeektoshi's legs.

Squeekchain publishes the cadence of the wheel in the room: how many thousandths of a revolution per minute it is turning, whether it is running, how far it has travelled, and how full the current block is. Squeek Leg Day turns that feed into a rhythm game. The marker on the wheel turns at his real speed. You tap when it crosses the power arc. Every clean tap is a step. Torque is the clock: it winds up on a hit and bleeds away every second, and when it empties the shift is over.

When he is asleep, the game says so and drops into a **GHOST SHIFT**: it replays the last cadence it saw live, and ghost steps never bank a settlement bonus. Nothing about the score pretends to be live when it is not.

Every shift is also a **round**. The block that is open when you press START is the block you played, and its state seeds the challenge you get: how wide the power arc is, how far it drifts and how many times it swings. Two players on the same block play the same shift. The HUD shows the seed as four hex characters so they can compare.

## Play

Live now: https://vm-0-13-ubuntu.tail1b7f8d.ts.net/legday/

Open the site and press START. No wallet, no account, no download.

- **START**: the only control that begins a shift. Everything else on the page can be used
  first, so reading HOW THIS WORKS or turning the sound off never starts the game underneath you.
- **Tap / click / space** (during a shift): step. Perfect taps hold the combo, loose taps break it.
- **Power arc**: narrows as he speeds up. The arc you see is the arc you hit.
- **Torque**: the shift ends when it reaches zero.
- **NIGHT MODE**: one button flips the arcade between a daylight room and the same room after dark. Both themes are fully styled, and the choice is remembered.
- **Block fill**: the bar is the block being mined right now. When a block closes during a live shift you bank one step per ten combo.
- **VS GHOST**: every shift you play is recorded as a timeline of taps. The next shift races it in real time: the marks inside the wheel are the angles your ghost landed, and the gap counter tells you whether you are ahead. The results card hands you a code, and anyone who pastes it races your ghost, no server involved.
- **SAVE CARD**: the results sheet draws a 1200×630 PNG of the shift (score, cadence, block, seed, ghost code) on a canvas and hands it to the share sheet on a phone or downloads it on a desktop. No server, no upload, nothing leaves the page unless you send it.
- **HOLDER SHIFT**: paste a Squeek address and the shift gets harder and pays more. Read-only, unsigned, optional. See below.
- **SOUND**: one tick per quarter turn, so the tempo you hear is the tempo he is running, plus a distinct hit sound per tap quality. Synthesised in the browser with WebAudio, so there is no audio file to download and nothing sampled.

## HOLDER SHIFT

The arcade is free and stays free: no wallet to play, no shift locked behind a token. A profile buys a different thing, a harder shift that pays more, and you have to ask for it.

Paste either an address or a member code into HOLDER SHIFT.

- **An address** is read through `https://api.squeekchain.com/v1/accounts/<address>`, which lists the Squeeks in that wallet and in staking.
- **A member code** (the eight characters on a Squeekchain profile, e.g. `q5ga9bvy`) is read through `community.squeekchain.com/v1/community/profiles/<code>`, which carries every badge the profile holds.

It is not only Squeeks. Squeekchain hands out holder badges for twenty other collections (Punks, Apes, Milady, IMD, Normies, Yield Fields, QUOTRONS and the rest) and builder badges for the CODE lane, and a tier that counted only Squeeks would ignore most of what a profile actually is. So the weight is everything:

| weight | what it counts |
| --- | --- |
| 1 | each Squeek in the wallet, each holder collection, each builder badge |
| 2 | each staked Squeek, because staking is the half that does the work |
| 3 | each one-of-one trophy: First Squeek, First Invitooor, First Buildooooor |

| tier | weight | arc | swings | steps |
| --- | --- | --- | --- | --- |
| LIGHT | 1-2 | ×0.86 | ×1.25 | ×1.5 |
| HEAVY | 3-5 | ×0.74 | ×1.5 | ×2 |
| PRIME | 6+ | ×0.62 | ×1.8 | ×2.5 |

The tier is frozen when you press START, the same way the round is, so switching mid-shift cannot change the target under your finger. The results sheet shows the raw steps next to the multiplied ones, and the card carries a `TIER` badge so the multiplier is never hidden.

Neither read is signed, so neither can prove the profile is yours, and it is built that way on purpose: a tier you do not hold only narrows the arc and widens the swings for you, so claiming one is a handicap, not a cheat. The card says `TIER` rather than `HOLDER` for the same reason. The tier stays in `localStorage` under `legday.holder.v1`. No key, no signature, no transaction.

### Why there is a PHP file

`api.squeekchain.com` sends `Access-Control-Allow-Origin: *` and can be fetched straight from the page. `community.squeekchain.com` only sends CORS headers to `https://squeekchain.com`, so a browser on any other origin cannot read a profile's badges. `api.php` fetches that one endpoint server-side and returns nothing but the badge ids, the Aura and the rank. It is read-only, allows only GET, only those two hosts and two path shapes, stores nothing, and holds no key. On a host without PHP the lookup says so instead of failing silently.

## The round seed

`SqueekCore.state()` returns eight static words. Three of them describe the round being mined right now and hold still for the whole block:

| word | name |
| --- | --- |
| 0 | `settledThroughRound` |
| 1 | `cumulativeWork` |
| 3 | `blockHeight` |

Squeek Leg Day builds the string `sqk:<settledThroughRound>:<cumulativeWork>:<blockHeight>` from those three words as trimmed hex, runs FNV-1a over it for a 32-bit seed, and feeds that seed to mulberry32. The first three draws set the arc width multiplier (0.88×–1.14×), the drift amplitude (4°–14°) and the swing count (1–3 per shift). The first four hex of the seed are the `ROUND SEED` shown in the HUD.

This is checkable without trusting the page:

```
curl -s -X POST https://ethereum-sepolia-rpc.publicnode.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4","data":"0xc19d93fb"},"latest"]}'
```

Take words 0, 1 and 3, strip leading zeroes, join with colons behind `sqk:`, and hash with the same FNV-1a in `round.js`. The result is the round you played. A settlement moves `settledThroughRound`, so the next block is a different shift.

## Where the numbers come from

The wheel telemetry is hardware, so it only exists in the API: `/v1/status` gives
`rpmMilli`, `coreStatus`, `freshness` and `distanceMm`. The settled work does not need the
API, because it is on Sepolia. The page calls `SqueekCore.state()` at
`0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4` over a public RPC on **every** poll, not only
when the API fails, because that call is what seeds the round. If `/v1/status` stops
answering, the block number, block fill and seed stay true and only the cadence falls back
to a labelled ghost tempo. Every read is an `eth_call`: no wallet, no key, no transaction,
nothing spent.

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
index.html   markup, HUD, how-it-works sheet, holder sheet
style.css    chalk-paper palette, Big Shoulders Display / JetBrains Mono / Work Sans
audio.js     WebAudio ticks and hit tones, generated, no asset files
round.js     block-seeded challenge (FNV-1a + mulberry32) and the share card
ghost.js     recording a shift, packing it into a code, decoding someone else's
holder.js    the read-only Squeek and badge lookup behind HOLDER SHIFT
api.php      the one server-side piece: a read-only proxy for the badge endpoint
game.js      polling, wheel state machine, scoring, canvas rendering
DESIGN.md    the visual direction: palette, type, dials, and the reasons for them
```

Scores are kept in `localStorage` under `legday.shifts.v1`, the rival ghost under `legday.ghost.v1` and the holder tier under `legday.holder.v1`, in the player's browser only.

## What this is not

The CODE lane already has projects on the same feed. This one is not a dashboard, not a
prediction market, not a hold-and-bail game and not a race to spectate: the only thing it
does with the telemetry is set the tempo you have to tap. It has no wallet code and it pays
nothing but a number in your own browser. It reads two things: `/v1/status` for the cadence
of the hardware, and `SqueekCore.state()` for the round the challenge is built from.

Of the eighteen projects on the board when this was built, none of them made a sound and none
of them kept a record of how you played. Those two gaps are the whole reason for the audio
and the ghost: the game now has a medium nobody used and a reason to come back that is not a
leaderboard.

## Status

Testnet toy. No tokens, no wallet connection, nothing to buy or sign.
