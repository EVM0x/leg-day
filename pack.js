/* SQUEEK LEG DAY, the packing rules.

   Everything in this file is arithmetic from the Squeekchain whitepaper and
   nothing else. No DOM, no network, no clock: a shift is a pure function of a
   seed, a starting difficulty and the choices a player makes. That is on
   purpose, because the rules have to be testable without a browser.

   The four rules this game is built on, quoted from the paper:

     "Work is grouped into rounds of exactly 600 seconds, ten minutes... A round
      can hold at most 10,000 work units, which is exactly as many as the 60 ms
      spacing allows in ten minutes. The cap is a safety limit: a passage beyond
      it would be rejected."

     "it never moves work from one round to another"

     "every billion block units completes one Squeek block"

     blockUnits += floor(w x 10^12 / D)
     D_next      = floor((29 x D + floor(w x 1,000 / 40)) / 30)   when w >= 40
     D_next      = D                                              when w <  40

   So: a round is a bin of 10,000. The bursts he runs have to go in it or be
   lost, because work never moves between rounds. What lands in the bin is
   priced at the difficulty earlier rounds set, and difficulty is a ratchet: a
   heavy round makes every later round worth less per work unit. */

const LegPack = (() => {
  const CAPACITY = 10000;        // work units a round can hold, per the paper
  const ROUNDS = 4;              // rounds in one shift
  // Twelve bursts that add up to 13,000: he runs 3,000 more than the round can
  // hold, so every round forces about three decisions about what to drop.
  const BURSTS = 12;
  const ROUND_WORK = 13000;
  // A burst is one unbroken run of passes, so its size is how long he ran:
  // 120 units is seven seconds, 2,500 is two and a half minutes.
  // Multiples of fifty only: a burst is a whole number of seconds at the 60 ms
  // spacing, and clean numbers are what make 10,000 minus a running total
  // something a player can do while the chute is counting down.
  const SIZES = [150, 200, 250, 300, 400, 500, 600, 750, 800, 1000, 1250, 1500, 1750, 2000, 2500];
  const UNIT_SCALE = 1000000000000n; // 10^12, the paper's numerator
  const BLOCK_UNITS = 1000000000n;   // 10^9 block units complete one block
  const MIN_DIFFICULTY = 1000;   // the paper's floor: one work unit per block
  const STEER_WORK = 40;         // rounds under 40 work leave difficulty alone

  /* mulberry32, the same generator round.js uses for the seed. Duplicated here
     so this file stands alone and can be run under node in the tests. */
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

  // one stream per round, from one seed: same shift seed, same bursts, for everyone
  function roundSeed(seed, index) {
    let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /* A round offers BURSTS bursts that add up to exactly ROUND_WORK. Every burst
     stays inside [smallest, largest] and the running remainder is kept fillable
     at every step, so the sum is exact by construction rather than by retry. */
  function burstsFor(seed, index) {
    const rand = prng(roundSeed(seed, index));
    const out = [];
    const lo0 = SIZES[0];
    const hi0 = SIZES[SIZES.length - 1];
    let rem = ROUND_WORK;

    for (let left = BURSTS; left > 1; left -= 1) {
      const lo = Math.max(lo0, rem - hi0 * (left - 1));
      const hi = Math.min(hi0, rem - lo0 * (left - 1));
      const pool = SIZES.filter((s) => s >= lo && s <= hi);
      let pick;
      if (pool.length) {
        pick = pool[Math.floor(rand() * pool.length) % pool.length];
      } else {
        // no listed size fits this window: take the middle and stay in bounds
        pick = Math.min(hi, Math.max(lo, Math.round((lo + hi) / 100) * 50));
      }
      out.push(pick);
      rem -= pick;
    }
    out.push(rem);
    return out;
  }

  /* Block units for one round, straight from the paper. BigInt because
     10,000 work x 10^12 is 10^16, past the 9x10^15 where doubles stop counting. */
  function unitsFor(work, difficulty) {
    const w = BigInt(Math.max(0, Math.round(work)));
    const d = BigInt(Math.max(1, Math.round(difficulty)));
    return (w * UNIT_SCALE) / d;
  }

  // The difficulty ratchet, integer for integer.
  function nextDifficulty(difficulty, work) {
    const d = Math.max(MIN_DIFFICULTY, Math.round(difficulty));
    const w = Math.max(0, Math.round(work));
    if (w < STEER_WORK) return d;
    const target = Math.floor((w * 1000) / STEER_WORK);
    return Math.max(MIN_DIFFICULTY, Math.floor((29 * d + target) / 30));
  }

  function newShift(opts) {
    const difficulty = Math.max(MIN_DIFFICULTY, Math.round(Number(opts.difficulty) || MIN_DIFFICULTY));
    const shift = {
      seed: Number(opts.seed) >>> 0,
      tag: String(opts.tag || ""),
      roundNumber: Number(opts.roundNumber) || 0,
      startDifficulty: difficulty,
      difficulty,
      roundIndex: 0,
      bursts: [],
      cursor: 0,
      bin: 0,
      totalUnits: 0n,
      totalWork: 0,
      offered: 0,
      sealed: 0,
      missed: 0,
      rounds: [],
      done: false,
    };
    beginRound(shift);
    return shift;
  }

  function beginRound(shift) {
    shift.bursts = burstsFor(shift.seed, shift.roundIndex);
    shift.cursor = 0;
    shift.bin = 0;
    shift.offered += shift.bursts.reduce((a, b) => a + b, 0);
  }

  function current(shift) {
    if (!shift || shift.done) return null;
    return shift.cursor < shift.bursts.length ? shift.bursts[shift.cursor] : null;
  }

  function peek(shift) {
    if (!shift || shift.done) return null;
    return shift.cursor + 1 < shift.bursts.length ? shift.bursts[shift.cursor + 1] : null;
  }

  function remaining(shift) {
    return CAPACITY - (shift ? shift.bin : 0);
  }

  function roundOver(shift) {
    if (!shift || shift.done) return true;
    return shift.cursor >= shift.bursts.length || shift.bin >= CAPACITY;
  }

  /* Taking a burst that does not fit is not a no-op: the paper rejects the
     passage, so the work is gone and the burst still leaves the chute. */
  function take(shift) {
    const size = current(shift);
    if (size == null) return { ok: false, why: "empty" };
    shift.cursor += 1;
    if (shift.bin + size > CAPACITY) {
      shift.missed += size;
      return { ok: false, why: "over", size, fits: remaining(shift) };
    }
    shift.bin += size;
    return { ok: true, size, bin: shift.bin };
  }

  function pass(shift) {
    const size = current(shift);
    if (size == null) return { ok: false, why: "empty" };
    shift.cursor += 1;
    shift.missed += size;
    return { ok: true, size };
  }

  // Close the round: price the work, complete blocks, move the ratchet.
  function settle(shift) {
    const work = shift.bin;
    const units = unitsFor(work, shift.difficulty);
    const before = shift.difficulty;
    const after = nextDifficulty(before, work);
    const blocksBefore = shift.totalUnits / BLOCK_UNITS;

    shift.totalUnits += units;
    shift.totalWork += work;
    shift.difficulty = after;

    const blocksAfter = shift.totalUnits / BLOCK_UNITS;
    const sealed = work === CAPACITY;
    if (sealed) shift.sealed += 1;

    const row = {
      index: shift.roundIndex,
      work,
      units,
      blocks: blocksAfter - blocksBefore,
      totalBlocks: blocksAfter,
      difficultyBefore: before,
      difficultyAfter: after,
      sealed,
      missed: shift.missed,
    };
    shift.rounds.push(row);

    shift.roundIndex += 1;
    if (shift.roundIndex >= ROUNDS) {
      shift.done = true;
    } else {
      shift.missed = 0;
      beginRound(shift);
    }
    return row;
  }

  function blocks(shift) {
    return shift.totalUnits / BLOCK_UNITS;
  }

  // how much of the capacity he offered you actually filled. The other number
  // (work packed over work run) can never pass 71% by design, so it would read
  // as failure no matter how well a shift went.
  function fillRate(shift) {
    const cap = CAPACITY * ROUNDS;
    return cap ? shift.totalWork / cap : 0;
  }

  return {
    CAPACITY, ROUNDS, BURSTS, ROUND_WORK, SIZES, BLOCK_UNITS, MIN_DIFFICULTY,
    prng, roundSeed, burstsFor, unitsFor, nextDifficulty,
    newShift, current, peek, remaining, roundOver, take, pass, settle, blocks, fillRate,
  };
})();
