/* LEG DAY ghost: your last shift, recorded as a timeline of taps, replayed as a rival.
   A ghost is a list of {t, a, q} where t is milliseconds into the shift, a is the angle
   the marker was at when you tapped, and q is 0 for a perfect step, 1 for a good one.
   It lives in localStorage and travels as a short base64 string, so racing a friend
   needs no server and no account. */

(function () {
  const KEY = "legday.ghost.v1";
  const MAX_EVENTS = 400;

  let rec = null;

  function begin() {
    rec = [];
  }

  function note(t, angle, quality) {
    if (!rec || rec.length >= MAX_EVENTS) return;
    rec.push({ t: Math.max(0, Math.round(t)), a: Math.round((angle * 180) / Math.PI), q: quality ? 1 : 0 });
  }

  function close(meta) {
    const events = rec || [];
    rec = null;
    if (!events.length) return null;
    return {
      steps: meta.steps,
      combo: meta.combo,
      acc: meta.acc,
      played: meta.played,
      block: meta.block,
      events,
    };
  }

  function encode(ghost) {
    if (!ghost || !ghost.events || !ghost.events.length) return "";
    let prev = 0;
    const body = ghost.events.map((e) => {
      const d = Math.max(0, e.t - prev);
      prev = e.t;
      return d.toString(36) + e.q + Math.max(0, e.a).toString(36);
    }).join(".");
    const head = ["1", ghost.steps, ghost.combo, ghost.acc, ghost.played === "LIVE" ? 1 : 0].join("|");
    try {
      return btoa(head + "|" + body).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch { return ""; }
  }

  function decode(code) {
    if (!code) return null;
    const clean = String(code).trim().replace(/[^A-Za-z0-9\-_]/g, "");
    if (clean.length < 8) return null;
    let raw;
    try {
      raw = atob(clean.replace(/-/g, "+").replace(/_/g, "/"));
    } catch { return null; }

    const parts = raw.split("|");
    if (parts.length !== 6 || parts[0] !== "1") return null;

    const steps = Number(parts[1]);
    const combo = Number(parts[2]);
    const acc = Number(parts[3]);
    const played = parts[4] === "1" ? "LIVE" : "GHOST";

    let t = 0;
    const events = [];
    for (const chunk of parts[5].split(".")) {
      const m = /^([0-9a-z]+)([01])([0-9a-z]{1,2})$/.exec(chunk);
      if (!m) continue;
      t += parseInt(m[1], 36);
      events.push({ t, a: parseInt(m[3], 36) % 360, q: Number(m[2]) });
    }

    if (!events.length || !Number.isFinite(steps)) return null;
    return {
      steps: Math.max(0, Math.min(99999, Math.round(steps))),
      combo: Math.max(0, Math.min(9999, Math.round(combo || 0))),
      acc: Math.max(0, Math.min(100, Math.round(acc || 0))),
      played,
      block: 0,
      events: events.slice(0, MAX_EVENTS),
      imported: true,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return saved && Array.isArray(saved.events) && saved.events.length ? saved : null;
    } catch { return null; }
  }

  // only a better run replaces the ghost, so the rival keeps getting harder,
  // unless a code was pasted in, in which case that ghost is the one you asked to race
  function save(ghost, force) {
    if (!ghost || !ghost.events || !ghost.events.length) return load();
    const held = load();
    if (!force && held && held.steps >= ghost.steps) return held;
    try { localStorage.setItem(KEY, JSON.stringify(ghost)); } catch { /* private mode */ }
    return ghost;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  }

  window.LegGhost = { begin, note, close, encode, decode, load, save, clear, MAX_EVENTS };
})();
