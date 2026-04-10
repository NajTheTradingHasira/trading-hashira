"""
Trading Hashira — Sectors Router
GET /api/sectors — Sector ETF RS ranking with 4w/13w/26w/Mansfield RS,
stage classification, breadth metrics.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yfinance as yf
import numpy as np
import math
from datetime import datetime

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


SECTOR_ETFS = [
    {"id": "XLK", "name": "Technology"},
    {"id": "XLF", "name": "Financials"},
    {"id": "XLV", "name": "Health Care"},
    {"id": "XLY", "name": "Cons. Discretionary"},
    {"id": "XLP", "name": "Cons. Staples"},
    {"id": "XLE", "name": "Energy"},
    {"id": "XLI", "name": "Industrials"},
    {"id": "XLC", "name": "Communication"},
    {"id": "XLU", "name": "Utilities"},
    {"id": "XLRE", "name": "Real Estate"},
    {"id": "XLB", "name": "Materials"},
]

BENCHMARK = "SPY"


def sf(val, default=0.0):
    if val is None:
        return default
    try:
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (ValueError, TypeError):
        return default


def pct_change(current, previous):
    if not current or not previous or previous == 0:
        return 0.0
    return round(((current - previous) / previous) * 100, 2)


def classify_stage(price, sma30, sma30_slope, rs_trend):
    """Simplified Weinstein stage classification."""
    if price > sma30 and sma30_slope > 0 and rs_trend > 0:
        return 2
    if price > sma30 and sma30_slope <= 0:
        return 3
    if price < sma30 and sma30_slope < 0:
        return 4
    if price < sma30 and sma30_slope >= 0:
        return 1
    return 2


def compute_mansfield_rs(sector_closes, bench_closes, lookback=52):
    """Mansfield Relative Strength = (sector/benchmark MA ratio - 1) * 100."""
    if len(sector_closes) < lookback or len(bench_closes) < lookback:
        return 0.0
    ratio = np.array(sector_closes[-lookback:]) / np.array(bench_closes[-lookback:])
    ma = np.mean(ratio)
    current = ratio[-1]
    return round((current / ma - 1) * 100, 2) if ma != 0 else 0.0


@router.get("")
async def get_sectors():
    """Full sector RS ranking with multi-timeframe relative strength."""
    try:
        # Fetch all sector ETFs + benchmark in one batch
        all_tickers = [s["id"] for s in SECTOR_ETFS] + [BENCHMARK]
        data = yf.download(
            all_tickers, period="1y", interval="1wk", group_by="ticker",
            threads=True, progress=False
        )

        bench_closes = []
        if BENCHMARK in data.columns.get_level_values(0):
            bench_df = data[BENCHMARK]["Close"].dropna()
            bench_closes = bench_df.tolist()

        results = []
        for sector in SECTOR_ETFS:
            sid = sector["id"]
            try:
                if sid not in data.columns.get_level_values(0):
                    continue
                closes = data[sid]["Close"].dropna()
                if len(closes) < 5:
                    continue

                c_list = closes.tolist()
                current = c_list[-1]

                # RS calculations
                rs4w = pct_change(current, c_list[-4] if len(c_list) >= 4 else current)
                rs13w = pct_change(current, c_list[-13] if len(c_list) >= 13 else current)
                rs26w = pct_change(current, c_list[-26] if len(c_list) >= 26 else current)
                mansfield = compute_mansfield_rs(c_list, bench_closes)

                # 30-week SMA (approx)
                sma30 = np.mean(c_list[-30:]) if len(c_list) >= 30 else np.mean(c_list)
                sma30_prev = np.mean(c_list[-31:-1]) if len(c_list) >= 31 else sma30
                sma30_slope = sma30 - sma30_prev

                # Stage
                rs_trend = 1 if mansfield > 0 else -1
                stage = classify_stage(current, sma30, sma30_slope, rs_trend)

                # Breadth proxy: % of last 13 weeks positive
                weekly_returns = np.diff(c_list[-14:]) / np.array(c_list[-14:-1]) * 100 if len(c_list) >= 14 else []
                pct_positive = round(np.sum(np.array(weekly_returns) > 0) / max(1, len(weekly_returns)) * 100, 0) if len(weekly_returns) > 0 else 50

                breadth_trend = "IMPROVING" if pct_positive >= 60 else "DETERIORATING" if pct_positive <= 40 else "STABLE"

                results.append({
                    "id": sid,
                    "name": sector["name"],
                    "price": round(current, 2),
                    "stage": stage,
                    "rs4w": rs4w,
                    "rs13w": rs13w,
                    "rs26w": rs26w,
                    "mansfield": mansfield,
                    "sma30w": round(sma30, 2),
                    "pct_above_30w": round((current / sma30 - 1) * 100, 2) if sma30 else 0,
                    "breadth_trend": breadth_trend,
                    "pct_weeks_positive": pct_positive,
                })
            except Exception as e:
                results.append({
                    "id": sid, "name": sector["name"], "error": str(e),
                    "stage": 0, "rs4w": 0, "rs13w": 0, "rs26w": 0, "mansfield": 0,
                })

        return JSONResponse(content={
            "sectors": results,
            "count": len(results),
            "benchmark": BENCHMARK,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "sectors": []},
        )
