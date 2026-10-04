// sl-governor-parity.mjs — hashira's governor vs the portable core, by OUTPUT.
//
//   node spy-logic/sl-governor-parity.mjs [hashira-index.html] [spy-governor-core.js]
//
// Exit 0 clean, 1 drift or an under-count, 2 a precondition failed and NOTHING
// was compared.
//
// ── The gap this closes ─────────────────────────────────────────────────────
//
// Before this file, hashira's governor was compared against nothing.
//
//   parity.mjs         APEX inline  <-> spy-governor-core.js   (governor axis)
//   inline-parity.mjs  hashira      <-> spyScenarios.js        (directional read)
//   sl-adopt-parity    all three                               (adoption boundary)
//
// hashira's slStructure / slApplyGovernor — the code that actually grades a
// trade in this repo — appeared in none of them. It was held to APEX by manual
// character-comparison, which only runs when someone remembers to run it.
//
// ── Why OUTPUT parity rather than unifying the symbol surfaces ──────────────
//
// parity.mjs cannot simply take hashira as a third side: it locates APEX's
// block by the anchors `const SL_STATE = {` and slRunGate, and NEITHER exists
// here. hashira's engine half shares no symbol, call shape or parameter name
// with APEX's — which is exactly why inline-parity.mjs needed its own ordered
// anchor list.
//
// The expensive fix is to rename things until the two look alike. That buys
// parity by making two codebases resemble each other, which is a proxy for what
// we actually care about. Character-comparability is also strictly WEAKER than
// what is asserted here: two identical-looking implementations can both have
// drifted from core in the same way and still diff clean.
//
// So this compares what the governors DECIDE, on a shared fixture grid, through
// each side's real entry point:
//
//   hashira   NX.evaluateSetup(s)  -> { struct, governor, stops, bias, gate }
//   core      structuralTag() + governorFor()
//
// Symbol surfaces stop mattering. No renaming, no third anchor list, and the
// assertion becomes the one worth making: both governors agree on the tag, the
// mode and the stops for the same block.
//
// Transitivity gives all three terminals: parity.mjs pins APEX <-> core over
// 7848 scenarios, this pins hashira <-> core, and spy-governor-core.js is
// byte-identical to nexus/src/lib/spyGovernor.js.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const hashiraPath = argv[0] || fileURLToPath(new URL('../index.html', import.meta.url));
const corePath = argv[1] || fileURLToPath(new URL('./spy-governor-core.js', import.meta.url));

function bail(msg) {
    console.error('\n✗ ' + msg);
    console.error('\nNothing was compared. A harness that silently compares nothing is worse');
    console.error('than no harness, so this exits 2 rather than printing a green run.\n');
    process.exit(2);
}
for (const [label, p] of [['hashira', hashiraPath], ['core', corePath]]) {
    if (!fs.existsSync(p)) bail(label + ' not found: ' + p);
}
const core = await import(pathToFileURL(corePath).href);

// ── FLOORS: fail CLOSED, not open ───────────────────────────────────────────
// This harness finds hashira's governor by evaluating the inline <script> and
// then by NAME (NX.evaluateSetup, slStructure). Both fail open: rename either,
// or let the script regex stop matching, and the run compares fewer things —
// possibly nothing — while still printing green. Today's counts are asserted.
// Raise them deliberately when the grid grows; never lower one to pass a run.
const MIN_CELLS = 112;          // 14 spots x 8 VIXes
const MIN_GATE_SCENARIOS = 2016; // 112 cells x 3 reads x 6 windows
const MIN_COMPARISONS = 6392;    // 112 tag + 112 ladder + 2016 x 3 gate + 120 freshness

// ── Load hashira's inline block ─────────────────────────────────────────────
const src = fs.readFileSync(hashiraPath, 'utf8');
const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);
if (!blocks.length) bail('no inline <script> block in ' + hashiraPath);

const stub = () => ({
    innerHTML: '', textContent: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    appendChild() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {},
    focus() {}, blur() {}, remove() {}, closest: () => null,
});
const sandbox = {
    document: {
        getElementById: () => stub(), querySelector: () => stub(), querySelectorAll: () => [],
        createElement: () => stub(), addEventListener() {},
        body: stub(), head: stub(), documentElement: { style: { setProperty() {} } },
    },
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    requestAnimationFrame: () => 0,
    fetch: () => Promise.reject(new Error('no network in the harness')),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: '', search: '', hash: '' }, navigator: { userAgent: 'node' },
    WebSocket: function () {}, alert() {}, addEventListener() {},
    Chart: new Proxy(function () {}, {
        get(t, k) { if (k === 'prototype') return t.prototype; if (!(k in t)) t[k] = new Proxy({}, this); return t[k]; },
        set(t, k, v) { t[k] = v; return true; },
        construct: () => ({ destroy() {}, update() {}, data: {}, options: {} }),
        apply: () => ({ destroy() {}, update() {}, data: {}, options: {} }),
    }),
    NX: {},
    URLSearchParams, TextEncoder, TextDecoder, performance: { now: () => 0 },
    Date, Math, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt,
    Intl, RegExp, Error, Promise, AbortController, Headers,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const b of blocks) {
    try { vm.runInContext(b, sandbox, { timeout: 20000 }); } catch { /* unrelated block */ }
}
const run = (code) => vm.runInContext(code, sandbox);

// Probes, not assumptions. If the entry points moved, say so and compare
// nothing rather than sweeping a grid against a stub.
for (const [label, expr] of [
    ['slStructure', 'typeof slStructure'],
    ['slSelectScenario', 'typeof slSelectScenario'],
    ['SL_STRUCTURE', 'typeof SL_STRUCTURE'],
    ['NX.evaluateSetup', 'typeof NX.evaluateSetup'],
    ['NX.spyTimeWindow', 'typeof NX.spyTimeWindow'],
]) {
    const got = run(expr);
    if (got !== 'function' && got !== 'object') {
        bail(label + ' not found in ' + hashiraPath + ' (typeof -> ' + got + '). '
            + 'Rename it in the harness rather than leaving it uncompared.');
    }
}

// ── PRECONDITION: anchor drift ──────────────────────────────────────────────
// If the two anchors disagree, every comparison below describes a different
// week. Bail loudly before comparing anything.
{
    const h = JSON.parse(run('JSON.stringify(SL_STRUCTURE)'));
    const c = core.SL_STRUCTURE;
    const keys = ['asOf', 'reclaim', 'support', 'flip', 'staleDays', 'vixFragile'];
    const drift = keys.filter((k) => String(h[k]) !== String(c[k]));
    if (drift.length) {
        console.error('\n✗ STRUCTURE DRIFT — hashira anchor and core anchor disagree.');
        for (const k of drift) {
            console.error('    ' + k + ': hashira=' + JSON.stringify(h[k]) + '  core=' + JSON.stringify(c[k]));
        }
        bail('re-anchor one side, or this run means nothing');
    }
    console.log('precondition: anchors agree (' + h.asOf + ', reclaim ' + h.reclaim
        + ' / support ' + h.support + ' / flip ' + h.flip + ')');
}

// ── Comparison plumbing ─────────────────────────────────────────────────────
let checks = 0;
let fail = 0;
const diff = (label, a, b) => {
    checks++;
    const A = JSON.stringify(a);
    const B = JSON.stringify(b);
    if (A !== B) {
        fail++;
        if (fail <= 12) console.log('  ✗ ' + label + '\n      hashira: ' + A + '\n      core:    ' + B);
    }
};

// Boundary-dense, and identical to parity.mjs phase 2 so the two harnesses
// describe the same surface from the two sides.
const SPOTS = [null, 700, 715, 722.54, 722.53, 728, 735.21, 735.20, 738.86, 739, 743.91, 743.90, 755, 800];
const VIXES = [null, 12, 16, 18.58, 24.99, 25, 29.42, 45];
const WINDOWS = ['open', 'amprime', 'lunch', 'pmprime', 'power', 'close'];
const INPUTS = {
    SHORT:   { opening: 'below', vwap: 'lost',    internals: 'weak',   retest: 'lowerhigh', ribbon: 'fanneddown', ivp: 40, hviv: 'inline' },
    LONG:    { opening: 'above', vwap: 'holding', internals: 'strong', retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' },
    NEUTRAL: { opening: 'above', vwap: 'chop',    internals: 'mixed',  retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' },
};

/** Point hashira's live-data accessors at a fixture cell. */
function setCell(spot, vix, now) {
    run('NX._spyLive = ' + (spot == null ? 'null' : '{ price: ' + spot + ' }') + ';');
    run('NX._vix = ' + (vix == null ? 'null' : vix) + ';');
    run('NX._spyLiveAt = ' + now + '; NX._vixAt = ' + now + ';');
}

console.log('\nstructural grid: ' + SPOTS.length + ' spots x ' + VIXES.length + ' VIXes = '
    + SPOTS.length * VIXES.length + ' cells');
console.log('gate grid:       cells x ' + Object.keys(INPUTS).length + ' reads x '
    + WINDOWS.length + ' windows = '
    + SPOTS.length * VIXES.length * Object.keys(INPUTS).length * WINDOWS.length + ' scenarios');

let cells = 0;
let gateScenarios = 0;

for (const spot of SPOTS) {
    for (const vix of VIXES) {
        cells++;
        const now = Date.now();
        setCell(spot, vix, now);

        const hS = JSON.parse(run('JSON.stringify(slStructure())'));
        const cS = core.structuralTag({ spot, vix, now, spotAt: now, vixAt: now });

        // The decision fields. `missing` is sorted because it is a set in
        // meaning and an array in representation, and order is not a decision.
        diff('structuralTag(spot=' + spot + ', vix=' + vix + ')',
            { verified: hS.verified, missing: [...(hS.missing || [])].sort(), tag: hS.tag,
              label: hS.label, dir: hS.dir, color: hS.color, spot: hS.spot, vix: hS.vix,
              stale: hS.stale, detail: hS.detail },
            { verified: cS.verified, missing: [...(cS.missing || [])].sort(), tag: cS.tag,
              label: cS.label, dir: cS.dir, color: cS.color, spot: cS.spot, vix: cS.vix,
              stale: cS.stale, detail: cS.detail });

        // The ladder is display, not decision — but it is the surface the PIVOT
        // row lives on, and hashira's slLevelLadder() is callable here where
        // APEX's equivalent sits below parity.mjs's end anchor. Shapes differ
        // (tuples vs objects), so both are mapped to the same record.
        const hLadder = JSON.parse(run('JSON.stringify(slLevelLadder())'))
            .map((r) => ({ label: r[0], price: r[1], note: r[2], color: r[3] }));
        const cLadder = core.levelLadder({ levels: cS.levels, spot: cS.spot })
            .map((r) => ({ label: r.label, price: r.price, note: r.note, color: r.color }));
        diff('levelLadder(spot=' + spot + ', vix=' + vix + ')', hLadder, cLadder);

        for (const [name, base] of Object.entries(INPUTS)) {
            for (const win of WINDOWS) {
                gateScenarios++;
                const inputs = Object.assign({}, base, { window: win });
                const hR = JSON.parse(run('JSON.stringify(NX.evaluateSetup('
                    + JSON.stringify(inputs) + '))'));
                // Pass the plan, exactly as the real call site does — calling the
                // core without one compares a plan-wired implementation against an
                // unwired one, and every scenario whose plan revokes a runner reads
                // as drift that is not there.
                const plan = JSON.parse(run('JSON.stringify(slSelectScenario('
                    + JSON.stringify(inputs) + ').plan || null)'));
                const cG = core.governorFor({ biasDir: hR.bias.dir, struct: cS, windowKey: win, plan });

                diff('governor(' + name + ', spot=' + spot + ', vix=' + vix + ', win=' + win + ')',
                    { mode: hR.governor.mode, label: hR.governor.label, color: hR.governor.color },
                    { mode: cG.governor.mode, label: cG.governor.label, color: cG.governor.color });

                diff('stops(' + name + ', spot=' + spot + ', vix=' + vix + ', win=' + win + ')',
                    { time: hR.stops.time, target: hR.stops.target, runner: hR.stops.runner,
                      pricePct: hR.stops.pricePct },
                    { time: cG.stops.time, target: cG.stops.target, runner: cG.stops.runner,
                      pricePct: cG.stops.pricePct });

                // The gate floor may only ratchet downward.
                diff('worsenGate(' + name + ', spot=' + spot + ', win=' + win + ')',
                    core.worsenGate('GO', cG.gateFloor),
                    cG.gateFloor === 'GO' ? 'GO' : cG.gateFloor);
            }
        }
    }
}

// ── FRESHNESS SWEEP ─────────────────────────────────────────────────────────
//
// The grid above holds the anchor DATE constant, so `stale` and `ageDays` are
// the same value in all 112 cells. They were being compared and never varied —
// a field in the comparison set that no fixture exercises, which is the exact
// failure this repo's harnesses exist to prevent.
//
// Found by mutation, not by review: changing hashira's threshold from
// `ageDays > staleDays` to `ageDays > staleDays + 5` left the run green,
// because the baked anchor is ~6 weeks old and both predicates are true there.
//
// So sweep the anchor date across the staleness boundary on both sides. Ages
// are chosen either side of staleDays (10) and exactly on it, because an
// off-by-one in a `>` vs `>=` is the whole bug class here.
const AGES = [0, 1, 9, 10, 11, 12, 15, 40];
const FRESH_SPOTS = [null, 722.53, 738.86, 743.91, 800];
const FRESH_VIXES = [null, 18.58, 25];
const MIN_FRESHNESS = AGES.length * FRESH_SPOTS.length * FRESH_VIXES.length;

console.log('\nfreshness sweep: ' + AGES.length + ' anchor ages x ' + FRESH_SPOTS.length
    + ' spots x ' + FRESH_VIXES.length + ' VIXes = ' + MIN_FRESHNESS + ' cells');

const bakedAsOf = JSON.parse(run('JSON.stringify(SL_STRUCTURE.asOf)'));
let freshnessCells = 0;
let staleSeen = { true: 0, false: 0 };

for (const age of AGES) {
    const now = Date.now();
    const asOf = new Date(now - age * 86400000).toISOString().slice(0, 10);
    run('SL_STRUCTURE = Object.assign({}, SL_STRUCTURE, { asOf: ' + JSON.stringify(asOf) + ' });');
    const levels = Object.assign({}, core.SL_STRUCTURE, { asOf });

    for (const spot of FRESH_SPOTS) {
        for (const vix of FRESH_VIXES) {
            freshnessCells++;
            setCell(spot, vix, now);
            const hS = JSON.parse(run('JSON.stringify(slStructure())'));
            const cS = core.structuralTag({ spot, vix, now, levels, spotAt: now, vixAt: now });
            staleSeen[String(cS.stale)]++;
            diff('freshness(age=' + age + 'd, spot=' + spot + ', vix=' + vix + ')',
                { ageDays: hS.ageDays, stale: hS.stale, verified: hS.verified, tag: hS.tag,
                  label: hS.label, color: hS.color },
                { ageDays: cS.ageDays, stale: cS.stale, verified: cS.verified, tag: cS.tag,
                  label: cS.label, color: cS.color });
        }
    }
}
// Restore, so anything added below this point sees the real anchor.
run('SL_STRUCTURE = Object.assign({}, SL_STRUCTURE, { asOf: ' + JSON.stringify(bakedAsOf) + ' });');

// The sweep is only meaningful if it actually crossed the boundary. A sweep
// that saw one value of `stale` proves nothing about the threshold.
if (staleSeen.true === 0 || staleSeen.false === 0) {
    console.log('  ✗ the freshness sweep never crossed the staleness boundary '
        + '(stale=true ' + staleSeen.true + ', stale=false ' + staleSeen.false + ')');
    fail++;
}

// ── floors ──────────────────────────────────────────────────────────────────
const floorFailures = [];
const floor = (label, got, min) => {
    if (got < min) {
        floorFailures.push('expected >= ' + min + ' ' + label + ', got ' + got
            + ' — an anchor probably stopped matching');
    }
};
floor('structural cells', cells, MIN_CELLS);
floor('gate scenarios', gateScenarios, MIN_GATE_SCENARIOS);
floor('comparisons', checks, MIN_COMPARISONS);
floor('freshness cells', freshnessCells, MIN_FRESHNESS);

// ── report ──────────────────────────────────────────────────────────────────
console.log('');
if (floorFailures.length) {
    console.log('✗ FLOOR CHECK FAILED — this harness compares less than it used to:');
    for (const m of floorFailures) console.log('    ' + m);
    console.log('\nA green run under a floor is the failure mode floors exist to catch.');
    process.exit(1);
}
if (fail === 0) {
    console.log('✓ governor parity clean — hashira agrees with core on '
        + checks + ' comparisons');
    console.log('    structural cells: ' + cells);
    console.log('    gate scenarios:   ' + gateScenarios);
    process.exit(0);
}
console.log('✗ governor parity FAILED — ' + fail + ' of ' + checks + ' comparisons disagreed');
process.exit(1);
