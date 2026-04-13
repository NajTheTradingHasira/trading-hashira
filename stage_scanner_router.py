"""
Stage Scanner Router — POST /api/research/stage-scan
Batch Weinstein Stage Analysis for multiple tickers.

Integration:
  In your main FastAPI app, add:
      from api.stage_scanner_router import router as stage_scanner_router
      app.include_router(stage_scanner_router)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import asyncio
import httpx
import math
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/research", tags=["stage-scanner"])

# ── Models ──────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=100)
    benchmark: str = "SPY"

class TickerResult(BaseModel):
    ticker: str
    stage: str                    # e.g. "2A", "3B", "4"
    qualifier: str = ""           # (+), (-), or ""
    stage_label: str = ""         # "Early Uptrend", "Distribution", etc.
    action_bias: str = ""         # "Primary buy zone", "Exit longs", etc.
    price: Optional[float] = None
    sma_30w: Optional[float] = None
    sma_10w: Optional[float] = None
    sma_30w_slope: Optional[str] = None   # "Rising", "Flat", "Falling"
    price_vs_30w: Optional[str] = None    # "Above", "Below"
    mansfield_rs: Optional[float] = None
    rs_direction: Optional[str] = None    # "Rising", "Flat", "Falling"
    vol_ratio: Optional[float] = None     # current week vol / 52w avg
    vol_signal: Optional[str] = None      # "Breakout", "Dry-up", "Churning", "Normal"
    canslim_ma_stack: Optional[bool] = None  # 50d > 150d > 200d
    kell_ema_stack: Optional[bool] = None    # 10/20 EMA aligned
    pct_from_52w_high: Optional[float] = None
    pct_from_52w_low: Optional[float] = None
    transition_risk: Optional[str] = None  # e.g. "3B → 4A — HIGH"
    stage_3_intercept_debug: Optional[dict] = None  # gate values for 3A intercept audit
    error: Optional[str] = None

class ScanResponse(BaseModel):
    timestamp: str
    benchmark: str
    benchmark_stage: Optional[str] = None
    total: int
    scanned: int
    failed: int
    results: list[TickerResult]
    stage_distribution: dict[str, int]  # {"2A": 5, "4": 3, ...}

# ── Stage Labels ────────────────────────────────────────────────────────

STAGE_META = {
    "1A": ("Basing / Accumulation",    "Watch only \u2014 too early, never buy Stage 1"),
    "1":  ("Basing / Accumulation",    "Early base forming \u2014 add to research watchlist"),
    "1B": ("Basing / Accumulation",    "Watch closely \u2014 maintain watchlist, wait for Stage 2 breakout"),
    "2A": ("Advancing / Markup",       "Buy \u2014 initial breakout (Point A)"),
    "2":  ("Advancing / Markup",       "Hold and trail stops \u2014 add on pullbacks to 10W EMA"),
    "2B": ("Advancing / Markup",       "Buy \u2014 consolidation entry (Point B) or add to position"),
    "3A": ("Topping / Distribution",   "Reduce exposure \u2014 sell 1/3 on first undercut of 10W EMA"),
    "3":  ("Topping / Distribution",   "Sell into strength \u2014 reduce on any volume climax"),
    "3B": ("Topping / Distribution",   "Sell remaining \u2014 exit on any rally into MAs from below"),
    "4A": ("Declining / Markdown",     "Full exit \u2014 breakdown confirmed, no longs"),
    "4":  ("Declining / Markdown",     "Short bias or flat \u2014 avoid bottom-fishing"),
    "4B": ("Declining / Markdown",     "Full exit / short \u2014 accelerating decline"),
}

# ── Yahoo Finance Data Fetcher ──────────────────────────────────────────

async def fetch_weekly_data(client: httpx.AsyncClient, ticker: str) -> dict:
    """Fetch ~2 years of weekly price data from Yahoo Finance v8."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {"interval": "1wk", "range": "2y"}
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = await client.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    result = data["chart"]["result"][0]
    quotes = result["indicators"]["quote"][0]
    return {
        "timestamps": result["timestamp"],
        "close":  quotes["close"],
        "volume": quotes["volume"],
        "high":   quotes["high"],
        "low":    quotes["low"],
        "open":   quotes["open"],
    }


def sma(values: list, period: int) -> list:
    """Simple moving average. Returns list same length, None-padded."""
    out = [None] * len(values)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        if all(v is not None for v in window):
            out[i] = sum(window) / period
        else:
            out[i] = None
    return out


def ema(values: list, span: int) -> list:
    """Exponential moving average matching nexus-terminal's _ema()."""
    if not values:
        return []
    alpha = 2 / (span + 1)
    out = [float(values[0])]
    for v in values[1:]:
        out.append(alpha * float(v) + (1 - alpha) * out[-1])
    return out


def _sma_30w_rising_3w(closes: list, sma_30w_slope: float) -> bool:
    """Check if 30W SMA has been rising for 3+ consecutive weeks."""
    if sma_30w_slope < 0.5:
        return False
    n = len(closes)
    if n < 33:
        return sma_30w_slope > 0
    for w in range(3):
        end = n - w
        start = max(0, end - 30)
        prev_end = end - 1
        prev_start = max(0, prev_end - 30)
        cur = sum(closes[start:end]) / (end - start)
        prev = sum(closes[prev_start:prev_end]) / (prev_end - prev_start)
        if cur <= prev:
            return False
    return True


# ── Stage Classifier ────────────────────────────────────────────────────
# Mirrors _weinstein_classify() from nexus-terminal/research_core/router.py
# One source of truth — any changes here must be synced to nexus-terminal.

def classify_stage(data: dict, benchmark_data: dict | None = None) -> TickerResult:
    """
    Weinstein stage classification from weekly OHLCV data.
    Uses 10W EMA, 30W SMA, 40W SMA — same logic as nexus-terminal.
    """
    closes = [c for c in data["close"] if c is not None]
    volumes = [v for v in data["volume"] if v is not None]
    highs = [h for h in data["high"] if h is not None]
    lows = [l for l in data["low"] if l is not None]
    n = len(closes)

    if n < 42:
        return TickerResult(ticker="", stage="?", error="Insufficient data (need 42+ weeks)")

    price = closes[-1]

    # ── Moving averages (matching nexus-terminal exactly) ──
    cur_sma30 = sum(closes[-30:]) / 30
    sma_30w_5ago = sum(closes[-35:-5]) / 30 if n >= 35 else cur_sma30
    sma_40w = sum(closes[-40:]) / 40 if n >= 40 else cur_sma30
    ema10_arr = ema(closes, 10)
    ema_10w = ema10_arr[-1]
    ema_10w_5ago = ema10_arr[-5] if len(ema10_arr) >= 5 else ema_10w

    sma_30w_slope = (cur_sma30 / sma_30w_5ago - 1) * 100 if sma_30w_5ago > 0 else 0
    ema_10w_slope = (ema_10w / ema_10w_5ago - 1) * 100 if ema_10w_5ago > 0 else 0
    pv30 = (price / cur_sma30 - 1) * 100 if cur_sma30 > 0 else 0
    ma_stack = price > ema_10w > cur_sma30 > sma_40w
    ma_stack_bearish = price < ema_10w < cur_sma30 < sma_40w

    above_30w = price > cur_sma30
    price_vs = "Above" if above_30w else "Below"

    # Stage 2 gates
    sma_30w_rising = _sma_30w_rising_3w(closes, sma_30w_slope)
    ema10_above_30w = ema_10w > cur_sma30

    # Weeks below/above 30W
    weeks_below = 0
    weeks_above = 0
    for i in range(n - 1, max(n - 52, 29), -1):
        s = sum(closes[max(0, i - 29):i + 1]) / min(30, i + 1)
        if closes[i] < s:
            if weeks_above == 0: weeks_below += 1
            else: break
        else:
            if weeks_below == 0: weeks_above += 1
            else: break

    # Crossovers in last 20 weeks
    crossovers = 0
    for i in range(max(30, n - 20), n):
        s_i = sum(closes[i - 29:i + 1]) / 30
        s_p = sum(closes[i - 30:i]) / 30
        if (closes[i] > s_i and closes[i - 1] < s_p) or (closes[i] < s_i and closes[i - 1] > s_p):
            crossovers += 1

    ma_conv = abs(ema_10w - cur_sma30) / cur_sma30 * 100 if cur_sma30 > 0 else 0

    # Volume analysis
    vol_avg_52 = sum(volumes[-52:]) / min(len(volumes), 52) if volumes else 0
    cur_vol = volumes[-1] if volumes else 0
    vol_ratio = round(cur_vol / vol_avg_52, 2) if vol_avg_52 > 0 else 0

    last_range_pct = abs(closes[-1] - closes[-2]) / closes[-2] * 100 if n >= 2 else 0
    if vol_ratio >= 1.5 and last_range_pct < 2:
        vol_signal = "Churning"
    elif vol_ratio >= 2.0:
        vol_signal = "Breakout"
    elif vol_ratio <= 0.6:
        vol_signal = "Dry-up"
    else:
        vol_signal = "Normal"

    # Mansfield RS
    mrs = None
    rs_dir = None
    if benchmark_data:
        bench_closes = [c for c in benchmark_data["close"] if c is not None]
        if len(bench_closes) >= 52 and n >= 52:
            min_len = min(n, len(bench_closes))
            rs_line = [closes[i] / bench_closes[i] if bench_closes[i] else None
                       for i in range(min_len)]
            rs_sma52 = sma(rs_line, 52)
            if rs_sma52[-1] and rs_sma52[-1] > 0:
                mrs = round((rs_line[-1] / rs_sma52[-1] - 1) * 100, 2)
            valid_rs = [v for v in rs_sma52 if v is not None]
            if len(valid_rs) >= 5:
                rd = (valid_rs[-1] / valid_rs[-5] - 1) * 100
                rs_dir = "Rising" if rd > 0.5 else ("Falling" if rd < -0.5 else "Flat")

    # 52-week high/low
    high_52 = max(highs[-52:]) if len(highs) >= 52 else max(highs)
    low_52 = min(lows[-52:]) if len(lows) >= 52 else min(lows)
    pct_high = round((price / high_52 - 1) * 100, 1) if high_52 else None
    pct_low = round((price / low_52 - 1) * 100, 1) if low_52 else None

    # ── 3A intercept debug (computed for every ticker) ──
    _g1 = ema_10w_slope < 0
    _g2 = pct_high is not None and pct_high < -8
    _g3 = vol_ratio < 1.0
    s3_gate = {
        "ema_10w_slope": round(ema_10w_slope, 3),
        "ema_10w_falling": _g1,
        "pct_from_52w_high": pct_high,
        "off_high_gt_8pct": _g2,
        "vol_ratio": vol_ratio,
        "vol_below_avg": _g3,
        "ma_stack": bool(ma_stack),
        "all_gates_true": _g1 and _g2 and _g3 and price > cur_sma30,
        "intercepted": False,
    }

    # ── Classification (first match wins — mirrors nexus-terminal) ──
    stage = "?"
    qualifier = ""
    transition = None

    # STAGE 4 — DECLINING
    if price < cur_sma30 and sma_30w_slope <= 0 and weeks_below >= 2:
        if pv30 < -10 or ma_stack_bearish or sma_30w_slope < -1.0:
            stage = "4B"
        else:
            stage = "4A"
            qualifier = "(-)"

    # STAGE 3 INTERCEPT — catch early distribution even with intact MA stack
    # Three gates: 10W declining + >8% off high + below-avg volume
    elif _g1 and _g2 and _g3 and price > cur_sma30:
        s3_gate["intercepted"] = True
        if (not ma_stack and ma_conv < 3) or price < ema_10w or sma_30w_slope < -0.5:
            stage = "3B"
        else:
            stage = "3A"

    # STAGE 2 — ADVANCING (with gate enforcement)
    elif price > cur_sma30 and sma_30w_slope > 0 and weeks_above >= 3:
        if sma_30w_rising and ema10_above_30w:
            if ma_stack and weeks_above <= 12:
                stage = "2A"
            elif weeks_above > 12:
                stage = "2B"
            else:
                stage = "2A"
        else:
            stage = "1B"
            transition = "1B \u2192 2A"

    # STAGE 3 — TOPPING (flat slope + signals)
    elif (-0.5 <= sma_30w_slope <= 0.5) and (
        crossovers >= 3 or
        (ma_conv < 3 and abs(pv30) < 3) or
        (price < ema_10w and ema_10w_slope < 0)
    ):
        if crossovers >= 4 or (price < ema_10w and price < cur_sma30):
            stage = "3B"
        else:
            stage = "3A"

    # STAGE 1 — BASING (default)
    else:
        if sma_30w_slope < -0.2:
            stage = "1A"
        else:
            stage = "1B"

    label, action = STAGE_META.get(stage, ("Unknown", "Review manually"))

    return TickerResult(
        ticker="",
        stage=stage,
        qualifier=qualifier,
        stage_label=label,
        action_bias=action,
        price=round(price, 2),
        sma_30w=round(cur_sma30, 2),
        sma_10w=round(ema_10w, 2),
        sma_30w_slope="Rising" if sma_30w_slope > 0.5 else ("Falling" if sma_30w_slope < -0.5 else "Flat"),
        price_vs_30w=price_vs,
        mansfield_rs=mrs,
        rs_direction=rs_dir,
        vol_ratio=vol_ratio,
        vol_signal=vol_signal,
        canslim_ma_stack=bool(ma_stack),
        kell_ema_stack=None,
        pct_from_52w_high=pct_high,
        pct_from_52w_low=pct_low,
        transition_risk=transition,
        stage_3_intercept_debug=s3_gate,
    )


# ── Endpoint ────────────────────────────────────────────────────────────

@router.post("/stage-scan", response_model=ScanResponse)
async def stage_scan(req: ScanRequest):
    """
    Batch stage classification.
    Accepts up to 100 tickers, returns Weinstein stage for each.
    Always classifies benchmark first for Mansfield RS.
    """
    tickers = [t.strip().upper() for t in req.tickers if t.strip()]
    if not tickers:
        raise HTTPException(400, "No tickers provided")

    async with httpx.AsyncClient() as client:
        # Fetch benchmark first
        benchmark_data = None
        try:
            benchmark_data = await fetch_weekly_data(client, req.benchmark)
        except Exception:
            pass  # proceed without RS if benchmark fails

        # Classify benchmark itself
        benchmark_stage = None
        if benchmark_data:
            br = classify_stage(benchmark_data)
            benchmark_stage = br.stage

        # Fetch all tickers concurrently (batches of 10 to avoid rate limits)
        results: list[TickerResult] = []
        failed = 0

        for batch_start in range(0, len(tickers), 10):
            batch = tickers[batch_start : batch_start + 10]
            tasks = [fetch_weekly_data(client, t) for t in batch]
            fetched = await asyncio.gather(*tasks, return_exceptions=True)

            for ticker, data in zip(batch, fetched):
                if isinstance(data, Exception):
                    results.append(TickerResult(
                        ticker=ticker, stage="ERR",
                        error=str(data)[:120]
                    ))
                    failed += 1
                    continue

                try:
                    tr = classify_stage(data, benchmark_data)
                    tr.ticker = ticker
                    results.append(tr)
                except Exception as e:
                    results.append(TickerResult(
                        ticker=ticker, stage="ERR",
                        error=str(e)[:120]
                    ))
                    failed += 1

    # Stage distribution
    dist: dict[str, int] = {}
    for r in results:
        if r.stage != "ERR":
            dist[r.stage] = dist.get(r.stage, 0) + 1

    return ScanResponse(
        timestamp=datetime.utcnow().isoformat() + "Z",
        benchmark=req.benchmark,
        benchmark_stage=benchmark_stage,
        total=len(tickers),
        scanned=len(tickers) - failed,
        failed=failed,
        results=results,
        stage_distribution=dist,
    )
