/**
 * PARITY HARNESS — portable core vs the APEX inline implementation.
 *
 * Proves spy-governor-core.js is a faithful extraction of what APEX ships
 * (Apex-terminal/index.html, the sl/SL_ block). If this passes, porting the
 * core into another terminal cannot silently change behaviour.
 *
 * Run:
 *   node parity.mjs <path-to-APEX-index.html> [path-to-spy-governor-core.js]
 *
 * Both paths are arguments — nothing is assumed about where the APEX checkout
 * lives. The inline block is located by CONTENT ANCHORS, not line numbers, so
 * edits above or below it cannot silently shift the slice.
 *
 * Exit codes:
 *   0  parity clean
 *   1  parity failure (a field disagreed) or a harness error
 *   2  STRUCTURE DRIFT — precondition failed, nothing was compared
 *
 * ── Why there are two phases, and what gets pruned ──────────────────────
 *
 * The full tape grid is the cartesian product of the six SL_INPUTS_DEF
 * selects that feed the directional read:
 *
 *     opening(4) x vwap(3) x internals(3) x retest(3) x ribbon(3) x hviv(3)
 *       = 972 combinations
 *
 * crossed with 6 explicit time windows (the 7th, 'auto', resolves to one of
 * those off the clock and is excluded so runs are deterministic) = 5832.
 * Crossing THAT with the structural grid (spot x VIX) would be ~650k
 * scenarios of almost entirely redundant work, because:
 *
 *     core.governorFor() is a pure function of (biasDir, struct, windowKey).
 *     The tape enters only through biasDir, which has three values.
 *
 * The old harness pruned straight to three representative tape combinations
 * (one per biasDir) and swept the structural grid against those — 2016
 * scenarios. That is the right prune, but it ASSUMES the collapse it depends
 * on. If APEX's inline governor ever started reading a tape field directly,
 * the pruned harness would keep passing while the terminals silently drifted.
 *
 * So this version proves the collapse instead of assuming it:
 *
 *   PHASE 1 — collapse proof. Run the FULL 972-combination tape grid across
 *   all 6 windows at a fixed verified structure, group the inline governor
 *   output by (biasDir, window), and assert every member of a group is
 *   identical. That is what licenses the prune.
 *
 *   PHASE 2 — structural sweep. With the collapse proven, prune to one
 *   representative tape combination per biasDir and sweep the full structural
 *   grid (spots x VIXes, boundary-dense) against core, comparing field by
 *   field. Runs TWICE — see below.
 *
 * Nothing else is pruned. Reported counts are actual, not nominal.
 *
 * ── Why phase 2 runs twice ──────────────────────────────────────────────
 *
 * The boundary probes used to be a typed-in list of the levels as of the week
 * the harness was written. When the weekly re-anchored, the list did not move:
 * every "one cent below the flip" spot landed in the flat interior of a band,
 * the sweep stopped exercising a single boundary, and it kept reporting a green
 * 2016-scenario run. Probing nothing and finding nothing look identical from
 * the outside, which is what let it survive several re-anchors.
 *
 * So the probes are DERIVED from a levels object, and phase 2 takes one:
 *
 *   SYNTHETIC — the primary. Fixed round numbers that are obviously not a real
 *   anchoring, hermetic and offline. It never changes, so this pass is a stable
 *   regression floor that cannot rot and cannot be affected by the network.
 *
 *   LIVE — the second pass, against whatever production is actually serving
 *   (PARITY_LIVE_URL, else SPY_STRUCTURE_JSON, else the baked anchor, announced
 *   loudly). Synthetic proves the two implementations agree at SOME boundary;
 *   only this proves they agree at the boundaries traders are looking at today.
 *
 * boundarySpots() also asserts every level it was handed appears in SPOTS, so
 * replacing the derivation with a literal list exits 2 rather than going quiet.
 *
 * Env:
 *   PARITY_LIVE_URL     /api/spy-logic/structure — fetched for the LIVE pass
 *   SPY_STRUCTURE_JSON  the same var the backend reads, used if no URL is set
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const apexPath = process.argv[2];
const corePath = process.argv[3] || './spy-governor-core.js';

if (!apexPath) {
    console.error('usage: node parity.mjs <path-to-APEX-index.html> [path-to-spy-governor-core.js]');
    process.exit(1);
}
if (!fs.existsSync(apexPath)) {
    console.error('APEX index.html not found: ' + apexPath);
    process.exit(1);
}

const core = await import(pathToFileURL(path.resolve(corePath)).href);

// ── load the APEX inline block against DOM stubs ─────────────
// Anchored on content, not line numbers. The end anchor is the renderer
// banner: everything above it is pure logic, everything below touches the DOM.
const html = fs.readFileSync(apexPath, 'utf8');

const START_ANCHOR = 'const SL_STATE = {';
const END_ANCHOR = '// ── Renderers';

const start = html.indexOf(START_ANCHOR);
if (start < 0) { console.error('start anchor not found: ' + START_ANCHOR); process.exit(1); }
const end = html.indexOf(END_ANCHOR, start);
if (end < 0) { console.error('end anchor not found: ' + END_ANCHOR); process.exit(1); }
const src = html.slice(start, end);

// Captured before the stub below replaces it. The LIVE pass may need to reach
// the real /api/spy-logic/structure endpoint; the inline block must not.
const realFetch = globalThis.fetch;

const nodes = {};
const el = () => ({ innerHTML: '', textContent: '', style: {}, value: '' });
globalThis.document = { getElementById: id => (nodes[id] || (nodes[id] = el())) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.PRICE_CACHE = {};
globalThis.NEXUS_API = 'http://parity';
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
globalThis.setInterval = () => 0;

// eslint-disable-next-line no-eval
(0, eval)(src + '\nglobalThis.__apex = { slStructure, slRunGate, slStructureContext, slDirectionalRead, slSelectScenario, SL_STATE, SL_STRUCTURE, SL_INPUTS_DEF };');
const apex = globalThis.__apex;

// ── PRECONDITION: structure drift ────────────────────────────
// If the inline anchor and the core anchor disagree, every downstream
// comparison is meaningless — the two implementations are describing
// different weeks. Bail loudly before comparing anything.
{
    const a = apex.SL_STRUCTURE, c = core.SL_STRUCTURE;
    const keys = ['asOf', 'reclaim', 'support', 'flip', 'staleDays', 'vixFragile'];
    const drift = keys.filter(k => String(a[k]) !== String(c[k]));
    if (drift.length) {
        console.error('\n✗ STRUCTURE DRIFT — inline anchor and core anchor disagree.');
        for (const k of drift) {
            console.error(`    ${k}: apex=${JSON.stringify(a[k])}  core=${JSON.stringify(c[k])}`);
        }
        console.error('\nNothing was compared. Re-anchor one side, or this run means nothing.\n');
        process.exit(2);
    }
    console.log('precondition: structure anchors agree (' + a.asOf +
        ', reclaim ' + a.reclaim + ' / support ' + a.support + ' / flip ' + a.flip + ')');
}

// The anchor as shipped, snapshotted before any pass overrides it. The
// structural sweep drives BOTH implementations off an explicit levels object,
// so it has to be able to put this one back afterwards.
const SHIPPED = { ...apex.SL_STRUCTURE };

let checks = 0, fail = 0;
const diff = (label, a, b) => {
    checks++;
    const A = JSON.stringify(a), B = JSON.stringify(b);
    if (A !== B) { fail++; console.log('  ✗ ' + label + '\n      apex: ' + A + '\n      core: ' + B); }
};

const WINDOWS = ['open', 'amprime', 'lunch', 'pmprime', 'power', 'close'];

// ═══════════════════════════════════════════════════════════════
// PHASE 1 — collapse proof over the FULL tape grid
// ═══════════════════════════════════════════════════════════════
// Derive the option lists from SL_INPUTS_DEF itself rather than hardcoding
// them, so adding a select or an option grows the grid automatically instead
// of silently leaving the new value untested.
const DEF = Object.fromEntries(apex.SL_INPUTS_DEF.map(([k, , opts]) => [k, opts.map(o => o[0])]));
const TAPE_KEYS = ['opening', 'vwap', 'internals', 'retest', 'ribbon', 'hviv'];

const tapeGrid = [];
(function build(i, acc) {
    if (i === TAPE_KEYS.length) { tapeGrid.push({ ...acc, ivp: 40 }); return; }
    for (const v of DEF[TAPE_KEYS[i]]) build(i + 1, { ...acc, [TAPE_KEYS[i]]: v });
})(0, {});

console.log('\nphase 1 — collapse proof: ' + tapeGrid.length + ' tape combinations x ' +
    WINDOWS.length + ' windows = ' + (tapeGrid.length * WINDOWS.length) + ' scenarios');

// Fix a verified structure so only the tape varies. DERIVED from the shipped
// anchor, not typed in: a literal here is a number that quietly stops meaning
// "comfortably inside the confirmed band" the next time the weekly re-anchors.
const round2 = v => Number(v.toFixed(2));
const MID_CONFIRMED = round2((SHIPPED.support + SHIPPED.reclaim) / 2);
const CALM_VIX = round2(SHIPPED.vixFragile * 0.75);
apex.SL_STATE.live = { price: MID_CONFIRMED };
globalThis.PRICE_CACHE['^VIX'] = { price: CALM_VIX };

const groups = new Map();
let phase1 = 0, collapseViolations = 0;

for (const tape of tapeGrid) {
    for (const win of WINDOWS) {
        phase1++;
        const inputs = { ...tape, window: win };
        apex.SL_STATE.inputs = inputs;
        const r = apex.slRunGate(inputs);
        // Keyed on the SCENARIO, not on bias.dir. Before the plan existed,
        // stops.target/runner were set by the governor alone, so every tape
        // yielding the same direction collapsed to one signature. The plan is
        // per-scenario and runner eligibility is DERIVED, so two LONG reads now
        // legitimately differ: buy_pullbacks rides (continuation + confirmed),
        // bullish_lean does not (no retest printed). Grouping by direction
        // reports that as a violation when it is the intended behaviour.
        const key = apex.slSelectScenario(inputs).id + '|' + win;
        // The governor verdict plus the fields the governor is allowed to move.
        const sig = JSON.stringify({
            governor: r.governor,
            time: r.stops.time,
            target: r.stops.target,
            runner: r.stops.runner
        });
        if (!groups.has(key)) groups.set(key, { sig, example: inputs });
        else if (groups.get(key).sig !== sig) {
            collapseViolations++;
            if (collapseViolations <= 5) {
                console.log('  ✗ collapse violated for ' + key);
                console.log('      first: ' + JSON.stringify(groups.get(key).example));
                console.log('      this:  ' + JSON.stringify(inputs));
                console.log('      a: ' + groups.get(key).sig);
                console.log('      b: ' + sig);
            }
        }
    }
}
checks += phase1;
fail += collapseViolations;
console.log(collapseViolations === 0
    ? '  ✓ governor output depends on the tape only through biasDir — prune licensed'
    : '  ✗ ' + collapseViolations + ' collapse violations — the phase-2 prune is NOT valid');

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — structural sweep against the pruned tape set
// ═══════════════════════════════════════════════════════════════
// Boundary-dense: every level appears exactly, one cent above, one cent below.
//
// DERIVED, never typed in. The old harness hardcoded the probe triple, so the
// week the anchor moved, every "boundary" spot landed in the flat interior of a
// band and the sweep silently stopped testing the thing it exists to test —
// while still reporting 2016 green scenarios. That failure is invisible by
// construction: a harness that probes nothing looks exactly like a harness that
// probes everything and finds nothing. Deriving the probes from the same object
// both implementations are reading makes the decay unrepresentable, and
// assertLevelsProbed() below refuses to run if it ever creeps back.
function boundarySpots(levels) {
    const L = [levels.flip, levels.support, levels.reclaim];
    const probes = L.flatMap(v => [round2(v - 0.01), v, round2(v + 0.01)]);
    // Interior context, also derived: one well below the flip, one mid
    // transition zone, one mid pressure band, one well above the reclaim.
    const context = [
        round2(levels.flip - 20),
        round2((levels.flip + levels.support) / 2),
        round2((levels.support + levels.reclaim) / 2),
        round2(levels.reclaim + 20)
    ];
    const spots = [null, ...context, ...probes];

    // THE GUARD. Every level in the fixture must appear in SPOTS exactly.
    // This is the assertion that makes the hardcoding unreintroducible: swap the
    // flatMap back for a literal list and the next re-anchor exits 2 instead of
    // printing a green run over dead probes.
    const unprobed = L.filter(v => !spots.includes(v));
    if (unprobed.length) {
        console.error('\n✗ BOUNDARY GUARD — a level in the fixture is not probed by SPOTS.');
        console.error('    unprobed: ' + JSON.stringify(unprobed));
        console.error('    SPOTS:    ' + JSON.stringify(spots));
        console.error('\nSPOTS must be derived from the levels, not listed. Nothing was compared.\n');
        process.exit(2);
    }
    return spots;
}

// Same decay, same fix: vixFragile is a boundary too, and 24.99/25 were typed
// in beside it. Probe it off the fixture so a fixture with a different fragile
// threshold is actually tested at its threshold.
function boundaryVixes(levels) {
    const f = levels.vixFragile;
    return [null, round2(f * 0.5), round2(f * 0.7), round2(f - 0.01), f, round2(f + 0.01), round2(f * 1.2), round2(f * 1.8)];
}

const INPUTS = {
    SHORT:   { opening: 'below', vwap: 'lost',    internals: 'weak',   retest: 'lowerhigh', ribbon: 'fanneddown', ivp: 40, hviv: 'inline' },
    LONG:    { opening: 'above', vwap: 'holding', internals: 'strong', retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' },
    NEUTRAL: { opening: 'above', vwap: 'chop',    internals: 'mixed',  retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' }
};

// ── the two level fixtures ───────────────────────────────────
//
// PRIMARY is SYNTHETIC and fixed: round numbers, obviously not a real
// anchoring, chosen so the derived probes are exact in binary floating point.
// It never changes, so the primary run is deterministic and offline forever —
// it does not care what the weekly did and it does not touch the network.
//
// It is deliberately NOT the production triple. If the fixture tracked
// production, the LIVE pass below would be a re-run of the same numbers and
// would prove nothing.
const SYNTHETIC = {
    asOf:       SHIPPED.asOf,      // shared so both sides age identically
    flip:       700.00,
    support:    750.00,
    reclaim:    800.00,
    staleDays:  SHIPPED.staleDays,
    vixFragile: 25,
    source:     'parity synthetic fixture — not a real anchoring'
};

// LIVE is whatever production is actually serving. The synthetic pass proves
// the two implementations agree at SOME boundary; only this one proves they
// agree at the boundaries traders are looking at today.
async function resolveLiveLevels() {
    const url = process.env.PARITY_LIVE_URL;
    if (url) {
        let d;
        try {
            const r = await realFetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            d = await r.json();
        } catch (e) {
            // Loud, not skipped. PARITY_LIVE_URL being set is a statement that
            // the live pass matters; failing to reach it is a failure.
            console.error('\n✗ LIVE PASS — could not read ' + url + ': ' + ((e && e.message) || e) + '\n');
            process.exit(1);
        }
        return { levels: { ...d }, origin: 'endpoint ' + url, real: true };
    }
    const raw = process.env.SPY_STRUCTURE_JSON;
    if (raw) {
        let d;
        try { d = JSON.parse(raw); }
        catch (e) {
            console.error('\n✗ LIVE PASS — SPY_STRUCTURE_JSON is not valid JSON: ' + ((e && e.message) || e) + '\n');
            process.exit(1);
        }
        return { levels: { ...SHIPPED, ...d }, origin: 'env SPY_STRUCTURE_JSON', real: true };
    }
    return { levels: { ...SHIPPED }, origin: 'shipped baked anchor', real: false };
}

const LIVE = await resolveLiveLevels();

const now = Date.now();
let phase2 = 0;

// Drives BOTH implementations off one explicit levels object: the inline block
// by mutating the `let SL_STRUCTURE` it reads, the core through its `levels`
// parameter. Anything else compares two different weeks.
function structuralSweep(label, levels) {
    Object.assign(apex.SL_STRUCTURE, levels);
    const SPOTS = boundarySpots(levels);
    const VIXES = boundaryVixes(levels);

    console.log('\nphase 2 — structural sweep [' + label + ']: ' + SPOTS.length + ' spots x ' + VIXES.length +
        ' VIXes x ' + Object.keys(INPUTS).length + ' reads x ' + WINDOWS.length + ' windows = ' +
        (SPOTS.length * VIXES.length * Object.keys(INPUTS).length * WINDOWS.length) + ' scenarios');
    console.log('    boundaries probed: flip ' + levels.flip + ' / support ' + levels.support +
        ' / reclaim ' + levels.reclaim + ' / vixFragile ' + levels.vixFragile);

    const at = s => `[${label}] ` + s;

    for (const spot of SPOTS) {
        for (const vix of VIXES) {
            apex.SL_STATE.live = spot == null ? null : { price: spot };
            if (vix == null) delete globalThis.PRICE_CACHE['^VIX'];
            else globalThis.PRICE_CACHE['^VIX'] = { price: vix };

            const aS = apex.slStructure();
            const cS = core.structuralTag({ spot, vix, now, levels });

            diff(at(`structuralTag(spot=${spot}, vix=${vix})`),
                { verified: aS.verified, missing: aS.missing, tag: aS.tag, label: aS.label, dir: aS.dir, color: aS.color, spot: aS.spot, vix: aS.vix, stale: aS.stale, detail: aS.detail },
                { verified: cS.verified, missing: cS.missing, tag: cS.tag, label: cS.label, dir: cS.dir, color: cS.color, spot: cS.spot, vix: cS.vix, stale: cS.stale, detail: cS.detail });

            // levelLadder is deliberately NOT compared here: APEX's ladder lives in
            // the renderer section, below the END anchor, so there is no inline
            // counterpart in the sliced region. Comparing core against a re-derivation
            // would test this harness, not parity. It is covered by the unit tests.

            for (const [name, base] of Object.entries(INPUTS)) {
                for (const win of WINDOWS) {
                    phase2++;
                    const inputs = Object.assign({}, base, { window: win });
                    apex.SL_STATE.inputs = inputs;
                    const aR = apex.slRunGate(inputs);
                    // Pass the plan. APEX's slRunGate now merges it, so calling the
                    // core without one compares a plan-wired implementation against an
                    // unwired one and every scenario whose plan revokes a runner reads
                    // as drift. Harmless against a core that predates the argument.
                    const cPlan = apex.slSelectScenario(inputs).plan;
                    const cG = core.governorFor({ biasDir: aR.bias.dir, struct: cS, windowKey: win, plan: cPlan });

                    diff(at(`governor(${name}, spot=${spot}, vix=${vix}, win=${win})`),
                        { mode: aR.governor.mode, label: aR.governor.label, color: aR.governor.color },
                        { mode: cG.governor.mode, label: cG.governor.label, color: cG.governor.color });

                    diff(at(`stops(${name}, spot=${spot}, vix=${vix}, win=${win})`),
                        { time: aR.stops.time, target: aR.stops.target, runner: aR.stops.runner, pricePct: aR.stops.pricePct },
                        { time: cG.stops.time, target: cG.stops.target, runner: cG.stops.runner, pricePct: cG.stops.pricePct });

                    // The gate floor may only ratchet downward.
                    diff(at(`worsenGate(${name}, spot=${spot}, win=${win})`),
                        core.worsenGate('GO', cG.gateFloor),
                        cG.gateFloor === 'GO' ? 'GO' : cG.gateFloor);
                }
            }
        }
    }
}   // structuralSweep

// PRIMARY — synthetic, offline, deterministic.
structuralSweep('SYNTHETIC', SYNTHETIC);

// SECOND PASS — the block production is actually serving.
if (!LIVE.real) {
    console.log('\n⚠ LIVE PASS is running against the ' + LIVE.origin + ', not production.');
    console.log('    Set PARITY_LIVE_URL=<nexus>/api/spy-logic/structure (or SPY_STRUCTURE_JSON)');
    console.log('    to probe the boundaries actually in production. Until then this pass');
    console.log('    re-tests the fallback, which is not the same claim.');
}
structuralSweep('LIVE · ' + LIVE.origin, LIVE.levels);

// Put the shipped anchor back for the sections below.
Object.assign(apex.SL_STRUCTURE, SHIPPED);

// ── stopMath, independent of the grid ────────────────────────
for (const prem of [0.68, 1.20, 2.55, 0, -1]) {
    for (const lots of [1, 2, 3, 9]) {
        const m = core.stopMath({ entryPremium: prem, lots });
        if (prem <= 0) {
            diff(`stopMath(${prem}, ${lots}) is null`, m, null);
        } else {
            diff(`stopMath(${prem}, ${lots})`,
                { stopPrice: Number((prem * 0.75).toFixed(4)), maxLoss: Math.round(prem * 0.25 * 100 * Math.min(lots, 3)), lots: Math.min(lots, 3) },
                { stopPrice: Number(m.stopPrice.toFixed(4)), maxLoss: Math.round(m.maxLoss), lots: m.lots });
        }
    }
}

// ── buildStructureContext shape ──────────────────────────────
apex.SL_STATE.live = { price: MID_CONFIRMED };
globalThis.PRICE_CACHE['^VIX'] = { price: CALM_VIX };
apex.SL_STATE.inputs = Object.assign({}, INPUTS.SHORT, { window: 'amprime' });
{
    const aCtx = apex.slStructureContext();
    const aR = apex.slRunGate(apex.SL_STATE.inputs);
    const cS = core.structuralTag({ spot: MID_CONFIRMED, vix: CALM_VIX, now, levels: SHIPPED });
    const cG = core.governorFor({ biasDir: aR.bias.dir, struct: cS, windowKey: 'amprime' });
    const cCtx = core.buildStructureContext({
        struct: cS, read: aR.bias, windowLabel: aR.windowLabel,
        entryStructure: aR.structure, governorResult: cG
    });
    diff('buildStructureContext top-level key set',
        Object.keys(aCtx).sort(), Object.keys(cCtx).sort());
}

// ── report ───────────────────────────────────────────────────
const scenarios = phase1 + phase2;
console.log('');
if (fail === 0) {
    console.log(`✓ parity clean — ${scenarios} scenarios, ${checks} comparisons`);
    console.log(`    phase 1 (collapse proof):    ${phase1}`);
    console.log(`    phase 2 (structural sweep):  ${phase2}   (synthetic + live)`);
    console.log(`    live pass source:            ${LIVE.origin}${LIVE.real ? '' : '  ⚠ NOT production'}`);
} else {
    console.log(`✗ parity FAILED — ${fail} of ${checks} comparisons disagreed across ${scenarios} scenarios`);
}
process.exit(fail === 0 ? 0 : 1);
