# trading-hashira — SPY Logic parity with APEX

**Regenerated 2026-07-26.** The original was lost in transit. This is rebuilt from the
work as actually performed on `feat/spy-logic-apex-parity`, so it documents what shipped
rather than what was planned. Companion: [`sl-structure-client-patch.md`](./sl-structure-client-patch.md).

---

## 1. The rule being ported

> The weekly structural tag is the **frame**; the intraday read is the **trade**.
> A read that fights the tag is a **scalp with a shelf life**, not a trend.

From the 07/24 review: 74.2% win rate — best ever — and still −$83.40, because three
trades were 76% of gross loss. Sizing is no longer the leak; **stops are**. The governor
degrades the plan automatically when a read fights structure, instead of relying on
remembering mid-tape.

---

## 2. Why this is a transplant, not a module port

Hashira is **not React**. No `package.json`, no `src/` — one ~420KB `index.html` with a
single inline `<script>` and one `const NX = {…}` object literal (opens ~1083, closes
~4581). Same shape as APEX.

So `spy-governor-core.js` is **not** used here. That module is the port target for the
React app (nexus). Here the correct move is transplanting APEX's inline `SL_*` block,
which already matches hashira's shape. Identifiers stay in the `sl`/`SL_` namespace
exactly as in APEX so the two inline implementations stay diffable.

Before: `grep -c "SL_" index.html` → **0**. After: **27**.

### 2.1 Correction (2026-08-02): "diffable" holds for the GOVERNOR, not the ENGINE

The claim above — that the shared `sl`/`SL_` namespace keeps the two inline implementations diffable — is **only true of the governor half**, and reading it as a whole-file guarantee is what nearly caused a bad port.

| | hashira | APEX |
|---|---|---|
| Governor block | `sl`/`SL_` namespace | `sl`/`SL_` namespace — **diffable** |
| Directional read | `NX.spyDirectionalBias(s)`, a method on the `NX` object literal | `function slDirectionalRead(inp)`, top level — **not diffable** |
| Gate entry point | `NX.evaluateSetup(s)` | `slRunGate(inp)` |
| Panel state | *(none)* | `SL_STATE` |

The engine halves share no symbol, no call shape and no parameter name. `spy-logic/parity.mjs` bakes the APEX side of this in: its extraction anchors are `const SL_STATE = {` and `slRunGate`, **neither of which exists in this repo**, so pointing it here has never verified hashira's runtime — it compares APEX's inline block against `spy-governor-core.js`, a module nothing here executes. `spy-logic/inline-parity.mjs` exists to cover the gap and carries an ordered anchor list for exactly this reason.

**`SL_SCENARIOS` is a false friend.** In APEX it is the three static playbook **cards** (`['SCENARIO A','red',title,body]`). It is *not* the scenario registry. The registry is **`SL_READS`** in both repos, deliberately named apart so the two never collide.

### 2.2 Blockers for `evaluateSetup`-level parity

The reads now match by enumeration (108/108, full `{dir,label,note}` triple). The **gate return shapes still do not**, and these are the outstanding items:

- **`maxLots`** — nexus sets `stops.maxLots = SL_MAX_LOTS`; hashira's `stops` has no such key, so the panel cannot render a lot cap and any consumer reading it gets `undefined`.
- **`struct` on the return** — hashira's `evaluateSetup` returns `struct`; nexus's does not, exposing the structural tag through `governor` instead.

Both predate the scenario-selector work and were left alone rather than widening that port's blast radius. Until they are reconciled, cross-terminal parity is verifiable at the *read* level and at the *governor* level, but **not** at the `evaluateSetup` level — there is no harness that could assert it, because the objects are not the same shape.

---

## 3. What hashira already had

| Piece | State before |
|---|---|
| 8 tape inputs (`#spy-opening` … `#spy-window`) | present, ~line 717 |
| 4 AI providers | present |
| Gate engine `NX.evaluateSetup()` | present, with a `worsen()` ratchet |
| `CURRENT STANCE` line | present, ~line 558 |
| Supply Map zone seeding | **already present** (commit `555ff23`) |
| Governor | absent — the whole gap |

Note the zone seeding: `555ff23` already derived zones from the live 5-day range with
math character-for-character identical to APEX's `slDeriveZones()`. The stale `560–563`
strings were only the **hardcoded `value=` attributes** on the three inputs — what paints
before the fetch resolves, and what persists if it fails.

---

## 4. Transplant steps

1. **Constants.** `SL_STRUCTURE`, `SL_STOP`, `SL_SCALP_TIME`, `SL_COLORS`, inserted at
   top level immediately after the `NX` object literal closes. APEX's palette is
   `--bull/--bear/--warn`; hashira's is `--green/--red/--amber` — remap, don't import.

2. **Inputs.** The governor needs live spot and live VIX or it correctly refuses to claim
   a stage. Cache both:
   - `NX._spyLive = d` in `loadSPYLogic()`, off `GET /api/spy-logic`.
   - `NX._vix` in `refreshTickerBar()`, off `GET /api/market-data/%5EVIX` — the ticker
     strip already fetches it and threw it away.

3. **Governor.** `slStructure()` and `slApplyGovernor()`, applied inside
   `evaluateSetup()` through the **existing** `worsen()` helper:

   ```js
   const G = slApplyGovernor(bias, stops, reasons, w, worsen);
   ```

   The governor may only make a read worse. Every pre-existing NO-GO rule — opening
   auction, closing pin, pinched ribbon, ribbon/direction conflict — still dominates.

4. **UI.** Three additions:
   - governor badge beside the gate badge;
   - structure bar above `CURRENT STANCE` (`#spy-structure-bar`), rendering the level
     ladder even when unverified — those are static facts, not a stage claim;
   - **HARD STOP card** (`#spy-stop-prem`, `#spy-stop-qty`, `#spy-stop-out`) wired to
     `slStopCalc()`, plus a `slStopCalc()` call in `runSPYLogic()`.

   The stop card is the one that changes behaviour at the desk. It was missed on the
   first pass — `slStopCalc()` shipped as dead code with no UI and no call site — and
   fixed in `51ec95c`. If you port this anywhere else, do the stop card first.

5. **Zones.** Route seeding through `slDeriveZones()` and replace the hardcoded
   `value="560–563"` / `"555–557"` / `"548–550"` attributes with a neutral `—`
   placeholder, so a false level can never paint.

---

## 5. Held deliberately

The structure fetch is **not** in the transplant commits. `SL_STRUCTURE` is a baked
constant until `sl-structure-client-patch.md` is applied against a live endpoint
returning `degraded:false`. Until then this branch *is* the second copy the endpoint
exists to eliminate, and should not merge.

---

## Verification

Run against live data, not fixtures. Report observed output — not a pass you didn't run.

1. **Zones.** Rendered `#spy-z1/2/3` strings match `slDeriveZones()` on the *same*
   payload, and none reads in the 500s.
   Observed (SPY 738.86, 5d 735.21–750.02): `747–750` / `741–744` / `735–738`.

2. **Structure bar.** Real tag, live SPY, live VIX, three ladder rows with ABOVE/BELOW
   and distances. If it reads STRUCTURE UNVERIFIED, `NX._vix` is not being set — that is
   the VIX wiring, not a governor bug.
   Observed: `WEEKLY STAGE 2 — WEAKENING`, verified, at SPY 738.86 / VIX 18.58.

3. **Counter-structural.** Force a SHORT read while the tag is LONG → governor
   `COUNTER-STRUCTURAL — SCALP ONLY`, gate CAUTION not GO, halved time stop, no runner.
   Observed: `gate=CAUTION`, `8-10 min`, `runner=false`.

4. **With-structure.** Force a LONG read → `WITH-STRUCTURE`, GO reachable, runner back.
   Observed: `gate=GO`, `15-20 min`, `runner=true`.

5. **Pre-existing rules still dominate.** LONG read + pinched ribbon → `NO-GO`, not
   CAUTION. Observed: `NO-GO`.

6. **Unverified.** Remove VIX → `STRUCTURE UNVERIFIED`, governor off, gate floored at
   CAUTION, no stage label. Observed: `mode=unverified`, `gate=CAUTION`.

7. **Hard stop.** Entry `0.68`, lots `1` → `STOP $0.51 · max loss $17 on 1 lot` (replays
   07/24 T28). Lots `3` → `… $51 on 3 lots · at 3-lot cap`. Lots `9` → clamps to 3.

8. **Cross-terminal drift.** APEX inline, hashira inline, `spy-governor-core.js` and the
   backend baked default must all carry the same level triple.
   Observed: all four at `2026-07-26 / 743.91 / 735.21 / 722.54`.

9. **Parity.** `node parity.mjs <APEX index.html> <spy-governor-core.js>` → clean, exit 0.

Deploys via Vercel (`vercel.json`), not GitHub Pages. Before browser testing, clear
`localStorage.nexus_api_base` — a stale preview URL silently overrides the default.
