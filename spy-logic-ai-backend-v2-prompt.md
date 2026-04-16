# SPY Logic AI Tape Reading — Backend Endpoint (Dual Provider)

## Overview
Add `POST /api/spy-logic/analysis` — an AI-powered endpoint that generates a comprehensive SPY tape reading for 0DTE trading. Accepts a `provider` parameter to choose between Perplexity (web search enabled) or Claude. Each provider cached independently for 5 minutes.

**Add to the existing FastAPI app in the nexus-terminal repo.**

---

## Endpoint: `POST /api/spy-logic/analysis`

### Request Body
```json
{
  "provider": "perplexity"   // "perplexity" or "claude"
}
```

### Response Schema
```json
{
  "analysis": "...full markdown text...",
  "model_used": "perplexity",
  "market_data": {
    "price": 550.23,
    "vwap": 548.90,
    "open": 549.10,
    "prior_close": 547.80,
    "day_range": "547.50 - 551.20",
    "sector_breadth": "8/11 green"
  },
  "timestamp": "2025-04-15T14:30:00Z"
}
```

### Implementation

```python
import httpx
import os
import json
import time
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import yfinance as yf

# Separate caches per provider
_analysis_cache = {
    "perplexity": {"data": None, "ts": 0},
    "claude": {"data": None, "ts": 0}
}
ANALYSIS_CACHE_TTL = 300  # 5 minutes

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


class AnalysisRequest(BaseModel):
    provider: str = "perplexity"  # "perplexity" or "claude"


def _gather_spy_context():
    """Fetch live SPY data to inject into the AI prompt."""
    try:
        spy = yf.Ticker("SPY")
        intraday = spy.history(period="1d", interval="5m")
        daily = spy.history(period="1mo", interval="1d")

        if intraday.empty:
            return None

        current = round(float(intraday['Close'].iloc[-1]), 2)
        today_open = round(float(intraday['Open'].iloc[0]), 2)
        day_high = round(float(intraday['High'].max()), 2)
        day_low = round(float(intraday['Low'].min()), 2)
        prior_close = round(float(daily['Close'].iloc[-2]), 2) if len(daily) >= 2 else None

        # VWAP
        tp = (intraday['High'] + intraday['Low'] + intraday['Close']) / 3
        cum_tp_vol = (tp * intraday['Volume']).cumsum()
        cum_vol = intraday['Volume'].cumsum()
        vwap = round(float((cum_tp_vol / cum_vol).iloc[-1]), 2)

        # Recent daily levels
        if len(daily) >= 5:
            recent_5d_high = round(float(daily['High'].tail(5).max()), 2)
            recent_5d_low = round(float(daily['Low'].tail(5).min()), 2)
        else:
            recent_5d_high = day_high
            recent_5d_low = day_low

        month_high = round(float(daily['High'].max()), 2)
        month_low = round(float(daily['Low'].min()), 2)

        # Sector breadth
        sectors = ['XLK','XLF','XLE','XLV','XLY','XLP','XLI','XLB','XLRE','XLC','XLU']
        try:
            sec_data = yf.download(sectors, period="2d", interval="1d", progress=False, threads=True)
            sec_changes = {}
            if not sec_data.empty:
                close = sec_data['Close']
                for s in sectors:
                    if s in close.columns and len(close[s].dropna()) >= 2:
                        vals = close[s].dropna().values
                        sec_changes[s] = round(((vals[-1] - vals[-2]) / vals[-2]) * 100, 2)
            green = [s for s, v in sec_changes.items() if v > 0]
            red = [s for s, v in sec_changes.items() if v <= 0]
            sorted_sec = sorted(sec_changes.items(), key=lambda x: x[1], reverse=True)
            leaders = [f"{s} ({v:+.1f}%)" for s, v in sorted_sec[:3]]
            laggards = [f"{s} ({v:+.1f}%)" for s, v in sorted_sec[-3:]]
            breadth_str = f"{len(green)}/{len(sec_changes)} sectors green. Leaders: {', '.join(leaders)}. Laggards: {', '.join(laggards)}"
        except:
            breadth_str = "Sector data unavailable"

        return {
            "price": current,
            "open": today_open,
            "prior_close": prior_close,
            "day_high": day_high,
            "day_low": day_low,
            "vwap": vwap,
            "recent_5d_high": recent_5d_high,
            "recent_5d_low": recent_5d_low,
            "month_high": month_high,
            "month_low": month_low,
            "breadth": breadth_str,
            "day_range": f"{day_low} - {day_high}"
        }
    except Exception as e:
        return None


def _build_prompt(ctx):
    """Build the structured prompt for the AI."""
    system = """You are an elite SPY 0DTE options day-trader and tape reader. You combine higher-timeframe technical context with intraday price action, VWAP structure, market internals, and options flow to produce a pre-market / intraday game plan.

Your output MUST follow this exact structure with these exact headers (use markdown):

## Bias summary
One paragraph: today's directional lean, confidence level, and the single biggest thing to watch.

## Higher-timeframe tape
2-3 bullets on the daily/weekly context — where SPY sits in its current swing, distance from key MAs, breadth context, any macro catalysts.

## Intraday structure and bias
2-3 bullets on pre-market prints, developing VWAP, opening expectations.

## Key levels roadmap
A markdown table with columns: Zone | Role today | Notes
Include 5-6 levels from upper resistance down to line-in-the-sand support. Use ranges not single ticks.

## 0DTE SPY options playbook
For each of 3 scenarios (A, B, C):
- Scenario label and condition
- Bias (trend/grind/range/fade)
- Preferred options structure (calls, puts, spreads, size)
- Entry trigger (specific price action pattern)
- Profit target zone
- Risk / hard stop

## Execution framework
- When to enter (what to wait for)
- Entry trigger pattern (specific bar-by-bar)
- Options structure recommendation with strikes relative to levels
- Risk management: where the thesis breaks

Be specific with price levels. Use the live data provided. Do NOT hedge with "this is not financial advice" disclaimers — this is a trader's internal playbook."""

    user_msg = f"""Give me a comprehensive tape reading on SPY for today's session.

Live market data:
- SPY price: ${ctx['price']}
- Today's open: ${ctx['open']}
- Prior close: ${ctx['prior_close']}
- Day range: {ctx['day_range']}
- VWAP: ${ctx['vwap']}
- 5-day high: ${ctx['recent_5d_high']}
- 5-day low: ${ctx['recent_5d_low']}
- 1-month high: ${ctx['month_high']}
- 1-month low: ${ctx['month_low']}
- Sector breadth: {ctx['breadth']}

Based on this data and current market conditions:
1. What is the higher-timeframe tape telling us?
2. Should I be looking for longs on pullbacks or shorts on rallies today?
3. Give me the key levels roadmap as a table.
4. Build me the 0DTE options playbook with 3 scenarios.
5. Give me the execution framework with specific triggers.

Search the web for today's SPY pre-market action, futures, VIX level, and any overnight catalysts to incorporate into your analysis."""

    return system, user_msg


async def _call_perplexity(system, user_msg):
    """Call Perplexity API with web search."""
    if not PERPLEXITY_API_KEY:
        raise Exception("PERPLEXITY_API_KEY not configured")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.perplexity.ai/chat/completions",
            headers={
                "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "sonar-pro",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg}
                ],
                "temperature": 0.3,
                "max_tokens": 4000
            }
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        raise Exception(f"Perplexity returned {resp.status_code}: {resp.text[:200]}")


async def _call_claude(system, user_msg):
    """Call Claude API."""
    if not ANTHROPIC_API_KEY:
        raise Exception("ANTHROPIC_API_KEY not configured")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4000,
                "system": system,
                "messages": [
                    {"role": "user", "content": user_msg}
                ]
            }
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["content"][0]["text"]
        raise Exception(f"Claude returned {resp.status_code}: {resp.text[:200]}")


@router.post("/api/spy-logic/analysis")
async def get_spy_analysis(req: AnalysisRequest = AnalysisRequest()):
    """AI-powered SPY tape reading — choose provider."""
    provider = req.provider if req.provider in ("perplexity", "claude") else "perplexity"
    now = time.time()

    # Check per-provider cache
    cached = _analysis_cache.get(provider, {})
    if cached.get("data") and (now - cached.get("ts", 0)) < ANALYSIS_CACHE_TTL:
        return cached["data"]

    # Gather live data
    ctx = _gather_spy_context()
    if not ctx:
        return {"error": "Could not fetch SPY market data", "analysis": None}

    # Build prompt
    system, user_msg = _build_prompt(ctx)

    # Call selected provider
    try:
        if provider == "perplexity":
            analysis = await _call_perplexity(system, user_msg)
        else:
            analysis = await _call_claude(system, user_msg)
    except Exception as e:
        return {"error": f"{provider} failed: {str(e)}", "analysis": None}

    result = {
        "analysis": analysis,
        "model_used": provider,
        "market_data": {
            "price": ctx["price"],
            "vwap": ctx["vwap"],
            "open": ctx["open"],
            "prior_close": ctx["prior_close"],
            "day_range": ctx["day_range"],
            "sector_breadth": ctx["breadth"]
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    _analysis_cache[provider] = {"data": result, "ts": now}
    return result
```

### Dependencies
Ensure `httpx` is in requirements.txt (add if missing). Everything else (`yfinance`, `pydantic`) is already installed.

### Registration
Include this endpoint in the same router as the `GET /api/spy-logic` endpoint. If adding to a separate file, register the router in the main app.

---

## Deploy

```bash
cd ~/nexus-terminal
git add -A
git commit -m "SPY Logic AI analysis — dual provider (Perplexity + Claude), selectable, cached independently"
git push
```
