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
 * ── Why the SELECTION is compared before the merge ──────────────────────
 *
 * The harness used to take the plan from apex.slSelectScenario() and hand THAT
 * SAME OBJECT to core.governorFor(). Both sides were therefore merging APEX's
 * selection. That proves the merge agrees and says nothing whatsoever about
 * whether the two registries pick the same scenario — and picking the wrong
 * scenario is the more dangerous of the two failures, because the panel keeps
 * printing a plausible label and a coherent plan, just the wrong one.
 *
 * Both registries are ordered arrays matched with `find(sc => sc.match(s))`,
 * where several entries legitimately match the same tape and precedence is the
 * ONLY thing that disambiguates them. Reordering one array, or editing one
 * matcher, diverges the two silently. That is precisely the class of bug this
 * suite was believed to be catching and provably was not.
 *
 * So PHASE 1b calls EACH implementation's own selector over the full 972-tape
 * grid and compares id, label, dir, note, the whole plan, and each side's
 * independently-derived runnerEligible. Selection is structure-independent, so
 * it is swept over the tape grid rather than the three pruned reads — those
 * only ever reach three of the eight scenarios.
 *
 * Phase 2 then gives each side its OWN plan, so a selection divergence shows up
 * in both numbers instead of being masked by a shared input.
 *
 * ── Why the source is a committed ref ───────────────────────────────────
 *
 * The harness used to read APEX's index.html off the working tree. Every green
 * number it ever printed was measured against a file that existed on no branch
 * and that nobody else could reproduce. "Matches production" was an assumption,
 * not an assertion.
 *
 * It now extracts the inline block with `git show <ref>:index.html` and runs
 * once per ref — by default the checked-out ref AND main, which is what APEX
 * actually deploys. The working tree is still checked, but only to report
 * whether it differs from the pinned ref.
 *
 * ── What this suite does NOT cover ──────────────────────────────────────
 *
 * Printed in the summary of every run, not just documented here. An uncovered
 * surface that says nothing looks exactly like a covered one.
 *
 *   levelLadder / slLadderHtml — no shared counterpart. The module returns a
 *   data array of the fixed triple; the inline block returns an HTML string
 *   built from the plan's targets. Comparing them means re-deriving one from
 *   the other, which tests the harness rather than parity.
 *
 *   degraded payloads — APEX does not honour levels.degraded (§9.11), so a
 *   degraded fixture would measure a fixed implementation against a
 *   known-unfixed one. Declared here, asserted in degraded.test.mjs.
 *
 * Note on phase 3: resolveTarget IS covered, but breadth on one axis is not
 * coverage of another. The structural sweep resolves targets at 112 spot/VIX
 * combinations and every one uses a fresh anchor, so collapsing the tri-state
 * to `state: 'current'` passed all 1120 of those comparisons. Phase 3 exists
 * to move anchor age and level validity, the axes the sweep holds constant.
 *
 * Env:
 *   PARITY_LIVE_URL     /api/spy-logic/structure — fetched for the LIVE pass
 *   SPY_STRUCTURE_JSON  the same var the backend reads, used if no URL is set
 *   APEX_REFS           comma-separated refs to check (default "HEAD,main")
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
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
// The scenario registry, imported directly. governorFor() only ever receives a
// plan; the SELECTOR that produces one is here, and comparing it is the whole
// point of phase 1b.
const scen = await import(pathToFileURL(path.resolve(path.dirname(path.resolve(corePath)), 'spyScenarios.js')).href);

// ── resolve the APEX sources: committed refs, not a working tree ─────
const START_ANCHOR = 'const SL_STATE = {';
const END_ANCHOR = '// ── Renderers';

function sliceBlock(html, origin) {
    const start = html.indexOf(START_ANCHOR);
    if (start < 0) { console.error('start anchor not found in ' + origin + ': ' + START_ANCHOR); process.exit(2); }
    const end = html.indexOf(END_ANCHOR, start);
    if (end < 0) { console.error('end anchor not found in ' + origin + ': ' + END_ANCHOR); process.exit(2); }
    return html.slice(start, end);
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

function apexSources() {
    const abs = path.resolve(apexPath);
    const worktreeSrc = sliceBlock(fs.readFileSync(abs, 'utf8'), 'working tree');

    let repo, rel;
    try {
        repo = git(path.dirname(abs), ['rev-parse', '--show-toplevel']).trim();
        rel = path.relative(repo, abs).split(path.sep).join('/');
    } catch {
        console.log('\n⚠ APEX is not in a git repository — falling back to the working-tree file.');
        console.log('    Nothing here is pinned; this run measures a file that exists on no branch.');
        return [{ label: 'WORKTREE (unpinned)', src: worktreeSrc, pinned: false }];
    }

    const refs = (process.env.APEX_REFS || 'HEAD,main').split(',').map(r => r.trim()).filter(Boolean);
    const out = [];
    for (const ref of refs) {
        let sha, html;
        try {
            sha = git(repo, ['rev-parse', '--short', ref]).trim();
            html = git(repo, ['show', ref + ':' + rel]);
        } catch (e) {
            // A named ref that cannot be read is a failure, not a skip. Silently
            // dropping `main` would restore exactly the assumption being removed.
            console.error('\n✗ APEX ref ' + ref + ' could not be read from ' + repo + ': ' + ((e && e.message) || e) + '\n');
            process.exit(1);
        }
        out.push({ label: ref + '@' + sha, src: sliceBlock(html, ref), pinned: true, ref, sha });
    }

    // Report, do not silently prefer: a dirty tree is the state the old harness
    // measured without saying so.
    const first = out[0];
    if (worktreeSrc !== first.src) {
        console.log('\n⚠ APEX working tree DIFFERS from ' + first.label + ' inside the SL_ block.');
        console.log('    The working tree is NOT what is measured below. Commit it, or the');
        console.log('    thing you are testing is not the thing you are running.');
    } else {
        console.log('apex source: working tree matches ' + first.label + ' inside the SL_ block');
    }
    // Identical refs are still both reported — the pass is armed for the day
    // they diverge, and saying so is more useful than quietly deduplicating.
    for (let i = 1; i < out.length; i++) {
        if (out[i].src === first.src) {
            console.log('apex source: ' + out[i].label + ' is byte-identical to ' + first.label +
                        ' inside the SL_ block (second pass adds no signal today, and will the day it does)');
        }
    }
    return out;
}

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

// ── bucketed counters ────────────────────────────────────────
// One aggregate number hides which HALF disagreed. Selection and merge fail for
// different reasons and are fixed in different files, so they are counted apart
// and reported apart.
const BUCKETS = {
    selection: { checks: 0, fail: 0, title: 'scenario SELECTION  (each registry picks its own)' },
    merge:     { checks: 0, fail: 0, title: 'plan MERGE          (governor + stops + gate floor)' },
    targets:   { checks: 0, fail: 0, title: 'target resolution   (CURRENT/STALE/ABSENT tri-state)' },
    structure: { checks: 0, fail: 0, title: 'structural tag' },
    collapse:  { checks: 0, fail: 0, title: 'collapse proof' },
    misc:      { checks: 0, fail: 0, title: 'stopMath / context shape' }
};
const SHOW_MAX = 40;
let shown = 0;
function cmp(bucket, label, a, b) {
    const B = BUCKETS[bucket];
    B.checks++;
    const A = JSON.stringify(a), Z = JSON.stringify(b);
    if (A === Z) return;
    B.fail++;
    if (++shown <= SHOW_MAX) {
        console.log('  ✗ [' + bucket + '] ' + label + '\n      apex: ' + A + '\n      core: ' + Z);
    } else if (shown === SHOW_MAX + 1) {
        console.log('  … further failures suppressed for readability; the totals below are exact');
    }
}

const WINDOWS = ['open', 'amprime', 'lunch', 'pmprime', 'power', 'close'];
const round2 = v => Number(v.toFixed(2));

// The three real rungs, the hardcoded-absent one, and a key no registry emits —
// the last is the only way to reach resolveTarget's finite guard, which is
// otherwise dead code because reclaim/support/flip are always present and the
// backend validates them gt=0.
const TARGET_KEYS = ['reclaim', 'support', 'flip', 'vwap', 'not_a_level'];
const shapeTarget = t => ({
    key: t.key, label: t.label, price: t.price,
    state: t.state, resolved: t.resolved, stale: t.stale, ageDays: t.ageDays
});

const INPUTS = {
    SHORT:   { opening: 'below', vwap: 'lost',    internals: 'weak',   retest: 'lowerhigh', ribbon: 'fanneddown', ivp: 40, hviv: 'inline' },
    LONG:    { opening: 'above', vwap: 'holding', internals: 'strong', retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' },
    NEUTRAL: { opening: 'above', vwap: 'chop',    internals: 'mixed',  retest: 'higherlow', ribbon: 'fannedup',   ivp: 40, hviv: 'inline' }
};

// ── boundary probes, DERIVED ─────────────────────────────────
// The old harness hardcoded the probe triple, so the week the anchor moved,
// every "boundary" spot landed in the flat interior of a band and the sweep
// silently stopped testing the thing it exists to test — while still reporting
// 2016 green scenarios. Probing nothing and probing everything and finding
// nothing print the same line. Deriving from the levels object both
// implementations read makes the decay unrepresentable; the guard below refuses
// to run if it creeps back.
function boundarySpots(levels) {
    const L = [levels.flip, levels.support, levels.reclaim];
    const probes = L.flatMap(v => [round2(v - 0.01), v, round2(v + 0.01)]);
    const context = [
        round2(levels.flip - 20),
        round2((levels.flip + levels.support) / 2),
        round2((levels.support + levels.reclaim) / 2),
        round2(levels.reclaim + 20)
    ];
    const spots = [null, ...context, ...probes];

    // THE GUARD. Swap the flatMap back for a literal and the next re-anchor
    // exits 2 instead of printing a green run over dead probes.
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

// vixFragile is a boundary too, and 24.99/25 were typed in beside it.
function boundaryVixes(levels) {
    const f = levels.vixFragile;
    return [null, round2(f * 0.5), round2(f * 0.7), round2(f - 0.01), f, round2(f + 0.01), round2(f * 1.2), round2(f * 1.8)];
}

// ── the live level override, resolved once ───────────────────
// Whatever production is actually serving. The synthetic fixture proves the two
// implementations agree at SOME boundary; only this proves they agree at the
// boundaries traders are looking at today.
async function resolveLiveOverride() {
    const url = process.env.PARITY_LIVE_URL;
    if (url) {
        let d;
        try {
            const r = await realFetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            d = await r.json();
        } catch (e) {
            // Loud, not skipped. Setting PARITY_LIVE_URL is a statement that the
            // live pass matters; failing to reach it is a failure.
            console.error('\n✗ LIVE PASS — could not read ' + url + ': ' + ((e && e.message) || e) + '\n');
            process.exit(1);
        }
        return { over: d, origin: 'endpoint ' + url, real: true };
    }
    const raw = process.env.SPY_STRUCTURE_JSON;
    if (raw) {
        let d;
        try { d = JSON.parse(raw); }
        catch (e) {
            console.error('\n✗ LIVE PASS — SPY_STRUCTURE_JSON is not valid JSON: ' + ((e && e.message) || e) + '\n');
            process.exit(1);
        }
        return { over: d, origin: 'env SPY_STRUCTURE_JSON', real: true };
    }
    return { over: null, origin: 'shipped baked anchor', real: false };
}

const LIVE = await resolveLiveOverride();
const now = Date.now();

const totals = { scenarios: 0, selectionCombos: 0 };

// ═══════════════════════════════════════════════════════════════
// ONE SUITE PER APEX SOURCE
// ═══════════════════════════════════════════════════════════════
function runSuite(source) {
    const TAG = source.label;
    const at = s => `{${TAG}} ` + s;
    console.log('\n════════════════════════════════════════════════════════');
    console.log('APEX SOURCE: ' + TAG + (source.pinned ? '' : '   ⚠ UNPINNED'));
    console.log('════════════════════════════════════════════════════════');

    // Reset the stub world so one source cannot leak state into the next.
    for (const k of Object.keys(globalThis.PRICE_CACHE)) delete globalThis.PRICE_CACHE[k];

    // Registry symbols are probed with typeof rather than named directly: a ref
    // that predates the scenario port must report that fact, not throw.
    // eslint-disable-next-line no-eval
    (0, eval)(source.src + `
globalThis.__apex = {
    slStructure, slRunGate, slStructureContext, slDirectionalRead,
    SL_STATE, SL_STRUCTURE, SL_INPUTS_DEF,
    slSelectScenario: typeof slSelectScenario === 'function' ? slSelectScenario : null,
    slRunnerEligible: typeof slRunnerEligible === 'function' ? slRunnerEligible : null,
    slResolveTarget:  typeof slResolveTarget  === 'function' ? slResolveTarget  : null,
    SL_READS:         typeof SL_READS !== 'undefined' ? SL_READS : null
};`);
    const apex = globalThis.__apex;
    const hasRegistry = !!(apex.slSelectScenario && apex.SL_READS);
    if (!hasRegistry) {
        console.log('⚠ this ref PREDATES the scenario registry — no slSelectScenario/SL_READS.');
        console.log('    Selection cannot be compared for it. Reported as skipped, not as passing.');
    }

    // ── PRECONDITION: structure drift ────────────────────────
    {
        const a = apex.SL_STRUCTURE, c = core.SL_STRUCTURE;
        const keys = ['asOf', 'reclaim', 'support', 'flip', 'staleDays', 'vixFragile'];
        const drift = keys.filter(k => String(a[k]) !== String(c[k]));
        if (drift.length) {
            console.error('\n✗ STRUCTURE DRIFT — inline anchor and core anchor disagree.');
            for (const k of drift) console.error(`    ${k}: apex=${JSON.stringify(a[k])}  core=${JSON.stringify(c[k])}`);
            console.error('\nNothing was compared. Re-anchor one side, or this run means nothing.\n');
            process.exit(2);
        }
        console.log('precondition: structure anchors agree (' + a.asOf +
            ', reclaim ' + a.reclaim + ' / support ' + a.support + ' / flip ' + a.flip + ')');
    }

    const SHIPPED = { ...apex.SL_STRUCTURE };
    const MID_CONFIRMED = round2((SHIPPED.support + SHIPPED.reclaim) / 2);
    const CALM_VIX = round2(SHIPPED.vixFragile * 0.75);

    // ── the tape grid, derived from SL_INPUTS_DEF ────────────
    const DEF = Object.fromEntries(apex.SL_INPUTS_DEF.map(([k, , opts]) => [k, opts.map(o => o[0])]));
    const TAPE_KEYS = ['opening', 'vwap', 'internals', 'retest', 'ribbon', 'hviv'];
    const tapeGrid = [];
    (function build(i, acc) {
        if (i === TAPE_KEYS.length) { tapeGrid.push({ ...acc, ivp: 40 }); return; }
        for (const v of DEF[TAPE_KEYS[i]]) build(i + 1, { ...acc, [TAPE_KEYS[i]]: v });
    })(0, {});

    // ═══════════════════════════════════════════════════════════
    // PHASE 1a — collapse proof over the FULL tape grid
    // ═══════════════════════════════════════════════════════════
    console.log('\nphase 1a — collapse proof: ' + tapeGrid.length + ' tape combinations x ' +
        WINDOWS.length + ' windows = ' + (tapeGrid.length * WINDOWS.length) + ' scenarios');

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
            // Keyed on the SCENARIO, not bias.dir: the plan is per-scenario and
            // runner eligibility is derived, so two LONG reads legitimately
            // differ (buy_pullbacks rides, bullish_lean does not).
            const key = (hasRegistry ? apex.slSelectScenario(inputs).id : r.bias.dir) + '|' + win;
            const sig = JSON.stringify({
                governor: r.governor, time: r.stops.time,
                target: r.stops.target, runner: r.stops.runner
            });
            if (!groups.has(key)) groups.set(key, { sig, example: inputs });
            else if (groups.get(key).sig !== sig) {
                collapseViolations++;
                if (collapseViolations <= 5) {
                    console.log('  ✗ collapse violated for ' + at(key));
                    console.log('      first: ' + JSON.stringify(groups.get(key).example));
                    console.log('      this:  ' + JSON.stringify(inputs));
                    console.log('      a: ' + groups.get(key).sig);
                    console.log('      b: ' + sig);
                }
            }
        }
    }
    BUCKETS.collapse.checks += phase1;
    BUCKETS.collapse.fail += collapseViolations;
    console.log(collapseViolations === 0
        ? '  ✓ governor output depends on the tape only through the scenario — prune licensed'
        : '  ✗ ' + collapseViolations + ' collapse violations — the phase-2 prune is NOT valid');

    // ═══════════════════════════════════════════════════════════
    // PHASE 1b — SELECTION: each implementation picks its own
    // ═══════════════════════════════════════════════════════════
    // Both registries are ordered arrays resolved by `find(sc => sc.match(s))`.
    // Several entries legitimately match the same tape; precedence is the ONLY
    // disambiguator. Reorder one array or edit one matcher and the two diverge
    // silently — the panel keeps printing a plausible label, just the wrong one.
    //
    // Selection is structure-independent, so it is swept over the whole tape
    // grid rather than the three pruned reads, which only ever reach three of
    // the eight scenarios.
    if (hasRegistry) {
        console.log('\nphase 1b — scenario selection: ' + tapeGrid.length +
            ' tape combinations, each side calling its OWN selector');

        // Precedence itself, compared directly and once.
        cmp('selection', at('registry order (SL_READS vs SPY_SCENARIOS)'),
            apex.SL_READS.map(r => r.id), scen.SPY_SCENARIOS.map(r => r.id));

        const seenA = new Set(), seenC = new Set();
        for (const tape of tapeGrid) {
            const k = Object.values(tape).join('/');
            const a = apex.slSelectScenario(tape);
            const c = scen.selectScenario(tape);
            seenA.add(a.id); seenC.add(c.id);

            cmp('selection', at(`select(${k}) identity`),
                { id: a.id, label: a.label, dir: a.dir, note: a.note },
                { id: c.id, label: c.label, dir: c.dir, note: c.note });

            cmp('selection', at(`select(${k}) plan`), a.plan, c.plan);

            // Each side derives eligibility from ITS OWN plan with ITS OWN
            // function. Sharing either would make this comparison circular.
            cmp('selection', at(`runnerEligible(${k})`),
                apex.slRunnerEligible ? apex.slRunnerEligible(a.plan) : null,
                scen.runnerEligible(c.plan));
        }
        totals.selectionCombos += tapeGrid.length;

        // Reachability: a scenario nothing selects is a scenario nothing tests.
        cmp('selection', at('scenario reachability'),
            [...seenA].sort(), [...seenC].sort());
        console.log('  scenarios reached: ' + seenA.size + '/' + apex.SL_READS.length +
            ' inline, ' + seenC.size + '/' + scen.SPY_SCENARIOS.length + ' module');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2 — structural sweep, each side merging its OWN plan
    // ═══════════════════════════════════════════════════════════
    let phase2 = 0;
    function structuralSweep(label, levels) {
        Object.assign(apex.SL_STRUCTURE, levels);
        const SPOTS = boundarySpots(levels);
        const VIXES = boundaryVixes(levels);

        console.log('\nphase 2 — structural sweep [' + label + ']: ' + SPOTS.length + ' spots x ' +
            VIXES.length + ' VIXes x ' + Object.keys(INPUTS).length + ' reads x ' + WINDOWS.length +
            ' windows = ' + (SPOTS.length * VIXES.length * Object.keys(INPUTS).length * WINDOWS.length) + ' scenarios');
        console.log('    boundaries probed: flip ' + levels.flip + ' / support ' + levels.support +
            ' / reclaim ' + levels.reclaim + ' / vixFragile ' + levels.vixFragile);

        const w = s => at('[' + label + '] ' + s);

        for (const spot of SPOTS) {
            for (const vix of VIXES) {
                apex.SL_STATE.live = spot == null ? null : { price: spot };
                if (vix == null) delete globalThis.PRICE_CACHE['^VIX'];
                else globalThis.PRICE_CACHE['^VIX'] = { price: vix };

                const aS = apex.slStructure();
                const cS = core.structuralTag({ spot, vix, now, levels });

                cmp('structure', w(`structuralTag(spot=${spot}, vix=${vix})`),
                    { verified: aS.verified, missing: aS.missing, tag: aS.tag, label: aS.label, dir: aS.dir, color: aS.color, spot: aS.spot, vix: aS.vix, stale: aS.stale, detail: aS.detail },
                    { verified: cS.verified, missing: cS.missing, tag: cS.tag, label: cS.label, dir: cS.dir, color: cS.color, spot: cS.spot, vix: cS.vix, stale: cS.stale, detail: cS.detail });

                // ── target resolution: the tri-state ─────────────
                // Each side resolves off the struct IT built, which is the path
                // the panel actually takes. `absent` is included via a key no
                // registry emits, so the finite guard is exercised and not just
                // the hardcoded vwap short-circuit.
                if (apex.slResolveTarget) {
                    for (const key of TARGET_KEYS) {
                        cmp('targets', w(`resolveTarget(${key}, spot=${spot}, vix=${vix})`),
                            shapeTarget(apex.slResolveTarget(key, aS)),
                            shapeTarget(core.resolveTarget(key, cS)));
                    }
                }

                for (const [name, base] of Object.entries(INPUTS)) {
                    for (const win of WINDOWS) {
                        phase2++;
                        const inputs = Object.assign({}, base, { window: win });
                        apex.SL_STATE.inputs = inputs;
                        const aR = apex.slRunGate(inputs);

                        // EACH SIDE'S OWN PLAN. The harness used to take APEX's
                        // selection and hand that same object to the core, so both
                        // were merging APEX's choice and a selection divergence
                        // could not surface here. Now it surfaces in both numbers.
                        const cPlan = hasRegistry ? scen.selectScenario(inputs).plan : undefined;
                        const cG = core.governorFor({ biasDir: aR.bias.dir, struct: cS, windowKey: win, plan: cPlan });

                        cmp('merge', w(`governor(${name}, spot=${spot}, vix=${vix}, win=${win})`),
                            { mode: aR.governor.mode, label: aR.governor.label, color: aR.governor.color },
                            { mode: cG.governor.mode, label: cG.governor.label, color: cG.governor.color });

                        cmp('merge', w(`stops(${name}, spot=${spot}, vix=${vix}, win=${win})`),
                            { time: aR.stops.time, target: aR.stops.target, runner: aR.stops.runner, pricePct: aR.stops.pricePct },
                            { time: cG.stops.time, target: cG.stops.target, runner: cG.stops.runner, pricePct: cG.stops.pricePct });

                        // The gate floor may only ratchet downward.
                        cmp('merge', w(`worsenGate(${name}, spot=${spot}, win=${win})`),
                            core.worsenGate('GO', cG.gateFloor),
                            cG.gateFloor === 'GO' ? 'GO' : cG.gateFloor);
                    }
                }
            }
        }
    }

    // PRIMARY — synthetic, offline, deterministic, immune to re-anchoring.
    // Deliberately NOT the production triple, or the live pass below would be a
    // re-run of the same numbers.
    const SYNTHETIC = {
        asOf: SHIPPED.asOf,           // shared so both sides age identically
        flip: 700.00, support: 750.00, reclaim: 800.00,
        staleDays: SHIPPED.staleDays, vixFragile: 25,
        source: 'parity synthetic fixture — not a real anchoring'
    };
    structuralSweep('SYNTHETIC', SYNTHETIC);

    if (!LIVE.real) {
        console.log('\n⚠ LIVE PASS is running against the ' + LIVE.origin + ', not production.');
        console.log('    Set PARITY_LIVE_URL=<nexus>/api/spy-logic/structure (or SPY_STRUCTURE_JSON)');
        console.log('    to probe the boundaries actually in production. Until then this pass');
        console.log('    re-tests the fallback, which is not the same claim.');
    }
    structuralSweep('LIVE · ' + LIVE.origin, LIVE.real ? { ...SHIPPED, ...LIVE.over } : { ...SHIPPED });

    // ═══════════════════════════════════════════════════════════
    // PHASE 3 — target resolution across the axes the sweep cannot reach
    // ═══════════════════════════════════════════════════════════
    // The sweep above resolves targets at 112 spot/VIX combinations, but every
    // one of them uses a FRESH anchor, so `stale` is false throughout and the
    // whole stale/current axis goes untested. Collapsing the tri-state to
    // `state: 'current'` passed all 1120 of those comparisons. Breadth on one
    // axis is not coverage of another.
    //
    // These fixtures move the axes the sweep holds constant: anchor age, and
    // levels that are present but not usable as prices.
    if (apex.slResolveTarget) {
        const OLD = '2026-01-05';   // far enough back to be stale under any staleDays
        const FIXTURES = [
            ['fresh',       { ...SYNTHETIC },                       MID_CONFIRMED],
            ['stale',       { ...SYNTHETIC, asOf: OLD },            MID_CONFIRMED],
            ['zero-level',  { ...SYNTHETIC, support: 0 },           MID_CONFIRMED],
            ['nan-level',   { ...SYNTHETIC, flip: NaN },            MID_CONFIRMED],
            ['neg-level',   { ...SYNTHETIC, reclaim: -1 },          MID_CONFIRMED],
            ['stale+zero',  { ...SYNTHETIC, asOf: OLD, support: 0 }, MID_CONFIRMED],
            ['no-spot',     { ...SYNTHETIC },                       null]
        ];
        console.log('\nphase 3 — target resolution: ' + FIXTURES.length + ' anchor fixtures x ' +
            TARGET_KEYS.length + ' keys (stale/current and the finite guard, which the sweep holds constant)');

        for (const [name, levels, spot] of FIXTURES) {
            Object.assign(apex.SL_STRUCTURE, levels);
            apex.SL_STATE.live = spot == null ? null : { price: spot };
            globalThis.PRICE_CACHE['^VIX'] = { price: CALM_VIX };
            const aS = apex.slStructure();
            const cS = core.structuralTag({ spot, vix: CALM_VIX, now, levels });
            cmp('targets', at(`[${name}] struct.stale agrees`), aS.stale, cS.stale);
            for (const key of TARGET_KEYS) {
                cmp('targets', at(`[${name}] resolveTarget(${key})`),
                    shapeTarget(apex.slResolveTarget(key, aS)),
                    shapeTarget(core.resolveTarget(key, cS)));
            }
        }
    }

    // Put the shipped anchor back for the sections below.
    Object.assign(apex.SL_STRUCTURE, SHIPPED);

    // ── stopMath, independent of the grid ────────────────────
    for (const prem of [0.68, 1.20, 2.55, 0, -1]) {
        for (const lots of [1, 2, 3, 9]) {
            const m = core.stopMath({ entryPremium: prem, lots });
            if (prem <= 0) {
                cmp('misc', at(`stopMath(${prem}, ${lots}) is null`), m, null);
            } else {
                cmp('misc', at(`stopMath(${prem}, ${lots})`),
                    { stopPrice: Number((prem * 0.75).toFixed(4)), maxLoss: Math.round(prem * 0.25 * 100 * Math.min(lots, 3)), lots: Math.min(lots, 3) },
                    { stopPrice: Number(m.stopPrice.toFixed(4)), maxLoss: Math.round(m.maxLoss), lots: m.lots });
            }
        }
    }

    // ── buildStructureContext shape ──────────────────────────
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
        cmp('misc', at('buildStructureContext top-level key set'),
            Object.keys(aCtx).sort(), Object.keys(cCtx).sort());
    }

    totals.scenarios += phase1 + phase2;
    return { hasRegistry };
}

// ── run ──────────────────────────────────────────────────────
const SOURCES = apexSources();
const results = SOURCES.map(runSuite);

// ── report ───────────────────────────────────────────────────
const totalFail = Object.values(BUCKETS).reduce((n, b) => n + b.fail, 0);
const totalChecks = Object.values(BUCKETS).reduce((n, b) => n + b.checks, 0);

console.log('\n════════════════════════════════════════════════════════');
console.log('RESULTS — ' + SOURCES.length + ' APEX source' + (SOURCES.length === 1 ? '' : 's') +
    ', ' + totals.scenarios + ' scenarios, ' + totalChecks + ' comparisons');
console.log('════════════════════════════════════════════════════════');
for (const [k, b] of Object.entries(BUCKETS)) {
    const mark = b.checks === 0 ? '–' : b.fail === 0 ? '✓' : '✗';
    console.log('  ' + mark + ' ' + b.title.padEnd(50) +
        String(b.checks).padStart(7) + ' compared, ' + String(b.fail).padStart(6) + ' disagreed');
}
console.log('');
console.log('  SELECTION agreement : ' +
    (BUCKETS.selection.checks === 0
        ? 'NOT MEASURED — no ref carried a registry'
        : (BUCKETS.selection.checks - BUCKETS.selection.fail) + ' / ' + BUCKETS.selection.checks +
          '   (' + totals.selectionCombos + ' tape combinations, each side its own selector)'));
console.log('  MERGE     agreement : ' +
    (BUCKETS.merge.checks - BUCKETS.merge.fail) + ' / ' + BUCKETS.merge.checks);
console.log('');
// ── NOT COVERED ──────────────────────────────────────────────
// Printed every run, in the summary, deliberately. An uncovered surface that
// says nothing is indistinguishable from a covered one, and that silence is
// what let normalizeLevels() sit unverified for five sessions. If something
// here gets covered, delete the line — do not let the list outlive the gap.
console.log('  NOT COVERED by this suite:');
console.log('    · levelLadder / slLadderHtml — no shared counterpart to compare.');
console.log('        core.levelLadder(struct) returns a data array of the fixed');
console.log('        reclaim/support/flip triple with distance and side; APEX\'s');
console.log('        slLadderHtml(r) returns an HTML string built from r.stops.targets.');
console.log('        Different input, different output, different content. Comparing');
console.log('        them would require re-deriving one from the other, which tests');
console.log('        this harness rather than parity. Covered only by unit tests.');
console.log('    · degraded payloads — APEX does not honour levels.degraded (§9.11):');
console.log('        slFetchStructure drops the flag on adopt and slStructure still');
console.log('        computes stale from ageDays alone. A degraded fixture here would');
console.log('        be a fixed implementation measured against a known-unfixed one,');
console.log('        so it is declared rather than asserted. Behaviour is covered');
console.log('        hashira-side by spy-logic/degraded.test.mjs (8 cases).');
console.log('');
for (const s of SOURCES) {
    console.log('  source: ' + s.label + (s.pinned ? ' (pinned)' : '  ⚠ UNPINNED — exists on no branch'));
}
console.log('  live levels: ' + LIVE.origin + (LIVE.real ? '' : '  ⚠ NOT production'));
if (results.some(r => !r.hasRegistry)) {
    console.log('  ⚠ at least one ref predates the scenario registry; its selection was NOT compared');
}
console.log('');
console.log(totalFail === 0 ? '✓ parity clean' : '✗ parity FAILED — ' + totalFail + ' of ' + totalChecks + ' comparisons disagreed');
process.exit(totalFail === 0 ? 0 : 1);
