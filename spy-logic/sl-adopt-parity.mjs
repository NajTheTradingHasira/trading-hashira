// sl-adopt-parity.mjs — ADOPTION-BOUNDARY parity across all three terminals.
//
//   node spy-logic/sl-adopt-parity.mjs <apex-index.html> <nexus-src-dir> [hashira-index.html]
//
// hashira defaults to ../index.html (this repo). Exit 0 clean, 1 drift, 2 a
// precondition failed and NOTHING was compared.
//
// ── Why this is not part of parity.mjs ──────────────────────────────────────
//
// parity.mjs compares GOVERNOR BEHAVIOUR: it slices APEX's inline pure-logic
// block (between `const SL_STATE = {` and the renderer banner) and proves it
// agrees with spy-governor-core.js across a tape grid and a structural sweep.
// Its comparison set is structuralTag / governorFor / stops / worsenGate /
// stopMath / buildStructureContext.
//
// `pivot` can never join that comparison set, and this is a design property
// rather than an oversight: the pivot is forbidden from reaching structuralTag,
// evaluateSetup, or the governor's view of the ladder (near-term-pivot-proposal
// §2 rule 2). It is display context. If a pivot field ever became visible to
// parity.mjs's comparison set, that would mean the governor had started reading
// it — the bug, not the test.
//
// The four provenance fields are outside parity.mjs for a duller reason: they
// are adopted, carried and never computed on, and the adopt step itself
// (`slFetchStructure`, APEX index.html) sits BELOW parity.mjs's end anchor, so
// the slice cannot see it at all.
//
// Hence a second harness on the axis that actually carries these fields: what
// each terminal's shipped adopt step produces from one identical payload.
//
// ── What parity structurally CANNOT catch, here or in parity.mjs ────────────
//
// PARITY COMPARES CLIENTS AGAINST EACH OTHER. It detects client-vs-client
// drift and is BLIND to anything every client loses together.
//
// The four provenance fields were lost exactly that way, and not by a client:
// `StructureResponse` is a Pydantic whitelist and `get_spy_structure()` builds
// it field by field, so a key the model does not name is dropped at the BACKEND,
// before the wire. All three terminals lost them in lockstep, all three agreed,
// and this harness would have printed "parity clean" throughout. `degraded`
// went the same way one release earlier.
//
// The guard for that class is a round-trip assertion on the backend — feed a
// known SPY_STRUCTURE_JSON in, assert every key comes back populated — and it
// lives in nexus-backend/api/test_spy_structure_roundtrip.py. It is deliberately
// NOT part of parity, because parity cannot express it. Do not read a green run
// here as evidence that a field reached the wire.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const SELF_TEST_ONLY = argv.includes('--self-test');
// --matrix prints the ACTUAL failure message each perturbation produced, not
// just a verdict. "red and named" is a claim about the comparator; the message
// is the evidence for it, and the two are worth keeping separable.
const MATRIX = argv.includes('--matrix');
const args = argv.filter((a) => a !== '--self-test' && a !== '--matrix');
const apexPath = args[0];
const nexusSrc = args[1];
const hashiraPath = args[2] || fileURLToPath(new URL('../index.html', import.meta.url));

function bail(msg) {
    console.error('\n✗ ' + msg);
    console.error('\nNothing was compared. A harness that silently compares nothing is worse');
    console.error('than no harness, so this exits 2 rather than printing a green run.\n');
    process.exit(2);
}
if (!apexPath || !nexusSrc) {
    bail('usage: node sl-adopt-parity.mjs <apex-index.html> <nexus-src-dir> [hashira-index.html]');
}
for (const [label, p] of [['APEX', apexPath], ['hashira', hashiraPath], ['nexus src', nexusSrc]]) {
    if (!fs.existsSync(p)) bail(label + ' not found: ' + p);
}

// ── The comparison set ──────────────────────────────────────────────────────
//
// `pivot`'s five sub-fields are listed INDIVIDUALLY and never compared as an
// object. A whole-object compare is either by reference (always unequal) or by
// stringify (order-sensitive, and reports "pivot differs" without saying which
// sub-field moved). A red build has to name the field or it costs more than it
// saves.
const FIELDS = [
    { path: 'pivot.level', numeric: true },
    { path: 'pivot.kind' },
    { path: 'pivot.asOf' },
    { path: 'pivot.origin' },
    { path: 'pivot.policy' },
    { path: 'derivationVersion' },
    { path: 'dataSource' },
    { path: 'originReview' },
    { path: 'calculatedAsOf' },
];

// ── FLOORS: fail CLOSED, not open ───────────────────────────────────────────
//
// Every harness here locates what it compares by matching something — a content
// anchor, a script block, an exported symbol. All of those fail OPEN. Reformat
// `const SL_STATE = {` to `const SL_STATE={`, rename a function, move a block
// past an anchor, and the harness matches less, compares fewer things (possibly
// nothing) and still reports GREEN. The thing guarding everything else is the
// thing with no guard on it.
//
// So today's counts become floors the run ASSERTS rather than numbers it
// merely prints. A run that comes in under its floor fails and says an anchor
// probably stopped matching. Raise these deliberately when the grid legitimately
// grows; never lower one to make a run pass.
const MIN_COMPARISONS = 243;   // 9 fixtures x 9 fields x 3 side pairs
const MIN_FIELDS = 9;
const MIN_FIXTURES = 9;
const MIN_SIDES = 3;

// Absent and null both mean "no value worth showing" and render identically
// (near-term-pivot-proposal §3). A terminal that omits the key and one that
// sets it null are NOT in drift, so both normalise to null BEFORE comparison.
// Without this the first week with no pivot is a false red across all sides.
//
// A missing PARENT normalises the same way: `pivot: null` makes all five
// sub-fields null rather than throwing.
function read(obj, fieldPath) {
    let cur = obj;
    for (const seg of fieldPath.split('.')) {
        if (cur === null || cur === undefined) return null;
        cur = cur[seg];
    }
    return cur === undefined ? null : cur;
}

/**
 * Compare one field across two sides.
 * Returns null (they agree), or a failure/warning record naming the field.
 */
function compareField(field, aName, a, bName, b) {
    const av = read(a, field.path);
    const bv = read(b, field.path);
    if (av === null && bv === null) return null;

    if (field.numeric) {
        // Only one side has a value: real drift, and Number(null) === 0 would
        // hide it. Test nullness BEFORE coercing, never after.
        if (av === null || bv === null) {
            return { kind: 'failure', field: field.path, aName, av, bName, bv,
                     why: 'present on one side only' };
        }
        // A numeric string is legitimate on either side: _validate coerces
        // numeric strings for the triple and _validate_pivot matches it
        // (test_numeric_strings_coerce_in_pivot_exactly_as_in_the_triple), so
        // "759.48" and 759.48 are the SAME LEVEL. Compare the value.
        const an = Number(av);
        const bn = Number(bv);
        if (an !== bn && !(Number.isNaN(an) && Number.isNaN(bn))) {
            return { kind: 'failure', field: field.path, aName, av, bName, bv,
                     why: 'value differs' };
        }
        // Same value, different type. Worth surfacing — a terminal rendering a
        // string where another renders a float can format differently — but it
        // is display-only and must not break the build.
        if (typeof av !== typeof bv) {
            return { kind: 'warning', field: field.path, aName, av, bName, bv,
                     why: 'type differs (' + typeof av + ' vs ' + typeof bv + '), value agrees' };
        }
        return null;
    }

    if (av !== bv) {
        return { kind: 'failure', field: field.path, aName, av, bName, bv,
                 why: 'value differs' };
    }
    return null;
}

/**
 * Compare every field across every pair of sides. Pure, so the self-test can
 * drive it directly with hand-built inputs.
 */
function compare(sides, fixtureLabel) {
    const names = Object.keys(sides);
    const failures = [];
    const warnings = [];
    for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
            const aName = names[i];
            const bName = names[j];
            for (const field of FIELDS) {
                const r = compareField(field, aName, sides[aName], bName, sides[bName]);
                if (!r) continue;
                (r.kind === 'failure' ? failures : warnings).push(
                    Object.assign({}, r, { fixture: fixtureLabel }));
            }
        }
    }
    return { failures, warnings };
}

const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const line = (r) =>
    '  ' + (r.kind === 'failure' ? '✗' : '⚠') + ' [' + r.fixture + '] ' + r.field + ' — ' + r.why +
    '\n      ' + r.aName + ': ' + show(r.av) +
    '\n      ' + r.bName + ': ' + show(r.bv);

// ── Side loaders ────────────────────────────────────────────────────────────
//
// Each side runs its SHIPPED adopt step, never a re-implementation. A harness
// that re-derives what it is checking tests itself.

/**
 * APEX and hashira: evaluate the real inline <script> and drive the shipped
 * slFetchStructure() against a stubbed response.
 */
function loadInline(htmlPath, barId) {
    const src = fs.readFileSync(htmlPath, 'utf8');
    const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((m) => m[1]);
    if (!blocks.length) bail('no inline <script> block in ' + htmlPath);

    const bar = { innerHTML: '' };
    const stub = () => ({
        innerHTML: '', textContent: '', value: '', style: {},
        classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
        appendChild() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {},
        focus() {}, blur() {}, remove() {}, closest: () => null,
    });
    const sandbox = {
        document: {
            getElementById: (id) => (id === barId ? bar : stub()),
            querySelector: () => stub(), querySelectorAll: () => [],
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
            get(t, k) {
                if (k === 'prototype') return t.prototype;
                if (!(k in t)) t[k] = new Proxy({}, this);
                return t[k];
            },
            set(t, k, v) { t[k] = v; return true; },
            construct: () => ({ destroy() {}, update() {}, data: {}, options: {} }),
            apply: () => ({ destroy() {}, update() {}, data: {}, options: {} }),
        }),
        NX: { apiFetch: () => Promise.reject(new Error('no network in the harness')) },
        URLSearchParams, TextEncoder, TextDecoder, performance: { now: () => 0 },
        Date, Math, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt,
        Intl, RegExp, Error, Promise, AbortController, Headers,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    // Blocks unrelated to SPY Logic may reference libraries that are not
    // stubbed; their failure is not this harness's business. The probe below is
    // what proves the block we care about actually loaded.
    for (const b of blocks) {
        try {
            vm.runInContext(b, sandbox, { timeout: 20000 });
        } catch {
            /* unrelated block */
        }
    }

    const run = (code) => vm.runInContext(code, sandbox);
    // `let SL_STRUCTURE` lives in the context's global LEXICAL scope, not as a
    // property of the sandbox object. Reading sandbox.SL_STRUCTURE would read a
    // shadow the shipped code never writes and every assertion would pass
    // vacuously — so everything goes through runInContext.
    for (const fn of ['slPivot', 'slValidStructure', 'slFetchStructure']) {
        if (run('typeof ' + fn) !== 'function') {
            bail(fn + ' not found in ' + htmlPath + ' — the inline block did not load');
        }
    }
    return {
        valid: (p) => run('slValidStructure(' + JSON.stringify(p) + ')'),
        async adopt(p) {
            run('fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve('
                + JSON.stringify(p) + ') });');
            await run('slFetchStructure()');
            return JSON.parse(run('JSON.stringify(SL_STRUCTURE)'));
        },
    };
}

/**
 * nexus: import the shipped spyEngine module.
 *
 * The boundary differs by necessity, and that difference is the point of
 * comparing at all: APEX and hashira adopt inside slFetchStructure, nexus
 * adopts in adoptStructure() and its fetch wrapper lives in SpyLogic.jsx (JSX,
 * not loadable here). adoptStructure IS the adoption boundary on that side —
 * SpyLogic.jsx calls it with no further massaging: setLevels(adoptStructure(d)).
 */
async function loadNexus(srcDir) {
    // nexus is bundled by vite, whose resolver accepts extensionless relative
    // specifiers (`from './spyGovernor'`). Node's does not. Resolve them the
    // way the bundler does rather than editing the shipped source.
    registerHooks({
        resolve(spec, ctx, next) {
            if (spec.startsWith('.') && !/\.[mc]?jsx?$/.test(spec)) {
                try {
                    return next(spec + '.js', ctx);
                } catch {
                    /* fall through to the unmodified specifier */
                }
            }
            return next(spec, ctx);
        },
    });
    const enginePath = path.join(srcDir, 'lib', 'spyEngine.js');
    if (!fs.existsSync(enginePath)) bail('nexus spyEngine.js not found at ' + enginePath);
    const m = await import(pathToFileURL(enginePath).href);
    for (const fn of ['adoptStructure', 'validStructure', 'pivotFrom']) {
        if (typeof m[fn] !== 'function') bail('nexus spyEngine.js does not export ' + fn);
    }
    return {
        valid: (p) => m.validStructure(p),
        // JSON round-trip so all three sides normalise identically: an
        // `undefined` value must read as absent on every side, not as present
        // on the one side that happens to hand back a live object.
        adopt: async (p) => JSON.parse(JSON.stringify(m.adoptStructure(p))),
    };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// Every fixture is a VALID triple (flip < support < reclaim). An invalid triple
// is not adopted at all, so it would exercise rejection, not the comparison set.
const BASE = {
    asOf: '2026-08-21', reclaim: 752.0, support: 748.8, flip: 729.05,
    staleDays: 10, vixFragile: 25, source: 'adopt-parity fixture',
    revision: '2026-08-21.1',
};
const PIVOT = {
    level: 759.48, kind: 'completed_week_low', asOf: '2026-08-21',
    origin: '08/17 completed week low', policy: 'completed_weekly_bar_only',
};
const PROV = {
    derivationVersion: 'spy_weekly_structure.v1', dataSource: 'tradingview',
    originReview: '2026-08-23', calculatedAsOf: '2026-08-21',
};

const FIXTURES = [
    ['full block', { ...BASE, ...PROV, pivot: PIVOT }],
    // Rule: absent and null render identically, so neither may be drift.
    ['pivot absent', { ...BASE, ...PROV }],
    ['pivot null', { ...BASE, ...PROV, pivot: null }],
    ['provenance absent', { ...BASE, pivot: PIVOT }],
    // Deliberate backend coercion parity — a numeric string is the same level.
    ['pivot.level numeric string', { ...BASE, ...PROV, pivot: { ...PIVOT, level: '759.48' } }],
    // Graduated degradation: a bad sub-field costs that field, not the pivot.
    ['pivot malformed asOf', { ...BASE, ...PROV, pivot: { ...PIVOT, asOf: 12345 } }],
    ['pivot unknown kind', { ...BASE, ...PROV, pivot: { ...PIVOT, kind: 'not_a_kind' } }],
    // Whole pivot unusable -> no pivot, and the triple is untouched.
    ['pivot level 0', { ...BASE, ...PROV, pivot: { ...PIVOT, level: 0 } }],
    // The case the field exists for.
    ['pivot above reclaim', { ...BASE, ...PROV, pivot: { ...PIVOT, level: 799.99 } }],
];

// ── Run ─────────────────────────────────────────────────────────────────────
console.log('adoption-boundary parity');
console.log('  apex:    ' + apexPath);
console.log('  hashira: ' + hashiraPath);
console.log('  nexus:   ' + nexusSrc);

const sides = {
    apex: loadInline(apexPath, 'slStructureBar'),
    hashira: loadInline(hashiraPath, 'spy-structure-bar'),
    nexus: await loadNexus(nexusSrc),
};
const PAIRS = (Object.keys(sides).length * (Object.keys(sides).length - 1)) / 2;

const failures = [];
const warnings = [];
let comparisons = 0;
const baseline = {};

if (!SELF_TEST_ONLY) {
    for (const [label, payload] of FIXTURES) {
        // Precondition: the sides must agree on whether the payload is adoptable
        // at all. If they disagree, comparing what they adopted is meaningless.
        const verdicts = Object.fromEntries(
            Object.entries(sides).map(([n, s]) => [n, !!s.valid(payload)]));
        const distinct = [...new Set(Object.values(verdicts))];
        if (distinct.length !== 1) {
            bail('sides disagree on validStructure for "' + label + '": ' + JSON.stringify(verdicts));
        }
        if (!distinct[0]) {
            bail('fixture "' + label + '" is not adoptable on any side — it tests rejection, '
                + 'not the comparison set');
        }

        const adopted = {};
        for (const [n, s] of Object.entries(sides)) adopted[n] = await s.adopt(payload);
        if (label === 'full block') Object.assign(baseline, adopted);

        const r = compare(adopted, label);
        comparisons += FIELDS.length * PAIRS;
        failures.push(...r.failures);
        warnings.push(...r.warnings);
    }

    console.log('\n' + FIXTURES.length + ' fixtures x ' + FIELDS.length + ' fields x '
        + PAIRS + ' side pairs = ' + comparisons + ' comparisons');
    for (const w of warnings) console.log(line(w));
    for (const f of failures) console.log(line(f));
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST THE TEST
// ═══════════════════════════════════════════════════════════════════════════
// Adding a field to a comparison set is worthless if the comparator cannot see
// a difference in it. For EACH field: perturb it on one side, assert the
// comparator goes red AND names that field. A perturbation that stays green
// means the field is not really being compared — fix the comparator, not the
// fixture.
//
// The perturbation is applied to the REAL adopted output and runs through the
// same compare() the live path uses.
const PERTURBATIONS = [
    // 759.48 -> 759.49: one cent. Catches a comparator that rounds, or that
    // compares with a tolerance nobody asked for.
    ['pivot.level', (s) => { s.pivot.level = 759.49; }],
    ['pivot.kind', (s) => { s.pivot.kind = 'reclaimed_support'; }],   // another VALID enum value
    ['pivot.asOf', (s) => { s.pivot.asOf = '2026-08-14'; }],
    ['pivot.origin', (s) => { s.pivot.origin = '08/10 completed week low'; }],
    ['pivot.policy', (s) => { s.pivot.policy = 'review_only'; }],     // the other valid enum value
    ['derivationVersion', (s) => { s.derivationVersion = 'spy_weekly_structure.v2'; }],
    ['dataSource', (s) => { s.dataSource = 'polygon'; }],
    ['originReview', (s) => { s.originReview = null; }],              // null on ONE side only
    ['calculatedAsOf', (s) => { s.calculatedAsOf = '2026-08-20'; }],
];

const clone = (o) => JSON.parse(JSON.stringify(o));
let selfFail = 0;

if (!baseline.apex) {
    // --self-test still needs a real adopted baseline.
    const payload = { ...BASE, ...PROV, pivot: PIVOT };
    for (const [n, s] of Object.entries(sides)) baseline[n] = await s.adopt(payload);
}

console.log('\ntest-the-test — one perturbation per field, each must go RED and name it');

// Control: the untouched baseline must be green, or every perturbation below
// "passes" on noise it did not cause.
{
    const r = compare(clone(baseline), 'control');
    if (r.failures.length) {
        selfFail++;
        console.log('  ✗ CONTROL — the unperturbed baseline is already red; everything below is noise');
        for (const f of r.failures) console.log(line(f));
    } else {
        console.log('  ok  control — unperturbed baseline is green');
    }
}

const matrixRows = [];

for (const [fieldPath, perturb] of PERTURBATIONS) {
    const perturbed = clone(baseline);
    perturb(perturbed.nexus);                    // one side only
    const r = compare(perturbed, 'perturb ' + fieldPath);
    const named = r.failures.filter((f) => f.field === fieldPath);
    const collateral = r.failures.filter((f) => f.field !== fieldPath);
    const others = (list) => [...new Set(list.map((f) => f.field))].join(', ');
    matrixRows.push({ fieldPath, red: r.failures.length > 0, named: named[0] || null });

    if (!r.failures.length) {
        selfFail++;
        console.log('  ✗ ' + fieldPath + ' — perturbed and the harness stayed GREEN. '
            + 'This field is not being compared.');
    } else if (!named.length) {
        selfFail++;
        console.log('  ✗ ' + fieldPath + ' — went red but named ' + others(r.failures) + ' instead');
    } else if (collateral.length) {
        // A comparator that reddens everything names nothing.
        selfFail++;
        console.log('  ✗ ' + fieldPath + ' — red and named, but also flagged ' + others(collateral));
    } else {
        console.log('  ok  ' + fieldPath + ' — red, named, ' + named.length
            + ' pair(s), no collateral');
    }
}

if (MATRIX) {
    // The artifact: nine fields, each perturbed on one side, each confirmed RED,
    // each failure message naming the field. Green is an ambiguous signal —
    // "nine fields correctly compared" and "nine fields silently not compared"
    // both report green — so the matrix, not the green run, is the evidence
    // that the comparator reaches each field.
    console.log('\n── PERTURBATION MATRIX ' + '─'.repeat(52));
    console.log('field'.padEnd(19) + 'perturbation'.padEnd(40) + 'verdict');
    console.log('─'.repeat(74));
    for (const row of matrixRows) {
        const f = row.named;
        const change = f ? show(f.av) + ' -> ' + show(f.bv) : '(no failure produced)';
        console.log(
            row.fieldPath.padEnd(19) +
            change.slice(0, 39).padEnd(40) +
            (row.red && f ? 'RED, names ' + f.field : row.red ? 'RED, WRONG FIELD' : 'GREEN — NOT COMPARED'));
    }
    console.log('─'.repeat(74));
    console.log('verbatim failure messages:\n');
    for (const row of matrixRows) {
        console.log(row.named ? line(row.named) : '  (none for ' + row.fieldPath + ')');
    }
}

// The normalisation rule, asserted rather than assumed: absent and null are the
// same state and must NEVER be drift. This is the check that stops the first
// pivot-less week from printing a false red.
console.log('\nnormalisation — absent and null are the same state');
const NORM_CASES = [
    ['pivot absent vs pivot null', 'pivot'],
    ['originReview absent vs null', 'originReview'],
    ['dataSource absent vs null', 'dataSource'],
    ['calculatedAsOf absent vs null', 'calculatedAsOf'],
];
for (const [label, key] of NORM_CASES) {
    const a = clone(baseline.apex);
    const b = clone(baseline.nexus);
    delete a[key];        // absent on one side
    b[key] = null;        // explicitly null on the other
    const r = compare({ apex: a, nexus: b }, label);
    if (r.failures.length) {
        selfFail++;
        console.log('  ✗ ' + label + ' — reported as drift, but they render identically');
        for (const f of r.failures) console.log(line(f));
    } else {
        console.log('  ok  ' + label + ' — not drift');
    }
}

// A numeric string is the same level; the type divergence is a warning, never a
// failure. Both halves are asserted — a warning that is silently a failure
// breaks the build on a display detail, and a failure downgraded to a warning
// hides a real one.
console.log('\nnumeric-string parity — same value, different type');
{
    const a = clone(baseline.apex);
    const b = clone(baseline.nexus);
    b.pivot.level = String(a.pivot.level);
    const r = compare({ apex: a, nexus: b }, 'numeric string');
    if (r.failures.length !== 0 || !r.warnings.some((w) => w.field === 'pivot.level')) {
        selfFail++;
        console.log('  ✗ expected 0 failures and a pivot.level warning; got '
            + r.failures.length + ' failure(s) / ' + r.warnings.length + ' warning(s)');
    } else {
        console.log('  ok  value agrees -> warning, not failure');
    }

    // ...and a real one-cent difference in the same string form is still a failure.
    b.pivot.level = String(a.pivot.level + 0.01);
    const r2 = compare({ apex: a, nexus: b }, 'numeric string drift');
    if (!r2.failures.some((f) => f.field === 'pivot.level')) {
        selfFail++;
        console.log('  ✗ a real difference in string form was NOT caught');
    } else {
        console.log('  ok  a real difference in string form is still a failure');
    }

    // ...and a value present on one side only is a failure, not a 0 == null pass.
    const c = clone(baseline.nexus);
    c.pivot = null;
    const r3 = compare({ apex: a, nexus: c }, 'pivot present one side only');
    if (!r3.failures.some((f) => f.field === 'pivot.level')) {
        selfFail++;
        console.log('  ✗ pivot present on one side only was NOT caught (Number(null) === 0)');
    } else {
        console.log('  ok  present on one side only is a failure');
    }
}

// ── floors ──────────────────────────────────────────────────────────────────
// Asserted before the green line is printed, so an under-count can never be
// reported as a clean run.
const floorFailures = [];
const floor = (label, got, min) => {
    if (got < min) {
        floorFailures.push('expected >= ' + min + ' ' + label + ', got ' + got
            + ' — an anchor probably stopped matching');
    }
};
floor('fields in the comparison set', FIELDS.length, MIN_FIELDS);
floor('fixtures', FIXTURES.length, MIN_FIXTURES);
floor('terminals loaded', Object.keys(sides).length, MIN_SIDES);
if (!SELF_TEST_ONLY) floor('comparisons', comparisons, MIN_COMPARISONS);
// Every field in the comparison set must have a perturbation proving it is
// reached. Adding a field without one is exactly how a field joins the set and
// is never actually compared.
if (PERTURBATIONS.length < FIELDS.length) {
    floorFailures.push('every field needs a perturbation: ' + FIELDS.length
        + ' fields but only ' + PERTURBATIONS.length + ' perturbations');
}
for (const f of FIELDS) {
    if (!PERTURBATIONS.some(([p]) => p === f.path)) {
        floorFailures.push('field ' + f.path + ' has no perturbation — it is in the '
            + 'comparison set but nothing proves the comparator reaches it');
    }
}

// ── report ──────────────────────────────────────────────────────────────────
console.log('');
if (floorFailures.length) {
    console.log('✗ FLOOR CHECK FAILED — this harness compares less than it used to:');
    for (const m of floorFailures) console.log('    ' + m);
    process.exit(1);
}
if (selfFail) {
    console.log('✗ TEST-THE-TEST FAILED — ' + selfFail + ' check(s). The comparator is not');
    console.log('  trustworthy; a green parity run above means nothing until this is fixed.');
    process.exit(1);
}
if (failures.length) {
    console.log('✗ adoption parity FAILED — ' + failures.length + ' of ' + comparisons
        + ' comparisons disagreed');
    process.exit(1);
}
console.log('✓ adoption parity clean — ' + comparisons + ' comparisons across '
    + Object.keys(sides).length + ' terminals'
    + (warnings.length ? ', ' + warnings.length + ' warning(s)' : ''));
console.log('✓ test-the-test green — all ' + PERTURBATIONS.length + ' fields provably compared');
process.exit(0);
