/**
 * §9.11 — DEGRADED LEVELS. Hashira-side test for spy-governor-core.js.
 *
 * Run:
 *   node --test spy-logic/degraded.test.mjs
 *
 * Zero dependencies on purpose. This repo has no package.json and no
 * node_modules; a test that needs `npm i` is a test nobody runs.
 *
 * ── Why this file has to exist ──────────────────────────────────────────
 *
 * parity.mjs cannot check this port. Not "does not" — CANNOT:
 *
 *   · it never calls resolveTarget (zero occurrences), and it explicitly
 *     excludes levelLadder, so the tri-state is outside what it compares;
 *   · every levels fixture it builds is a clean payload, so `degraded` is
 *     falsy in all 9864 scenarios and the new branch is never entered;
 *   · the fields it compares on structuralTag are a fixed list that does not
 *     include `degraded` or `degradedReason`.
 *
 * So parity stays green whether or not this port works. Worse, the usual
 * fallback check is no help either: spy-governor-core.js is byte-identical to
 * nexus src/lib/spyGovernor.js, and byte-identity across implementations only
 * proves they would fail the same way. It cannot tell you that either of them
 * is right.
 *
 * ── What `degraded` means ───────────────────────────────────────────────
 *
 * The backend sets it when /api/spy-logic/structure fell back to its own baked
 * default because SPY_STRUCTURE_JSON was absent or invalid. Nothing on the
 * client can infer it: stale and ageDays are recomputed here from asOf, but
 * "the server could not read its config" leaves no trace in the numbers. A
 * degraded payload carries a fresh-looking asOf over levels nobody anchored,
 * which is the confident-but-wrong rung the tri-state exists to prevent.
 *
 * Hence ageDays 0. It is the strongest case: the clock says the anchor could
 * not be fresher, so any staleness has to come from `degraded` and from
 * nothing else. If the guard is going to collapse, it collapses here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuralTag, governorFor, resolveTarget } from './spy-governor-core.js';

// Local time, deliberately: structuralTag parses `asOf + 'T00:00:00'` with no
// zone, so the anchor lands at LOCAL midnight. Noon on the same local day is
// ageDays 0 in every timezone; a UTC instant would not be.
const ANCHOR = '2026-07-26';
const SAME_DAY = Date.parse(ANCHOR + 'T12:00:00');

const payload = extra => ({
    asOf: ANCHOR, reclaim: 744.05, support: 729.10, flip: 723.70,
    staleDays: 10, vixFragile: 25, source: 'degraded.test fixture', ...extra
});

// A spot above reclaim and a calm VIX, so the tag verifies and the governor
// reaches its reason list instead of bailing on unverified structure.
const tagFor = levels => structuralTag({ spot: 750, vix: 18, now: SAME_DAY, levels });

test('§9.11 the guard: a degraded payload with ageDays 0 is STALE', () => {
    const bad = tagFor(payload({ degraded: true, degradedReason: 'SPY_STRUCTURE_JSON not set' }));
    assert.equal(bad.ageDays, 0, 'fixture must be same-day or the test proves nothing');
    assert.equal(bad.stale, true, 'degraded must force stale even at ageDays 0');
});

test('§9.11 the control: the identical payload, not degraded, is NOT stale', () => {
    // Without this the test above passes against a `stale = true` constant.
    const ok = tagFor(payload());
    assert.equal(ok.ageDays, 0);
    assert.equal(ok.stale, false);
});

test('§9.11 degraded and degradedReason are carried onto the struct', () => {
    const bad = tagFor(payload({ degraded: true, degradedReason: 'invalid JSON' }));
    assert.equal(bad.degraded, true);
    assert.equal(bad.degradedReason, 'invalid JSON');
});

test('§9.11 absent fields default to not-degraded, not undefined', () => {
    const ok = tagFor(payload());
    assert.equal(ok.degraded, false);
    assert.equal(ok.degradedReason, null);
});

test('§9.11 the tri-state follows: a rung off degraded levels is stale, not current', () => {
    // The consequence parity structurally cannot see. The price is finite and
    // positive, so a finite-only guard renders it as a confident level.
    const bad = tagFor(payload({ degraded: true }));
    const t = resolveTarget('reclaim', bad);
    assert.equal(t.price, 744.05);
    assert.equal(t.state, 'stale', 'NOT current, despite ageDays 0');
    assert.equal(t.label, 'RECLAIM 744.05 (0d old)');

    const good = resolveTarget('reclaim', tagFor(payload()));
    assert.equal(good.state, 'current');
    assert.equal(good.label, 'RECLAIM 744.05');
});

test('§9.11 the governor says DEGRADED ahead of, and distinctly from, stale', () => {
    const bad = tagFor(payload({ degraded: true, degradedReason: 'SPY_STRUCTURE_JSON not set' }));
    const g = governorFor({ biasDir: 'LONG', struct: bad, windowKey: 'amprime' });

    const iDegraded = g.reasons.findIndex(r => r.includes('LEVELS DEGRADED'));
    const iStale = g.reasons.findIndex(r => r.includes('describes the baked default'));
    assert.ok(iDegraded >= 0, 'no LEVELS DEGRADED reason emitted');
    assert.ok(iStale >= 0, 'no staleness reason emitted');
    assert.ok(iDegraded < iStale, 'LEVELS DEGRADED must precede the staleness reason');

    const joined = g.reasons.join(' | ');
    assert.ok(joined.includes('SPY_STRUCTURE_JSON not set'), 'the reason must name the cause');
    // Re-anchoring does not fix a backend that cannot read its config, so the
    // panel must not tell the trader to go re-anchor.
    assert.ok(!joined.includes('re-anchor the structure block'));
});

test('§9.11 a clean payload says nothing about degradation', () => {
    const g = governorFor({ biasDir: 'LONG', struct: tagFor(payload()), windowKey: 'amprime' });
    assert.ok(!g.reasons.join(' | ').includes('DEGRADED'));
});

test('§9.11 age and degradation are independent: an old CLEAN anchor still re-anchors', () => {
    // Guards the other direction — the degraded branch must not swallow the
    // ordinary staleness message it was inserted in front of.
    const old = structuralTag({ spot: 750, vix: 18, now: Date.parse('2026-09-26T12:00:00'), levels: payload() });
    assert.equal(old.stale, true);
    assert.equal(old.degraded, false);
    const g = governorFor({ biasDir: 'LONG', struct: old, windowKey: 'amprime' });
    const joined = g.reasons.join(' | ');
    assert.ok(joined.includes('re-anchor the structure block'));
    assert.ok(!joined.includes('LEVELS DEGRADED'));
});
