# NOTE: Wanda value inconsistency between OVERVIEW tab and STAGE dashboard header

**Status:** open · not blocking · observed 2026-05-02
**Symptom:** Same symbol (MRVL) shows two different Wanda composite values in two places on the same screen:
- STAGE dashboard top-right header → `WANDA 75`
- OVERVIEW tab Strength Profile panel → `Wanda 59`

Two code paths disagree. Pick one, kill the other.

## Where the two values come from

| Location | File | Line (approx) | Source |
|---|---|---|---|
| STAGE dashboard header `WANDA` tile | `trading-hashira/index.html` | ~1946 | `(d.wanda \|\| {}).composite` from stage-detail payload |
| OVERVIEW tab Strength Profile headline | `trading-hashira/index.html` | ~2005 (via `coerceRs(d, aByName)` at ~1991) | same `d.wanda.composite` field |
| WANDA tab full breakdown | `trading-hashira/index.html` | ~2042 | `d.wanda.components` from same payload |

If both panels read `d.wanda.composite` from the same `d` object they MUST agree. The fact that they don't means one of:

1. **Different fetches.** The header may be hydrated by an earlier scan / cached scanner result (which client-computes Wanda via `calcWANDA()` in App.jsx) while the OVERVIEW tab pulls a fresh `/api/research/stage-scan` (server-computed Wanda from `nexus-terminal-repo/nexus-backend/api/research_core/...`). The two calculators do not necessarily agree.
2. **Stale render.** Header reuses `NX._stageData` from a previous symbol while the OVERVIEW tab re-renders against fresh data.
3. **Server endpoint divergence.** Two different backend routes return Wanda computed with slightly different inputs (e.g. different lookback windows, different price series).

## How to investigate

1. Load MRVL on the STAGE page with DevTools → Network. Capture every request that returns a `wanda` field.
2. Compare the `wanda.composite` values in each response. If they differ, the two backend endpoints disagree → fix in `nexus-terminal-repo` (authoritative backend per memory note).
3. If they agree, the bug is purely client-side rendering / state. Likely a stale-`d` reference in the dashboard header rebuild path.

## Suggested fix shape

Whichever direction the investigation points:
- Backend: have one canonical Wanda endpoint and have the scanner re-use it instead of client-computing.
- Frontend: derive both displays from the same `coerceRs(d).wanda` so they cannot diverge.

## Owner / next step

Najee. Pick up after the APEX port lands.
