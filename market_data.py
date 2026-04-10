"""
Trading Hashira — Market Data Router
GET /api/market-data/{ticker} — Single-ticker quote with day/week/month %
Used by the watchlist live price fetcher and chart page.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yfinance as yf
import numpy as np
import math
from datetime import datetime

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


def sf(val, default=0.0):
    if val is None:
        return default
    try:
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (ValueError, TypeError):
        return default


@router.get("/{ticker}")
async def get_market_data(ticker: str):
    ticker = ticker.upper().strip()
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
        fast = tk.fast_info

        price = sf(fast.get("lastPrice", info.get("currentPrice", info.get("regularMarketPrice", 0))))
        prev_close = sf(info.get("previousClose", info.get("regularMarketPreviousClose", 0)))

        # Day change
        day_change = round(price - prev_close, 2) if price and prev_close else 0
        day_pct = round((day_change / prev_close) * 100, 2) if prev_close else 0

        # Get historical for week/month %
        hist = tk.history(period="3mo", interval="1d")
        week_pct = 0.0
        month_pct = 0.0

        if not hist.empty:
            closes = hist["Close"].dropna().tolist()
            if len(closes) >= 5:
                week_pct = round((price / closes[-5] - 1) * 100, 2) if closes[-5] else 0
            if len(closes) >= 22:
                month_pct = round((price / closes[-22] - 1) * 100, 2) if closes[-22] else 0

        return JSONResponse(content={
            "ticker": ticker,
            "price": price,
            "open": sf(info.get("open", info.get("regularMarketOpen", 0))),
            "high": sf(info.get("dayHigh", info.get("regularMarketDayHigh", 0))),
            "low": sf(info.get("dayLow", info.get("regularMarketDayLow", 0))),
            "close": prev_close,
            "volume": sf(fast.get("lastVolume", info.get("volume", 0))),
            "change": day_change,
            "change_pct": day_pct,
            "week_pct": week_pct,
            "month_pct": month_pct,
            "market_cap": sf(info.get("marketCap", 0)),
            "name": info.get("shortName", ticker),
            "sector": info.get("sector", "Unknown"),
            "52w_high": sf(info.get("fiftyTwoWeekHigh", 0)),
            "52w_low": sf(info.get("fiftyTwoWeekLow", 0)),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ticker": ticker, "error": str(e)},
        )
