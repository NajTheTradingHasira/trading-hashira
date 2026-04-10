"""
Trading Hashira — LSTM / Forecast Router
GET /api/lstm/{ticker} — Price forecast using momentum extrapolation.
Placeholder for full LSTM model. Uses linear regression + volatility cone
to generate 5d/20d targets with confidence bands.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yfinance as yf
import numpy as np
import math
from datetime import datetime

router = APIRouter(prefix="/api/lstm", tags=["lstm"])


def sf(val, default=0.0):
    try:
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else round(f, 4)
    except:
        return default


@router.get("/{ticker}")
async def get_forecast(ticker: str):
    ticker = ticker.upper().strip()
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(period="6mo", interval="1d")
        if hist.empty or len(hist) < 30:
            return JSONResponse(
                status_code=404,
                content={"ticker": ticker, "error": "Insufficient data"},
            )

        closes = hist["Close"].dropna().values
        current = float(closes[-1])

        # Log returns
        log_ret = np.diff(np.log(closes))
        mu = float(np.mean(log_ret[-20:]))  # 20d drift
        sigma = float(np.std(log_ret[-20:]))  # 20d vol

        # Linear regression slope on last 30 days
        x = np.arange(30)
        y = closes[-30:]
        slope = float(np.polyfit(x, y, 1)[0])

        # 5d and 20d targets
        target_5d = round(current * np.exp(mu * 5), 2)
        target_20d = round(current * np.exp(mu * 20), 2)

        # Confidence bands (1 sigma)
        band_5d = round(current * sigma * np.sqrt(5), 2)
        band_20d = round(current * sigma * np.sqrt(20), 2)

        # Direction confidence
        trend_strength = abs(mu) / (sigma + 1e-8)
        confidence = min(0.95, round(0.5 + trend_strength * 0.3, 3))

        # Generate forecast series (next 20 bars)
        forecast_series = []
        for i in range(1, 21):
            proj = current * np.exp(mu * i)
            upper = proj * np.exp(sigma * np.sqrt(i))
            lower = proj * np.exp(-sigma * np.sqrt(i))
            forecast_series.append({
                "day": i,
                "projected": round(proj, 2),
                "upper": round(upper, 2),
                "lower": round(lower, 2),
            })

        # Historical series (last 60 days for chart)
        hist_series = [
            {"day": -60 + i, "close": round(float(c), 2)}
            for i, c in enumerate(closes[-60:])
        ]

        direction = "BULLISH" if mu > 0.001 else "BEARISH" if mu < -0.001 else "NEUTRAL"

        return JSONResponse(content={
            "ticker": ticker,
            "price": round(current, 2),
            "forecast": {
                "target_5d": target_5d,
                "target_20d": target_20d,
                "band_5d": band_5d,
                "band_20d": band_20d,
                "confidence": confidence,
                "direction": direction,
                "daily_drift": round(mu * 100, 4),
                "daily_vol": round(sigma * 100, 4),
                "slope_30d": round(slope, 4),
            },
            "forecast_series": forecast_series,
            "history": hist_series,
            "model": "momentum_extrapolation_v1",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ticker": ticker, "error": str(e)},
        )
