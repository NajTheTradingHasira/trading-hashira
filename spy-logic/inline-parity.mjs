/**
 * INLINE PARITY — does the block that actually runs match the module?
 * ---------------------------------------------------------------
 *   node inline-parity.mjs [path-to-index.html] [path-to-spyScenarios.js]
 *
 * WHY THIS EXISTS, given parity.mjs already exists.
 *
 * parity.mjs compares APEX's inline block (argv[2], extracted from HTML and
 * evaluated) against a MODULE (argv[3], imported). Point it at this repo and
 * "APEX vs hashira" measures APEX's runtime against hashira's spy-governor-core.js
 * — a parity ARTIFACT that nothing in this repo executes. hashira's own
 * index.html is never loaded by it, and its anchors (`const SL_STATE = {`,
 * slRunGate) are APEX-only and absent here.
 *
 * So the block that actually runs in this repo has never been verified against
 * anything. This closes that.
 *
 * WHAT IT CHECKS.
 *
 * The directional read is an ORDERED sequence of overlapping conditions, and
 * order is the only thing that disambiguates them:
 *
 *   (above, holding, strong, higherlow)  matches BUY PULLBACKS *and* BULLISH LEAN
 *   (inside, lost,   weak,   none)       matches FAILED BREAKOUT *and* REDUCE SIZE / WAIT
 *
 * In each case the earlier branch wins purely by position. A hand-transcribed
 * ordered array is exactly where a precedence slip hides, and the failure is
 * silent: the panel keeps printing a plausible label, just the wrong one.
 * Reviewing the transcription by eye cannot catch that. Enumeration can.
 *
 * So: run all 4x3x3x3 = 108 input combinations through the INLINE code and
 * through the module, and require the full {dir, label, note} triple to match
 * on every one. The triple, not the label — transcribing POTENTIAL REVERSAL as
 * dir:'LONG' changes no label, yet it flips a CAUTION into a GO downstream.
 *
 * It passes BEFORE the registry port too, and that is deliberate: the registry
 * was built to reproduce the legacy if-chain exactly, so a green run now is the
 * baseline that makes a red run after the port meaningful.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const htmlPath = process.argv[2] || '../index.html';
const modPath  = process.argv[3] || './spyScenarios.js';

if (!fs.existsSync(htmlPath)) { console.error('index.html not found: ' + htmlPath); process.exit(1); }

const mod = await import(pathToFileURL(path.resolve(modPath)).href);
const html = fs.readFileSync(htmlPath, 'utf8');

// ── extract the inline read ──────────────────────────────────
// Anchored on the method name, not on line numbers, and brace-balanced rather
// than regex-terminated so the anchor survives the body being rewritten from an
// if-chain into a registry lookup. That stability is the point: the same guard
// has to bracket the port on both sides.
const ANCHOR = 'spyDirectionalBias(s){';
const at = html.indexOf(ANCHOR);
if (at < 0) { console.error('anchor not found: ' + ANCHOR); process.exit(1); }

function balancedFrom(src, openIdx) {
    let depth = 0, i = openIdx, q = null;
    for (; i < src.length; i++) {
        const c = src[i], p = src[i - 1];
        if (q) { if (c === q && p !== '\\') q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}
const openIdx = at + ANCHOR.length - 1;
const closeIdx = balancedFrom(html, openIdx);
if (closeIdx < 0) { console.error('unbalanced braces after anchor'); process.exit(1); }
const body = html.slice(openIdx + 1, closeIdx);

// If the port lands a registry inline, pull it in — along with everything it
// depends on. Extracting SL_SCENARIOS alone is not enough: the array literal
// references SL_EXIT_POLICY, and the read calls slSelectScenario, which calls
// slRunnerEligible. Missing any of them is a ReferenceError at eval, not a
// silent pass, so the failure is loud — but the dependency list has to be
// maintained alongside the port.
function extractDecl(src, header, open, close) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const o = src.indexOf(open, at);
    if (o < 0) return null;
    let depth = 0, q = null;
    for (let i = o; i < src.length; i++) {
        const c = src[i], p = src[i - 1];
        if (q) { if (c === q && p !== '\\') q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    return null;
}

const DEPS = [
    ['const SL_EXIT_POLICY', '{', '}'],
    ['function slRunnerEligible', '{', '}'],
    ['const SL_SCENARIOS', '[', ']'],
    ['function slSelectScenario', '{', '}'],
];
let prelude = '', found = [];
for (const [header, o, c] of DEPS) {
    const chunk = extractDecl(html, header, o, c);
    if (chunk) { prelude += chunk + ';\n'; found.push(header.split(' ').pop()); }
}

// Whatever the read actually references must have been extracted, or the run is
// meaningless. Check by name rather than trusting the list above to be current.
for (const sym of ['SL_SCENARIOS', 'slSelectScenario', 'SL_EXIT_POLICY', 'slRunnerEligible']) {
    if (new RegExp('\\b' + sym + '\\b').test(body + prelude) && !new RegExp('\\b' + sym + '\\b').test(prelude)) {
        console.error('the inline read reaches ' + sym + ' but it could not be extracted from the HTML');
        process.exit(1);
    }
}

// eslint-disable-next-line no-eval
const inlineBias = (0, eval)('(function(){' + prelude + 'return function(s){' + body + '};})()');

// ── enumerate ────────────────────────────────────────────────
const OPENING = ['above', 'below', 'inside', 'gapdown'];
const VWAP = ['holding', 'lost', 'chop'];
const INTERNALS = ['strong', 'weak', 'mixed'];
const RETEST = ['higherlow', 'lowerhigh', 'none'];

let n = 0, fail = 0;
const seen = new Set();
console.log('inline source: ' + htmlPath);
console.log('module:        ' + modPath);
console.log("registry inline:  " + (prelude ? "yes — extracted with deps: " + found.join(", ") : "no (pre-port if-chain)"));
console.log('');

for (const opening of OPENING) for (const vwap of VWAP)
for (const internals of INTERNALS) for (const retest of RETEST) {
    const s = { opening, vwap, internals, retest };
    n++;
    const a = inlineBias(s);
    const scenario = mod.selectScenario(s);
    const b = { dir: scenario.dir, label: scenario.label, note: scenario.note };
    seen.add(scenario.id);
    const A = JSON.stringify({ dir: a.dir, label: a.label, note: a.note });
    const B = JSON.stringify(b);
    if (A !== B) {
        fail++;
        if (fail <= 8) {
            console.log('  ✗ ' + JSON.stringify(s));
            console.log('      inline: ' + A);
            console.log('      module: ' + B);
        }
    }
}

// Every scenario reachable, so a slip that makes one unreachable is caught too —
// an unreachable branch produces no mismatch on its own.
const missing = mod.SPY_SCENARIOS.map(x => x.id).filter(id => !seen.has(id));

console.log('');
if (fail === 0 && missing.length === 0) {
    console.log('✓ inline parity clean — ' + n + '/108 combinations, full {dir,label,note} triple');
    console.log('  all ' + seen.size + ' scenarios reachable');
    process.exit(0);
}
if (missing.length) console.log('✗ unreachable scenarios: ' + missing.join(', '));
if (fail) console.log('✗ ' + fail + ' of ' + n + ' combinations disagree');
process.exit(1);
