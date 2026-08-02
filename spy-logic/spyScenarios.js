/**
 * SPY scenario registry — ORDERED. Precedence is load-bearing.
 *
 * These are the eight reads from spyDirectionalBias(), in their original source
 * order, with a plan attached to each. The matchers are transcribed
 * branch-for-branch from spyEngine.js: same conditions, same order, same
 * labels, same notes.
 *
 * DO NOT SORT THIS ARRAY. DO NOT CONVERT IT TO AN OBJECT.
 * The reads overlap; order is the only thing that disambiguates them. Two
 * overlaps bite in particular:
 *   (above, holding, strong, higherlow) matches BOTH buy_pullbacks and
 *     bullish_lean — buy_pullbacks wins only because it is written first.
 *   (inside, lost, weak, none) matches BOTH failed_breakout and
 *     reduce_size_wait — failed_breakout wins only because it is written first.
 * A keyed object has no order guarantee that survives a refactor, a JSON
 * round-trip, or a merge, and the failure is silent: the gate keeps printing a
 * plausible label, just the wrong one.
 */

// Exit policy: which leg of the plan ends the trade first.
//   LEVEL_FIRST — targets drive the exit; maxHoldMin is the backstop.
//   TIME_FIRST  — maxHoldMin drives the exit; targets are opportunistic.
export const EXIT_POLICY = { LEVEL: "LEVEL_FIRST", TIME: "TIME_FIRST" };

/**
 * RUNNER ELIGIBILITY IS DERIVED, NEVER HAND-SET.
 *
 * Two independent properties, and BOTH must hold:
 *
 *   thesis === 'continuation'  the move is open-ended — there is somewhere for
 *                              a runner to run TO. A 'terminus' thesis targets a
 *                              specific level and is finished when it gets
 *                              there; riding past it is riding without a thesis.
 *
 *   entryConfirmed === true    the read's own conditions include a COMPLETED
 *                              confirming event — a retest that printed, or a
 *                              failure that finished. A read that describes a
 *                              persisting STATE (acceptance, holding) has no
 *                              confirmed entry location, so there is no anchor
 *                              to trail a stop behind.
 *
 * Exactly two scenarios satisfy both: buy_pullbacks and trend_down_watch.
 *
 * Hand-setting the boolean lets the table drift from the rule the first time
 * someone edits one entry in isolation. No plan stores `runnerEligible`; the
 * suite asserts that it is absent.
 */
export function runnerEligible(plan) {
  return plan.thesis === "continuation" && plan.entryConfirmed === true;
}

export const SPY_SCENARIOS = [
  {
    id: "short_rallies",
    label: "SHORT RALLIES",
    dir: "SHORT",
    note: "Opening impulse failing under supply. Puts on a lower-high retest into resistance.",
    match: s => (s.opening === "below" || s.opening === "inside") && s.vwap === "lost" && s.internals === "weak" && s.retest === "lowerhigh",
    plan: {
      thesis: "terminus",          // fading a bounce INTO resistance — bounded by the level
      entryConfirmed: true,        // matcher requires retest === 'lowerhigh'
      exitPolicy: EXIT_POLICY.LEVEL,
      targets: ["vwap", "support"],
      maxHoldMin: 15,
      fragileTags: ["stage2", "stage2w"],   // shorting into a long frame
    },
  },
  {
    id: "buy_pullbacks",
    label: "BUY PULLBACKS",
    dir: "LONG",
    note: "Holding above value with confirming internals. Buy first orderly pullback into reclaimed level/VWAP.",
    match: s => (s.opening === "above" || s.opening === "gapdown") && s.vwap === "holding" && s.internals === "strong" && s.retest === "higherlow",
    plan: {
      thesis: "continuation",      // an established advance, open-ended
      entryConfirmed: true,        // matcher requires retest === 'higherlow'
      exitPolicy: EXIT_POLICY.LEVEL,
      targets: ["reclaim"],
      maxHoldMin: 20,
      fragileTags: ["transition", "stage3"],
    },
  },
  {
    id: "trend_down_watch",
    label: "TREND-DOWN WATCH",
    dir: "SHORT",
    note: "Gap-down demand failing with VWAP overhead. Rallies are liquidity events to fade.",
    match: s => s.opening === "gapdown" && s.vwap === "lost" && s.internals === "weak",
    plan: {
      thesis: "continuation",      // a trend-down day, open-ended
      entryConfirmed: true,        // the gap-down demand failure is a COMPLETED event,
                                   // with VWAP overhead as the standing anchor
      exitPolicy: EXIT_POLICY.LEVEL,
      targets: ["support", "flip"],
      maxHoldMin: 15,
      fragileTags: ["stage2", "stage2w"],
    },
  },
  {
    id: "bullish_lean",
    label: "BULLISH LEAN",
    dir: "LONG",
    note: "Accepted above supply with confirming breadth. Pullback entries; avoid chasing.",
    match: s => s.opening === "above" && s.vwap === "holding" && s.internals === "strong",
    plan: {
      thesis: "continuation",      // the move is open-ended...
      entryConfirmed: false,       // ...but no retest printed. "Avoid chasing" IS this flag.
      exitPolicy: EXIT_POLICY.TIME,
      targets: [],                 // no confirmed entry ⇒ no level to scale against.
                                   // [] + no runner means TIME-BOXED, not "rides free":
                                   // maxHoldMin is the sole exit.
      maxHoldMin: 12,
      fragileTags: ["transition", "stage3"],
    },
  },
  {
    id: "potential_reversal",
    label: "POTENTIAL REVERSAL",
    dir: "NEUTRAL",                // NEUTRAL BY DESIGN — do not "fix" to LONG.
                                   // spyEngine.js forces CAUTION on a NEUTRAL read;
                                   // flipping this to LONG turns that CAUTION into GO.
    note: "Below supply but holding VWAP with strong internals. Need acceptance above supply to flip long.",
    match: s => s.opening === "below" && s.vwap === "holding" && s.internals === "strong",
    plan: {
      thesis: "terminus",          // a reversal targets acceptance, then re-reads
      entryConfirmed: false,       // acceptance above supply has NOT printed
      exitPolicy: EXIT_POLICY.TIME,
      targets: [],
      maxHoldMin: 10,
      fragileTags: [],
    },
  },
  {
    id: "failed_breakout",
    label: "FAILED BREAKOUT",
    dir: "SHORT",
    note: "Lost VWAP with weak internals after being above/inside supply. Short the lower-high retest.",
    match: s => (s.opening === "above" || s.opening === "inside") && s.vwap === "lost" && s.internals === "weak",
    plan: {
      thesis: "terminus",          // a fade back to value, not a new trend
      entryConfirmed: true,        // losing VWAP after acceptance is a COMPLETED failure
      exitPolicy: EXIT_POLICY.LEVEL,
      targets: ["vwap", "support"],
      maxHoldMin: 10,
      fragileTags: ["stage2", "stage2w"],
    },
  },
  {
    id: "reduce_size_wait",
    label: "REDUCE SIZE / WAIT",
    dir: "NEUTRAL",
    note: "Conditions unaligned. Noise, poor follow-through, rapid premium decay.",
    match: s => s.vwap === "chop" || s.internals === "mixed" || s.retest === "none",
    plan: {
      thesis: "terminus",
      entryConfirmed: false,
      exitPolicy: EXIT_POLICY.TIME,
      targets: [],
      maxHoldMin: 8,
      fragileTags: [],
    },
  },
  {
    id: "stand_aside",
    label: "STAND ASIDE",
    dir: "NEUTRAL",
    note: "Auction not yet clear.",
    match: () => true,             // CATCH-ALL. Must stay last. Makes selectScenario total.
    plan: {
      thesis: "terminus",
      entryConfirmed: false,
      exitPolicy: EXIT_POLICY.TIME,
      targets: [],
      maxHoldMin: 0,               // 0 ⇒ no trade at all, not a fast trade
      fragileTags: [],
    },
  },
];

/**
 * First match wins. Total by construction — the last entry matches everything,
 * so callers never need a null check.
 *
 * The `||` tail is defence against someone editing the catch-all's matcher, not
 * a live path. It costs nothing and it is the difference between a wrong label
 * and a TypeError in the renderer.
 *
 * @returns {object} always a scenario, never undefined
 */
export function selectScenario(s) {
  return SPY_SCENARIOS.find(sc => sc.match(s)) || SPY_SCENARIOS[SPY_SCENARIOS.length - 1];
}
