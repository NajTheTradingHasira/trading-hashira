# Base Analyzer — Ascending Base + HTF Detection + Consistency Fix

## Problem Statement

The Base Analyzer (in Trade Tools) produces inconsistent results for the same ticker:
- Nexus sometimes returns "No valid bases detected" for COHR
- APEX Trade Tools returns 9 bases, Base 9 = generic "Base", 5W wide, 28.2% depth, pivot $300.20, vol dry-up 109%
- Nexus on a second run returns 9 bases, Base 9 = "Double Bottom", 7W wide, 30.7% depth, pivot $310.98, vol dry-up 56%

The root cause is twofold:
1. **Missing pattern type**: COHR is an ascending channel / high tight flag — price drifts higher in a tight channel instead of correcting sideways. The current algorithm requires a price correction (10–30% drop) to anchor a base start, so it either rejects the pattern entirely or misclassifies it.
2. **Non-deterministic base start anchor**: Width, depth, pivot, and vol dry-up calculations diverge because the "start of base" detection window is ambiguous for ascending structures.

## Repo Context

- **nexus-terminal** is the authoritative backend (Railway deploys from it). ALL base detection logic changes go here FIRST.
- **trading-hashira** is the frontend (GitHub Pages). Sync changes to it AFTER nexus-terminal is confirmed working.
- The base analyzer is in the Trade Tools section. Find the file(s) by searching for: `detectBases`, `baseAnalyzer`, `findBases`, `BasePattern`, `pivotPoint`, `buyZone`, or the string `"No valid bases detected"`.
- Data source: Yahoo Finance (live mode) via the existing fetch pipeline. The analyzer works on weekly OHLCV bars.

## Changes Required — In Priority Order

### 1. Ascending Base Detection (NEW pattern type)

Add `"Ascending Base"` to the list of recognized base patterns (alongside Cup, Cup-with-Handle, Flat Base, Double Bottom, 3-Weeks-Tight, Base).

**Detection logic:**

```
IF all of the following are true:
  - Price > 10-week SMA throughout the consolidation window
  - Slope of 10-week SMA > 0 (still rising during consolidation)
  - ATR (Average True Range) is DECREASING over the consolidation window
    (i.e., weekly candle ranges are getting tighter)
  - At least 3 pullbacks within the window, each with a HIGHER LOW than the previous
  - Max drawdown from the swing high < 20%
  - Duration >= 3 weeks
THEN classify as "Ascending Base"
```

**Pivot point for Ascending Base**: The highest weekly close within the pattern (the upper channel line), NOT the base high in the traditional sense.

**Buy zone**: Pivot to pivot + 5% (standard O'Neil rule still applies).

**Vol dry-up**: Measure volume contraction toward the RIGHT side of the pattern. Compare avg volume of the last 2 weeks of the pattern vs. the first 2 weeks. A ratio < 0.75 (25%+ contraction) confirms the base.

### 2. High Tight Flag (HTF) Detection (NEW pattern type)

Add `"High Tight Flag"` to recognized patterns.

**Detection logic — two phases:**

Phase 1 — Power Pole:
```
IF Price Change > 80% within a lookback window of 4–12 weeks
THEN flag the pole. Record pole_start_price, pole_end_price, pole_slope, pole_duration.
```

Phase 2 — Flag:
```
IF after the pole:
  - Max drawdown from pole high < 25%
  - Flag duration >= 3 weeks and <= 8 weeks
  - Flag stays within a narrow channel (width of flag range < 25% of pole range)
THEN classify as "High Tight Flag"
```

**Ascending HTF variant**: If `flag_slope > 0` but `flag_slope < pole_slope`, it's an ascending HTF. Tag it as `"High Tight Flag (Ascending)"`. This is the COHR pattern.

**Pivot**: Pole high (the swing high before the flag starts).

**Vol dry-up**: Same right-side contraction check as Ascending Base.

### 3. Volume Dry-Up as Primary Confirmation for Shallow Patterns

Current logic likely gates on price depth first (requires X% correction to start a base). For ascending structures, flip the priority:

```
IF candidate_base_depth < 15%:
  # Shallow pattern — use volume dry-up as primary confirmation
  IF vol_dryup_ratio < 0.75:
    # Volume contracted 25%+ from left side to right side → VALID base
    ACCEPT the pattern
  ELSE:
    REJECT — not enough evidence of institutional accumulation
ELSE:
  # Standard depth — use existing logic (depth + vol confirmation together)
  ... existing code ...
```

This prevents the analyzer from rejecting valid ascending structures just because the price correction is shallow.

### 4. Deterministic Base Start Anchor

The divergent measurements (5W vs 7W, 28.2% vs 30.7%) come from inconsistent anchor logic. Enforce a SINGLE rule:

```
base_start = the FIRST weekly bar where ANY of:
  (a) Weekly close drops >= 5% below the prior swing high
      (standard correction start)
  OR
  (b) ATR contracts below the 10-week ATR average AND price is within 10%
      of the swing high
      (ascending base start — volatility contraction, not price drop)

Once base_start is set, it is LOCKED. Do not recalculate on subsequent runs
unless new weekly bars extend the pattern.
```

This ensures APEX and Nexus produce identical width/depth/pivot even if run at different times, as long as they have the same bar data.

### 5. Base Count and Late-Stage Warning

The current analyzer already flags "late-stage — caution" for high base counts. Make sure the Ascending Base and HTF types are included in the base count:

```
IF base_number >= 4 AND pattern_type in ("Ascending Base", "High Tight Flag"):
  label += " (late-stage cheat — elevated risk)"
```

The "cheat area" / "high handle" pattern where institutions bid up the consolidation is inherently late-stage and should carry an extra caution flag.

## Data Consistency Audit

After implementing the above, run this diagnostic:

1. Fetch COHR weekly OHLCV data (live, Yahoo Finance)
2. Log the number of weekly bars returned
3. Run the base analyzer
4. Log: number of bases found, and for each base: type, width, depth, pivot, buy zone, base low, stop loss, vol dry-up %
5. Print all of this to the browser console

Then repeat from the other app (APEX or Nexus, whichever wasn't just tested). Compare:
- Are the same number of weekly bars being loaded?
- Are the results identical?

If the bar counts differ, find where the lookback period is set and unify it across both apps. The default should be **104 weeks (2 years)** of weekly data.

## Testing Checklist

After implementation, verify these tickers and expected behaviors:

- [ ] **COHR**: Should detect an Ascending Base or HTF (Ascending) in the most recent consolidation. Pivot should be near the channel high (~$300–310 area). Should NOT return "No valid bases detected."
- [ ] **NVDA**: Run to confirm no regressions — existing Cup/Flat Base/Double Bottom detection still works.
- [ ] **AAPL**: Run to confirm no regressions.
- [ ] **TSLA**: Known volatile name — make sure the 25% HTF flag drawdown limit doesn't generate false HTF signals from normal TSLA volatility.
- [ ] Both APEX and Nexus return **identical** results for the same ticker when run on the same day with live data.

## Files to NOT Modify

- Stage classification engine (Weinstein stage gates, WANDA, Mansfield RS)
- Watchlist CRUD
- Dashboard layout and routing
- Screener modules (finviz.py, bullsnort, etc.)
- tickers.json or build_universe.py

## Summary

This is a **pattern detection expansion** — adding two new base types (Ascending Base, HTF) and fixing the anchor determinism that causes measurement divergence. The existing Cup, Cup-with-Handle, Flat Base, Double Bottom, 3-Weeks-Tight, and generic Base patterns should remain untouched. The new patterns slot into the same detection pipeline and produce the same output shape (type, width, depth, pivot, buy zone, base low, stop loss, vol dry-up).
