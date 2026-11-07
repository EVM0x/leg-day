/* HOLDER SHIFT, the part of Squeek Leg Day that a Squeekchain profile opens.

   Three rules shape this file.

   One: the arcade is free for everybody. Nobody is ever asked for a wallet to
   play, and no shift is locked behind a token. What a profile gets is one burst
   of sight: the chute shows the next burst before it arrives, so the player can
   decide whether the room they have left is worth spending. It is not a
   multiplier and it does not touch the score, because nothing in the whitepaper
   makes a Squeek worth more work than another.

   Two: it is not only Squeeks. Squeekchain hands out holder badges for twenty
   other collections (Punks, Apes, Milady, IMD, Normies, Yield Fields and the
   rest) and builder badges for the CODE lane, and a tier that only counted
   Squeeks would be ignoring most of what a profile actually is. So the weight
   is everything a profile carries: Squeeks in the wallet, Squeeks staked
   (counted twice), every holder badge, every builder badge, and a trophy for
   the few that are one of one.

   Three: the lookup is read-only and unsigned, so it cannot prove the wallet
   belongs to the person at the keyboard. That is deliberate. Claiming a tier
   you do not hold buys one preview of a burst you were about to be shown
   anyway, so there is nothing to gain by lying. For the same reason the card says
   "TIER" rather than "HOLDER": it reports which tier the run was played on,
   and nothing about who owns what.

   The badge half cannot be read from the browser directly, because
   community.squeekchain.com only sends CORS headers to squeekchain.com. api.php
   in this same folder is the read-only proxy that fetches it server-side. If
   that file is missing, the lookup says so instead of pretending.

   Nothing here signs, spends, or stores a key. */

const LegHolder = (() => {
  const API = "api.php";
  const ACCOUNTS = "https://api.squeekchain.com/v1/accounts/";
  const KEY = "legday.holder.v1";

  // weight counts a staked Squeek twice: staking is the action that actually
  // puts the NFT to work, so it should move you up the ladder faster than a
  // Squeek sitting still in a wallet
  // A tier is a name and a threshold, and that is all: it buys sight, so there
  // is no multiplier or difficulty modifier to carry here.
  const TIERS = [
    { id: "light", name: "LIGHT", min: 1 },
    { id: "heavy", name: "HEAVY", min: 3 },
    { id: "prime", name: "PRIME", min: 6 },
  ];

  // the three one-of-one badges. Someone holding one of these has been here
  // since the first block, and the tier should say so.
  const TROPHIES = {
    "clout.first_squeek": "First Squeek",
    "clout.first_invitooor": "First Invitooor",
    "code.first_buildooooor": "First Buildooooor",
  };

  function tierFor(weight) {
    let picked = null;
    for (const t of TIERS) if (weight >= t.min) picked = t;
    return picked;
  }

  function isAddress(value) {
    return /^0[xX][0-9a-fA-F]{40}$/.test(String(value || "").trim());
  }

  function isCode(value) {
    return /^[a-z0-9]{6,12}$/i.test(String(value || "").trim());
  }

  function short(value) {
    const a = String(value || "");
    if (a.length === 42 && a.startsWith("0x")) return a.slice(0, 6) + "..." + a.slice(-4);
    return a;
  }

  // what the game asks for: the tier in force, or null for the open shift
  function active() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || !saved.tier) return null;
      const tier = TIERS.find((t) => t.id === saved.tier);
      if (!tier) return null;
      return { ...saved, tier };
    } catch (err) {
      return null;
    }
  }

  function save(result) {
    // nothing to remember when the profile carries nothing: storing a null tier
    // would only be read back and rejected on the next load
    if (!result || !result.tier) {
      clear();
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({
        id: result.id,
        kind: result.kind,
        tier: result.tier.id,
        weight: result.weight,
        labels: result.labels,
        at: Date.now(),
      }));
    } catch (err) {
      /* private mode: the shift still runs, it just will not survive a reload */
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  }

  // An address is read straight from api.squeekchain.com, which answers with
  // Access-Control-Allow-Origin: *, so the browser is allowed to ask it from any
  // host. That half works on a static host with no PHP at all. No wallet, no
  // signature, nothing stored.
  async function readWallet(address) {
    let res;
    try {
      res = await fetch(ACCOUNTS + address, { cache: "no-store" });
    } catch (err) {
      throw new Error("api.squeekchain.com did not answer, so the wallet could not be read");
    }
    if (res.status === 404) throw new Error("that address has no Squeeks and no indexer entry");
    if (!res.ok) throw new Error("api.squeekchain.com answered " + res.status);
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error("api.squeekchain.com sent something unreadable");
    }
    if (body && body.status === "unavailable") {
      throw new Error("the indexer has not caught up with that address yet");
    }
    // the counts arrive as strings, and a token's level is a string too
    const counts = (body && body.tokenCounts) || {};
    const tokens = Array.isArray(body && body.tokens) ? body.tokens : [];
    let best = 0;
    for (const t of tokens) best = Math.max(best, Number(t && t.level) || 0);
    return {
      kind: "wallet",
      address: address,
      wallet: Number(counts.wallet) || 0,
      staking: Number(counts.staking) || 0,
      bestLevel: best,
    };
  }

  // A member code is the half that needs a server: community.squeekchain.com
  // only sends CORS headers to squeekchain.com, so the browser cannot read it
  // from here. api.php in this folder does it and hands back the ids, the Aura
  // and the rank. On a static host that file cannot run, and it says so.
  async function readCode(code) {
    let res;
    try {
      res = await fetch(API + "?q=" + encodeURIComponent(code), { cache: "no-store" });
    } catch (err) {
      throw new Error("the lookup did not answer, so this copy may be missing api.php");
    }

    // A static host without PHP answers with the raw file or a plain 404, and
    // neither parses as JSON. Parsing first is what tells the two apart: the
    // proxy's own 404 is a real JSON error and must be shown as one.
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error("member codes need api.php, and this copy is on a host that cannot run it: paste a wallet address instead");
    }
    if (!res.ok) throw new Error(body && body.error ? body.error : "the lookup answered " + res.status);
    return body;
  }

  // one read. Which half runs depends on what was pasted.
  async function lookup(query) {
    let q = String(query || "").trim();
    if (q === "") throw new Error("paste an address or a member code first");
    if (!isAddress(q) && !isCode(q)) throw new Error("that is neither a 0x address nor a member code");
    q = q.toLowerCase();
    if (isAddress(q)) return readWallet(q);
    return readCode(q);
  }

  function check(query) {
    const q = String(query || "").trim();
    if (isAddress(q)) return lookup(q).then(toResult);
    // "0xnope" reads like a typo of an address rather than a member code, and
    // saying so is more useful than a 404 from the badge endpoint
    if (/^0x/i.test(q)) throw new Error("that starts with 0x but is not a 40-character address");
    return lookup(q).then(toResult);
  }

  // turn either shape of answer into one weight and one list of what it found
  function toResult(body) {
    if (body.kind === "wallet") {
      const wallet = Number(body.wallet) || 0;
      const staking = Number(body.staking) || 0;
      const weight = wallet + staking * 2;
      const labels = [];
      if (wallet) labels.push(wallet + " Squeek" + (wallet === 1 ? "" : "s"));
      if (staking) labels.push(staking + " staked");
      if (!labels.length) labels.push("no Squeek");
      return {
        id: body.address,
        kind: "wallet",
        weight,
        labels,
        tier: tierFor(weight),
      };
    }

    // a member code: everything the profile carries, across all three lanes
    const badges = Array.isArray(body.badges) ? body.badges : [];
    const holderBadges = badges.filter((b) => String(b.id).startsWith("holder."));
    const builderBadges = badges.filter((b) => String(b.id).startsWith("code.") && b.id !== "code.the_tester");
    const trophies = badges.filter((b) => Object.prototype.hasOwnProperty.call(TROPHIES, b.id));

    // one point per collection, one per builder badge, three per trophy
    const weight = holderBadges.length + builderBadges.length + trophies.length * 3;

    const labels = [];
    for (const t of trophies) labels.push("trophy: " + t.title);
    if (holderBadges.length) labels.push(holderBadges.length + " collection" + (holderBadges.length === 1 ? "" : "s"));
    if (builderBadges.length) labels.push(builderBadges.length + " builder badge" + (builderBadges.length === 1 ? "" : "s"));
    if (!labels.length) labels.push("no holder or builder badge");

    return {
      id: body.code,
      kind: "member",
      weight,
      labels,
      collections: holderBadges.map((b) => b.title),
      aura: Number(body.aura) || 0,
      tier: tierFor(weight),
    };
  }

  return { active, save, clear, check, lookup, isAddress, isCode, short, tierFor, TIERS, TROPHIES, KEY };
})();
