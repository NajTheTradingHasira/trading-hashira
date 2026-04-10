"""
Trading Hashira — AI Proxy (Claude + Perplexity)

POST /api/claude      — Claude primary, Perplexity fallback
POST /api/perplexity  — Perplexity direct (web-grounded research)
GET  /api/ai/health   — Check both keys

Requires env vars on Railway:
  ANTHROPIC_API_KEY   — Anthropic Messages API
  PERPLEXITY_API_KEY  — Perplexity Chat Completions API
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import httpx
import os
from datetime import datetime

router = APIRouter(tags=["ai"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"


# ─── Request Models ───

class ClaudeRequest(BaseModel):
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4000
    system: Optional[str] = None
    messages: list


class PerplexityRequest(BaseModel):
    query: str
    ticker: Optional[str] = None
    context: Optional[str] = "trading"
    model: str = "sonar-pro"


# ─── Anthropic Call ───

async def _call_anthropic(body: ClaudeRequest) -> dict:
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": body.model,
        "max_tokens": body.max_tokens,
        "messages": body.messages,
    }
    if body.system:
        payload["system"] = body.system

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(ANTHROPIC_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"Anthropic {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        content = data.get("content", [])
        text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
        return {
            "content": content,
            "text": text,
            "model": data.get("model", body.model),
            "source": "anthropic",
            "usage": data.get("usage", {}),
            "stop_reason": data.get("stop_reason", ""),
        }


# ─── Perplexity Call ───

async def _call_perplexity(messages: list, system: str = None, model: str = "sonar-pro", max_tokens: int = 4000) -> dict:
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json",
    }
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    for m in messages:
        msgs.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    payload = {
        "model": model,
        "messages": msgs,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "return_citations": True,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(PERPLEXITY_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"Perplexity {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        choice = data.get("choices", [{}])[0]
        text = choice.get("message", {}).get("content", "")
        citations = data.get("citations", [])
        return {
            "content": [{"type": "text", "text": text}],
            "text": text,
            "model": data.get("model", model),
            "source": "perplexity",
            "citations": citations,
            "usage": data.get("usage", {}),
        }


# ─── POST /api/claude — Claude primary, Perplexity fallback ───

@router.post("/api/claude")
async def claude_proxy(body: ClaudeRequest):
    """
    Routes to Claude first. If Claude fails (no key, rate limit, error),
    falls back to Perplexity with the same prompt.
    """
    errors = []

    # Try Claude first
    if ANTHROPIC_API_KEY:
        try:
            result = await _call_anthropic(body)
            return JSONResponse(content=result)
        except Exception as e:
            errors.append(f"Claude: {str(e)[:200]}")

    # Fallback to Perplexity
    if PERPLEXITY_API_KEY:
        try:
            result = await _call_perplexity(
                messages=body.messages,
                system=body.system,
                max_tokens=body.max_tokens,
            )
            result["fallback"] = True
            result["primary_errors"] = errors
            return JSONResponse(content=result)
        except Exception as e:
            errors.append(f"Perplexity: {str(e)[:200]}")

    raise HTTPException(
        status_code=500,
        detail=f"Both AI providers failed. Errors: {errors}. "
               "Configure ANTHROPIC_API_KEY and/or PERPLEXITY_API_KEY in Railway.",
    )


# ─── POST /api/perplexity — Direct Perplexity (web-grounded) ───

@router.post("/api/perplexity")
async def perplexity_research(body: PerplexityRequest):
    """
    Direct Perplexity query with web search grounding.
    Great for: dark pool intel, news sentiment, earnings whispers,
    sector rotation context, macro regime analysis.
    """
    if not PERPLEXITY_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="PERPLEXITY_API_KEY not configured. Add it in Railway → Variables.",
        )

    system_prompts = {
        "trading": (
            "You are an institutional-grade market research analyst. "
            "Provide concise, actionable analysis using Weinstein Stage Analysis, "
            "Oliver Kell Cycle of Price Action, and CANSLIM methodology. "
            "Always state market regime before individual names. "
            "Flag IV percentile and HV/IV relationship on all options recommendations. "
            "Use specific price levels, not vague language."
        ),
        "darkpool": (
            "You are a dark pool and institutional flow analyst. "
            "Analyze dark pool prints, block trades, and institutional positioning. "
            "Identify accumulation vs distribution patterns. "
            "Reference specific volume levels, VWAP relationships, and hidden support/resistance."
        ),
        "earnings": (
            "You are a pre-earnings setup analyst. "
            "Analyze IV crush expectations, historical earnings gaps, "
            "options structure recommendations (straddles, spreads, condors), "
            "and post-earnings drift patterns."
        ),
        "macro": (
            "You are a macro strategist. Analyze FRED data, yield curve dynamics, "
            "fed policy expectations, and cross-asset correlations. "
            "Translate macro signals into actionable equity/options positioning."
        ),
    }

    system = system_prompts.get(body.context, system_prompts["trading"])
    query = body.query
    if body.ticker:
        query = f"[Ticker: {body.ticker}] {query}"

    try:
        result = await _call_perplexity(
            messages=[{"role": "user", "content": query}],
            system=system,
            model=body.model,
        )
        return JSONResponse(content={
            **result,
            "query": body.query,
            "ticker": body.ticker,
            "context": body.context,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Health Check ───

@router.get("/api/ai/health")
async def ai_health():
    return {
        "anthropic": {
            "configured": bool(ANTHROPIC_API_KEY),
            "status": "ready" if ANTHROPIC_API_KEY else "no_key",
        },
        "perplexity": {
            "configured": bool(PERPLEXITY_API_KEY),
            "status": "ready" if PERPLEXITY_API_KEY else "no_key",
        },
        "fallback_chain": "Claude → Perplexity → Error",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
