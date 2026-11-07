/* SHIFT SEED, the part of Squeek Leg Day that comes from the chain and not from
   the API, plus the card a player posts afterwards.

   Every shift is played against the block that was open when the player pressed
   START. The block's state is hashed down to a 32-bit seed, and the seed decides
   the burst stream: same block, same bursts, for everybody, forever.

   That is checkable without trusting this page: read SqueekCore.state() on
   Sepolia, run the same FNV-1a below, compare. Nothing here signs or spends. */

const LegRound = (() => {
  // FNV-1a over the hex characters of the state. Small, stable, and easy enough
  // to reimplement in any language, which is the point: the seed has to be
  // verifiable by someone who does not trust this file.
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
    // the tag is the first four hex of the seed: short enough to read out loud,
    // long enough that two rounds in a row do not collide by accident
    const tag = seed.toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
    return { seed, number: number || 0, tag };
  }

  // The seed that matters: the three numbers SqueekCore.state() keeps about the
  // round being mined right now. They hold still for the whole block, they change
  // when the block settles, and anyone can read them with one eth_call.
  function fromState(state, height) {
    const raw = (state && state.raw) || {};
    const text = "sqk:" + (raw.settled || "0") + ":" + (raw.work || "0") + ":" + (raw.height || "0");
    return derive(text, height || state.blockHeight);
  }

  // When Sepolia itself is unreachable there is still a block height, and it is
  // still the same height for everybody: seed from it alone rather than inventing
  // a shift the player cannot check.
  function fromHeight(height) {
    if (!height) return null;
    return derive("sqk:block:" + height, height);
  }

  // No chain reading at all. A local shift is still a fair shift, but it is not a
  // shared one, so it is tagged LOCAL and the page says so.
  function local() {
    return derive("local:" + Date.now() + ":" + Math.random(), 0);
  }

  return { derive, fromState, fromHeight, local, fnv1a, prng };
})();

/* CARD, the thing a player actually wants to post. Drawn on a canvas so the file
   leaves the page as a PNG, with no server and no screenshot tool. */
const LegCard = (() => {
  const W = 1200;
  const H = 630;

  function palette() {
    const dark = document.documentElement.dataset.theme === "dark";
    return dark
      ? { bg: "#10150f", ink: "#eef3ee", soft: "#93a698", accent: "#86dc9e", line: "#2b322a", dim: "#3d4a3c" }
      : { bg: "#eef1e6", ink: "#12160f", soft: "#5c6b60", accent: "#1c6b45", line: "#ccd2c2", dim: "#dfe4d5" };
  }

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Cut a string to the width it is allowed, with an ellipsis.
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

  // the biggest numeral that still fits its column
  function fitFont(x, text, maxWidth, start, family) {
    let size = start;
    do {
      x.font = '800 ' + size + 'px ' + family;
      if (x.measureText(text).width <= maxWidth) return size;
      size -= 4;
    } while (size > 40);
    return size;
  }

  function render(s) {
    const C = palette();
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    const DISPLAY = '"Big Shoulders Display", Impact, sans-serif';
    const MONO = '"JetBrains Mono", ui-monospace, monospace';

    x.fillStyle = C.bg;
    x.fillRect(0, 0, W, H);

    // wordmark, set the way the HUD sets it: three words, and the third one is
    // measured rather than guessed so the accent never crowds the first
    x.fillStyle = C.ink;
    x.font = '800 50px ' + DISPLAY;
    x.fillText("SQUEEK", 72, 104);
    const sqW = x.measureText("SQUEEK").width + x.measureText(" ").width;
    x.fillStyle = C.accent;
    x.fillText("LEG DAY", 72 + sqW, 104);
    x.fillStyle = C.soft;
    x.font = '400 21px ' + MONO;
    x.fillText("PACK THE ROUND", 72, 142);

    // the tier, when the shift was played on one. Sight is not score, so the
    // badge says TIER and nothing about a multiplier.
    if (s.tier) {
      const label = "TIER \u00b7 " + s.tier;
      x.font = '600 19px ' + MONO;
      const w = x.measureText(label).width;
      x.beginPath();
      x.roundRect(1128 - w - 32, 44, w + 32, 38, 19);
      x.fillStyle = C.accent;
      x.globalAlpha = 0.14;
      x.fill();
      x.globalAlpha = 1;
      x.strokeStyle = C.accent;
      x.lineWidth = 1;
      x.stroke();
      x.fillStyle = C.accent;
      x.fillText(label, 1128 - w - 16, 69);
    }

    // the score: blocks completed. It is the only number the chain pays, so it
    // is the only number set at display size.
    const score = fmt(s.blocks);
    const size = fitFont(x, score, 430, 168, DISPLAY);
    x.fillStyle = C.ink;
    x.font = '800 ' + size + 'px ' + DISPLAY;
    x.fillText(score, 66, 330);
    x.fillStyle = C.soft;
    x.font = '400 22px ' + MONO;
    x.fillText("SQUEEK BLOCKS", 72, 370);

    x.fillStyle = C.soft;
    x.font = '400 17px ' + MONO;
    x.fillText("BLOCK UNITS", 72, 424);
    x.fillStyle = C.ink;
    x.font = '600 21px ' + MONO;
    x.fillText(fit(fmt(s.units), x, 430), 72, 452);

    x.fillStyle = C.soft;
    x.font = '400 17px ' + MONO;
    x.fillText("WORK PACKED", 72, 492);
    x.fillStyle = C.ink;
    x.font = '600 21px ' + MONO;
    x.fillText(fmt(s.work) + " of " + fmt(s.capacity), 72, 520);

    // the four rounds, drawn as the rule they were measured on: what landed,
    // and the room that was lost when the round closed.
    const bx = 560;
    const bw = 560;
    const rows = s.rounds && s.rounds.length ? s.rounds : [];
    x.font = '400 17px ' + MONO;
    x.fillStyle = C.soft;
    x.fillText("ROUNDS", bx, 200);
    rows.forEach((r, i) => {
      const y = 226 + i * 78;
      const frac = Math.max(0, Math.min(1, r.work / s.capacityPerRound));
      x.fillStyle = C.soft;
      x.font = '400 16px ' + MONO;
      x.fillText("R" + (i + 1), bx, y);
      x.fillStyle = r.sealed ? C.accent : C.ink;
      x.font = '600 16px ' + MONO;
      x.fillText(fmt(r.work), bx + 40, y);
      x.fillStyle = C.soft;
      x.font = '400 16px ' + MONO;
      const paid = fmt(r.blocks) + " blocks";
      x.fillText(paid, bx + bw - x.measureText(paid).width, y);

      x.fillStyle = C.dim;
      x.fillRect(bx, y + 10, bw, 12);
      x.fillStyle = r.sealed ? C.accent : C.accent;
      x.globalAlpha = r.sealed ? 1 : 0.45;
      x.fillRect(bx, y + 10, bw * frac, 12);
      x.globalAlpha = 1;
      // the last round of the shift has no ratchet after it, so it is the only
      // one where the room left costs nothing but the work itself
      x.fillStyle = C.soft;
      x.font = '400 14px ' + MONO;
      x.fillText("D " + fmt(r.difficultyAfter), bx, y + 40);
    });

    x.strokeStyle = C.line;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(72, 536);
    x.lineTo(1128, 536);
    x.stroke();

    // the seed gets its own line, because it is the one field on this card that
    // somebody can go and check against the contract
    x.fillStyle = C.soft;
    x.font = '400 18px ' + MONO;
    const seed = s.tag ? "SHIFT SEED " + s.tag + (s.block ? " \u00b7 BLOCK #" + s.block : "") : "NO SEED";
    x.fillText(seed, 72, 570);

    // the maker's mark sits bottom left, the address bottom right: a screenshot
    // of this card is how the arcade travels, so both travel with it
    const mark = "BUILT BY EVM0X";
    x.font = '400 14px ' + MONO;
    const markW = x.measureText(mark).width;
    x.strokeStyle = C.line;
    x.strokeRect(72, 590, markW + 18, 24);
    x.fillStyle = C.soft;
    x.fillText(mark, 81, 606);

    x.font = '400 18px ' + MONO;
    x.fillText(s.url, 1128 - x.measureText(s.url).width, 607);

    return cv;
  }

  async function save(stats) {
    const cv = render(stats);
    const name = "squeek-leg-day-" + stats.blocks + (stats.tag ? "-" + String(stats.tag).toLowerCase() : "") + ".png";
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
    } catch { /* fall through to a download */ }

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
