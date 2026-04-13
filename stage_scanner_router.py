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


def slope_direction(values: list, lookback: int = 4, threshold: float = 0.5) -> str:
    """Classify slope of last `lookback` values."""
    recent = [v for v in values[-lookback:] if v is not None]
    if len(recent) < 2:
        return "Unknown"
    delta = recent[-1] - recent[0]
    pct = delta / recent[0] * 100 if recent[0] else 0
    if pct > threshold:
        return "Rising"
    elif pct < -threshold:
        return "Falling"
    return "Flat"


# ── Stage Classifier ────────────────────────────────────────────────────

def classify_stage(data: dict, benchmark_data: dict | None = None) -> TickerResult:
    """
    Weinstein stage classification from weekly OHLCV data.
    Returns a populated TickerResult.
    """
    closes = [c for c in data["close"] if c is not None]
    volumes = [v for v in data["volume"] if v is not None]
    highs = [h for h in data["high"] if h is not None]
    lows = [l for l in data["low"] if l is not None]

    if len(closes) < 35:
        return TickerResult(ticker="", stage="?", error="Insufficient data")

    # Moving averages
    sma30 = sma(closes, 30)
    sma10 = sma(closes, 10)
    sma50d = sma(closes, 10)   # ~50-day proxy on weekly
    sma150d = sma(closes, 30)  # ~150-day proxy
    sma200d = sma(closes, 40)  # ~200-day proxy

    price = closes[-1]
    cur_sma30 = sma30[-1]
    cur_sma10 = sma10[-1]

    if cur_sma30 is None or cur_sma10 is None:
        return TickerResult(ticker="", stage="?", error="SMA calc failed")

    # 1. Price vs 30w SMA
    above_30w = price > cur_sma30
    price_vs = "Above" if above_30w else "Below"

    # 2. 30w SMA slope (5-week lookback, 0.6% threshold for slow-moving 30w avg)
    slope_30w = slope_direction(sma30, lookback=5, threshold=0.6)

    # 3. Volume analysis
    vol_avg_52 = sum(volumes[-52:]) / min(len(volumes), 52) if volumes else 0
    cur_vol = volumes[-1] if volumes else 0
    vol_ratio = round(cur_vol / vol_avg_52, 2) if vol_avg_52 > 0 else 0

    # Detect churning: high volume + small price change
    last_range_pct = abs(closes[-1] - closes[-2]) / closes[-2] * 100 if len(closes) >= 2 else 0
    if vol_ratio >= 1.5 and last_range_pct < 2:
        vol_signal = "Churning"
    elif vol_ratio >= 2.0:
        vol_signal = "Breakout"
    elif vol_ratio <= 0.6:
        vol_signal = "Dry-up"
    else:
        vol_signal = "Normal"

    # 4. Mansfield RS
    mrs = None
    rs_dir = None
    if benchmark_data:
        bench_closes = [c for c in benchmark_data["close"] if c is not None]
        if len(bench_closes) >= 52 and len(closes) >= 52:
            rs_line = [closes[i] / bench_closes[i] if bench_closes[i] else None
                       for i in range(min(len(closes), len(bench_closes)))]
            rs_sma52 = sma(rs_line, 52)
            if rs_sma52[-1] and rs_sma52[-1] > 0:
                mrs = round((rs_line[-1] / rs_sma52[-1] - 1) * 100, 2)
            rs_dir = slope_direction([v for v in rs_sma52 if v is not None])

    # 5. CANSLIM MA stack
    canslim_stack = None
    if sma50d[-1] and sma150d[-1] and sma200d[-1]:
        canslim_stack = sma50d[-1] > sma150d[-1] > sma200d[-1]

    # 6. Kell 10/20 EMA stack (approximate with SMA on weekly)
    sma4 = sma(closes, 4)   # ~20-day proxy
    sma2 = sma(closes, 2)   # ~10-day proxy
    kell_stack = None
    if sma2[-1] and sma4[-1]:
        kell_stack = sma2[-1] > sma4[-1] > cur_sma10

    # 7. 52-week high/low
    high_52 = max(highs[-52:]) if len(highs) >= 52 else max(highs)
    low_52 = min(lows[-52:]) if len(lows) >= 52 else min(lows)
    pct_high = round((price / high_52 - 1) * 100, 1) if high_52 else None
    pct_low = round((price / low_52 - 1) * 100, 1) if low_52 else None

    # ── Stage Decision Tree ──────────────────────────────────────────
    #
    # Weinstein / Wyckoff hybrid classification.
    # Primary axes: price vs 30W SMA, 30W SMA slope direction.
    # Secondary: Mansfield RS, 10W slope, volume, extension.
    #
    stage = "?"
    qualifier = ""
    transition = None
    slope_10w = slope_direction(sma10)

    pct_above_30w = (price - cur_sma30) / cur_sma30 * 100 if cur_sma30 else 0

    if above_30w and slope_30w == "Rising":
        # ── Stage 2 family: confirmed uptrend ──
        #
        # Stage 3A intercept: 30W is a lagging indicator — distribution
        # can begin while 30W still rises.  Detect early topping when:
        #   1) 10W slope is Falling (shorter MA rolling over)
        #   2) Price > 8% off 52-week high (failed to recover)
        #   3) Volume below average on the recovery (weak demand)
        if (slope_10w == "Falling"
                and pct_high is not None and pct_high < -8
                and vol_ratio < 1.0):
            stage = "3A"
        elif vol_signal == "Breakout":
            stage = "2A"
            qualifier = "(+)" if vol_ratio >= 3.0 else ""
        elif pct_above_30w > 20 and slope_10w != "Rising":
            stage = "2B"
        else:
            stage = "2A"

    elif above_30w and slope_30w == "Flat":
        # ── Ambiguous: late base or early distribution ──
        # 3B = RS negative (distribution)
        # 3A = RS positive but 10W weakening (late distribution)
        # 1B = RS positive and structure holding (accumulation)
        if mrs is not None and mrs <= 0:
            stage = "3B"
        elif slope_10w == "Falling":
            stage = "3A"
        else:
            stage = "1B"
            transition = "1B \u2192 2A"

    elif above_30w and slope_30w == "Falling":
        # ── Price above a declining 30W: accumulation or distribution ──
        # 3A = barely above + 10W weakening (distribution)
        # 1A = price spring above declining 30W (early accumulation)
        if slope_10w == "Falling" and pct_above_30w < 5:
            stage = "3A"
        else:
            stage = "1A"

    elif not above_30w and slope_30w == "Rising":
        # ── Pullback within uptrend ──
        stage = "1B"

    elif not above_30w and slope_30w == "Flat":
        # ── Base or late topping ──
        if vol_signal == "Dry-up":
            stage = "1A"
        else:
            stage = "3B"
            transition = "3B \u2192 4A"

    elif not above_30w and slope_30w == "Falling":
        # ── Stage 4 family: confirmed downtrend ──
        if slope_10w == "Falling":
            stage = "4"
            if vol_signal == "Dry-up":
                stage = "4B"
        else:
            stage = "4A"
            qualifier = "(-)"

    label, action = STAGE_META.get(stage, ("Unknown", "Review manually"))

    return TickerResult(
        ticker="",
        stage=stage,
        qualifier=qualifier,
        stage_label=label,
        action_bias=action,
        price=round(price, 2),
        sma_30w=round(cur_sma30, 2),
        sma_10w=round(cur_sma10, 2),
        sma_30w_slope=slope_30w,
        price_vs_30w=price_vs,
        mansfield_rs=mrs,
        rs_direction=rs_dir,
        vol_ratio=vol_ratio,
        vol_signal=vol_signal,
        canslim_ma_stack=canslim_stack,
        kell_ema_stack=kell_stack,
        pct_from_52w_high=pct_high,
        pct_from_52w_low=pct_low,
        transition_risk=transition,
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
