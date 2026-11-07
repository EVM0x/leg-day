/* What the arcade knows about the wheel, and where it learned it.

   Two sources, polled together. The API carries the hardware telemetry, which
   cannot be read from a contract. SqueekCore carries the settled state, which
   can, so the difficulty the shift starts at is never taken on trust even when
   the API is down. No wallet, no key, no transaction: one HTTP GET and one
   eth_call every five seconds. */

const LegChain = (() => {
  const API = "https://api.squeekchain.com/v1/status";
  const CORE = "0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4";
  const RPCS = [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.drpc.org",
    "https://sepolia.rpc.thirdweb.com",
  ];
  const EVERY = 5000;

  const state = {
    status: "boot",          // live | ghost | offline | boot
    blockHeight: 0,
    difficulty: 0,           // work per 1,000 blocks, as the chain reports it
    source: null,            // api | chain
    round: null,
    seen: false,
  };

  let timer = null;
  let onUpdate = null;
  let inflight = false;

  // SqueekCore.state() returns eight static words:
  // settledThroughRound u64, cumulativeWork u64, cumulativeBlockUnits u96,
  // blockHeight u64, blockProgress u96, workPerThousandBlocks u32,
  // authorizationNonce u256, paused bool.
  function decodeState(hex) {
    const body = (hex || "").replace(/^0x/, "");
    if (body.length < 64 * 8) return null;
    const word = (i) => BigInt("0x" + body.slice(i * 64, i * 64 + 64));
    const rawWord = (i) => body.slice(i * 64, i * 64 + 64).replace(/^0+/, "") || "0";
    return {
      settledThroughRound: Number(word(0)),
      cumulativeWork: Number(word(1)),
      blockHeight: Number(word(3)),
      blockProgress: Number(word(4)),
      workPerThousandBlocks: Number(word(5)),
      paused: word(7) !== 0n,
      // left as trimmed hex so the shift seed can be rebuilt character for
      // character by anyone reading the contract themselves
      raw: { settled: rawWord(0), work: rawWord(1), height: rawWord(3) },
    };
  }

  async function readCore() {
    for (const rpc of RPCS) {
      try {
        const ctl = new AbortController();
        const cut = setTimeout(() => ctl.abort(), 4500);
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "eth_call",
            params: [{ to: CORE, data: "0xc19d93fb" }, "latest"],
          }),
          signal: ctl.signal,
        });
        clearTimeout(cut);
        if (!res.ok) continue;
        const body = await res.json();
        if (body && body.result) {
          const decoded = decodeState(body.result);
          if (decoded) return decoded;
        }
      } catch { /* try the next endpoint */ }
    }
    return null;
  }

  function refreshRound() {
    const height = state.blockHeight;
    if (!height) return;
    if (state.round && state.round.number === height) return;
    const round = state.core
      ? LegRound.fromState(state.core, height)
      : LegRound.fromHeight(height);
    if (round) state.round = round;
  }

  async function poll() {
    if (inflight) return;
    inflight = true;

    // the chain first: it is the half that cannot lie about settled work
    const core = await readCore();
    if (core) state.core = core;

    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("http " + res.status);
      const d = await res.json();
      const m = d.measurement || {};
      const a = (d.builder && d.builder.anchor) || {};

      const stale = String(m.freshness || "") !== "online";
      const running = String(m.coreStatus || "").toUpperCase() === "RUNNING";
      state.blockHeight = Number(a.blockHeight) || state.blockHeight;
      if (Number(a.workPerThousandBlocks) > 0) state.difficulty = Number(a.workPerThousandBlocks);
      state.status = running && !stale ? "live" : stale ? "offline" : "ghost";
      state.source = "api";
      state.seen = true;
    } catch {
      state.status = core ? "ghost" : "offline";
      if (core) {
        state.blockHeight = core.blockHeight || state.blockHeight;
        state.difficulty = core.workPerThousandBlocks || state.difficulty;
        state.source = "chain";
        state.seen = true;
      } else {
        state.source = null;
      }
    }

    refreshRound();
    inflight = false;
    if (onUpdate) onUpdate(state);
  }

  function start(cb) {
    onUpdate = cb;
    poll();
    if (timer) clearInterval(timer);
    timer = setInterval(poll, EVERY);
    // a hidden tab does not need to poll, and a phone should not pay for it
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
      } else if (!timer) {
        poll();
        timer = setInterval(poll, EVERY);
      }
    });
  }

  return { start, poll, state, decodeState, API, CORE };
})();
