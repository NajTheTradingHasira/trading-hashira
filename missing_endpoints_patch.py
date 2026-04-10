"""
Trading Hashira — Missing Endpoints Patch
Add these 3 routes to server.py (or as a separate router).

1. GET /api/hmm/{ticker}     — HMM regime for individual stocks
2. GET /api/options/unusual   — Cross-market unusual options activity
3. GET /api/options/whale     — Large block / whale flow
"""

# ══════════════════════════════════════════════════════════════
# OPTION 1: Add directly to server.py (paste near line 1283)
# ══════════════════════════════════════════════════════════════

# --- HMM per-stock (paste after the existing @app.get("/api/hmm") block) ---

"""
@app.get("/api/hmm/{ticker}")
async def hmm_stock(ticker: str):
    ticker = ticker.upper().strip()
    try:
        import yfinance as yf
        import numpy as np

        tk = yf.Ticker(ticker)
        hist = tk.history(period="1y", interval="1d")
        if hist.empty or len(hist) < 60:
            raise HTTPException(status_code=404, detail=f"Insufficient data for {ticker}")

        closes = hist["Close"].dropna().values
        log_ret = np.diff(np.log(closes))

        # Simple regime detection: rolling mean + vol
        window = 20
        rolling_mean = np.convolve(log_ret, np.ones(window)/window, mode='valid')
        rolling_vol = np.array([np.std(log_ret[max(0,i-window):i]) for i in range(window, len(log_ret)+1)])

        recent_mean = float(rolling_mean[-1]) if len(rolling_mean) > 0 else 0
        recent_vol = float(rolling_vol[-1]) if len(rolling_vol) > 0 else 0
        avg_vol = float(np.mean(rolling_vol)) if len(rolling_vol) > 0 else 0

        # Classify
        if recent_mean > 0.001 and recent_vol < avg_vol * 1.2:
            regime = "BULLISH_TRENDING"
            confidence = min(0.9, 0.5 + abs(recent_mean) * 50)
        elif recent_mean > 0 and recent_vol >= avg_vol * 1.2:
            regime = "VOLATILE_BULLISH"
            confidence = 0.55
        elif recent_mean < -0.001 and recent_vol < avg_vol * 1.2:
            regime = "BEARISH_TRENDING"
            confidence = min(0.9, 0.5 + abs(recent_mean) * 50)
        elif recent_mean < 0 and recent_vol >= avg_vol * 1.2:
            regime = "VOLATILE_BEARISH"
            confidence = 0.55
        elif recent_vol > avg_vol * 1.5:
            regime = "HIGH_VOLATILITY"
            confidence = 0.6
        else:
            regime = "MEAN_REVERTING"
            confidence = 0.5

        return {
            "ticker": ticker,
            "regime": regime,
            "confidence": round(confidence, 3),
            "volatility": round(recent_vol * np.sqrt(252) * 100, 2),
            "trend": round(recent_mean * 252 * 100, 2),  # Annualized drift %
            "avg_volatility": round(avg_vol * np.sqrt(252) * 100, 2),
            "model": "rolling_regime_v1",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""

# --- Options Unusual + Whale (paste at end of server.py, or add to options.py) ---

"""
@app.get("/api/options/unusual")
async def options_unusual():
    import yfinance as yf
    tickers = ["NVDA","AAPL","TSLA","META","AMZN","AMD","GOOGL","MSFT","SPY","QQQ",
               "PLTR","COIN","MARA","RIOT","SOFI","BAC","F","NIO","INTC","SNAP"]
    results = []
    for sym in tickers:
        try:
            tk = yf.Ticker(sym)
            exps = tk.options
            if not exps:
                continue
            chain = tk.option_chain(exps[0])
            for _, row in chain.calls.iterrows():
                vol = int(row.get("volume") or 0)
                oi = int(row.get("openInterest") or 0)
                iv = float(row.get("impliedVolatility") or 0)
                if vol > 2 * oi and vol > 1000 and oi > 200:
                    results.append({
                        "ticker": sym, "type": "CALL",
                        "strike": round(float(row["strike"]), 2),
                        "volume": vol, "oi": oi,
                        "iv": round(iv, 4),
                        "last": round(float(row.get("lastPrice") or 0), 2),
                        "bid": round(float(row.get("bid") or 0), 2),
                        "ask": round(float(row.get("ask") or 0), 2),
                        "expiry": exps[0],
                    })
            for _, row in chain.puts.iterrows():
                vol = int(row.get("volume") or 0)
                oi = int(row.get("openInterest") or 0)
                iv = float(row.get("impliedVolatility") or 0)
                if vol > 2 * oi and vol > 1000 and oi > 200:
                    results.append({
                        "ticker": sym, "type": "PUT",
                        "strike": round(float(row["strike"]), 2),
                        "volume": vol, "oi": oi,
                        "iv": round(iv, 4),
                        "last": round(float(row.get("lastPrice") or 0), 2),
                        "bid": round(float(row.get("bid") or 0), 2),
                        "ask": round(float(row.get("ask") or 0), 2),
                        "expiry": exps[0],
                    })
        except Exception:
            continue
    results.sort(key=lambda x: x["volume"], reverse=True)
    return {"unusual": results[:30], "count": len(results), "scanned": len(tickers)}


@app.get("/api/options/whale")
async def options_whale():
    import yfinance as yf
    tickers = ["SPY","QQQ","NVDA","AAPL","TSLA","META","AMZN","GOOGL","MSFT","AMD"]
    results = []
    for sym in tickers:
        try:
            tk = yf.Ticker(sym)
            exps = tk.options
            if not exps:
                continue
            chain = tk.option_chain(exps[0])
            for _, row in chain.calls.iterrows():
                vol = int(row.get("volume") or 0)
                last = float(row.get("lastPrice") or 0)
                premium = vol * last * 100
                if premium > 500000:
                    results.append({
                        "ticker": sym, "type": "CALL",
                        "strike": round(float(row["strike"]), 2),
                        "premium": round(premium, 0),
                        "volume": vol,
                        "expiry": exps[0],
                    })
            for _, row in chain.puts.iterrows():
                vol = int(row.get("volume") or 0)
                last = float(row.get("lastPrice") or 0)
                premium = vol * last * 100
                if premium > 500000:
                    results.append({
                        "ticker": sym, "type": "PUT",
                        "strike": round(float(row["strike"]), 2),
                        "premium": round(premium, 0),
                        "volume": vol,
                        "expiry": exps[0],
                    })
        except Exception:
            continue
    results.sort(key=lambda x: x["premium"], reverse=True)
    return {"whale": results[:20], "count": len(results), "scanned": len(tickers)}
"""
