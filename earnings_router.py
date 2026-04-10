"""
Trading Hashira — Earnings Router
GET /api/earnings/{ticker} — Pre-earnings setup analysis with IV/HV metrics,
earnings surprise history, implied move, and options structure recommendation.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yfinance as yf
import numpy as np
import math
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/earnings", tags=["earnings"])


def sf(val, default=0.0):
    if val is None:
        return default
    try:
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (ValueError, TypeError):
        return default


def compute_hv(closes, window=20):
    """Historical volatility (annualized)."""
    if len(closes) < window + 1:
        return 0.0
    log_returns = np.diff(np.log(closes[-window - 1:]))
    return round(float(np.std(log_returns) * np.sqrt(252) * 100), 2)


@router.get("/{ticker}")
async def get_earnings(ticker: str):
    ticker = ticker.upper().strip()
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}

        # Current price
        price = sf(info.get("currentPrice", info.get("regularMarketPrice", 0)))

        # ── Earnings History ──
        quarterly = []
        try:
            qe = tk.quarterly_earnings
            if qe is not None and not qe.empty:
                qe = qe.reset_index()
                for _, row in qe.iterrows():
                    est = sf(row.get("Estimated") or row.get("Revenue Estimate"))
                    act = sf(row.get("Reported") or row.get("Actual") or row.get("Revenue"))
                    surprise = round((act - est) / abs(est) * 100, 2) if est else 0
                    quarterly.append({
                        "quarter": str(row.get("Quarter", row.get("index", ""))),
                        "estimated": est,
                        "actual": act,
                        "surprise": surprise,
                        "beat": act > est if est else False,
                    })
        except Exception:
            pass

        # ── Earnings Dates ──
        next_date = None
        try:
            dates = tk.earnings_dates
            if dates is not None and not dates.empty:
                future = dates[dates.index >= datetime.now()]
                if not future.empty:
                    next_date = future.index[0].strftime("%Y-%m-%d")
        except Exception:
            pass

        # ── IV / HV Metrics ──
        hist = tk.history(period="6mo", interval="1d")
        closes = hist["Close"].dropna().tolist() if not hist.empty else []

        hv20 = compute_hv(closes, 20)
        hv30 = compute_hv(closes, 30)

        # Get ATM IV from options
        atm_iv = 0.0
        iv_rank = 0.0
        implied_move = 0.0
        try:
            expirations = tk.options
            if expirations:
                chain = tk.option_chain(expirations[0])
                if not chain.calls.empty and price > 0:
                    calls = chain.calls.copy()
                    calls["dist"] = abs(calls["strike"] - price)
                    atm = calls.sort_values("dist").head(1)
                    if len(atm) > 0:
                        atm_iv = round(sf(atm.iloc[0].get("impliedVolatility", 0)) * 100, 2)

                    # Compute IV rank (simplified: current ATM IV vs 6mo range of ATM IVs)
                    all_ivs = chain.calls["impliedVolatility"].dropna() * 100
                    if len(all_ivs) > 5:
                        iv_min = float(all_ivs.min())
                        iv_max = float(all_ivs.max())
                        if iv_max > iv_min:
                            iv_rank = round((atm_iv - iv_min) / (iv_max - iv_min) * 100, 1)

                # Implied move from nearest expiry straddle
                if atm_iv > 0 and next_date:
                    try:
                        days_to_earn = max(1, (datetime.strptime(next_date, "%Y-%m-%d") - datetime.now()).days)
                        implied_move = round(atm_iv / 100 * np.sqrt(days_to_earn / 365) * 100, 2)
                    except Exception:
                        implied_move = round(atm_iv * 0.06, 2)  # rough approx
        except Exception:
            pass

        iv_hv_ratio = round(atm_iv / hv20, 2) if hv20 > 0 else 0.0

        # ── Stats ──
        beats = [q for q in quarterly if q.get("beat")]
        beat_rate = round(len(beats) / len(quarterly) * 100, 0) if quarterly else 0
        avg_surprise = round(np.mean([q["surprise"] for q in quarterly]), 2) if quarterly else 0

        # ── Recommendation ──
        sell_premium = iv_rank > 50 or atm_iv > hv20 * 1.2
        stage = info.get("recommendationKey", "hold")

        return JSONResponse(content={
            "ticker": ticker,
            "price": price,
            "next_earnings_date": next_date,
            "iv": atm_iv,
            "iv_rank": iv_rank,
            "hv20": hv20,
            "hv30": hv30,
            "iv_hv_ratio": iv_hv_ratio,
            "implied_move": implied_move,
            "sell_premium": sell_premium,
            "beat_rate": beat_rate,
            "avg_surprise": avg_surprise,
            "quarterly": quarterly[-8:],  # Last 8 quarters
            "recommendation": "SELL PREMIUM" if sell_premium else "BUY PREMIUM",
            "sector": info.get("sector", "Unknown"),
            "name": info.get("shortName", ticker),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ticker": ticker, "error": str(e)},
        )
