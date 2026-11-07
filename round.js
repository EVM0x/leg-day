/* ROUND SEED, the part of LEG DAY that comes from the chain and not from the API.

   Every shift is played against the block that was open when you pressed START.
   The block's hash is hashed down to a 32-bit seed, and the seed decides three
   things about that round: how wide the power arc is, how far it drifts, and how
   many times it swings. Same block, same challenge, for everybody, forever.

   That is checkable without trusting this page: read the block hash from Sepolia,
   run the same FNV-1a below, compare. Nothing here signs or spends. */

const LegRound = (() => {
  // FNV-1a over the hex characters of the block hash. Small, stable, and easy
  // enough to reimplement in any language, which is the point: the seed has to
  // be verifiable by someone who does not trust this file.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: one seed in, a repeatable stream of numbers out
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function derive(seedText, number) {
    const clean = String(seedText || "");
    if (clean.length < 3) return null;
    const seed = fnv1a(clean);
    const rand = prng(seed);
    // the tag is the first four hex of the seed: short enough to read out loud,
    // long enough that two rounds in a row do not collide by accident
    const tag = seed.toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
    const arcScale = 0.88 + rand() * 0.26;      // 0.88x to 1.14x the live width
    // a wander under 4 degrees is invisible next to a 30 degree arc, so the floor
    // is high enough that every round actually feels like its own round
    const driftAmp = 4 + rand() * 10;           // 4 to 14 degrees the arc wanders
    const driftCycles = 1 + Math.floor(rand() * 3); // full swings in a shift
    return { seed, number: number || 0, tag, arcScale, driftAmp, driftCycles };
  }

  // The seed that matters: the three numbers SqueekCore.state() keeps about the
  // round being mined right now. They hold still for the whole block, they change
  // when the block settles, and anyone can read them with one eth_call, so the
  // challenge on screen can be recomputed by a stranger.
  function fromState(state, height) {
    const raw = (state && state.raw) || {};
    const text = "sqk:" + (raw.settled || "0") + ":" + (raw.work || "0") + ":" + (raw.height || "0");
    return derive(text, height || state.blockHeight);
  }

  // When Sepolia itself is unreachable there is still a round number, and it is
  // still the same round for everybody: seed from it alone rather than inventing
  // a challenge the player cannot check.
  function fromHeight(height) {
    if (!height) return null;
    return derive("sqk:block:" + height, height);
  }

  // where the arc sits, in radians, at a given second of the shift
  function drift(round, seconds) {
    if (!round || !round.driftAmp) return 0;
    const swing = Math.sin((2 * Math.PI * round.driftCycles * seconds) / 22);
    return (round.driftAmp * Math.PI) / 180 * swing;
  }

  return { derive, drift, fromState, fromHeight, fnv1a };
})();

/* CARD, the thing a player actually wants to post. Drawn on a canvas so the file
   leaves the page as a PNG, with no server and no screenshot tool. */
const LegCard = (() => {
  const W = 1200;
  const H = 630;

  function palette() {
    const dark = document.documentElement.dataset.theme === "dark";
    return dark
      ? { bg: "#0e1512", ink: "#eef3ee", soft: "#8ea398", accent: "#c6f24e", line: "#24312b" }
      : { bg: "#f5f5f7", ink: "#12160f", soft: "#5c6b60", accent: "#4f7a13", line: "#dfe3dd" };
  }

  function render(s) {
    const C = palette();
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");

    x.fillStyle = C.bg;
    x.fillRect(0, 0, W, H);

    // the dial, echoing the page: a rim, a wedge, and the arc that was open
    const cx = 900, cy = 315, R = 210;
    x.beginPath();
    x.arc(cx, cy, R, 0, Math.PI * 2);
    x.strokeStyle = C.line;
    x.lineWidth = 2;
    x.stroke();
    x.beginPath();
    x.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
    x.strokeStyle = C.line;
    x.lineWidth = 1;
    x.stroke();
    const half = 0.34;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, R * 0.93, Math.PI - half - Math.PI / 2, Math.PI + half - Math.PI / 2);
    x.closePath();
    x.fillStyle = C.accent;
    x.globalAlpha = 0.18;
    x.fill();
    x.globalAlpha = 1;
    x.beginPath();
    x.arc(cx, cy, R * 0.93, Math.PI - half - Math.PI / 2, Math.PI + half - Math.PI / 2);
    x.strokeStyle = C.accent;
    x.lineWidth = 12;
    x.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i * 2 * Math.PI) / 12;
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.sin(a) * R * 0.56, cy - Math.cos(a) * R * 0.56);
      x.strokeStyle = C.line;
      x.lineWidth = 1;
      x.stroke();
    }
    x.beginPath();
    x.arc(cx, cy, R * 0.09, 0, Math.PI * 2);
    x.fillStyle = C.ink;
    x.fill();

    // wordmark
    x.fillStyle = C.ink;
    x.font = '800 62px "Big Shoulders Display", Impact, sans-serif';
    x.fillText("LEG", 72, 118);
    const legW = x.measureText("LEG").width;
    x.fillStyle = C.accent;
    x.fillText("DAY", 72 + legW + 6, 118);
    x.fillStyle = C.soft;
    x.font = '400 22px "JetBrains Mono", ui-monospace, monospace';
    x.fillText("YOU ARE SQUEKETOSHI'S LEGS", 72, 154);

    // the score, which is the only number that matters. Four digits is where a
    // 190px numeral starts to crowd the dial, so it steps down instead of over.
    const scoreSize = s.steps >= 1000 ? 150 : 190;
    x.fillStyle = C.ink;
    x.font = '800 ' + scoreSize + 'px "Big Shoulders Display", Impact, sans-serif';
    x.fillText(String(s.steps), 66, 340);
    x.fillStyle = C.soft;
    x.font = '400 24px "JetBrains Mono", ui-monospace, monospace';
    x.fillText("STEPS", 72, 382);

    const rows = [
      ["BEST COMBO", String(s.combo)],
      ["CADENCE", s.acc + "%"],
      ["PLAYED", s.played],
      ["BLOCK", s.block ? "#" + s.block : "none"],
      ["ROUND SEED", s.tag ? s.tag + " / block hash" : "no seed"],
    ];
    x.font = '400 21px "JetBrains Mono", ui-monospace, monospace';
    rows.forEach(([k, v], i) => {
      const y = 440 + i * 34;
      x.fillStyle = C.soft;
      x.fillText(k, 72, y);
      x.fillStyle = C.ink;
      x.fillText(String(v), 300, y);
    });

    // the ghost, if this shift left one worth carrying
    if (s.code) {
      x.fillStyle = C.soft;
      x.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
      x.fillText("RACE ME", 72, 606);
      x.fillStyle = C.ink;
      x.font = '600 19px "JetBrains Mono", ui-monospace, monospace';
      x.fillText(s.code, 168, 606);
    }

    x.strokeStyle = C.line;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(72, 566);
    x.lineTo(1128, 566);
    x.stroke();

    x.fillStyle = C.soft;
    x.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
    x.fillText(s.url, 900 - x.measureText(s.url).width / 2 + 0, 606);
    return cv;
  }

  async function save(stats) {
    const cv = render(stats);
    const name = "legday-" + stats.steps + (stats.tag ? "-" + stats.tag.toLowerCase() : "") + ".png";
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (!blob) return false;

    // on a phone the share sheet is the right door: the file lands in whatever
    // app the player actually posts from
    try {
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "LEG DAY", text: stats.line });
        return true;
      }
    } catch (err) {
      // fall through to a download
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  return { save, render };
})();
