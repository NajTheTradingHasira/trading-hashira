/**
 * Regression harness for the portable governor core.
 * No DOM, no stubs — run with: node spy-governor-core.test.mjs
 *
 * These vectors are the contract. Any port to another terminal must pass
 * this file unchanged, or the terminals have drifted.
 */
import {
    SL_STRUCTURE, SL_STOP, SL_MAX_LOTS,
    structuralTag, governorFor, worsenGate, stopMath,
    buildStructureContext, levelLadder
} from './spy-governor-core.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const near = (a, b, m) => { if (Math.abs(a - b) > 1e-9) throw new Error((m || '') + ' expected ~' + b + ', got ' + a); };

// Freeze "now" so staleness is deterministic: the anchor date itself.
const NOW = Date.parse(SL_STRUCTURE.asOf + 'T12:00:00');
const tag = (spot, vix, now = NOW) => structuralTag({ spot, vix, now });

console.log('\n── regime-input discipline ──');
t('missing spot → unverified, no stage claimed', () => {
    const S = tag(null, 18);
    eq(S.verified, false); eq(S.tag, null); eq(S.label, 'STRUCTURE UNVERIFIED');
    ok(S.missing.includes('live daily price'));
});
t('missing VIX → unverified even with a live spot', () => {
    const S = tag(755, null);
    eq(S.verified, false); ok(S.missing.includes('VIX'));
});
t('both missing → both named', () => {
    const S = tag(null, null);
    eq(S.missing.length, 2);
});
t('unverified forces a CAUTION floor and turns the governor off', () => {
    const g = governorFor({ biasDir: 'LONG', struct: tag(755, null), windowKey: 'amprime' });
    eq(g.gateFloor, 'CAUTION');
    eq(g.governor.mode, 'unverified');
    ok(g.reasons.some(r => /STRUCTURE UNVERIFIED/.test(r)));
});
t('zero and negative inputs are treated as missing, not as levels', () => {
    eq(tag(0, 18).verified, false);
    eq(tag(755, 0).verified, false);
    eq(tag(-5, 18).verified, false);
});

console.log('\n── tag classification ──');
t('above reclaim → Stage 2 confirmed, structural side LONG', () => {
    const S = tag(755, 16);
    eq(S.verified, true); eq(S.tag, 'stage2'); eq(S.dir, 'LONG'); eq(S.color, 'green');
});
t('between support and reclaim → weakening, still LONG', () => {
    const S = tag(739, 16); eq(S.tag, 'stage2w'); eq(S.dir, 'LONG');
});
t('between flip and support → transition, no directional tag', () => {
    const S = tag(728, 16); eq(S.tag, 'transition'); eq(S.dir, null);
});
t('below flip → structure broken, structural side SHORT', () => {
    const S = tag(715, 22); eq(S.tag, 'stage3'); eq(S.dir, 'SHORT'); eq(S.color, 'red');
});
// DESIGN LIMIT — do not "fix" this by wiring in an injection seam.
// structuralTag() reads the module-level SL_STRUCTURE and takes no structure
// argument, so these two tests can only probe the baked fallback. That couples
// them to a constant frozen by convention rather than by test: the day someone
// refreshes the bake, these probes move with it and stop being boundaries.
// Honest boundary coverage needs levels injected per-run, which is exactly what
// parity.mjs::boundarySpots() does — including a guard that exits non-zero when
// a level in the fixture goes unprobed. Adding a seam here would duplicate that
// job in a file with no harness around it. Boundary coverage lives in parity.mjs.
t('boundaries are inclusive at the level itself', () => {
    eq(tag(SL_STRUCTURE.reclaim, 16).tag, 'stage2');
    eq(tag(SL_STRUCTURE.support, 16).tag, 'stage2w');
    eq(tag(SL_STRUCTURE.flip, 16).tag, 'transition');
});
t('one cent below each level falls through to the next band', () => {
    eq(tag(SL_STRUCTURE.reclaim - 0.01, 16).tag, 'stage2w');
    eq(tag(SL_STRUCTURE.support - 0.01, 16).tag, 'transition');
    eq(tag(SL_STRUCTURE.flip - 0.01, 16).tag, 'stage3');
});
t('VIX at/above the fragile threshold downgrades a confirmed tag', () => {
    const S = tag(755, 29.42);
    eq(S.tag, 'stage2w'); eq(S.color, 'amber');
    ok(/VIX 29\.42/.test(S.detail));
    eq(tag(755, SL_STRUCTURE.vixFragile).tag, 'stage2w', 'inclusive at threshold');
    eq(tag(755, SL_STRUCTURE.vixFragile - 0.01).tag, 'stage2', 'below threshold stays confirmed');
});
t('VIX downgrade does not touch the broken-structure tag', () => {
    eq(tag(715, 40).tag, 'stage3');
});

console.log('\n── governor ──');
t('SHORT into Stage 2 → counter-structural: scalp, no runner, CAUTION floor', () => {
    const g = governorFor({ biasDir: 'SHORT', struct: tag(755, 16), windowKey: 'amprime' });
    eq(g.governor.mode, 'counter');
    eq(g.gateFloor, 'CAUTION');
    eq(g.stops.runner, false);
    eq(g.stops.time, '8-10 min');
    ok(/NO runner/.test(g.stops.target));
    ok(g.reasons.some(r => /scalp with a shelf life/i.test(r)));
});
t('LONG into Stage 2 → with-structure: full plan, GO stays reachable', () => {
    const g = governorFor({ biasDir: 'LONG', struct: tag(755, 16), windowKey: 'amprime' });
    eq(g.governor.mode, 'aligned');
    eq(g.gateFloor, 'GO');
    eq(g.stops.runner, true);
    eq(g.stops.time, '15-20 min');
});
t('governor INVERTS below the flip', () => {
    const S = tag(715, 22);
    eq(governorFor({ biasDir: 'LONG',  struct: S, windowKey: 'amprime' }).governor.mode, 'counter');
    eq(governorFor({ biasDir: 'SHORT', struct: S, windowKey: 'amprime' }).governor.mode, 'aligned');
    eq(governorFor({ biasDir: 'LONG',  struct: S, windowKey: 'amprime' }).stops.runner, false);
    eq(governorFor({ biasDir: 'SHORT', struct: S, windowKey: 'amprime' }).stops.runner, true);
});
t('transition zone → both directions scalp-only', () => {
    const S = tag(728, 16);
    for (const dir of ['LONG', 'SHORT']) {
        const g = governorFor({ biasDir: dir, struct: S, windowKey: 'amprime' });
        eq(g.governor.mode, 'transition');
        eq(g.stops.runner, false);
        eq(g.gateFloor, 'CAUTION');
    }
});
t('neutral read → governor idle, plan untouched', () => {
    const g = governorFor({ biasDir: 'NEUTRAL', struct: tag(755, 16), windowKey: 'amprime' });
    eq(g.governor.mode, 'idle');
    eq(g.gateFloor, 'GO');
    eq(g.stops.runner, true);
});
t('scalp time stops are defined for every trading window', () => {
    for (const w of ['open', 'amprime', 'lunch', 'pmprime', 'power']) {
        const g = governorFor({ biasDir: 'SHORT', struct: tag(755, 16), windowKey: w });
        ok(g.stops.time && g.stops.time !== '5-8 min' || w === 'power', 'window ' + w + ' has a scalp time');
    }
});
t('unknown window still yields a safe scalp default', () => {
    const g = governorFor({ biasDir: 'SHORT', struct: tag(755, 16), windowKey: 'nonsense' });
    eq(g.stops.time, '5-8 min');
});
t('stale anchor adds a re-anchor reason but does NOT unverify', () => {
    const old = structuralTag({ spot: 755, vix: 16, now: NOW + 20 * 86400000 });
    eq(old.verified, true);
    eq(old.stale, true);
    ok(governorFor({ biasDir: 'LONG', struct: old, windowKey: 'amprime' })
        .reasons.some(r => /re-anchor/i.test(r)));
});
t('a fresh anchor produces no re-anchor nag', () => {
    const g = governorFor({ biasDir: 'LONG', struct: tag(755, 16), windowKey: 'amprime' });
    ok(!g.reasons.some(r => /re-anchor/i.test(r)));
});

console.log('\n── gate floor never improves a gate ──');
t('worsenGate only ratchets downward', () => {
    eq(worsenGate('NO-GO', 'CAUTION'), 'NO-GO', 'a CAUTION floor cannot rescue a NO-GO');
    eq(worsenGate('GO', 'CAUTION'), 'CAUTION');
    eq(worsenGate('CAUTION', 'GO'), 'CAUTION');
    eq(worsenGate('GO', 'GO'), 'GO');
});

console.log('\n── hard stop ──');
t('stop is hard and present on every path', () => {
    for (const [dir, spot] of [['SHORT', 755], ['LONG', 755], ['LONG', 728], ['NEUTRAL', 755]]) {
        const g = governorFor({ biasDir: dir, struct: tag(spot, 16), windowKey: 'amprime' });
        eq(g.stops.hard, true);
        eq(g.stops.pricePct, 25);
        ok(g.reasons.some(r => /HARD STOP/.test(r)));
    }
});
t('stop math: 1.20 entry, 3 lots', () => {
    const m = stopMath({ entryPremium: 1.20, lots: 3 });
    near(m.stopPrice, 0.90); near(m.maxLoss, 90); eq(m.lots, 3); eq(m.atCap, true);
});
t('lots clamp at the 3-lot cap and floor at 1', () => {
    eq(stopMath({ entryPremium: 1, lots: 9 }).lots, SL_MAX_LOTS);
    eq(stopMath({ entryPremium: 1, lots: 0 }).lots, 1);
    eq(stopMath({ entryPremium: 1, lots: -4 }).lots, 1);
});
t('invalid premium returns null rather than NaN', () => {
    eq(stopMath({ entryPremium: '' }), null);
    eq(stopMath({ entryPremium: 'abc' }), null);
    eq(stopMath({ entryPremium: 0 }), null);
    eq(stopMath({ entryPremium: -1 }), null);
});

console.log('\n── AI context payload (shape must not drift across terminals) ──');
t('payload is JSON-safe and carries tag, governor, stops, rules', () => {
    const S = tag(755, 16);
    const g = governorFor({ biasDir: 'SHORT', struct: S, windowKey: 'amprime' });
    const ctx = JSON.parse(JSON.stringify(buildStructureContext({
        struct: S,
        read: { gate: 'CAUTION', dir: 'SHORT', label: 'SHORT RALLIES' },
        windowLabel: '9:45-11:00 AM PRIME',
        entryStructure: 'Single-leg 0DTE (long call/put)',
        governorResult: g
    })));
    eq(ctx.verified, true);
    eq(ctx.tag, 'stage2');
    eq(ctx.structural_direction, 'LONG');
    eq(ctx.governor.mode, 'counter');
    eq(ctx.stops.hard_stop_pct, 25);
    eq(ctx.stops.runner_allowed, false);
    // Subject is the payload SHAPE — that buildStructureContext surfaces the
    // levels into ctx.levels at all. Assert pass-through, not the values; the
    // freeze guard on the constants themselves belongs in its own test.
    eq(ctx.levels.reclaim, SL_STRUCTURE.reclaim);
    eq(ctx.levels.support, SL_STRUCTURE.support);
    eq(ctx.levels.flip, SL_STRUCTURE.flip);
    eq(ctx.rules.length, 5);
    ok(ctx.rules.some(r => /shelf life/i.test(r)));
    ok(ctx.rules.some(r => /never assign a weinstein stage/i.test(r)));
});
t('exact top-level key set — a port that adds or drops keys fails here', () => {
    const S = tag(755, 16);
    const ctx = buildStructureContext({ struct: S, read: { dir: 'LONG' }, governorResult: governorFor({ biasDir: 'LONG', struct: S, windowKey: 'amprime' }) });
    eq(Object.keys(ctx).sort().join(','),
       'anchor,detail,governor,label,levels,local_read,missing,rules,spot,stops,structural_direction,tag,verified,vix');
});
t('unverified payload tells the AI not to claim a stage', () => {
    const S = tag(755, null);
    const ctx = buildStructureContext({ struct: S, read: { dir: 'LONG' }, governorResult: governorFor({ biasDir: 'LONG', struct: S, windowKey: 'amprime' }) });
    eq(ctx.verified, false);
    eq(ctx.tag, null);
    ok(ctx.missing.includes('VIX'));
});

console.log('\n── level ladder ──');
t('ladder reports side and distance against live spot', () => {
    const rows = levelLadder(tag(755, 16));
    eq(rows.length, 3);
    eq(rows[0].side, 'ABOVE');
    // Subject is the distance arithmetic, not the level. Deriving the expected
    // value keeps this test about the subtraction if the bake ever moves.
    near(rows[0].distance, 755 - SL_STRUCTURE.reclaim);
    eq(rows.every(r => r.side === 'ABOVE'), true);
});
t('ladder degrades to null distances when spot is unknown', () => {
    const rows = levelLadder(tag(null, 16));
    ok(rows.every(r => r.distance === null && r.side === null));
    ok(rows.every(r => typeof r.price === 'number'), 'levels are still shown — they are static facts, not a stage claim');
});
t('below the flip every rung reads BELOW', () => {
    const rows = levelLadder(tag(700, 30));
    eq(rows.every(r => r.side === 'BELOW'), true);
});

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
process.exit(fail ? 1 : 0);
