# SL_STRUCTURE — client wiring patch

**Regenerated 2026-07-26.** The original was lost in transit; this is rebuilt from the
shipped endpoint (`nexus-terminal`, `api/spy_logic_router.py`) and the transplanted
governor in `index.html`. Where the two disagree, the code wins — check it, don't trust
this document.

Applies to: `trading-hashira/index.html`. Landed on `main` via `bb5ecca` (PR #2); the
branches this doc originally named (`feat/spy-logic-apex-parity`,
`feat/sl-structure-fetch-wiring`) are both merged and deleted.
Same shape applies to APEX and nexus; the response contract is shared by all three —
**those two are still unwired and this doc remains live for them.**

---

## 1. What this changes — IMPLEMENTED 2026-07-26

> **Status: landed. This section is history, not a constraint.**
> An earlier draft of §1 read *"Do not merge the parity branch without this."* That is
> **obsolete** — it was overtaken by the actual rollout and contradicted `main` for the
> window between the two merges. Do not treat it as a live gate.

`SL_STRUCTURE` was a baked constant in `index.html` — the second of three independent
copies the endpoint exists to eliminate, since re-anchoring the weekly levels meant
editing three frontends instead of one Railway env var.

The panel now seeds `SL_STRUCTURE` from `GET {NEXUS_API}/api/spy-logic/structure` and
keeps the baked constant as a fallback.

### What actually shipped

Two PRs, deliberately sequenced rather than bundled:

| PR | Commit | What landed |
|---|---|---|
| #1 | `60cec27` | Parity branch, merged **with the baked constant intact** |
| #2 | `bb5ecca` | This patch — fetch wiring, provenance badge, client-side validation |

The baked constant was **not** drift in #1. It is the designed fallback, and it stays in
the file after #2: every failure path (endpoint unreachable, payload rejected, malformed
`asOf`, inverted triple) falls back to it and labels the bar amber. Shipping the governor
against it for the gap between the two merges was a deliberate, authorized call, not an
oversight — the governor was already correct on those levels, and the fetch only changes
*where they come from*, never whether a stage is claimed.

Re-anchoring is now **by env var, not by editing the constant in code**. Set
`SPY_STRUCTURE_JSON` on the Railway service; the client picks it up on the next panel
load. Editing the baked triple in `index.html` is no longer the re-anchor path — it only
moves the fallback.

---

## 2. Response contract

`GET /api/spy-logic/structure` → always `200`, `Cache-Control: public, max-age=300`.

```json
{
  "asOf": "2026-07-26",
  "reclaim": 743.91,
  "support": 735.21,
  "flip": 722.54,
  "staleDays": 10,
  "vixFragile": 25,
  "source": "Weekly 30-wk SMA rising; levels from the 07/24 review.",
  "revision": "2026-07-26.1",
  "hash": "sha256:f3f4b477…",
  "ageDays": 0,
  "stale": false,
  "degraded": true,
  "degradedReason": "SPY_STRUCTURE_JSON not set — serving baked default"
}
```

The endpoint **never** returns a non-200 for a bad config. A missing or malformed
`SPY_STRUCTURE_JSON` degrades to the server's own baked default with `degraded: true`
and a human-readable `degradedReason`. `degraded: true` is a *state to display*, not an
error to retry.

`hash` covers `asOf` + the level triple only — editing `source` prose does not move it.

---

## 3. Validation before adopting a payload

Never adopt levels you have not checked. The endpoint validates server-side, but the
client is the last line before a bad triple silently inverts the structural tag.

```js
function slValidStructure(d) {
    if (!d || typeof d !== 'object') return false;
    for (const k of ['reclaim', 'support', 'flip']) {
        if (typeof d[k] !== 'number' || !isFinite(d[k]) || d[k] <= 0) return false;
    }
    // Ordering is the invariant the governor depends on.
    // WRITE THIS AS TWO COMPARISONS JOINED BY &&.
    //
    //   d.flip < d.support < d.reclaim        <-- WRONG in JavaScript
    //
    // JS has no chained relational operators. That expression evaluates
    // left-to-right as ((d.flip < d.support) < d.reclaim), i.e. a boolean
    // coerced to 0 or 1 and compared against d.reclaim — which is true for
    // any plausible SPY price regardless of the actual ordering. The check
    // would pass on inverted levels, which is the one thing it exists to
    // catch. (Python chains; JavaScript does not. The server-side version of
    // this check in spy_logic_router.py IS a legitimate Python chain — do not
    // "fix" it to match this.)
    if (!(d.flip < d.support && d.support < d.reclaim)) return false;
    if (typeof d.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.asOf)) return false;
    return true;
}
```

A payload that fails validation is discarded entirely — keep the baked constant, and
label the bar as fallback. Do not merge a partially-valid payload.

---

## 4. Wiring

`SL_STRUCTURE` is currently `const`. Change it to `let` and add a source marker:

```js
let SL_STRUCTURE = { …baked… };
let SL_STRUCTURE_SOURCE = { kind: 'baked', label: 'BAKED', detail: 'endpoint not consulted yet' };
```

Then, alongside the other panel loaders:

```js
async function slFetchStructure() {
    try {
        const d = await NX.apiFetch('/api/spy-logic/structure');
        if (!slValidStructure(d)) {
            SL_STRUCTURE_SOURCE = { kind: 'rejected', label: 'BAKED — payload rejected',
                                    detail: 'endpoint returned levels that failed validation' };
            return;
        }
        SL_STRUCTURE = {
            asOf: d.asOf, reclaim: d.reclaim, support: d.support, flip: d.flip,
            staleDays: d.staleDays, vixFragile: d.vixFragile, source: d.source
        };
        SL_STRUCTURE_SOURCE = d.degraded
            ? { kind: 'degraded', label: 'SERVER — DEGRADED',
                detail: d.degradedReason || 'server served its baked default' }
            : { kind: 'live', label: 'SERVER', detail: 'revision ' + d.revision };
    } catch (e) {
        SL_STRUCTURE_SOURCE = { kind: 'unreachable', label: 'BAKED — endpoint unreachable',
                                detail: String(e && e.message || e) };
    } finally {
        slRenderStructure();   // repaint in place, whatever the outcome
    }
}
```

**Never block first render on this fetch.** Call it *after* the panel has drawn:

```js
// in loadSPYLogic(), after NX.runSPYLogic():
slFetchStructure();          // no await — panel is already on screen
```

The panel draws immediately with the baked constant and upgrades in place when the
response lands. A hung endpoint must degrade to a stale-but-correct panel, never to a
blank one.

---

## 5. Labelling in the structure bar

`slRenderStructure()` already prints `SL_STRUCTURE.source` on its last line. Append the
provenance so the desk can always tell which levels are on screen:

```js
+ '<span style="margin-left:8px;color:' +
  (SL_STRUCTURE_SOURCE.kind === 'live' ? 'var(--text-dim)' : 'var(--amber)') + '">'
+ slEsc(SL_STRUCTURE_SOURCE.label) + '</span>'
```

Anything other than `live` renders amber. A trader glancing at the bar should never have
to wonder whether the levels are current.

---

## Verification

Five states. Report the structure-bar badge text for each.

| # | Setup | Expect |
|---|---|---|
| 1 | Endpoint live, `SPY_STRUCTURE_JSON` set and valid | `SERVER` · levels match the env var · `degraded:false` |
| 2 | Endpoint live, `SPY_STRUCTURE_JSON` **unset** | `SERVER — DEGRADED` · server's baked levels · reason names the missing var |
| 3 | Endpoint blocked in devtools (Network → block request URL) | `BAKED — endpoint unreachable` · panel still fully rendered |
| 4 | Endpoint returns inverted levels (`flip > support`) | `BAKED — payload rejected` · baked levels retained |
| 5 | Throttle to Slow 3G, watch first paint | Panel renders with baked levels **before** the response lands, then upgrades in place |

States 3 and 4 are the ones that matter — they are the paths where a naive
implementation shows a blank panel or, worse, adopts inverted levels and silently
flips every structural tag.

Before testing anything in the browser, clear `localStorage.nexus_api_base`. A stale
preview URL there silently overrides the default and you will be testing the wrong
backend.
