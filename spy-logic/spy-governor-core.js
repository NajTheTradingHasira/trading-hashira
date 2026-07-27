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
 */

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
/**
 * Classify the weekly structural tag from live inputs.
 *
 * A stage label is NEVER claimed off partial data. Weekly anchor + live daily
 * price + VIX must all be present, or `verified` is false, `tag` is null, and
 * `missing` names what is absent. This is the "never stage-classify off a
 * daily" rule encoded so it cannot be forgotten.
 *
 * @param {number|null} spot   live daily price (null/NaN → unverified)
 * @param {number|null} vix    live VIX         (null/NaN → unverified)
 * @param {number} [now]       epoch ms, injectable for tests
 * @param {object} [levels]    override SL_STRUCTURE
 */
export function structuralTag({ spot, vix, now = Date.now(), levels = SL_STRUCTURE } = {}) {
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

    if (out.missing.length) return out;   // no stage claim off partial inputs

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
export function governorFor({ biasDir, struct, windowKey } = {}) {
    const reasons = [];
    const stops = {
        time: SL_NORMAL_TIME[windowKey] || '10 min',
        price: SL_STOP.label + ' — HARD, pre-set at entry',
        pricePct: SL_STOP.pct,
        hard: true,
        target: '+30-50%, scale half, BE stop on runner',
        runner: true,
        maxLots: SL_MAX_LOTS
    };
    const scalp = () => {
        stops.time   = SL_SCALP_TIME[windowKey] || '5-8 min';
        stops.target = '+20-30% — take the full clip, NO runner';
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

    return { governor, gateFloor, stops, reasons };
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
        const d = (spot == null) ? null : spot - row.price;
        return Object.assign(row, {
            distance: d,
            distancePct: d == null ? null : (d / row.price) * 100,
            side: spot == null ? null : (spot >= row.price ? 'ABOVE' : 'BELOW')
        });
    });
}

// CommonJS interop for quick node harnesses:
//   const m = await import('./spy-governor-core.js')
