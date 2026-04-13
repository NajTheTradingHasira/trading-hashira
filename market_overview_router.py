"""
Market Overview Endpoints — GET /api/heatmap + GET /api/movers
═══════════════════════════════════════════════════════════════
Integration:
    from api.market_overview_router import router as market_overview_router
    app.include_router(market_overview_router)

Data source: Yahoo Finance (no API key needed).
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import pathlib
import httpx

router = APIRouter(prefix="/api", tags=["market-overview"])

# ── Load tickers from centralized registry ─────────────────────────────
_REG = json.loads((pathlib.Path(__file__).parent / "tickers.json").read_text())

# ── Sector / Heatmap Tickers ────────────────────────────────────────────

SECTOR_ETFS = {
    "Technology":      "XLK",
    "Healthcare":      "XLV",
    "Financials":      "XLF",
    "Consumer Disc.":  "XLY",
    "Consumer Staples":"XLP",
    "Energy":          "XLE",
    "Industrials":     "XLI",
    "Materials":       "XLB",
    "Utilities":       "XLU",
    "Real Estate":     "XLRE",
    "Communication":   "XLC",
}

# Default universe for movers — core + etfs + custom (from tickers.json)
MOVERS_UNIVERSE = list(dict.fromkeys(_REG["core"] + _REG["etfs"] + _REG["custom"]))

# ── Models ──────────────────────────────────────────────────────────────

class SectorData(BaseModel):
    sector: str
    ticker: str
    price: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[int] = None

class HeatmapResponse(BaseModel):
    sectors: list[SectorData]
    timestamp: str

class MoverEntry(BaseModel):
    ticker: str
    price: Optional[float] = None
    change_pct: Optional[float] = None
    change_abs: Optional[float] = None
    volume: Optional[int] = None
    avg_volume: Optional[int] = None
    vol_ratio: Optional[float] = None

class MoversResponse(BaseModel):
    gainers: list[MoverEntry]
    losers: list[MoverEntry]
    most_active: list[MoverEntry]
    timestamp: str

# ── Yahoo Finance Helper ────────────────────────────────────────────────

async def fetch_quote(client: httpx.AsyncClient, ticker: str) -> dict:
    """Fetch real-time quote from Yahoo Finance v8."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {"interval": "1d", "range": "5d"}
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = await client.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    meta = data["chart"]["result"][0]["meta"]
    quotes = data["chart"]["result"][0]["indicators"]["quote"][0]

    price = meta.get("regularMarketPrice", 0)
    prev_close = meta.get("chartPreviousClose") or meta.get("previousClose", 0)
    change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
    change_abs = price - prev_close

    volumes = [v for v in (quotes.get("volume") or []) if v is not None]
    cur_vol = volumes[-1] if volumes else 0
    avg_vol = int(sum(volumes) / len(volumes)) if volumes else 0

    return {
        "ticker": ticker,
        "price": round(price, 2),
        "change_pct": round(change_pct, 2),
        "change_abs": round(change_abs, 2),
        "volume": cur_vol,
        "avg_volume": avg_vol,
        "vol_ratio": round(cur_vol / avg_vol, 2) if avg_vol else 0,
    }

async def batch_fetch(tickers: list[str]) -> list[dict]:
    """Fetch quotes for a list of tickers, 15 concurrent max."""
    results = []
    async with httpx.AsyncClient() as client:
        sem = asyncio.Semaphore(15)
        async def _fetch(t):
            async with sem:
                try:
                    return await fetch_quote(client, t)
                except Exception:
                    return {"ticker": t, "price": None, "change_pct": None,
                            "change_abs": None, "volume": None,
                            "avg_volume": None, "vol_ratio": None}
        results = await asyncio.gather(*[_fetch(t) for t in tickers])
    return list(results)

# ── GET /api/heatmap ────────────────────────────────────────────────────

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap():
    """
    Sector heatmap data — returns % change for each SPDR sector ETF.
    Frontend renders as colored grid (green/red by change_pct).
    """
    from datetime import datetime
    tickers = list(SECTOR_ETFS.values())
    quotes = await batch_fetch(tickers)

    quote_map = {q["ticker"]: q for q in quotes}
    sectors = []
    for sector_name, etf in SECTOR_ETFS.items():
        q = quote_map.get(etf, {})
        sectors.append(SectorData(
            sector=sector_name,
            ticker=etf,
            price=q.get("price"),
            change_pct=q.get("change_pct"),
            volume=q.get("volume"),
        ))

    # Sort by change_pct descending
    sectors.sort(key=lambda s: s.change_pct or 0, reverse=True)

    return HeatmapResponse(
        sectors=sectors,
        timestamp=datetime.utcnow().isoformat() + "Z",
    )

# ── GET /api/movers ────────────────────────────────────────────────────

@router.get("/movers", response_model=MoversResponse)
async def get_movers(
    limit: int = Query(default=10, ge=1, le=25),
    tickers: Optional[str] = Query(default=None, description="Comma-sep tickers to scan instead of default universe"),
):
    """
    Top gainers, losers, most active from a stock universe.
    Optionally pass ?tickers=AAPL,NVDA,... to scan a custom list.
    """
    from datetime import datetime
    universe = (
        [t.strip().upper() for t in tickers.split(",") if t.strip()]
        if tickers
        else MOVERS_UNIVERSE
    )

    quotes = await batch_fetch(universe)
    valid = [q for q in quotes if q["change_pct"] is not None]

    def to_entry(q):
        return MoverEntry(**q)

    # Gainers: top positive movers
    gainers = sorted(valid, key=lambda q: q["change_pct"], reverse=True)[:limit]
    # Losers: worst performers
    losers = sorted(valid, key=lambda q: q["change_pct"])[:limit]
    # Most active: highest volume ratio (today vs avg)
    most_active = sorted(valid, key=lambda q: q.get("vol_ratio", 0), reverse=True)[:limit]

    return MoversResponse(
        gainers=[to_entry(q) for q in gainers],
        losers=[to_entry(q) for q in losers],
        most_active=[to_entry(q) for q in most_active],
        timestamp=datetime.utcnow().isoformat() + "Z",
    )
