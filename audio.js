/* LEG DAY sound. Synthesised with WebAudio, so the arcade ships no audio files:
   every tone here is generated from the same numbers the wheel is drawn from.
   Nothing is fetched, nothing is licensed, nothing is sampled. */

(function () {
  const KEY = "legday.sound.v1";
  const Ctx = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let muted = readMuted();
  let tickCount = 0;

  function readMuted() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw === "off";
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

  function env(gain, peak, attack, decay) {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
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
    env(gain, peak, attack, decay);
    osc.start();
    osc.stop(ctx.currentTime + attack + decay + 0.02);
  }

  /* One tick per quarter revolution, so the tempo you hear is the tempo you see.
     velocity comes from the live cadence, which is why a fast hamster sounds busy. */
  function tick(velocity) {
    if (!ready()) return;
    tickCount += 1;
    const bright = 900 + 700 * Math.min(1, Math.max(0, velocity));
    // every fourth tick is the downbeat, so the loop has a pulse you can count
    const downbeat = tickCount % 4 === 0;
    tone("triangle", downbeat ? bright * 0.5 : bright, downbeat ? 0.055 : 0.03, 0.002, 0.045);
  }

  function hit(kind) {
    if (!ready()) return;
    if (kind === "perfect") {
      tone("square", 1180, 0.055, 0.002, 0.07, 1760);
      tone("sine", 590, 0.05, 0.004, 0.11);
    } else if (kind === "good") {
      tone("triangle", 720, 0.05, 0.003, 0.08);
    } else {
      tone("sawtooth", 150, 0.06, 0.004, 0.13, 78);
    }
  }

  // three rising notes: he woke up, so the arcade is live again
  function wake() {
    if (!ready()) return;
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => tone("triangle", f, 0.06, 0.004, 0.16), i * 90);
    });
  }

  function setMuted(value) {
    muted = !!value;
    writeMuted(muted);
    if (master) master.gain.value = muted ? 0 : 0.9;
    return muted;
  }

  window.LegAudio = { unlock, tick, hit, wake, setMuted, isMuted: () => muted, isReady: ready };
})();
