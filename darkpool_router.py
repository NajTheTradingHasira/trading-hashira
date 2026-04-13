"""
Trading Hashira — Dark Pool Router
GET /api/darkpool — Cross-market dark pool flow data.
Currently generates seeded mock data. Ready for live feed integration
(Quiver Quant, Unusual Whales, or FINRA ADF).
"""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import json
import pathlib
import random
import hashlib
from datetime import datetime

router = APIRouter(prefix="/api/darkpool", tags=["darkpool"])

# ── Load tickers from centralized registry ─────────────────────────────
_REG = json.loads((pathlib.Path(__file__).parent / "tickers.json").read_text())
TICKERS = [(t, _REG["sectors"].get(t, "Technology")) for t in _REG["core"]]

VENUES = ["NYSE DP", "BATS DP", "FINRA TRF", "MEMX DP", "FINRA ADF", "EDGX DP"]


def _seed(day: str) -> random.Random:
    h = int(hashlib.md5(day.encode()).hexdigest(), 16)
    return random.Random(h)


@router.get("")
async def get_darkpool(ticker: str = Query(None), size: str = Query("ALL")):
    """Dark pool flow feed. Seeded mock per day."""
    rng = _seed(datetime.utcnow().strftime("%Y-%m-%d"))
    now = datetime.utcnow()

    feed = []
    for i in range(120):
        tk, sector = rng.choice(TICKERS)
        base_price = 40 + rng.random() * 500
        price = round(base_price * (0.96 + rng.random() * 0.08), 2)
        vwap = round(base_price * (0.97 + rng.random() * 0.06), 2)
        vol = int(
            rng.random() < 0.06 and 1_000_000 + rng.random() * 4_000_000
            or rng.random() < 0.22 and 500_000 + rng.random() * 500_000
            or 100_000 + rng.random() * 400_000
        )
        above_vwap = price >= vwap
        size_cat = "WHALE" if vol >= 1_000_000 else "MEGA" if vol >= 500_000 else "BLOCK"
        t = datetime(now.year, now.month, now.day, 9, 30) 
        offset_sec = int(rng.random() * 23400)  # 6.5 hrs
        t_str = f"{9 + offset_sec // 3600:02d}:{(offset_sec % 3600) // 60:02d}:{offset_sec % 60:02d}"

        feed.append({
            "id": i,
            "time": t_str,
            "ticker": tk,
            "sector": sector,
            "price": price,
            "vwap": vwap,
            "volume": vol,
            "notional": round(vol * price, 0),
            "venue": rng.choice(VENUES),
            "aboveVwap": above_vwap,
            "sizeCategory": size_cat,
        })

    # Apply filters
    if ticker:
        ticker = ticker.upper().strip()
        feed = [f for f in feed if f["ticker"] == ticker]
    if size and size != "ALL":
        feed = [f for f in feed if f["sizeCategory"] == size.upper()]

    feed.sort(key=lambda x: x["time"], reverse=True)

    total_vol = sum(f["volume"] for f in feed)
    total_not = sum(f["notional"] for f in feed)
    buy_count = sum(1 for f in feed if f["aboveVwap"])
    buy_pct = round(buy_count / len(feed) * 100, 1) if feed else 0

    return JSONResponse(content={
        "feed": feed,
        "summary": {
            "total_volume": total_vol,
            "total_notional": total_not,
            "buy_pct": buy_pct,
            "tickers_active": len(set(f["ticker"] for f in feed)),
            "whale_count": sum(1 for f in feed if f["sizeCategory"] == "WHALE"),
            "mega_count": sum(1 for f in feed if f["sizeCategory"] == "MEGA"),
        },
        "count": len(feed),
        "source": "mock",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
