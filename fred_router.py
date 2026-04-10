"""
Trading Hashira — FRED Router
GET /api/fred — Returns FRED indicators keyed by series ID for the frontend.
Proxies the macro.py data into the flat format the dashboard/macro page expects:
  { DGS10: {value: 4.25}, DGS2: {value: 3.90}, ... }
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import requests
import os
import math
from datetime import datetime

router = APIRouter(prefix="/api/fred", tags=["fred"])

FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

SERIES = {
    "DGS10": "10Y Treasury Yield",
    "DGS2": "2Y Treasury Yield",
    "T10Y2Y": "10Y-2Y Spread",
    "FEDFUNDS": "Fed Funds Rate",
    "UNRATE": "Unemployment Rate",
    "ICSA": "Initial Jobless Claims",
    "CPIAUCSL": "CPI (All Urban)",
    "DCOILWTICO": "WTI Crude Oil",
    "DTWEXBGS": "Trade-Weighted USD Index",
}


def sf(val):
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


@router.get("")
async def get_fred():
    """Return latest FRED values keyed by series ID."""
    if not FRED_API_KEY:
        return JSONResponse(
            status_code=500,
            content={"error": "FRED_API_KEY not configured"},
        )

    result = {}
    errors = []

    for series_id, label in SERIES.items():
        try:
            params = {
                "series_id": series_id,
                "api_key": FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 2,
            }
            resp = requests.get(FRED_BASE, params=params, timeout=8)
            if not resp.ok:
                errors.append(f"{series_id}: HTTP {resp.status_code}")
                continue

            obs = resp.json().get("observations", [])
            valid = [o for o in obs if o.get("value") and o["value"] != "."]
            if not valid:
                continue

            value = sf(valid[0]["value"])
            if value is not None:
                result[series_id] = {
                    "value": round(value, 3),
                    "label": label,
                    "date": valid[0].get("date", ""),
                }
        except Exception as e:
            errors.append(f"{series_id}: {e}")

    return JSONResponse(content={
        **result,
        "_meta": {
            "count": len(result),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "errors": errors if errors else None,
        },
    })
