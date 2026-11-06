/* LEG DAY, a Squeekchain arcade.
   The marker turns at the cadence published by api.squeekchain.com/v1/status.
   Nothing here signs, spends, or stores a key. */

const API = "https://api.squeekchain.com/v1/status";
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
};

let rafId = null;
let lastFrame = 0;
let flashTimer = null;

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

    if (prevHeight && chain.blockHeight > prevHeight) settle(chain.blockHeight - prevHeight);

    paintChain();
  } catch (err) {
    chain.status = "offline";
    paintChain();
  }
}

function paintChain() {
  const label = { boot: "CONNECTING", live: "LIVE", ghost: "GHOST SHIFT", offline: "OFFLINE" }[chain.status];
  el.mode.textContent = label;
  el.mode.dataset.mode = chain.status === "boot" ? "boot" : chain.status;

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
    chain.status === "live"
      ? "Live from api.squeekchain.com/v1/status, he is running"
      : chain.status === "offline"
        ? "api.squeekchain.com is not answering, so the wheel is on a ghost tempo"
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
  el.steps.textContent = "0";
  el.combo.textContent = "0";
  el.results.hidden = true;
  wheel.focus({ preventScroll: true });
  if (rafId === null) {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}

function endShift() {
  game.running = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
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
  el.rLine.textContent = line;
  el.rNote.textContent = game.modeAtStart === "live"
    ? `Settlement paid ${game.settlement} steps on real blocks.`
    : "Ghost shift: no settlement bonus was paid, because he was not running.";
  openSheet(el.results, document.getElementById("againBtn"));
}

function tap() {
  if (!game.running) { startShift(); return; }
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
    flash(game.combo > 1 ? `PERFECT · ${game.combo}×` : "PERFECT", "good");
  } else if (delta <= goodHalf) {
    game.steps += 1;
    game.combo = 0;
    game.torque = Math.min(TORQUE_MAX, game.torque + TORQUE_GOOD);
    flash("GOOD · COMBO LOST", "bad");
  } else {
    game.combo = 0;
    game.torque += TORQUE_MISS;
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
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (game.running) {
    const sag = 0.55 + 0.45 * Math.max(0, game.torque) / TORQUE_MAX;
    game.angle = normalise(game.angle + clampedRps() * sag * 2 * Math.PI * dt);
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

  // centre readout while idle: the only call to action the page needs
  if (!game.running) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.label;
    ctx.font = "600 " + Math.round(R * 0.115) + 'px "Barlow Condensed", sans-serif';
    ctx.fillText("TAP TO START", cx, cy + R * 0.22);
    ctx.fillStyle = C.sublabel;
    ctx.font = Math.round(R * 0.055) + 'px "IBM Plex Mono", monospace';
    ctx.fillText(chain.status === "live" ? "LIVE SHIFT" : "GHOST SHIFT", cx, cy + R * 0.37);
  }
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

wheel.addEventListener("pointerdown", (e) => { e.preventDefault(); tap(); });
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowDown" || e.code === "Enter") {
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    e.preventDefault();
    tap();
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

function openSheet(sheet, focusTarget) {
  returnFocus = document.activeElement;
  sheet.hidden = false;
  if (sheet === el.how) howBtn.setAttribute("aria-expanded", "true");
  if (focusTarget) focusTarget.focus();
}

function closeSheet(sheet) {
  sheet.hidden = true;
  if (sheet === el.how) howBtn.setAttribute("aria-expanded", "false");
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
}

howBtn.addEventListener("click", () => openSheet(el.how, document.getElementById("closeHow")));
document.getElementById("closeHow").addEventListener("click", () => closeSheet(el.how));

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
window.LEGDAY = { chain, game, tap, startShift, endShift, arcHalfWidth, clampedRps };
