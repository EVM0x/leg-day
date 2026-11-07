/* ROUND SEED, the part of Squeek Leg Day that comes from the chain and not from the API.

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

  // Cut a string to the width it is allowed, with an ellipsis. A long shift
  // packs a long ghost code, and at 19px one of those runs off the right edge
  // of the card. The card is a picture of the shift, not the transport: the
  // whole code is in COPY RESULT, so cutting it here loses nothing.
  function fit(text, ctx, maxWidth) {
    const s = String(text);
    if (ctx.measureText(s).width <= maxWidth) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(s.slice(0, mid) + "\u2026").width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo) + "\u2026";
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

    // wordmark. Two words now, so it is set smaller and stacked the way the HUD
    // does it: SQUEEK in ink, LEGDAY in the accent. The tier badge below it in
    // the corner starts at y=105, so the block stays above that.
    x.fillStyle = C.ink;
    x.font = '800 52px "Big Shoulders Display", Impact, sans-serif';
    x.fillText("SQUEEK", 72, 106);
    const sqW = x.measureText("SQUEEK ").width;
    x.fillStyle = C.accent;
    x.fillText("LEGDAY", 72 + sqW, 106);
    x.fillStyle = C.soft;
    x.font = '400 22px "JetBrains Mono", ui-monospace, monospace';
    x.fillText("YOU ARE SQUEKETOSHI'S LEGS", 72, 150);

    // the tier, when the shift was played on one: a holder's card has to say so,
    // because the multiplier is the reason the number is that size. It sits in
    // the top-right corner, clear of the dial, which starts at y=105.
    if (s.tier) {
      const label = "TIER · " + s.tier + (s.tierLine ? " " + s.tierLine.split(" ").pop() : "");
      x.font = '600 20px "JetBrains Mono", ui-monospace, monospace';
      const w = x.measureText(label).width;
      x.beginPath();
      x.roundRect(1128 - w - 34, 44, w + 34, 40, 20);
      x.fillStyle = C.accent;
      x.globalAlpha = 0.14;
      x.fill();
      x.globalAlpha = 1;
      x.strokeStyle = C.accent;
      x.lineWidth = 1;
      x.stroke();
      x.fillStyle = C.accent;
      x.fillText(label, 1128 - w - 17, 71);
    }

    // the score, which is the only number that matters. Four digits is where a
    // 190px numeral starts to crowd the dial, so it steps down instead of over.
    const scoreSize = s.steps >= 1000 ? 150 : 190;
    x.fillStyle = C.ink;
    x.font = '800 ' + scoreSize + 'px "Big Shoulders Display", Impact, sans-serif';
    x.fillText(String(s.steps), 66, 340);
    x.fillStyle = C.soft;
    x.font = '400 24px "JetBrains Mono", ui-monospace, monospace';
    x.fillText("STEPS" + (s.raw && s.raw !== s.steps ? " · " + s.raw + " RAW" : ""), 72, 382);

    const rows = [
      ["BEST COMBO", String(s.combo)],
      ["CADENCE", s.acc + "%"],
      ["PLAYED", s.played + (s.tier ? " · " + s.tier : "")],
      ["BLOCK", s.block ? "#" + s.block : "none"],
      ["ROUND SEED", s.tag ? s.tag + " / from block #" + (s.block || "?") : "no seed"],
    ];
    x.font = '400 21px "JetBrains Mono", ui-monospace, monospace';
    rows.forEach(([k, v], i) => {
      const y = 436 + i * 30;
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
      // the address and the mark own the right half of this line, so the code
      // gets what is left and no more
      x.fillText(fit(s.code, x, 520), 168, 606);
    }

    x.strokeStyle = C.line;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(72, 566);
    x.lineTo(1128, 566);
    x.stroke();

    // the address, right aligned so the corner under it stays free for the mark
    x.fillStyle = C.soft;
    x.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
    x.fillText(s.url, 1128 - x.measureText(s.url).width, 596);

    // the maker's mark: a screenshot of this card is how the arcade travels, so
    // the corner it lands in says where it came from. It sits clear of the
    // bottom edge, not on it.
    const mark = "BUILT BY EVM0X";
    x.fillStyle = C.soft;
    x.font = '400 14px "JetBrains Mono", ui-monospace, monospace';
    const markW = x.measureText(mark).width;
    x.strokeStyle = C.line;
    x.lineWidth = 1;
    x.strokeRect(1128 - markW - 18, 600, markW + 18, 22);
    x.fillText(mark, 1128 - markW - 9, 615);
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
        await navigator.share({ files: [file], title: "Squeek Leg Day", text: stats.line });
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
