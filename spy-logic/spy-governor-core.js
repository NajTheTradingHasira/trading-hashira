/**
 * SPY STRUCTURAL GOVERNOR — portable core
 * ---------------------------------------------------------------
 * Framework-agnostic. No DOM, no fetch, no globals, no side effects.
 * Every function is pure; the only inputs are the arguments you pass.
 *
 * This is the canonical implementation of the rule:
 *
 *   The weekly structural tag is the FRAME; the intraday read is the TRADE.
 *   A read that fights the tag is a scalp with a shelf life, not a trend.
 *
 * It reproduces, exactly, the behaviour shipped inline in the APEX terminal
 * (Apex-terminal/index.html, commit 3c470a4, the sl/SL_ block). APEX is the
 * reference; this module is what gets dropped into the React terminals.
 *
 * Usage in a React/Vite/Next app:
 *   import { structuralTag, governorFor, buildStructureContext } from './spy-governor-core';
 *   const struct = structuralTag({ spot, vix });
 *   const gov    = governorFor({ biasDir: read.dir, struct, windowKey });
 *   // apply gov.gateFloor / gov.stops / gov.reasons to your own gate output
 *
 * Ships as ESM. For CommonJS consumers, see the bottom of the file.
 *
 * One import, and it points the safe way: spyScenarios.js has no imports of its
 * own, so there is no cycle. applyPlan() needs the runner derivation and must
 * not keep a second copy of the rule.
 */
// Explicit .js extension: Vite resolves extensionless specifiers, plain Node does
// not. Without it this module is unloadable outside the bundler, which silently
// takes it out of reach of spy-logic/parity.mjs — the one harness that checks
// nexus against APEX. Keep the extension.
import { runnerEligible } from './spyScenarios.js';

// ═══════════════════════════════════════════════════════════════
// 1. THE ANCHOR — the only block you edit when the weekly re-anchors
// ═══════════════════════════════════════════════════════════════
export const SL_STRUCTURE = {
    asOf:       '2026-07-26',
    reclaim:    743.91,   // spot above  → weekly Stage 2 confirmed
    support:    735.21,   // spot below  → Stage 2 under pressure
    flip:       722.54,   // spot below  → tag flips bearish (Stage 3/4)
    staleDays:  10,       // nudge to re-anchor after this many days
    vixFragile: 25,       // VIX at/above this downgrades a confirmed tag
    source:     'Weekly 30-wk SMA rising; levels from the 07/24 review.'
};

// The last leak. Hard, pre-set at entry, non-negotiable.
export const SL_STOP = { pct: 25, label: '−25% of premium' };

// Position cap. Sizing is no longer the leak — do not coach on it.
export const SL_MAX_LOTS = 3;

// Counter-structural time stops (halved vs with-structure)
export const SL_SCALP_TIME = {
    open: '5 min', amprime: '8-10 min', lunch: '5 min',
    pmprime: '6-8 min', power: '5-8 min'
};

// With-structure time stops (the pre-existing APEX values)
export const SL_NORMAL_TIME = {
    lunch: '10 min', amprime: '15-20 min', pmprime: '10-15 min', power: '10-15 min'
};

// ── Numeric counterparts to the two tables above ─────────────────
// Each value is the UPPER BOUND of the range the string beside it expresses.
// The strings stay: they are what keeps this module diffable character-for-
// character against hashira's and APEX's inline SL_ blocks, which is how drift
// between the three has been caught to date. These are the enforceable version
// of the same numbers.
//
// Do NOT derive these by parsing the strings at runtime, and do NOT compute
// them by halving SL_NORMAL_TIME. The APEX spec says "half the window default,
// floor 6 min", and that rule contradicts what shipped: half of lunch's 10 is
// 5, the floor forces 6, but SL_SCALP_TIME.lunch is '5 min'. Pairing the tables
// by hand makes the numeric and the string agree by construction instead.
//
// 'open' and 'close' are 0 in both: those windows are already an unconditional
// NO-GO in evaluateSetup, so there is no hold to cap.
export const NUMERIC_HOLD       = { open: 0, amprime: 20, lunch: 10, pmprime: 15, power: 15, close: 0, pre: 0, after: 0, closed: 0 };
export const NUMERIC_SCALP_HOLD = { open: 0, amprime: 10, lunch:  5, pmprime:  8, power:  8, close: 0, pre: 0, after: 0, closed: 0 };

export const SL_RULES = [
    'The weekly structural tag is the frame; the intraday read is the trade.',
    'A directional read that fights the weekly tag is a SCALP WITH A SHELF LIFE, not a trend: half size, halved time stop, no runner, and it can never be a GO.',
    'Never assign a Weinstein stage off a daily or intraday chart alone — weekly + daily + VIX are all required before any regime claim.',
    'The −25% premium stop is hard and pre-set at entry. No loser may exceed it.',
    'Position size caps at 3 lots; sizing is no longer the leak — stops are.'
];

// ═══════════════════════════════════════════════════════════════
// 2. THE TAG — regime-input discipline lives here
// ═══════════════════════════════════════════════════════════════

// ── Input freshness ──────────────────────────────────────────────
// A stale input is treated exactly like a missing one during RTH. A tag
// computed off a spot from forty minutes ago still renders as a confident
// stage label, which is strictly worse than printing nothing: it looks
// authoritative and it is not. Outside RTH a stale spot is stale BY DEFINITION
// (the market is closed), so the age is reported and nothing is downgraded.
export const SL_STALE = { soft: 120000, hard: 300000 };   // 2 min report age · 5 min downgrade
/**
 * Classify the weekly structural tag from live inputs.
 *
 * A stage label is NEVER claimed off partial data. Weekly anchor + live daily
 * price + VIX must all be present, or `verified` is false, `tag` is null, and
 * `missing` names what is absent. This is the "never stage-classify off a
 * daily" rule encoded so it cannot be forgotten.
 *
 * A STALE input is treated the same way as a missing one during RTH — see
 * SL_STALE below. Pass spotAt/vixAt to enable that; omit them and no staleness
 * is claimed.
 *
 * @param {number|null} spot   live daily price (null/NaN → unverified)
 * @param {number|null} vix    live VIX         (null/NaN → unverified)
 * @param {number} [now]       epoch ms, injectable for tests
 * @param {object} [levels]    override SL_STRUCTURE
 * @param {number|null} [spotAt] epoch ms when spot was FETCHED (null → age unknown)
 * @param {number|null} [vixAt]  epoch ms when vix was FETCHED  (null → age unknown)
 */

// RTH = the cash session, on the ET clock. Pure: `at` is always supplied.
export function isRTH(at) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
    });
    const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map(x => [x.type, x.value]));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
    const m = (+p.hour) * 60 + (+p.minute);
    return m >= 570 && m < 960;   // 09:30–16:00 ET
}

export function ageMs(at, now) {
    return (typeof at === 'number' && isFinite(at) && at > 0) ? Math.max(0, now - at) : null;
}

export function fmtAge(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm';
}

// spotAt / vixAt are the epoch-ms stamps of when each input was FETCHED.
// Omitting them means the age is unknown, and an unknown age claims nothing —
// we do not assert freshness we have not measured. That default is what keeps
// callers which never stamp (parity.mjs, unit fixtures) behaving as before.
export function structuralTag({ spot, vix, now = Date.now(), levels = SL_STRUCTURE, spotAt = null, vixAt = null } = {}) {
    const out = {
        verified: false, missing: [], tag: null, label: 'STRUCTURE UNVERIFIED',
        dir: null, color: 'amber', spot: null, vix: null, ageDays: null,
        stale: false, detail: '', levels
    };

    const anchored = Date.parse(levels.asOf + 'T00:00:00');
    if (isFinite(anchored)) {
        out.ageDays = Math.floor((now - anchored) / 86400000);
        out.stale = out.ageDays > levels.staleDays;
    } else {
        out.missing.push('weekly anchor date');
    }

    const s = Number(spot);
    if (isFinite(s) && s > 0) out.spot = s; else out.missing.push('live daily price');

    const v = Number(vix);
    if (isFinite(v) && v > 0) out.vix = v; else out.missing.push('VIX');

    // Freshness is graded after presence: an input that is absent is already
    // in `missing`, and a second complaint about its age would be noise.
    out.rth = isRTH(now);
    out.spotAge = out.spot != null ? ageMs(spotAt, now) : null;
    out.vixAge = out.vix != null ? ageMs(vixAt, now) : null;
    out.spotStale = out.spotAge != null && out.spotAge >= SL_STALE.hard;
    out.vixStale = out.vixAge != null && out.vixAge >= SL_STALE.hard;
    // Age is surfaced past the soft threshold during RTH, and always outside
    // it — a closed-market panel should say so rather than look current.
    out.spotAgeLabel = (out.spotAge != null && (!out.rth || out.spotAge >= SL_STALE.soft)) ? fmtAge(out.spotAge) : null;
    out.vixAgeLabel = (out.vixAge != null && (!out.rth || out.vixAge >= SL_STALE.soft)) ? fmtAge(out.vixAge) : null;
    if (out.rth) {
        if (out.spotStale) out.missing.push('a fresh daily price (last fetch ' + fmtAge(out.spotAge) + ' ago)');
        if (out.vixStale) out.missing.push('a fresh VIX (last fetch ' + fmtAge(out.vixAge) + ' ago)');
    }

    if (out.missing.length) return out;   // no stage claim off partial or stale inputs

    out.verified = true;
    if (out.spot >= levels.reclaim) {
        out.tag = 'stage2';  out.dir = 'LONG';  out.color = 'green';
        out.label = 'WEEKLY STAGE 2 — CONFIRMED';
        out.detail = 'Holding above ' + levels.reclaim.toFixed(2) + '. Shorts are counter-structural.';
    } else if (out.spot >= levels.support) {
        out.tag = 'stage2w'; out.dir = 'LONG';  out.color = 'green';
        out.label = 'WEEKLY STAGE 2 — WEAKENING';
        out.detail = 'Below the ' + levels.reclaim.toFixed(2) + ' reclaim but holding ' + levels.support.toFixed(2) + '. Structure intact, conviction reduced.';
    } else if (out.spot >= levels.flip) {
        out.tag = 'transition'; out.dir = null; out.color = 'amber';
        out.label = 'STAGE 2 AT RISK — NO TAG';
        out.detail = 'Lost ' + levels.support.toFixed(2) + ', has not broken ' + levels.flip.toFixed(2) + '. Tag unresolved — both sides are scalps.';
    } else {
        out.tag = 'stage3';  out.dir = 'SHORT'; out.color = 'red';
        out.label = 'STRUCTURE BROKEN — STAGE 3/4';
        out.detail = 'Broke ' + levels.flip.toFixed(2) + '. Governor inverts: LONGS are now the counter-structural side.';
    }

    if (out.tag === 'stage2' && out.vix >= levels.vixFragile) {
        out.tag = 'stage2w'; out.color = 'amber';
        out.label = 'WEEKLY STAGE 2 — WEAKENING';
        out.detail += ' VIX ' + out.vix.toFixed(2) + ' at/above ' + levels.vixFragile + ' — tag downgraded, structure fragile.';
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════
// 3. THE GOVERNOR
// ═══════════════════════════════════════════════════════════════
/**
 * Given a directional read and a structural tag, return the governor verdict:
 * how the plan must degrade, and why.
 *
 * The host app applies the result to its own gate. The governor can only make
 * a read WORSE — `gateFloor` is a floor, never a ceiling. Pre-existing NO-GO
 * rules (opening auction, closing pin, pinched ribbon, ribbon conflict) must
 * still dominate whatever this returns.
 *
 * @param {'LONG'|'SHORT'|'NEUTRAL'} biasDir  the intraday directional read
 * @param {object} struct                     result of structuralTag()
 * @param {string} windowKey                  time window: open|amprime|lunch|pmprime|power|...
 */
export function governorFor({ biasDir, struct, windowKey, plan } = {}) {
    const reasons = [];
    const stops = {
        time: SL_NORMAL_TIME[windowKey] || '10 min',
        price: SL_STOP.label + ' — HARD, pre-set at entry',
        pricePct: SL_STOP.pct,
        hard: true,
        // `target` is NOT set here — it is derived from stops.runner at the end
        // of this function. See the note above the return.
        runner: true,
        maxLots: SL_MAX_LOTS
    };
    const scalp = () => {
        stops.time   = SL_SCALP_TIME[windowKey] || '5-8 min';
        stops.runner = false;
    };

    let governor = { mode: 'off', label: 'GOVERNOR OFF', color: 'amber', note: '' };
    let gateFloor = 'GO';   // worst gate this verdict permits

    if (!struct || !struct.verified) {
        const missing = (struct && struct.missing || []).join(', ');
        governor = { mode: 'unverified', label: 'STRUCTURE UNVERIFIED', color: 'amber', note: 'Missing ' + missing + '.' };
        gateFloor = 'CAUTION';
        reasons.push('STRUCTURE UNVERIFIED — missing ' + missing + '. No stage label claimed and the governor is off; do not size this off an intraday read alone.');
    } else if (biasDir === 'NEUTRAL' || !biasDir) {
        governor = { mode: 'idle', label: struct.label, color: struct.color, note: 'No directional read to govern yet.' };
    } else if (struct.dir === null) {
        governor = { mode: 'transition', label: 'TRANSITION — SCALP ONLY', color: 'amber',
                     note: 'Structural tag unresolved between ' + struct.levels.flip.toFixed(2) + ' and ' + struct.levels.support.toFixed(2) + '.' };
        gateFloor = 'CAUTION';
        scalp();
        reasons.push('TRANSITION ZONE — SPY ' + struct.spot.toFixed(2) + ' sits between ' + struct.levels.flip.toFixed(2) + ' and ' + struct.levels.support.toFixed(2) + '. No tag either way, so BOTH directions are scalps: half size, hard time stop, no runner.');
    } else if (biasDir !== struct.dir) {
        governor = { mode: 'counter', label: 'COUNTER-STRUCTURAL — SCALP ONLY', color: 'red',
                     note: biasDir + ' against ' + struct.label + '.' };
        gateFloor = 'CAUTION';
        scalp();
        reasons.push('COUNTER-STRUCTURAL — ' + biasDir + ' into ' + struct.label + ' (SPY ' + struct.spot.toFixed(2) + '). This is a scalp with a shelf life, not a trend: half size, halved time stop, no runner, and the gate cannot print GO.');
    } else {
        governor = { mode: 'aligned', label: 'WITH-STRUCTURE', color: 'green',
                     note: biasDir + ' agrees with ' + struct.label + '.' };
        reasons.push('WITH-STRUCTURE — ' + biasDir + ' agrees with ' + struct.label + ' (SPY ' + struct.spot.toFixed(2) + '). Full plan available: scale half at target, BE stop on the runner.');
    }

    if (struct && struct.stale) {
        reasons.push('Weekly anchor is ' + struct.ageDays + ' days old (set ' + struct.levels.asOf + ') — re-anchor the structure block off a fresh weekly chart.');
    }
    reasons.push('HARD STOP ' + SL_STOP.label + ' — pre-set at entry, no exceptions. No loser exceeds it.');

    // ── plan merge (optional) ──
    // Omit `plan` and this function behaves exactly as it did before the
    // scenario registry existed — that no-plan path is pinned byte-identical by
    // the gate-invariance test, and it is the path parity.mjs exercises.
    //
    // Downward only, same discipline as gateFloor: the plan can REVOKE a runner
    // the governor allowed, never grant one the governor revoked.
    if (plan) {
        stops.plan = applyPlan(plan, {
            struct,
            windowKey,
            counterStructural: governor.mode === 'counter',
            transition: governor.mode === 'transition'
        });
        stops.runner     = stops.runner && stops.plan.runnerEligible;
        stops.maxHoldMin = stops.plan.maxHoldMin;
        stops.targets    = stops.plan.targets;
        stops.exitPolicy = stops.plan.exitPolicy;
    }

    // ── target string: DERIVED, never authored ──
    // stops.runner is the single source of truth for "may this trade ride"; the
    // string is a rendering of that boolean, computed LAST so it reflects every
    // mutation above (scalp(), and later the plan merge).
    //
    // Previously the two were set independently — once in the stops literal and
    // once inside scalp() — which left them free to disagree. A string promising
    // a runner beside runner:false is worse than a stale string, because both
    // render and the reader has no way to tell which one is lying.
    //
    // Reproduces the two prior strings EXACTLY, so nexus stays diffable
    // character-for-character against the hashira/APEX inline SL_ blocks:
    //   default path → runner true  → '+30-50%, scale half, BE stop on runner'
    //   scalp() path → runner false → '+20-30% — take the full clip, NO runner'
    stops.target = stops.runner
        ? '+30-50%, scale half, BE stop on runner'
        : '+20-30% — take the full clip, NO runner';

    return { governor, gateFloor, stops, reasons };
}

/**
 * Merge a scenario's baseline plan with the governor's verdict.
 *
 * DOWNWARD ONLY, on every field:
 *   maxHoldMin      → min(scenario, window ceiling, scalp ceiling)
 *   runnerEligible  → derived AND governor
 *   targets         → truncated, never extended
 *
 * There is deliberately no path that lengthens a hold, enables a runner the
 * derivation disallowed, or adds a target. If a future rule needs to RELAX a
 * plan, it belongs in the scenario baseline, not here — same discipline as
 * gateFloor, which is a floor and never a ceiling.
 *
 * Not yet called by governorFor(). Wired in a later step.
 *
 * @param {object} plan  a SPY_SCENARIOS[].plan
 * @param {object} ctx   {struct, windowKey, counterStructural, transition}
 */
export function applyPlan(plan, { struct, windowKey, counterStructural, transition } = {}) {
    // Defensive on the array fields. This is the entry point a NINTH scenario
    // arrives through, and a plan authored without `targets` or `fragileTags`
    // should be governed conservatively rather than throw on .slice()/.includes()
    // and take the panel down. NOT a licence to omit them: the suite requires
    // every scenario in the registry to declare both explicitly.
    const out = {
        exitPolicy: plan.exitPolicy,
        targets: (plan.targets || []).slice(),
        maxHoldMin: plan.maxHoldMin,
        runnerEligible: runnerEligible(plan),   // DERIVED — never read off the table
        degradedBy: []
    };

    // Window ceiling — a plan can never outlast its window's own time stop.
    const windowCap = NUMERIC_HOLD[windowKey];
    if (windowCap != null && windowCap < out.maxHoldMin) {
        out.maxHoldMin = windowCap;
        out.degradedBy.push('window');
    }

    // Counter-structural / transition: clamp to the scalp ceiling, kill the
    // runner, truncate the ladder. Mirrors scalp() on the display strings —
    // kept in lockstep by the paired tables, NOT by halving arithmetic.
    if (counterStructural || transition) {
        const scalpCap = NUMERIC_SCALP_HOLD[windowKey];
        if (scalpCap != null && scalpCap < out.maxHoldMin) {
            out.maxHoldMin = scalpCap;
            out.degradedBy.push(counterStructural ? 'counter-structural' : 'transition');
        }
        if (out.runnerEligible) { out.runnerEligible = false; out.degradedBy.push('no-runner'); }
        if (out.targets.length > 1) { out.targets = out.targets.slice(0, 1); out.degradedBy.push('target-truncated'); }
    }

    // Frame fragility — METADATA, not an eligibility gate. A scenario naming the
    // live tag in fragileTags loses its runner and its extended targets. It is
    // still selected, still tradeable, simply governed harder. Nothing here can
    // exclude it from selection: a filter would let the selector fall through to
    // a LATER, BROADER scenario, i.e. the gate would enable a trade rather than
    // disqualify one.
    if (struct && struct.verified && (plan.fragileTags || []).includes(struct.tag)) {
        if (out.runnerEligible) { out.runnerEligible = false; out.degradedBy.push('fragile-frame'); }
        if (out.targets.length > 1) { out.targets = out.targets.slice(0, 1); out.degradedBy.push('target-truncated'); }
    }

    // A zero-minute hold is a no-trade, not a fast trade.
    if (out.maxHoldMin <= 0) { out.maxHoldMin = 0; out.runnerEligible = false; out.targets = []; }

    return out;
}

/** Gate ranking helper — apply gateFloor without ever improving a gate. */
export function worsenGate(currentGate, floor) {
    const rank = { 'GO': 0, 'CAUTION': 1, 'NO-GO': 2 };
    return (rank[floor] > rank[currentGate]) ? floor : currentGate;
}

// ═══════════════════════════════════════════════════════════════
// 4. HARD STOP MATH
// ═══════════════════════════════════════════════════════════════
/**
 * @returns {null|{stopPrice:number, maxLoss:number, lots:number, atCap:boolean}}
 *          null when the premium is missing/invalid (render a prompt, not NaN)
 */
export function stopMath({ entryPremium, lots = SL_MAX_LOTS, pct = SL_STOP.pct } = {}) {
    const prem = Number(entryPremium);
    if (!isFinite(prem) || prem <= 0) return null;
    const n = Math.max(1, Math.min(SL_MAX_LOTS, Number(lots) || 1));
    return {
        stopPrice: prem * (1 - pct / 100),
        maxLoss: prem * (pct / 100) * 100 * n,
        lots: n,
        atCap: n >= SL_MAX_LOTS
    };
}

// ═══════════════════════════════════════════════════════════════
// 5. AI CONTEXT PAYLOAD
// ═══════════════════════════════════════════════════════════════
/**
 * Build the `structure` object POSTed to /api/spy-logic/analysis.
 *
 * THE SHAPE MUST NOT DRIFT between terminals — the backend injects it verbatim
 * into the provider prompt. All three apps send the same object so one backend
 * prompt serves them all.
 */
export function buildStructureContext({ struct, read, windowLabel, entryStructure, governorResult } = {}) {
    const g = governorResult || governorFor({ biasDir: read && read.dir, struct, windowKey: null });
    return {
        verified: struct.verified,
        missing: struct.missing,
        tag: struct.tag,
        label: struct.label,
        detail: struct.detail,
        structural_direction: struct.dir,
        spot: struct.spot,
        vix: struct.vix,
        levels: { reclaim: struct.levels.reclaim, support: struct.levels.support, flip: struct.levels.flip },
        anchor: { as_of: struct.levels.asOf, age_days: struct.ageDays, stale: struct.stale, source: struct.levels.source },
        local_read: {
            gate: read && read.gate,
            direction: read && read.dir,
            label: read && read.label,
            window: windowLabel,
            structure: entryStructure
        },
        governor: { mode: g.governor.mode, label: g.governor.label, note: g.governor.note },
        stops: {
            time: g.stops.time, price: g.stops.price, target: g.stops.target,
            runner_allowed: g.stops.runner, hard_stop_pct: SL_STOP.pct
        },
        rules: SL_RULES
    };
}

// ═══════════════════════════════════════════════════════════════
// 6. LEVEL LADDER (for the structure bar UI, framework-agnostic data)
// ═══════════════════════════════════════════════════════════════
export function levelLadder(struct) {
    const L = (struct && struct.levels) || SL_STRUCTURE;
    const spot = struct && struct.spot;
    return [
        { key: 'reclaim', label: 'RECLAIM', price: L.reclaim, color: 'green', note: 'Stage 2 confirmed above' },
        { key: 'support', label: 'SUPPORT', price: L.support, color: 'amber', note: 'Stage 2 pressured below' },
        { key: 'flip',    label: 'FLIP',    price: L.flip,    color: 'red',   note: 'Tag flips bearish below' }
    ].map(row => {
        // Finiteness checked at the READ site, not only at ingest. validStructure()
        // guards the API boundary, but `levels` can also arrive as a caller-supplied
        // override, and `spot - undefined` is NaN — which renders as the string
        // "NaN" rather than as missing. A price that cannot be shown must read as
        // absent, never as a number-shaped artefact.
        const ok = Number.isFinite(row.price) && row.price > 0;
        const d = (spot == null || !ok) ? null : spot - row.price;
        return Object.assign(row, {
            resolved: ok,
            distance: d,
            distancePct: d == null ? null : (d / row.price) * 100,
            side: (spot == null || !ok) ? null : (spot >= row.price ? 'ABOVE' : 'BELOW')
        });
    });
}

/**
 * Resolve a target key to a renderable rung. THREE states, not two.
 *
 * Number.isFinite(v) && v > 0 is checked HERE, at the read site. Neither ?? nor
 * || distinguishes an absent level from a zero one:
 *     levels.support ?? fallback   // 0 passes through as a real level
 *     levels.support || fallback   // 0 silently becomes the fallback
 * Both are wrong for a price. Test the number, not its truthiness.
 *
 * FINITENESS ALONE IS STILL NOT ENOUGH, and this is the whole reason the
 * tri-state exists. The baked SL_STRUCTURE defaults are finite and positive, so
 * a finite-only guard reports a months-old anchor as a current level. APEX main
 * had no ingest at all and would have resolved every rung off the bake; nexus
 * has the identical hole, merely hidden behind a working fetch — it reappears
 * the moment /api/spy-logic/structure fails validStructure(), because then
 * adoptStructure() never runs and `levels` stays the constant.
 *
 * A stale-but-confident price is worse than a missing one: "VWAP (no level)"
 * exists so an unknown level LOOKS unknown, and a July anchor rendered bare
 * defeats that. struct.stale is the discriminator, and structuralTag() has been
 * computing it all along from levels.asOf vs levels.staleDays — it simply was
 * not being read here.
 *
 * `resolved` is kept as (state !== 'absent') so existing truthiness checks
 * survive, but it CANNOT separate current from stale. Branch on `state`.
 *
 * @returns {{key,price,state:'current'|'stale'|'absent',resolved,stale,ageDays,label}}
 */
export function resolveTarget(key, struct) {
    const KEY = String(key).toUpperCase();
    const absent = label => ({
        key, label: label || (KEY + ' (no level)'), price: null,
        state: 'absent', resolved: false, stale: false, ageDays: null
    });

    // No live VWAP feed in nexus. Absent by construction, not by failure —
    // and never substituted with a number.
    if (key === 'vwap') return absent('VWAP (no level)');

    const v = struct && struct.levels && struct.levels[key];
    if (!(Number.isFinite(v) && v > 0)) return absent();

    const stale = !!(struct && struct.stale);
    const ageDays = (struct && Number.isFinite(struct.ageDays)) ? struct.ageDays : null;
    return {
        key,
        price: v,
        state: stale ? 'stale' : 'current',
        resolved: true,
        stale,
        ageDays,
        label: stale && ageDays != null ? KEY + ' ' + v.toFixed(2) + ' (' + ageDays + 'd old)'
             : stale                    ? KEY + ' ' + v.toFixed(2) + ' (stale)'
             :                            KEY + ' ' + v.toFixed(2)
    };
}

// CommonJS interop for quick node harnesses:
//   const m = await import('./spy-governor-core.js')
