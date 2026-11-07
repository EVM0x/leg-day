/* LEG DAY, a Squeekchain arcade.
   The marker turns at the cadence published by api.squeekchain.com/v1/status.
   Nothing here signs, spends, or stores a key. */

const API = "https://api.squeekchain.com/v1/status";

// The API is the only place the hardware telemetry lives, but the settled work
// is on Sepolia, so the chain can be read without it. These are read-only
// eth_calls: no wallet, no key, no transaction.
const CORE = "0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4";
const RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
  "https://sepolia.rpc.thirdweb.com",
];
const POLL_MS = 5000;

const TORQUE_START = 55;
const TORQUE_MAX = 100;
const TORQUE_DECAY = 9;      // per second
const TORQUE_PERFECT = 9;
const TORQUE_GOOD = 5;
const TORQUE_MISS = -10;

const RPS_MIN = 0.30;
const RPS_MAX = 1.20;
const GHOST_FALLBACK_RPS = 1.0;   // 60 rpm, the tempo used when nothing live has ever been seen
const STORE_KEY = "legday.shifts.v1";
const STORE_MAX = 8;

const wheel = document.getElementById("wheel");
const ctx = wheel.getContext("2d");
const el = {
  mode: document.getElementById("mode"),
  steps: document.getElementById("steps"),
  combo: document.getElementById("combo"),
  torque: document.getElementById("torqueBar"),
  rpm: document.getElementById("rpm"),
  block: document.getElementById("block"),
  blockBar: document.getElementById("blockBar"),
  dist: document.getElementById("dist"),
  flash: document.getElementById("flash"),
  source: document.getElementById("source"),
  results: document.getElementById("results"),
  how: document.getElementById("how"),
  rSteps: document.getElementById("rSteps"),
  rCombo: document.getElementById("rCombo"),
  rAcc: document.getElementById("rAcc"),
  rMode: document.getElementById("rMode"),
  rBlock: document.getElementById("rBlock"),
  rPlace: document.getElementById("rPlace"),
  rLine: document.getElementById("rLine"),
  rNote: document.getElementById("rNote"),
  ghostDelta: document.getElementById("ghostDelta"),
  rGhost: document.getElementById("rGhost"),
  rGhostCode: document.getElementById("rGhostCode"),
  soundBtn: document.getElementById("soundBtn"),
  startBtn: document.getElementById("startBtn"),
  startSub: document.getElementById("startSub"),
};

const chain = {
  status: "boot",          // boot | live | ghost | offline
  rpmMilli: 0,
  lastLiveRps: null,
  blockHeight: 0,
  blockProgress: 0,
  distanceMm: 0,
  seen: false,
  lastPollAt: 0,
  source: null,            // api | chain | null
  workPerThousandBlocks: 0,
  paused: false,
};

const game = {
  running: false,
  angle: 0,
  torque: TORQUE_START,
  steps: 0,
  combo: 0,
  bestCombo: 0,
  taps: 0,
  perfects: 0,
  settlement: 0,
  blockAtStart: 0,
  modeAtStart: "ghost",
  elapsed: 0,
  tickAngle: 0,
  ghost: null,
  ghostIdx: 0,
  ghostSteps: 0,
};

let rafId = null;
let lastFrame = 0;
let flashTimer = null;
let lastPaintedMode = null;
let ghostDeltaText = "";

/* ---------- chain ---------- */

function baseRps() {
  if (chain.status === "live" && chain.rpmMilli > 0) return chain.rpmMilli / 60000;
  if (chain.lastLiveRps !== null) return chain.lastLiveRps;
  return GHOST_FALLBACK_RPS;
}

function clampedRps() {
  return Math.min(RPS_MAX, Math.max(RPS_MIN, baseRps()));
}

function arcHalfWidth() {
  const t = (clampedRps() - RPS_MIN) / (RPS_MAX - RPS_MIN);
  return ((30 - 12 * t) * Math.PI) / 180;
}

async function poll() {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const d = await res.json();
    const m = d.measurement || {};
    const a = (d.builder && d.builder.anchor) || {};

    const stale = m.freshness !== "online";
    const rpmMilli = Number(m.rpmMilli) || 0;
    const running = String(m.coreStatus || "").toUpperCase() === "RUNNING";

    if (running && rpmMilli > 0 && !stale) {
      chain.status = "live";
      chain.rpmMilli = rpmMilli;
      chain.lastLiveRps = Math.min(RPS_MAX, Math.max(RPS_MIN, rpmMilli / 60000));
    } else {
      chain.status = stale ? "offline" : "ghost";
      chain.rpmMilli = rpmMilli;
    }

    const prevHeight = chain.blockHeight;
    chain.blockHeight = Number(a.blockHeight) || 0;
    chain.blockProgress = Number(a.blockProgress) || 0;
    chain.distanceMm = Number(m.distanceMm) || 0;
    chain.seen = true;
    chain.lastPollAt = Date.now();
    chain.source = "api";

    if (prevHeight && chain.blockHeight > prevHeight) settle(chain.blockHeight - prevHeight);

    paintChain();
  } catch (err) {
    chain.status = "offline";
    // the telemetry is gone, but the settled work is not: read SqueekCore
    // directly so the block bar keeps telling the truth instead of blanking
    const core = await readCore();
    if (core) {
      const prevHeight = chain.blockHeight;
      chain.blockHeight = core.blockHeight;
      chain.blockProgress = core.blockProgress;
      chain.workPerThousandBlocks = core.workPerThousandBlocks;
      chain.paused = core.paused;
      chain.seen = true;
      chain.source = "chain";
      chain.status = "ghost";
      if (prevHeight && chain.blockHeight > prevHeight) settle(chain.blockHeight - prevHeight);
    } else {
      chain.source = null;
    }
    paintChain();
  }
}

// SqueekCore.state() returns eight static words:
// settledThroughRound u64, cumulativeWork u64, cumulativeBlockUnits u96,
// blockHeight u64, blockProgress u96, workPerThousandBlocks u32,
// authorizationNonce u256, paused bool.
function decodeState(hex) {
  const body = (hex || "").replace(/^0x/, "");
  if (body.length < 64 * 8) return null;
  const word = (i) => BigInt("0x" + body.slice(i * 64, i * 64 + 64));
  return {
    settledThroughRound: Number(word(0)),
    cumulativeWork: Number(word(1)),
    blockHeight: Number(word(3)),
    blockProgress: Number(word(4)),
    workPerThousandBlocks: Number(word(5)),
    paused: word(7) !== 0n,
  };
}

async function readCore() {
  for (const rpc of RPCS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4500);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: CORE, data: "0xc19d93fb" }, "latest"],
        }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const d = await res.json();
      const state = decodeState(d && d.result);
      // a deployment that has settled nothing decodes to zeroes, which is not
      // a useful reading either
      if (state && state.blockHeight > 0) return state;
    } catch (err) {
      // try the next endpoint
    }
  }
  return null;
}

function paintChain() {
  const label = { boot: "CONNECTING", live: "LIVE", ghost: "GHOST SHIFT", offline: "OFFLINE" }[chain.status];
  el.mode.textContent = label;
  el.mode.dataset.mode = chain.status === "boot" ? "boot" : chain.status;
  if (lastPaintedMode && lastPaintedMode !== "live" && chain.status === "live") LegAudio.wake();
  lastPaintedMode = chain.status;

  // the start button says what kind of shift you are about to play
  if (el.startSub) {
    el.startSub.textContent = chain.status === "live" ? "LIVE SHIFT" : chain.status === "offline" ? "OFFLINE" : "GHOST SHIFT";
  }

  const rpm = chain.status === "live" ? chain.rpmMilli / 1000 : null;
  el.rpm.textContent = rpm === null
    ? (chain.status === "offline" ? "unreachable" : chain.status === "boot" ? "no reading" : "asleep")
    : rpm.toFixed(1) + " rpm";
  el.block.textContent = chain.blockHeight ? "#" + chain.blockHeight : "waiting";
  el.dist.textContent = chain.distanceMm
    ? (chain.distanceMm / 1000).toFixed(2) + " m"
    : chain.seen ? "0.00 m" : "no reading";

  const fill = Math.min(1, Math.max(0, chain.blockProgress / 1e9));
  el.blockBar.style.transform = `scaleX(${fill.toFixed(4)})`;
  el.blockBar.style.backgroundColor = chain.status === "live" ? "var(--accent)" : "var(--faint)";
  el.blockBar.parentElement.setAttribute("aria-valuenow", String(Math.round(fill * 100)));

  el.source.textContent =
    chain.source === "chain"
      ? "api.squeekchain.com is not answering, so the block is read from SqueekCore on Sepolia"
      : chain.status === "live"
        ? "Live from api.squeekchain.com/v1/status, he is running"
        : chain.status === "offline"
          ? "Neither api.squeekchain.com nor Sepolia is answering, so the wheel is on a ghost tempo"
          : "api.squeekchain.com/v1/status: he is asleep, so the wheel replays its last live cadence";
}

function settle(blocks) {
  if (!game.running || game.modeAtStart !== "live") return;
  const bonus = Math.floor(game.combo / 10) * blocks;
  if (bonus <= 0) return;
  game.steps += bonus;
  game.settlement += bonus;
  el.steps.textContent = game.steps;
  flash("SETTLEMENT +" + bonus, "pay");
}

/* ---------- game ---------- */

function startShift() {
  game.running = true;
  game.angle = 0;
  game.torque = TORQUE_START;
  game.steps = 0;
  game.combo = 0;
  game.bestCombo = 0;
  game.taps = 0;
  game.perfects = 0;
  game.settlement = 0;
  game.blockAtStart = chain.blockHeight;
  game.modeAtStart = chain.status === "live" ? "live" : "ghost";
  game.elapsed = 0;
  game.tickAngle = 0;
  game.ghost = LegGhost.load();
  game.ghostIdx = 0;
  game.ghostSteps = 0;
  LegGhost.begin();
  ghostDeltaText = game.ghost ? "0 / " + game.ghost.steps : "no ghost yet";
  el.ghostDelta.textContent = ghostDeltaText;
  el.steps.textContent = "0";
  el.combo.textContent = "0";
  el.results.hidden = true;
  el.startBtn.hidden = true;
  // the wheel takes the keyboard back so Space keeps tapping
  wheel.focus({ preventScroll: true });
  if (rafId === null) {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}

function endShift() {
  game.running = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  el.startBtn.hidden = false;
  draw();

  const acc = game.taps ? Math.round((game.perfects / game.taps) * 100) : 0;
  const played = game.modeAtStart === "live" ? "LIVE" : "GHOST";
  const line = `LEG DAY: ${game.steps} steps, best combo ${game.bestCombo}, ${acc}% cadence, ${played}, block #${game.blockAtStart}`;

  const shifts = readShifts();
  shifts.push({ steps: game.steps, combo: game.bestCombo, acc, played, block: game.blockAtStart, at: Date.now() });
  shifts.sort((a, b) => b.steps - a.steps);
  const kept = shifts.slice(0, STORE_MAX);
  writeShifts(kept);

  const rank = kept.filter((s) => s.steps > game.steps).length + 1;

  el.rSteps.textContent = game.steps;
  el.rCombo.textContent = game.bestCombo;
  el.rAcc.textContent = acc + "%";
  el.rMode.textContent = played;
  el.rBlock.textContent = game.blockAtStart ? "#" + game.blockAtStart : "none";
  el.rPlace.textContent = "#" + Math.min(rank, kept.length) + " of " + kept.length;
  // the shift you just played becomes a ghost, and a ghost travels as a short code
  const mine = LegGhost.close({
    steps: game.steps,
    combo: game.bestCombo,
    acc,
    played,
    block: game.blockAtStart,
  });

  if (game.ghost) {
    const diff = game.steps - game.ghost.steps;
    el.rGhost.textContent = diff === 0
      ? "dead heat on " + game.ghost.steps
      : (diff > 0 ? "+" + diff : String(diff)) + " vs " + game.ghost.steps;
  } else {
    el.rGhost.textContent = "first shift, no rival";
  }

  const code = mine ? LegGhost.encode(mine) : "";
  el.rGhostCode.textContent = code || "nothing to race, this shift had no taps";
  if (mine) LegGhost.save(mine);

  el.rLine.textContent = code ? line + ", ghost code " + code : line;
  el.rNote.textContent = game.modeAtStart === "live"
    ? `Settlement paid ${game.settlement} steps on real blocks.`
    : "Ghost shift: no settlement bonus was paid, because he was not running.";
  openSheet(el.results);
}

function tap() {
  // the first tap is also the gesture that lets the browser start audio
  LegAudio.unlock();
  // a tap on the wheel is a step, never a start: the START control does that,
  // so pressing anything else on the page can no longer begin a shift
  if (!game.running) return;
  game.taps += 1;

  const half = arcHalfWidth();
  const goodHalf = half + (18 * Math.PI) / 180;
  let delta = Math.abs(normalise(game.angle - Math.PI));
  if (delta > Math.PI) delta = 2 * Math.PI - delta;

  if (delta <= half) {
    game.perfects += 1;
    game.steps += 1;
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.torque = Math.min(TORQUE_MAX, game.torque + TORQUE_PERFECT);
    LegAudio.hit("perfect");
    LegGhost.note(game.elapsed * 1000, game.angle, 0);
    flash(game.combo > 1 ? `PERFECT · ${game.combo}×` : "PERFECT", "good");
  } else if (delta <= goodHalf) {
    game.steps += 1;
    game.combo = 0;
    game.torque = Math.min(TORQUE_MAX, game.torque + TORQUE_GOOD);
    LegAudio.hit("good");
    LegGhost.note(game.elapsed * 1000, game.angle, 1);
    flash("GOOD · COMBO LOST", "bad");
  } else {
    game.combo = 0;
    game.torque += TORQUE_MISS;
    LegAudio.hit("miss");
    // a miss is not a step, so it does not belong in the ghost's timeline:
    // the rival should only ever be seen landing steps it actually scored
    flash("MISS", "bad");
  }

  el.steps.textContent = game.steps;
  el.combo.textContent = game.combo;
  if (game.torque <= 0) endShift();
}

function normalise(a) {
  const t = 2 * Math.PI;
  return ((a % t) + t) % t;
}

function flash(text, tone) {
  el.flash.textContent = text;
  el.flash.dataset.tone = tone;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.flash.dataset.tone = ""; el.flash.textContent = ""; }, 750);
}

/* ---------- rendering ---------- */

let canvasInk = null;

function ink() {
  if (canvasInk) return canvasInk;
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  canvasInk = {
    rim: v("--wheel-rim"),
    guide: v("--wheel-guide"),
    trail: v("--wheel-trail"),
    pad: v("--wheel-pad"),
    padIdle: v("--wheel-pad-idle"),
    good: v("--wheel-good"),
    arc: v("--wheel-arc"),
    arcIdle: v("--wheel-arc-idle"),
    tick: v("--wheel-tick"),
    spoke: v("--wheel-spoke"),
    hub: v("--wheel-hub"),
    hubLine: v("--wheel-hub-line"),
    marker: v("--wheel-marker"),
    markerIdle: v("--wheel-marker-idle"),
    label: v("--wheel-label"),
    sublabel: v("--wheel-sublabel"),
  };
  return canvasInk;
}

function sizeCanvas() {
  const r = wheel.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  wheel.width = Math.max(1, Math.round(r.width * dpr));
  wheel.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the START control is sized off the rim, so it never covers the power arc
  if (el.startBtn) {
    const d = Math.max(84, Math.min(132, Math.round(Math.min(r.width, r.height) * 0.30)));
    el.startBtn.style.width = d + "px";
    el.startBtn.style.height = d + "px";
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (game.running) {
    const sag = 0.55 + 0.45 * Math.max(0, game.torque) / TORQUE_MAX;
    const turns = clampedRps() * sag * dt;
    game.angle = normalise(game.angle + turns * 2 * Math.PI);
    game.elapsed += dt;

    // one tick per quarter revolution: what you hear is the cadence on the dial
    game.tickAngle += turns;
    while (game.tickAngle >= 0.25) {
      game.tickAngle -= 0.25;
      LegAudio.tick(clampedRps());
    }

    advanceGhost();

    game.torque = Math.max(0, game.torque - TORQUE_DECAY * dt);
    el.torque.style.transform = `scaleX(${(game.torque / TORQUE_MAX).toFixed(3)})`;
    el.torque.parentElement.setAttribute("aria-valuenow", String(Math.round((Math.max(0, game.torque) / TORQUE_MAX) * 100)));
    el.torque.style.backgroundColor = game.torque < 25 ? "var(--red)" : "var(--accent)";
    if (game.torque <= 0) { endShift(); }
  }

  draw();
  // only keep the frame loop alive while a shift is running: an idle wheel is static
  rafId = game.running ? requestAnimationFrame(loop) : null;
}

// replay the rival shift on the clock you are playing against
function advanceGhost() {
  const g = game.ghost;
  if (!g) return;
  const ms = game.elapsed * 1000;
  while (game.ghostIdx < g.events.length && g.events[game.ghostIdx].t <= ms) {
    game.ghostIdx += 1;
    game.ghostSteps += 1;
  }
  const diff = game.steps - game.ghostSteps;
  const text = (diff > 0 ? "+" + diff : String(diff)) + " / " + g.steps;
  // the loop runs at 60fps, so only touch the DOM when the number actually moves
  if (text !== ghostDeltaText) {
    ghostDeltaText = text;
    el.ghostDelta.textContent = text;
  }
}

function draw() {
  const w = wheel.clientWidth;
  const h = wheel.clientHeight;
  if (!w || !h) return;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.max(20, Math.min(w, h) / 2 - 10);
  const C = ink();

  ctx.clearRect(0, 0, w, h);

  // rim
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // inner guide
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = C.guide;
  ctx.stroke();

  const half = arcHalfWidth();
  const goodHalf = half + (18 * Math.PI) / 180;

  // trail behind the marker, 55 degrees of recent motion
  if (game.running) {
    const trail = (55 * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.93, game.angle - trail - Math.PI / 2, game.angle - Math.PI / 2);
    ctx.strokeStyle = C.trail;
    ctx.lineWidth = 9;
    ctx.stroke();
  }

  // cream wedge behind the power arc, so the target reads as a landing pad
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R * 0.93, Math.PI - half - Math.PI / 2, Math.PI + half - Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = game.running ? C.pad : C.padIdle;
  ctx.fill();

  // good window
  strokeArc(cx, cy, R * 0.93, Math.PI - goodHalf, Math.PI + goodHalf, C.good, 9);
  // power arc
  strokeArc(cx, cy, R * 0.93, Math.PI - half, Math.PI + half, game.running ? C.arc : C.arcIdle, 9);

  // power arc ticks
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI - half + (2 * half * i) / 4;
    const p1 = polar(cx, cy, R * 0.80, a);
    const p2 = polar(cx, cy, R * 0.86, a);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = C.tick;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // spokes, driven by the same angle so the wheel reads as one body
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = game.angle * 0.5 + (i * 2 * Math.PI) / spokes;
    const p = polar(cx, cy, R * 0.58, a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = C.spoke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // hub
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.10, 0, Math.PI * 2);
  ctx.fillStyle = C.hub;
  ctx.fill();
  ctx.strokeStyle = C.hubLine;
  ctx.stroke();

  // the ghost's fingerprints: every angle it landed, so you can see where it lived
  if (game.ghost) {
    ctx.strokeStyle = C.trail;
    ctx.lineWidth = 1;
    for (const e of game.ghost.events) {
      const a = (e.a * Math.PI) / 180;
      const p1 = polar(cx, cy, R * 0.71, a);
      const p2 = polar(cx, cy, R * 0.77, a);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    // and its head, the angle it is standing on right now
    if (game.running && game.ghostIdx > 0) {
      const a = (game.ghost.events[game.ghostIdx - 1].a * Math.PI) / 180;
      const gp = polar(cx, cy, R * 0.74, a);
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = C.markerIdle;
      ctx.fill();
    }
  }

  // marker
  const mp = polar(cx, cy, R * 0.93, game.angle);
  const mi = polar(cx, cy, R * 0.30, game.angle);
  ctx.beginPath();
  ctx.moveTo(mi.x, mi.y);
  ctx.lineTo(mp.x, mp.y);
  ctx.strokeStyle = game.running ? C.marker : C.markerIdle;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mp.x, mp.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = game.running ? C.marker : C.markerIdle;
  ctx.fill();

  // nothing is drawn in the middle while idle: the START button sits there,
  // and a second call to action underneath it would be two buttons in one place
}

function strokeArc(cx, cy, r, from, to, colour, width) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, from - Math.PI / 2, to - Math.PI / 2);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.stroke();
}

function polar(cx, cy, r, a) {
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/* ---------- storage ---------- */

function readShifts() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeShifts(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/* ---------- wiring ---------- */

// pointerdown on the wheel is a step only; the START button starts the shift
wheel.addEventListener("pointerdown", (e) => { e.preventDefault(); tap(); });

el.startBtn.addEventListener("click", () => {
  LegAudio.unlock();
  startShift();
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowDown" || e.code === "Enter") {
    const tag = document.activeElement && document.activeElement.tagName;
    // a focused button or the ghost-code field keeps its own keys
    if (tag === "BUTTON" || tag === "INPUT") return;
    if (!el.how.hidden || !el.results.hidden) return;
    e.preventDefault();
    // Space is the shortcut for whatever the START button would do
    if (game.running) tap();
    else { LegAudio.unlock(); startShift(); }
  }
});

document.getElementById("againBtn").addEventListener("click", () => { closeSheet(el.results); startShift(); });
document.getElementById("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el.rLine.textContent);
    document.getElementById("copyBtn").textContent = "COPIED";
    setTimeout(() => { document.getElementById("copyBtn").textContent = "COPY RESULT"; }, 1400);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el.rLine);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.getElementById("copyBtn").textContent = "LINE SELECTED, COPY IT";
  }
});

/* ---------- theme ---------- */

const THEME_KEY = "legday.theme.v1";
const themeBtn = document.getElementById("themeBtn");
const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(name, persist) {
  document.documentElement.dataset.theme = name;
  canvasInk = null;
  themeBtn.setAttribute("aria-pressed", String(name === "dark"));
  if (themeMeta) themeMeta.setAttribute("content", name === "dark" ? "#14151c" : "#f5f5f7");
  if (persist) {
    try { localStorage.setItem(THEME_KEY, name); } catch { /* private mode */ }
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// the head script already set the first paint; this syncs the button and the meta colour
applyTheme(currentTheme(), false);

themeBtn.addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
  paintChain();
  if (rafId === null) draw();
  // the toggle is a one-shot control, so focus goes back to the board and Space
  // keeps taking steps instead of flipping the theme again
  wheel.focus({ preventScroll: true });
});

const howBtn = document.getElementById("howBtn");
let returnFocus = null;

function openSheet(sheet) {
  returnFocus = document.activeElement;
  sheet.hidden = false;
  // focus the card, not a button at the bottom: on a short phone focusing the
  // last control scrolls the sheet down and hides the heading it just opened
  const card = sheet.querySelector(".sheet__card");
  if (card) {
    card.scrollTop = 0;
    card.focus({ preventScroll: true });
  }
  if (sheet === el.how) howBtn.setAttribute("aria-expanded", "true");
}

function closeSheet(sheet) {
  sheet.hidden = true;
  if (sheet === el.how) howBtn.setAttribute("aria-expanded", "false");
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
}

howBtn.addEventListener("click", () => openSheet(el.how));
document.getElementById("closeHow").addEventListener("click", () => closeSheet(el.how));
document.getElementById("closeResults").addEventListener("click", () => closeSheet(el.results));

// tapping the dimmed backdrop closes, which is the escape hatch a phone expects
[el.results, el.how].forEach((sheet) => {
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) closeSheet(sheet);
  });
});

/* ---------- sound ---------- */

function paintSound() {
  const on = !LegAudio.isMuted();
  el.soundBtn.textContent = on ? "SOUND ON" : "SOUND OFF";
  el.soundBtn.setAttribute("aria-pressed", String(on));
}

el.soundBtn.addEventListener("click", () => {
  LegAudio.unlock();
  LegAudio.setMuted(!LegAudio.isMuted());
  paintSound();
  wheel.focus({ preventScroll: true });
});

paintSound();

/* ---------- racing a pasted ghost ---------- */

const ghostInput = document.getElementById("ghostInput");

document.getElementById("loadGhostBtn").addEventListener("click", () => {
  const parsed = LegGhost.decode(ghostInput.value);
  if (!parsed) {
    ghostInput.value = "";
    ghostInput.placeholder = "that code did not read, try again";
    ghostInput.focus();
    return;
  }
  ghostInput.value = "";
  ghostInput.placeholder = "paste a ghost code";
  LegGhost.save(parsed, true);
  closeSheet(el.results);
  startShift();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!el.how.hidden) closeSheet(el.how);
  else if (!el.results.hidden) closeSheet(el.results);
});

window.addEventListener("resize", () => { sizeCanvas(); draw(); });
window.addEventListener("orientationchange", () => setTimeout(() => { sizeCanvas(); draw(); }, 120));

sizeCanvas();
paintChain();
draw();
poll();
setInterval(poll, POLL_MS);

// exposed for testing only
window.LEGDAY = { chain, game, tap, startShift, endShift, arcHalfWidth, clampedRps, ghost: window.LegGhost, audio: window.LegAudio };
