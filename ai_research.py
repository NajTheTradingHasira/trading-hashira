"""
Trading Hashira — AI Research Router
POST /api/research/stage — Aggregates market data and returns
structured analysis sections (MARKET REGIME, IV CONTEXT, TRADE STRUCTURE, etc.)
Placeholder for Claude API integration. Currently returns data-driven analysis
from yfinance + macro indicators.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import numpy as np
import math
import os
from datetime import datetime

router = APIRouter(prefix="/api/research", tags=["research"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")


class StageQuery(BaseModel):
    query: str
    ticker: Optional[str] = "SPY"


def sf(val, default=0.0):
    try:
        f = float(val)
        return default if math.isnan(f) or math.isinf(f) else round(f, 4)
    except:
        return default


def analyze_ticker(ticker: str) -> dict:
    """Build structured analysis from live data."""
    tk = yf.Ticker(ticker)
    info = tk.info or {}
    hist = tk.history(period="6mo", interval="1d")
    
    if hist.empty:
        return {"sections": [{"heading": "ERROR", "content": f"No data for {ticker}"}]}

    closes = hist["Close"].dropna().values
    volumes = hist["Volume"].dropna().values
    current = float(closes[-1])

    # Moving averages
    sma10 = float(np.mean(closes[-10:])) if len(closes) >= 10 else current
    sma30 = float(np.mean(closes[-30:])) if len(closes) >= 30 else current
    sma50 = float(np.mean(closes[-50:])) if len(closes) >= 50 else current
    sma200 = float(np.mean(closes[-200:])) if len(closes) >= 200 else sma50

    # Trend
    above_10 = current > sma10
    above_30 = current > sma30
    slope_30 = (sma30 - float(np.mean(closes[-35:-5]))) if len(closes) >= 35 else 0

    # Volatility
    log_ret = np.diff(np.log(closes[-21:])) if len(closes) >= 21 else np.array([0])
    hv20 = round(float(np.std(log_ret) * np.sqrt(252) * 100), 2)

    # IV from options
    atm_iv = 0.0
    iv_rank = 0.0
    try:
        expirations = tk.options
        if expirations:
            chain = tk.option_chain(expirations[0])
            if not chain.calls.empty and current > 0:
                calls = chain.calls.copy()
                calls["dist"] = abs(calls["strike"] - current)
                atm = calls.sort_values("dist").head(1)
                if len(atm) > 0:
                    atm_iv = round(sf(atm.iloc[0].get("impliedVolatility", 0)) * 100, 2)
                all_ivs = chain.calls["impliedVolatility"].dropna() * 100
                if len(all_ivs) > 5:
                    iv_min, iv_max = float(all_ivs.min()), float(all_ivs.max())
                    if iv_max > iv_min:
                        iv_rank = round((atm_iv - iv_min) / (iv_max - iv_min) * 100, 1)
    except:
        pass

    iv_hv = round(atm_iv / hv20, 2) if hv20 > 0 else 0

    # Stage determination
    if current > sma30 and slope_30 > 0:
        stage = "Stage 2"
        stage_desc = "mid-advance"
    elif current > sma30 and slope_30 <= 0:
        stage = "Stage 3"
        stage_desc = "distribution"
    elif current < sma30 and slope_30 < 0:
        stage = "Stage 4"
        stage_desc = "decline"
    else:
        stage = "Stage 1"
        stage_desc = "basing"

    # Volume analysis
    avg_vol = float(np.mean(volumes[-20:])) if len(volumes) >= 20 else 0
    vol_ratio = round(float(volumes[-1]) / avg_vol, 2) if avg_vol > 0 else 1.0

    # Build sections
    sections = [
        {
            "heading": "MARKET REGIME",
            "content": (
                f"Weinstein {stage} {stage_desc}.\n"
                f"{ticker} {'above' if above_30 else 'below'} 30-week SMA "
                f"({'positive' if slope_30 > 0 else 'negative'} slope).\n"
                f"{'Above' if above_10 else 'Below'} 10-week SMA.\n"
                f"Overall bias: {'bullish' if stage in ('Stage 1', 'Stage 2') else 'bearish'}."
            ),
        },
        {
            "heading": "IV CONTEXT",
            "content": (
                f"Current IV: {atm_iv}%, HV(20): {hv20}%.\n"
                f"IV Rank: {iv_rank}% — {'elevated' if iv_rank > 60 else 'compressed' if iv_rank < 30 else 'moderate'}.\n"
                f"IV/HV ratio: {iv_hv}x — "
                f"{'IV premium, sell structures favorable' if iv_hv > 1.2 else 'HV ≈ IV' if iv_hv > 0.8 else 'IV discount, debit structures'}."
            ),
        },
        {
            "heading": "TRADE STRUCTURE",
            "content": (
                f"{'SELL PREMIUM: Iron condor or credit spread at ±1σ.' if iv_rank > 50 else 'BUY PREMIUM: Debit spread or long options.'}\n"
                f"Volume ratio: {vol_ratio}x avg — {'institutional participation' if vol_ratio > 1.5 else 'normal activity'}.\n"
                f"Key levels: 10d MA ${round(sma10, 2)}, 30d MA ${round(sma30, 2)}, 50d MA ${round(sma50, 2)}."
            ),
        },
        {
            "heading": "RISK",
            "content": (
                f"Max drawdown from 6mo high: {round((current / float(np.max(closes)) - 1) * 100, 2)}%.\n"
                f"Daily vol: {round(hv20 / np.sqrt(252), 2)}%.\n"
                f"Position sizing: {'full size' if stage == 'Stage 2' and iv_rank < 50 else 'reduced' if stage == 'Stage 3' else 'avoid longs' if stage == 'Stage 4' else 'pilot size'}."
            ),
        },
    ]

    return {
        "sections": sections,
        "summary": f"{ticker} is in Weinstein {stage} ({stage_desc}). IV rank {iv_rank}%, HV/IV {iv_hv}x.",
        "tickers": [ticker],
    }


@router.post("/stage")
async def research_stage(body: StageQuery):
    """Run AI analysis pipeline."""
    ticker = (body.ticker or "SPY").upper().strip()

    try:
        result = analyze_ticker(ticker)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "sections": []},
        )
