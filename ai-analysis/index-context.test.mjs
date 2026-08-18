/**
 * AI-6a — index_context payload wiring for POST /api/ai/commentary/{ticker}.
 *
 * Run:
 *   node --test ai-analysis/index-context.test.mjs
 *
 * Zero dependencies on purpose. This repo has no package.json and no
 * node_modules; a test that needs `npm i` is a test nobody runs. Same rule as
 * spy-logic/degraded.test.mjs.
 *
 * ── What is under test ──────────────────────────────────────────────────
 *
 * The context builder inside NX.runAIAnalysis, sliced out of index.html by
 * anchor and executed for real — the same technique spy-logic/inline-parity.mjs
 * uses. Nothing is reimplemented here: if the block in index.html changes, this
 * test runs the changed block or fails to find it.
 *
 * ── Why it has to exist ─────────────────────────────────────────────────
 *
 * This is the only caller of the 0DTE analysis route, and every defect it used
 * to carry was SILENT — the analysis came back looking complete either way:
 *
 *   · `if(bd)` accepted the failure envelope. /api/market-breadth answers
 *     HTTP 200 with {"error": …} when both its sources fail, and that dict is
 *     truthy, so `bd.advancing+'/'+bd.declining` reached the model as the
 *     string "undefined/undefined" — a fabricated value, not a gap.
 *   · `bd.mcclellan` never existed. The endpoint's key is
 *     mcclellan_oscillator, so that field was empty on every successful call.
 *   · Five of nine sections were never sent at all, and an entirely empty ctx
 *     trips _build_index_user_prompt's early return — which made a FAILED
 *     payload quieter than a successful one.
 *
 * None of those surface as an error anywhere. They surface as an analysis
 * written on less data than it appears to have, which is the whole NX-AI-01
 * failure class. Hence assertions on the JSON that actually goes over the wire
 * rather than on the in-memory object: `undefined` values vanish in
 * JSON.stringify, and absent-vs-empty is exactly the distinction that matters
 * to ai.py's AI-7 machinery on the other side.
 *
 * Fixtures are live response shapes captured from Railway on 2026-08-18.
 * They are fixtures: no assertion here has been run against a live call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = process.argv[2] && process.argv[2].endsWith('.html')
  ? process.argv[2]
  : path.join(HERE, '..', 'index.html');

const OPEN = '// ── Build index_context from live terminal data';
const CLOSE = "const d=await NX.apiPost('/api/ai/commentary/'";

/** The context builder, verbatim from index.html. */
function extractBlock() {
  const html = fs.readFileSync(HTML, 'utf8');
  const a = html.indexOf(OPEN);
  assert.ok(a >= 0, `anchor not found in ${HTML}: ${OPEN}`);
  const b = html.indexOf(CLOSE, a);
  assert.ok(b > a, `closing anchor not found after the block: ${CLOSE}`);
  return html.slice(a, b);
}

const BLOCK = extractBlock();

// ── Fixtures — live shapes, 2026-08-18 ──────────────────────────────────

const BD_OK = {
  advancing: 117, declining: 343, unchanged: 2, up_volume: 0.57, down_volume: 1.39,
  ad_ratio: 0.34, vol_ratio: 0.41, trin: 0.83,
  mcclellan_oscillator: -60.2, summation_index: -3886.0,
  ema19: -188.2, ema39: -128.0, mc_line: [2.4, -16.1],
  new_highs: 33, new_lows: 5,
  ma_breadth: [{ label: '20-Day MA', pct: 56.9 }, { label: '50-Day MA', pct: 48.2 }],
  weinstein_30w_pct: 69.3,
  sector_breadth: [{ name: 'Energy', pct: 100.0 }, { name: 'Health Care', pct: 80.0 }],
  total_scanned: 462, source: ['yfinance_fallback'], timestamp: 'x',
};

// The double-source failure. Note the status code is 200 and the body is a
// truthy object — which is the entire reason `if(bd)` was not a presence check.
const BD_ERR = { error: 'Both data sources failed — check Railway logs', timestamp: 'x' };

const PX_OK = {
  prices: {
    SPY: { price: 772.67, dayPct: -0.47, weekPct: 0.27, monthPct: 3.95, volume: 33285717 },
    QQQ: { price: 729.87, dayPct: -0.16, weekPct: 1.59, monthPct: 4.97, volume: 26102182 },
    IWM: { price: 304.06, dayPct: -0.34, weekPct: 1.02, monthPct: 3.41, volume: 14168427 },
    '^VIX': { price: 15.19, dayPct: 6.6, weekPct: -0.59, monthPct: -19.07, volume: 0 },
  },
  count: 4, source: 'yahoo', errors: null,
};

const SD_OK = {
  timestamp: 'x', total: 5, scanned: 5, failed: 0,
  s1: 0, s2: 3, s3: 1, s4: 1,
  pctStage1: 0.0, pctStage2: 60.0, pctStage3: 20.0, pctStage4: 20.0,
  hostileEnvironment: false, bySubStage: { '2B': 3, '3A': 1, '4B': 1 },
};
const SD_HOSTILE = {
  ...SD_OK, s2: 1, s4: 4, pctStage2: 20.0, pctStage4: 80.0, hostileEnvironment: true,
};
// Nothing classified: every percentage null, the HOSTILE test not evaluated.
const SD_NONE = {
  timestamp: 'x', total: 5, scanned: 0, failed: 5,
  s1: 0, s2: 0, s3: 0, s4: 0,
  pctStage1: null, pctStage2: null, pctStage3: null, pctStage4: null,
  hostileEnvironment: null, bySubStage: {},
};

const SECTIONS = ['breadth', 'vix', 'indexPrices', 'stageDistribution', 'cotSummary',
                  'uwMarketTide', 'uwIV', 'uwFlowAlerts', 'uwDarkPool'];

/** Run the real block against stubbed fetches. `'throw'` simulates an outage. */
async function buildCtx({ bd, px, sd, watchlist = [{ ticker: 'AAPL' }, { ticker: 'MSFT' }],
                          onPost } = {}) {
  const NX = {
    _wlGetData: () => ({ focus: watchlist }),
    async apiFetch(p) {
      if (p.startsWith('/api/market-breadth')) {
        if (bd === 'throw') throw new Error('500 Internal Server Error');
        return bd;
      }
      if (p.startsWith('/api/prices')) {
        if (px === 'throw') throw new Error('500 Internal Server Error');
        return px;
      }
      throw new Error('unexpected GET ' + p);
    },
    async apiPost(p, body) {
      if (onPost) onPost(p, body);
      if (sd === 'throw') throw new Error('500 Internal Server Error');
      return sd;
    },
  };
  const fn = new Function('NX', `return (async()=>{ ${BLOCK} ; return ctx; })()`);
  return await fn(NX);
}

/** What actually reaches the backend: undefined keys do not survive. */
const wire = async (opts) => JSON.parse(JSON.stringify(await buildCtx(opts)));

// ── Healthy payload ─────────────────────────────────────────────────────

test('healthy: every section key is assigned, so nothing can silently vanish', async () => {
  const ctx = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK });
  for (const k of SECTIONS) assert.ok(k in ctx, `missing section key: ${k}`);
});

test('healthy: all 8 breadth sub-keys populate (was 4, one of them misnamed)', async () => {
  const { breadth } = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK });
  assert.equal(breadth.advDecl, '117/343');
  assert.equal(breadth.advDeclRatio, 0.34);
  assert.equal(breadth.newHighsLows, '33/5');
  assert.equal(breadth.trin, 0.83);
  // The regression: bd.mcclellan is undefined on every real response.
  assert.equal(breadth.mcclellan, -60.2);
  assert.equal(breadth.summation, -3886.0);
  assert.equal(breadth.aboveMA[0].label, '20-Day MA');
  assert.equal(breadth.aboveMA[0].pct, 56.9);
  assert.equal(breadth.sectorBreadth[0].name, 'Energy');
});

test('healthy: vix is sent, with dayPct renamed to the dayChange ai.py reads', async () => {
  const { vix } = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK });
  assert.deepEqual(vix, { price: 15.19, dayChange: 6.6 });
});

test('healthy: indexPrices is the exact shape ai.py reads, and excludes ^VIX', async () => {
  const { indexPrices } = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK });
  assert.deepEqual(indexPrices, {
    SPY: { price: 772.67, dayPct: -0.47 },
    QQQ: { price: 729.87, dayPct: -0.16 },
    IWM: { price: 304.06, dayPct: -0.34 },
  });
});

test('healthy: stageDistribution carries the keys the prompt builder reads', async () => {
  const ctx = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK });
  for (const k of ['total', 's1', 's2', 's3', 's4', 'pctStage2', 'pctStage4']) {
    assert.ok(k in ctx.stageDistribution, `missing: ${k}`);
  }
  // The >=60% verdict is computed server-side beside the classifier and
  // forwarded, never recomputed here — two copies of the rule would drift.
  assert.equal(ctx.hostileEnvironment, false);
});

// ── The failure envelope ────────────────────────────────────────────────

test('the {"error":…} envelope is rejected, not read as data', async () => {
  const ctx = await wire({ bd: BD_ERR, px: PX_OK, sd: SD_OK });
  assert.equal(JSON.stringify(ctx).includes('undefined'), false,
    'the literal string "undefined" reached the payload');
  // Empty, not partial: AI-7 renders a MISSING header for an empty section.
  assert.deepEqual(ctx.breadth, {});
});

test('a breadth failure does not take the rest of the payload down with it', async () => {
  const ctx = await wire({ bd: BD_ERR, px: PX_OK, sd: SD_OK });
  assert.equal(ctx.vix.price, 15.19);
  assert.equal(ctx.stageDistribution.total, 5);
});

// ── Outages ─────────────────────────────────────────────────────────────

test('a failed payload is never QUIETER than a successful one', async () => {
  // The early-return edge: ctx must stay non-empty so every absent section
  // gets a MISSING header instead of the whole block being skipped.
  const ctx = await wire({ bd: 'throw', px: 'throw', sd: 'throw' });
  for (const k of SECTIONS) assert.ok(k in ctx, `missing section key: ${k}`);
  assert.ok(Object.keys(ctx).length >= SECTIONS.length);
  assert.equal(JSON.stringify(ctx).includes('undefined'), false);
});

test('each fetch fails independently', async () => {
  const noBreadth = await wire({ bd: 'throw', px: PX_OK, sd: SD_OK });
  assert.deepEqual(noBreadth.breadth, {});
  assert.equal(noBreadth.vix.price, 15.19);

  const noPrices = await wire({ bd: BD_OK, px: 'throw', sd: SD_OK });
  assert.deepEqual(noPrices.vix, {});
  assert.deepEqual(noPrices.indexPrices, {});
  assert.equal(noPrices.breadth.trin, 0.83);

  const noStage = await wire({ bd: BD_OK, px: PX_OK, sd: 'throw' });
  assert.deepEqual(noStage.stageDistribution, {});
  // No verdict is better than a fabricated one.
  assert.ok(!('hostileEnvironment' in noStage));
});

// ── Partial data ────────────────────────────────────────────────────────

test('an absent breadth key is omitted, never nulled or placeheld', async () => {
  const bd = { ...BD_OK };
  delete bd.trin;
  bd.mcclellan_oscillator = null;   // upstream can legitimately send null
  const { breadth } = await wire({ bd, px: PX_OK, sd: SD_OK });
  assert.ok(!('trin' in breadth));
  assert.ok(!('mcclellan' in breadth));
  assert.equal(breadth.summation, -3886.0);   // neighbours unaffected
});

test('half a pair is absent, never "117/undefined"', async () => {
  const bd = { ...BD_OK };
  delete bd.declining;
  const { breadth } = await wire({ bd, px: PX_OK, sd: SD_OK });
  assert.ok(!('advDecl' in breadth));
  assert.equal(breadth.newHighsLows, '33/5');
});

// ── Stage distribution edges ────────────────────────────────────────────

test('a hostile verdict is forwarded intact', async () => {
  const ctx = await wire({ bd: BD_OK, px: PX_OK, sd: SD_HOSTILE });
  assert.equal(ctx.hostileEnvironment, true);
  assert.equal(ctx.stageDistribution.pctStage4, 80.0);
});

test('an unevaluated scan forwards null, never a benign-looking zero', async () => {
  const ctx = await wire({ bd: BD_OK, px: PX_OK, sd: SD_NONE });
  assert.equal(ctx.stageDistribution.pctStage4, null);
  // null, not false: "not evaluated" and "evaluated, not hostile" are
  // different claims, and ai.py states the difference to the model.
  assert.equal(ctx.hostileEnvironment, null);
});

test('an empty watchlist sends no scan rather than a fabricated one', async () => {
  const ctx = await wire({ bd: BD_OK, px: PX_OK, sd: SD_OK, watchlist: [] });
  assert.deepEqual(ctx.stageDistribution, {});
  assert.equal(ctx.breadth.trin, 0.83);
});

test('a watchlist over the 100-ticker cap is sliced before the call', async () => {
  // ScanRequest caps at 100; without the slice the whole call 422s at the
  // model boundary and the section goes missing for an avoidable reason.
  let sent = null;
  await buildCtx({
    bd: 'throw', px: 'throw', sd: SD_OK,
    watchlist: Array.from({ length: 150 }, (_, i) => ({ ticker: 'T' + i })),
    onPost: (_p, body) => { sent = body.tickers; },
  });
  assert.equal(sent.length, 100);
});

test('watchlist tickers are de-duplicated across categories', async () => {
  let sent = null;
  await buildCtx({
    bd: 'throw', px: 'throw', sd: SD_OK,
    watchlist: [{ ticker: 'AAPL' }, { ticker: 'AAPL' }, { ticker: 'MSFT' }, null],
    onPost: (_p, body) => { sent = body.tickers; },
  });
  assert.deepEqual(sent, ['AAPL', 'MSFT']);
});
