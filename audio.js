/* Squeek Leg Day sound. Synthesised with WebAudio, so the arcade ships no audio
   files: every tone is generated from the same numbers the round is counted
   from. Nothing is fetched, nothing is licensed, nothing is sampled. */

(function () {
  const KEY = "legday.sound.v1";
  const Ctx = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let muted = readMuted();

  function readMuted() {
    try {
      return localStorage.getItem(KEY) === "off";
    } catch { return false; }
  }

  function writeMuted(value) {
    try { localStorage.setItem(KEY, value ? "off" : "on"); } catch { /* private mode */ }
  }

  // Called from a real gesture only: browsers refuse to start audio any other way.
  function unlock() {
    if (!Ctx) return false;
    if (!ctx) {
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(ctx.destination);
      } catch { return false; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state !== "closed";
  }

  function ready() {
    return ctx && master && !muted && ctx.state === "running";
  }

  function tone(type, freq, peak, attack, decay, sweepTo) {
    if (!ready()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + attack + decay);
    osc.connect(gain);
    gain.connect(master);
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.start();
    osc.stop(t + attack + decay + 0.02);
  }

  /* Taking a burst is a click, and the click gets brighter as the round fills.
     The pitch is the fill: a round that is nearly closed sounds nearly closed. */
  function take(fill) {
    const f = Math.max(0, Math.min(1, fill || 0));
    tone("square", 240 + f * 420, 0.045, 0.002, 0.05);
  }

  // Letting a burst go is deliberately quiet: it is not an event, it is a gap.
  function pass() {
    tone("sine", 190, 0.02, 0.003, 0.05, 150);
  }

  // A rejected burst is the only unpleasant sound in the arcade, on purpose.
  function reject() {
    tone("sawtooth", 132, 0.05, 0.004, 0.16, 74);
  }

  // A round filled to the cap: the one moment the arcade is allowed to celebrate.
  function seal() {
    if (!ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => tone("triangle", f, 0.05, 0.004, 0.22), i * 70);
    });
  }

  // Settling a round: work turning into block units, two notes down a fifth.
  function settle(paid) {
    tone("triangle", 392, 0.045, 0.004, 0.13);
    if (paid) setTimeout(() => tone("triangle", 587, 0.04, 0.004, 0.16), 110);
  }

  function setMuted(value) {
    muted = !!value;
    writeMuted(muted);
    if (master) master.gain.value = muted ? 0 : 0.9;
    return muted;
  }

  window.LegAudio = { unlock, take, pass, reject, seal, settle, setMuted, isMuted: () => muted, isReady: ready };
})();
