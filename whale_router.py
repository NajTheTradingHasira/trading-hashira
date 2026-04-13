"""
Whale Flow Endpoint — GET /api/options/whale
Scans yfinance options chains for whale-sized activity.

Whale heuristics:
  1. Volume > 5× Open Interest (unusual accumulation)
  2. Notional premium > $500K (institutional size)
  3. Volume > 10K contracts on single strike

Add to your FastAPI app:
  from api.whale_router import router as whale_router
  app.include_router(whale_router)
"""

from fastapi import APIRouter, Query
from datetime import datetime, timedelta
import json
import pathlib
import yfinance as yf
import math

router = APIRouter(prefix="/api/options", tags=["options"])

# ── Load tickers from centralized registry ─────────────────────────────
_REG = json.loads((pathlib.Path(__file__).parent / "tickers.json").read_text())
# Whale scanner: high-liquidity core names + all ETFs
_WHALE_CORE = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOG", "AMD", "NFLX", "JPM", "GS"]
DEFAULT_TICKERS = list(dict.fromkeys(_REG["etfs"] + [t for t in _REG["core"] if t in set(_WHALE_CORE)]))

MIN_NOTIONAL = 500_000      # $500K premium
VOL_OI_RATIO = 5.0          # volume/OI threshold
MIN_VOLUME = 500            # ignore dust
MIN_ABS_VOLUME = 10_000     # standalone volume whale


def _scan_ticker(ticker: str, max_expiries: int = 4) -> list[dict]:
    """Scan nearest expiries for whale strikes."""
    try:
        tk = yf.Ticker(ticker)
        spot = tk.fast_info.get("lastPrice") or tk.info.get("currentPrice")
        if not spot:
            return []

        expiries = tk.options[:max_expiries]
        hits = []

        for exp in expiries:
            chain = tk.option_chain(exp)
            for side, df in [("CALL", chain.calls), ("PUT", chain.puts)]:
                if df.empty:
                    continue
                for _, row in df.iterrows():
                    vol = int(row.get("volume") or 0)
                    oi = int(row.get("openInterest") or 0)
                    last = float(row.get("lastPrice") or 0)
                    iv = float(row.get("impliedVolatility") or 0)
                    strike = float(row.get("strike") or 0)
                    bid = float(row.get("bid") or 0)
                    ask = float(row.get("ask") or 0)

                    if vol < MIN_VOLUME:
                        continue

                    notional = vol * last * 100
                    vol_oi = (vol / oi) if oi > 0 else 999.0
                    otm_pct = ((strike - spot) / spot * 100) if side == "CALL" else ((spot - strike) / spot * 100)

                    # ── Whale filters ──
                    is_whale = False
                    flags = []
                    if vol_oi >= VOL_OI_RATIO:
                        is_whale = True
                        flags.append(f"Vol/OI {vol_oi:.1f}x")
                    if notional >= MIN_NOTIONAL:
                        is_whale = True
                        flags.append(f"${notional/1e6:.1f}M notional")
                    if vol >= MIN_ABS_VOLUME:
                        is_whale = True
                        flags.append(f"{vol:,} contracts")

                    if not is_whale:
                        continue

                    # ── Sentiment inference ──
                    if side == "CALL":
                        sentiment = "BULLISH" if otm_pct > 0 else "HEDGE"
                    else:
                        sentiment = "BEARISH" if otm_pct > 0 else "HEDGE"

                    hits.append({
                        "ticker": ticker,
                        "expiry": exp,
                        "strike": strike,
                        "side": side,
                        "volume": vol,
                        "oi": oi,
                        "vol_oi": round(vol_oi, 1),
                        "last": round(last, 2),
                        "bid": round(bid, 2),
                        "ask": round(ask, 2),
                        "iv": round(iv * 100, 1),
                        "notional": round(notional),
                        "otm_pct": round(otm_pct, 1),
                        "spot": round(spot, 2),
                        "sentiment": sentiment,
                        "flags": flags,
                    })

        return hits
    except Exception as e:
        print(f"[whale] {ticker} error: {e}")
        return []


@router.get("/whale")
def get_whale_flow(
    tickers: str = Query(default=None, description="Comma-separated tickers to scan. Defaults to top 20."),
    min_notional: int = Query(default=MIN_NOTIONAL, description="Minimum notional premium filter"),
    limit: int = Query(default=50, description="Max results returned"),
):
    """
    Scan options chains for whale-sized flow.
    Returns trades sorted by notional premium descending.
    """
    scan_list = [t.strip().upper() for t in tickers.split(",")] if tickers else DEFAULT_TICKERS
    all_hits = []

    for t in scan_list:
        hits = _scan_ticker(t)
        all_hits.extend(hits)

    # Apply min_notional filter
    all_hits = [h for h in all_hits if h["notional"] >= min_notional]

    # Sort by notional descending
    all_hits.sort(key=lambda x: x["notional"], reverse=True)

    # Summary stats
    total_call_notional = sum(h["notional"] for h in all_hits if h["side"] == "CALL")
    total_put_notional = sum(h["notional"] for h in all_hits if h["side"] == "PUT")
    bullish_count = sum(1 for h in all_hits if h["sentiment"] == "BULLISH")
    bearish_count = sum(1 for h in all_hits if h["sentiment"] == "BEARISH")

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "scanned": len(scan_list),
        "hits": len(all_hits),
        "summary": {
            "total_call_notional": total_call_notional,
            "total_put_notional": total_put_notional,
            "put_call_ratio": round(total_put_notional / total_call_notional, 2) if total_call_notional else None,
            "bullish": bullish_count,
            "bearish": bearish_count,
        },
        "flows": all_hits[:limit],
    }
