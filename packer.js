/* SQUEEK LEG DAY, the arcade around the rules.

   pack.js holds the arithmetic and knows nothing about the page. This file holds
   the page and knows nothing about the arithmetic: it asks for the current
   burst, offers two choices, and paints whatever comes back. Everything that can
   be wrong about the numbers is therefore testable without a browser, and
   everything here is wiring.

   Phase machine: idle -> play -> settle -> play ... -> over. One phase at a
   time, and every handler checks it, so a fast tap or a stray key cannot settle
   a round twice. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const BURST_MS = 1900;      // how long a burst stays in the chute
  const SETTLE_MS = 2100;     // how long the payout panel holds before moving on
  const DIFF_KEY = "legday.difficulty.v1";
  const THEME_KEY = "legday.theme.v1";
  // named SITE, not URL: `URL` is a global constructor and shadowing it inside
  // this scope is a trap for anyone who later needs a blob URL here
  const SITE = "https://squeeklegday.evm0x.com";

  const el = {
    board: $("board"), mode: $("mode"), holderChip: $("holderChip"),
    roundNo: $("roundNo"), packedV: $("packedV"), leftV: $("leftV"),
    track: $("track"), fill: $("fill"), ghostFill: $("ghostFill"), ruleNote: $("ruleNote"),
    chute: $("chute"), burstNo: $("burstNo"), burstValue: $("burstValue"),
    burstUnit: $("burstUnit"), burstHint: $("burstHint"), nextHint: $("nextHint"),
    timerBar: $("timerBar"),
    startBtn: $("startBtn"), takeBtn: $("takeBtn"), takeLabel: $("takeLabel"), passBtn: $("passBtn"),
    flash: $("flash"),
    blocksV: $("blocksV"), unitsV: $("unitsV"), diffV: $("diffV"), tagV: $("tagV"),
    settle: $("settle"), settleTitle: $("settleTitle"), settleSub: $("settleSub"),
    sWork: $("sWork"), sUnits: $("sUnits"), sBlocks: $("sBlocks"), sDiff: $("sDiff"), nextBtn: $("nextBtn"),
    soundBtn: $("soundBtn"), themeBtn: $("themeBtn"), howBtn: $("howBtn"), holderBtn: $("holderBtn"),
    results: $("results"), how: $("how"), holder: $("holder"),
    rBlocks: $("rBlocks"), rUnits: $("rUnits"), rWork: $("rWork"), rFill: $("rFill"),
    rSealed: $("rSealed"), rDiff: $("rDiff"), rTag: $("rTag"), rMode: $("rMode"),
    rHolder: $("rHolder"), rLead: $("rLead"), rLine: $("rLine"), rNote: $("rNote"),
    againBtn: $("againBtn"), cardBtn: $("cardBtn"), copyBtn: $("copyBtn"), closeResults: $("closeResults"),
    closeHow: $("closeHow"), closeHolder: $("closeHolder"),
    holderInput: $("holderInput"), holderCheck: $("holderCheck"),
    holderStatus: $("holderStatus"), holderClear: $("holderClear"), holderNote: $("holderNote"),
  };

  let shift = null;
  let phase = "idle";       // idle | play | settle | over
  let deadline = 0;
  let raf = 0;
  let settleTimer = 0;
  let tier = null;
  let lastFocus = null;

  /* ---------- formatting ---------- */

  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fmtBig = (b) => fmt(b.toString());

  /* ---------- small storage helpers ---------- */

  function readNum(key) {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch { return 0; }
  }

  function writeNum(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
  }

  /* ---------- flash line: one message, replaced, never stacked ---------- */

  let flashTimer = 0;
  function flash(text, tone) {
    el.flash.textContent = text;
    el.flash.dataset.tone = tone || "";
    clearTimeout(flashTimer);
    if (tone) {
      flashTimer = setTimeout(() => {
        el.flash.textContent = "";
        el.flash.dataset.tone = "";
      }, 2200);
    }
  }

  /* ---------- painting ---------- */

  function paintChain(s) {
    const mode = s.status;
    el.mode.dataset.mode = mode;
    el.mode.textContent =
      mode === "live" ? "LIVE WHEEL" :
      mode === "ghost" ? "GHOST WHEEL" :
      mode === "offline" ? "NO TELEMETRY" : "CONNECTING";

    const src = document.getElementById("source");
    if (src) {
      src.textContent = s.source === "api" ? "Reading api.squeekchain.com/v1/status, every five seconds"
        : s.source === "chain" ? "Reading SqueekCore.state() on Sepolia, every five seconds"
        : "No chain reading. Difficulty falls back to the paper's floor of 1,000.";
    }

    if (phase === "idle" || phase === "over") {
      el.diffV.textContent = s.difficulty > 0 ? fmt(s.difficulty) : "reading";
    }
    if (s.round && (phase === "idle" || phase === "over")) {
      el.tagV.textContent = "#" + s.round.number + " \u00b7 " + s.round.tag;
      el.tagV.dataset.round = "seeded";
    }
  }

  function paintRule() {
    if (!shift) return;
    const cap = LegPack.CAPACITY;
    const room = LegPack.remaining(shift);
    const pct = (shift.bin / cap) * 100;

    el.roundNo.textContent = Math.min(shift.roundIndex + 1, LegPack.ROUNDS) + "/" + LegPack.ROUNDS;
    el.packedV.textContent = fmt(shift.bin);
    el.leftV.textContent = fmt(room);
    el.fill.style.width = pct.toFixed(3) + "%";
    el.track.setAttribute("aria-valuenow", String(shift.bin));

    const size = LegPack.current(shift);
    if (size != null && phase === "play") {
      const fits = size <= room;
      el.ghostFill.hidden = false;
      el.ghostFill.style.left = pct.toFixed(3) + "%";
      el.ghostFill.style.width = (Math.min(size, room) / cap * 100).toFixed(3) + "%";
      el.ghostFill.style.background = fits ? "" : "var(--red)";
    } else {
      el.ghostFill.hidden = true;
    }

    if (shift.bin === cap) {
      el.ruleNote.textContent = "Round sealed: 10,000 of 10,000.";
    } else if (shift.bin >= cap * 0.9) {
      el.ruleNote.textContent = fmt(room) + " work units of room left.";
    } else {
      el.ruleNote.textContent = "A round holds 10,000 work units.";
    }
  }

  function paintChute() {
    const size = LegPack.current(shift);
    if (size == null) {
      el.burstValue.textContent = "\u2014";
      el.burstNo.textContent = "";
      el.chute.dataset.fit = "none";
      el.burstHint.textContent = "";
      return;
    }
    const room = LegPack.remaining(shift);
    const fits = size <= room;
    const index = Math.min(shift.cursor + 1, shift.bursts.length);

    el.burstValue.textContent = fmt(size);
    el.burstNo.textContent = index + "/" + shift.bursts.length;
    el.chute.dataset.fit = fits ? "fits" : "over";
    el.takeBtn.dataset.fit = fits ? "fits" : "over";
    el.takeLabel.textContent = fits ? "TAKE IT" : "DOES NOT FIT";
    el.burstHint.textContent = fits
      ? fmt(room) + " room \u00b7 taking it leaves " + fmt(room - size)
      : "needs " + fmt(size) + ", only " + fmt(room) + " left \u2014 it will be rejected";

    const next = LegPack.peek(shift);
    if (tier && next != null) {
      el.nextHint.hidden = false;
      el.nextHint.textContent = "HOLDER SIGHT \u00b7 next burst " + fmt(next);
    } else {
      el.nextHint.hidden = true;
      el.nextHint.textContent = "";
    }
  }

  function paintReadout() {
    if (!shift) return;
    el.blocksV.textContent = fmtBig(LegPack.blocks(shift));
    el.unitsV.textContent = fmtBig(shift.totalUnits);
    el.diffV.textContent = fmt(shift.difficulty);
    el.tagV.textContent = shift.tag === "LOCAL" || !shift.tag
      ? "LOCAL"
      : (shift.roundNumber ? "#" + shift.roundNumber + " \u00b7 " : "") + shift.tag;
    el.tagV.dataset.round = shift.tag && shift.tag !== "LOCAL" ? "seeded" : "none";
  }

  function paint() {
    paintRule();
    paintChute();
    paintReadout();
  }

  /* ---------- the burst clock ---------- */

  function stopClock() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function startClock() {
    stopClock();
    deadline = performance.now() + BURST_MS;
    el.timerBar.style.transform = "scaleX(1)";
    const step = (now) => {
      const left = deadline - now;
      if (left <= 0) {
        raf = 0;
        el.timerBar.style.transform = "scaleX(0)";
        expire();
        return;
      }
      el.timerBar.style.transform = "scaleX(" + (left / BURST_MS).toFixed(3) + ")";
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // The burst was not taken in time, so it left the chute without being counted.
  function expire() {
    if (phase !== "play") return;
    const r = LegPack.pass(shift);
    if (r.ok) {
      flash("TIME \u00b7 " + fmt(r.size) + " LEFT THE CHUTE", "bad");
      LegAudio.pass();
    }
    advance();
  }

  /* ---------- actions ---------- */

  function take() {
    if (phase !== "play") return;
    stopClock();
    const r = LegPack.take(shift);
    if (r.ok) {
      const fill = shift.bin / LegPack.CAPACITY;
      LegAudio.take(fill);
      flash("TOOK " + fmt(r.size) + " \u00b7 " + fmt(shift.bin) + " PACKED", "good");
    } else if (r.why === "over") {
      LegAudio.reject();
      flash("REJECTED \u00b7 " + fmt(r.size) + " DOES NOT FIT IN " + fmt(r.fits), "bad");
    }
    advance();
  }

  function letPass() {
    if (phase !== "play") return;
    stopClock();
    const r = LegPack.pass(shift);
    if (r.ok) {
      LegAudio.pass();
      flash("PASSED \u00b7 " + fmt(r.size) + " LOST, WORK NEVER MOVES ROUNDS", "");
    }
    advance();
  }

  function advance() {
    if (phase !== "play") return;
    if (LegPack.roundOver(shift)) {
      closeRound();
    } else {
      paint();
      startClock();
    }
  }

  /* ---------- settling a round ---------- */

  function closeRound() {
    stopClock();
    const row = LegPack.settle(shift);
    phase = "settle";
    // the board's own state drives which panel is on stage: without this the
    // payout stays behind the play-state rule and never appears
    el.board.dataset.state = "settle";

    const sealed = row.sealed;
    el.settleTitle.textContent = sealed ? "ROUND SEALED" : "ROUND CLOSED";
    el.settleSub.textContent = sealed
      ? "10,000 of 10,000 packed"
      : fmt(LegPack.CAPACITY - row.work) + " work units of room lost";
    el.sWork.textContent = fmt(row.work);
    el.sUnits.textContent = fmtBig(row.units);
    el.sBlocks.textContent = fmtBig(row.blocks);
    el.sDiff.textContent = fmt(row.difficultyAfter);
    el.settle.hidden = false;

    if (sealed) LegAudio.seal();
    else LegAudio.settle(row.blocks > 0n);

    paintReadout();
    el.takeBtn.hidden = true;
    el.passBtn.hidden = true;
    el.settle.scrollIntoView({ block: "nearest" });

    clearTimeout(settleTimer);
    settleTimer = setTimeout(nextRound, SETTLE_MS);
  }

  function nextRound() {
    if (phase !== "settle") return;
    clearTimeout(settleTimer);
    el.settle.hidden = true;
    if (shift.done) {
      finish();
      return;
    }
    phase = "play";
    el.board.dataset.state = "play";
    el.takeBtn.hidden = false;
    el.passBtn.hidden = false;
    paint();
    startClock();
    flash("ROUND " + (shift.roundIndex + 1) + " \u00b7 " + fmt(LegPack.ROUND_WORK) + " WORK RUNNING", "");
  }

  /* ---------- the shift ---------- */

  function startShift() {
    if (phase === "play" || phase === "settle") return;
    closeAllSheets();

    const chain = LegChain.state;
    const round = chain.round || LegRound.local();
    const difficulty = chain.difficulty > 0
      ? chain.difficulty
      : (readNum(DIFF_KEY) || LegPack.MIN_DIFFICULTY);

    shift = LegPack.newShift({
      difficulty,
      seed: round.seed,
      tag: round.number ? round.tag : "LOCAL",
      roundNumber: round.number || 0,
    });

    phase = "play";
    el.board.dataset.state = "play";
    el.startBtn.hidden = true;
    el.takeBtn.hidden = false;
    el.passBtn.hidden = false;
    el.settle.hidden = true;
    el.chute.dataset.fit = "fits";

    if (chain.difficulty > 0) writeNum(DIFF_KEY, chain.difficulty);

    paint();
    startClock();
    flash(
      chain.difficulty > 0
        ? "DIFFICULTY " + fmt(difficulty) + " \u00b7 WORK PER 1,000 BLOCKS"
        : "NO CHAIN READING \u00b7 STARTING AT THE FLOOR OF 1,000",
      chain.difficulty > 0 ? "" : "gold"
    );
  }

  function finish() {
    phase = "over";
    el.board.dataset.state = "over";
    el.takeBtn.hidden = true;
    el.passBtn.hidden = true;
    el.settle.hidden = true;
    el.startBtn.hidden = false;
    el.startBtn.textContent = "RUN ANOTHER SHIFT";
    paint();

    const blocks = LegPack.blocks(shift);
    const units = shift.totalUnits;
    const work = shift.totalWork;
    const fillPct = Math.round(LegPack.fillRate(shift) * 100);
    const chain = LegChain.state;
    const modeText = chain.status === "live" ? "LIVE" : chain.status === "ghost" ? "GHOST" : "OFFLINE";

    el.rBlocks.textContent = fmtBig(blocks);
    el.rUnits.textContent = fmtBig(units);
    el.rWork.textContent = fmt(work);
    el.rFill.textContent = fillPct + "%";
    el.rSealed.textContent = shift.sealed + " of " + LegPack.ROUNDS;
    el.rDiff.textContent = fmt(shift.startDifficulty) + " \u2192 " + fmt(shift.difficulty);
    el.rTag.textContent = shift.roundNumber ? "#" + shift.roundNumber + " \u00b7 " + shift.tag : shift.tag;
    el.rMode.textContent = modeText;
    el.rHolder.textContent = tier ? tier.tier.name + " \u00b7 sight only" : "open shift";

    el.rLead.textContent =
      "Four rounds, " + fmt(work) + " work units packed out of the " +
      fmt(LegPack.CAPACITY * LegPack.ROUNDS) + " the rounds could hold. " +
      "Difficulty walked from " + fmt(shift.startDifficulty) + " to " + fmt(shift.difficulty) +
      ", so the last round was priced " +
      (shift.rounds.length > 1
        ? (shift.rounds[0].units > 0n
            ? Math.round(Number(shift.rounds[shift.rounds.length - 1].units) / Number(shift.rounds[0].units) * 100) + "% of what the first one was"
            : "lower than the first")
        : "once") + ".";

    el.rLine.textContent =
      "SQUEEK LEG DAY \u00b7 " + fmtBig(blocks) + " blocks \u00b7 " + fmtBig(units) +
      " block units \u00b7 " + fmt(work) + " work packed (" + fillPct + "% of capacity) \u00b7 " +
      shift.sealed + "/" + LegPack.ROUNDS + " rounds sealed \u00b7 seed " + shift.tag + " \u00b7 " + SITE;

    el.rNote.textContent =
      "Block units are the whitepaper's arithmetic on the difficulty above, not a chain balance. " +
      "Nothing here is signed, spent, or held by a wallet.";

    openSheet(el.results);
  }

  /* ---------- sheets ---------- */

  /* A sheet covers the board, so the round behind it has to stop: the burst
     clock and the pause between rounds. Reading the rules should never cost a
     burst. Opening and closing are the only places that touch this. */
  function pauseRound() {
    if (phase === "play") stopClock();
    if (phase === "settle") clearTimeout(settleTimer);
  }

  function resumeRound() {
    if (phase === "play") startClock();
    if (phase === "settle") {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(nextRound, SETTLE_MS);
    }
  }

  function openSheet(node) {
    lastFocus = document.activeElement;
    pauseRound();
    node.hidden = false;
    const card = node.querySelector(".sheet__card");
    if (card) card.focus();
  }

  function closeSheet(node) {
    node.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
    resumeRound();
  }

  function closeAllSheets() {
    let closed = false;
    [el.results, el.how, el.holder].forEach((n) => {
      if (!n.hidden) { n.hidden = true; closed = true; }
    });
    // the toggle buttons advertise their sheet's state, so they have to be told
    el.howBtn.setAttribute("aria-expanded", "false");
    el.holderBtn.setAttribute("aria-expanded", "false");
    if (closed) {
      lastFocus = null;
      resumeRound();
    }
  }

  // Keep Tab inside the sheet that is open: a modal that lets focus wander into
  // the game behind it is not a modal.
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const open = [el.results, el.how, el.holder].find((n) => !n.hidden);
    if (!open) return;
    const items = [...open.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])")]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }


  /* ---------- card and clipboard ---------- */

  function cardStats() {
    return {
      blocks: Number(LegPack.blocks(shift)),
      units: shift.totalUnits.toString(),
      work: shift.totalWork,
      capacity: LegPack.CAPACITY * LegPack.ROUNDS,
      capacityPerRound: LegPack.CAPACITY,
      rounds: shift.rounds.map((r) => ({
        work: r.work,
        blocks: Number(r.blocks),
        sealed: r.sealed,
        difficultyAfter: r.difficultyAfter,
      })),
      tag: shift.tag,
      block: shift.roundNumber,
      tier: tier ? tier.tier.name : null,
      url: "squeeklegday.evm0x.com",
      line: el.rLine.textContent,
    };
  }

  async function copyResult() {
    const text = el.rLine.textContent;
    try {
      await navigator.clipboard.writeText(text);
      el.copyBtn.textContent = "COPIED";
    } catch {
      // older mobile browsers: a temporary field is the only way in
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); el.copyBtn.textContent = "COPIED"; }
      catch { el.copyBtn.textContent = "SELECT AND COPY"; }
      ta.remove();
    }
    setTimeout(() => { el.copyBtn.textContent = "COPY RESULT"; }, 2000);
  }

  /* ---------- theme and sound ---------- */

  function paintThemeBtn() {
    const dark = document.documentElement.dataset.theme === "dark";
    el.themeBtn.textContent = dark ? "DAY MODE" : "NIGHT MODE";
    el.themeBtn.setAttribute("aria-pressed", String(dark));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#131713" : "#e9ece2");
  }

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, dark ? "light" : "dark"); } catch { /* private mode */ }
    paintThemeBtn();
  }

  function paintSoundBtn() {
    const muted = LegAudio.isMuted();
    el.soundBtn.textContent = muted ? "SOUND OFF" : "SOUND ON";
    el.soundBtn.setAttribute("aria-pressed", String(!muted));
  }

  function toggleSound() {
    LegAudio.unlock();
    const muted = LegAudio.setMuted(!LegAudio.isMuted());
    el.soundBtn.textContent = muted ? "SOUND OFF" : "SOUND ON";
    el.soundBtn.setAttribute("aria-pressed", String(!muted));
  }

  /* ---------- holder sight ---------- */

  function paintHolder(result) {
    // `result` is what was read, `result.tier` is what it is worth. A profile
    // that carries nothing is a real answer, so it is reported rather than
    // treated as a failure: no tier means the open shift, which is playable.
    const held = result && result.tier ? result.tier : null;
    tier = held ? result : null;

    if (!held) {
      el.holderChip.hidden = true;
      el.holderStatus.textContent = result
        ? result.labels.join(", ") + ". Nothing here counts toward a tier, so this stays the open shift."
        : "Open shift: no sight.";
      el.holderStatus.dataset.tone = "";
      el.holderClear.hidden = !result;
      el.rHolder.textContent = "open shift";
    } else {
      el.holderChip.hidden = false;
      el.holderChip.textContent = held.name + " \u00b7 SIGHT";
      el.holderStatus.textContent =
        held.name + " \u00b7 " + result.labels.join(", ") + ". The chute now shows the next burst.";
      el.holderStatus.dataset.tone = "good";
      el.holderClear.hidden = false;
    }
    if (phase === "play") paintChute();
  }

  function checkHolder() {
    const query = el.holderInput.value.trim();
    if (!query) {
      el.holderStatus.textContent = "Paste an address or a member code first.";
      el.holderStatus.dataset.tone = "bad";
      return;
    }
    el.holderStatus.textContent = "Reading the public profile\u2026";
    el.holderStatus.dataset.tone = "";
    el.holderCheck.disabled = true;

    LegHolder.check(query)
      .then((result) => {
        if (!result) {
          el.holderStatus.textContent = "Nothing found. Check the address or code and try again.";
          el.holderStatus.dataset.tone = "bad";
          return;
        }
        LegHolder.save(result);
        paintHolder(result);
      })
      .catch((err) => {
        // holder.js already writes a specific reason for each failure, and it is
        // the only thing that knows whether the host, the address or the network
        // is at fault. Passing it through beats guessing.
        el.holderStatus.textContent = (err && err.message)
          ? err.message.charAt(0).toUpperCase() + err.message.slice(1) + "."
          : "That read did not come back. Try again.";
        el.holderStatus.dataset.tone = "bad";
      })
      .finally(() => { el.holderCheck.disabled = false; });
  }

  /* ---------- wiring ---------- */

  function wire() {
    el.startBtn.addEventListener("click", () => { LegAudio.unlock(); startShift(); });
    el.takeBtn.addEventListener("click", take);
    el.passBtn.addEventListener("click", letPass);
    el.nextBtn.addEventListener("click", nextRound);

    el.soundBtn.addEventListener("click", toggleSound);
    el.themeBtn.addEventListener("click", toggleTheme);

    el.howBtn.addEventListener("click", () => {
      const open = el.how.hidden;
      openSheet(el.how);
      el.howBtn.setAttribute("aria-expanded", String(open));
    });
    el.holderBtn.addEventListener("click", () => {
      const open = el.holder.hidden;
      openSheet(el.holder);
      el.holderBtn.setAttribute("aria-expanded", String(open));
    });

    el.closeResults.addEventListener("click", () => closeSheet(el.results));
    el.closeHow.addEventListener("click", () => {
      closeSheet(el.how);
      el.howBtn.setAttribute("aria-expanded", "false");
    });
    el.closeHolder.addEventListener("click", () => {
      closeSheet(el.holder);
      el.holderBtn.setAttribute("aria-expanded", "false");
    });

    el.againBtn.addEventListener("click", () => { closeSheet(el.results); startShift(); });
    el.cardBtn.addEventListener("click", async () => {
      el.cardBtn.disabled = true;
      const ok = await LegCard.save(cardStats());
      el.cardBtn.textContent = ok ? "CARD SAVED" : "CARD FAILED";
      setTimeout(() => { el.cardBtn.textContent = "SAVE CARD"; el.cardBtn.disabled = false; }, 2200);
    });
    el.copyBtn.addEventListener("click", copyResult);

    el.holderCheck.addEventListener("click", checkHolder);
    el.holderInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); checkHolder(); }
    });
    el.holderClear.addEventListener("click", () => {
      LegHolder.clear();
      el.holderInput.value = "";
      paintHolder(null);
    });

    // One keyboard map, checked against the phase, so a key can never do the
    // same thing twice or do it in the wrong phase.
    document.addEventListener("keydown", (e) => {
      trapFocus(e);
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Escape") {
        if (!el.results.hidden) { closeSheet(el.results); return; }
        if (!el.how.hidden) { closeSheet(el.how); el.howBtn.setAttribute("aria-expanded", "false"); return; }
        if (!el.holder.hidden) { closeSheet(el.holder); el.holderBtn.setAttribute("aria-expanded", "false"); }
        return;
      }
      if (!el.results.hidden || !el.how.hidden || !el.holder.hidden) return;

      if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
        if (phase === "play") { e.preventDefault(); take(); }
        else if (phase === "settle") { e.preventDefault(); nextRound(); }
        else if (phase === "idle" || phase === "over") { e.preventDefault(); LegAudio.unlock(); startShift(); }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "Backspace") {
        if (phase === "play") { e.preventDefault(); letPass(); }
      }
    });

    // A hidden tab stops the frame clock, so the burst would hang. Coming back
    // gives the burst its full time again rather than punishing the player for
    // a phone call.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && phase === "play") startClock();
    });

    window.addEventListener("beforeunload", stopClock);
  }

  /* ---------- boot ---------- */

  function boot() {
    paintThemeBtn();
    paintSoundBtn();
    wire();

    try {
      const saved = LegHolder.active();
      if (saved) paintHolder(saved);
    } catch { /* a broken stored profile is not worth a crash */ }

    el.board.dataset.state = "idle";
    el.takeBtn.hidden = true;
    el.passBtn.hidden = true;
    el.settle.hidden = true;
    el.burstValue.textContent = "\u2014";
    el.burstNo.textContent = "";
    el.burstUnit.textContent = "WORK UNITS";
    el.burstHint.textContent = "Press START to open the round.";
    el.blocksV.textContent = "0";
    el.unitsV.textContent = "0";
    el.tagV.textContent = "no seed";

    LegChain.start(paintChain);
  }

  // A read-only handle on the live shift. The engine is already testable on its
  // own; this makes the wired game testable too, which is how the rejection and
  // seal paths get exercised without a human clicking them.
  window.LegDay = { state: () => ({ phase, shift }) };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
