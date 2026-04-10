# ══════════════════════════════════════════════════════════════
# TRADING HASHIRA — NEW ENDPOINT WIRING GUIDE
# ══════════════════════════════════════════════════════════════
#
# 6 new router files to drop into nexus-backend/api/
#
# Files:
#   api/sectors.py          → GET  /api/sectors
#   api/earnings_router.py  → GET  /api/earnings/{ticker}
#   api/fred_router.py      → GET  /api/fred
#   api/market_data.py      → GET  /api/market-data/{ticker}
#   api/darkpool_router.py  → GET  /api/darkpool
#   api/lstm_router.py      → GET  /api/lstm/{ticker}
#   api/ai_research.py      → POST /api/research/stage
#
# ══════════════════════════════════════════════════════════════
# ADD THESE LINES TO server.py (near other router imports):
# ══════════════════════════════════════════════════════════════

# --- Copy this block into server.py ---

from api.sectors import router as sectors_router
from api.earnings_router import router as earnings_router
from api.fred_router import router as fred_router
from api.market_data import router as market_data_router
from api.darkpool_router import router as darkpool_router
from api.lstm_router import router as lstm_router
from api.ai_research import router as ai_research_router

app.include_router(sectors_router)
app.include_router(earnings_router)
app.include_router(fred_router)
app.include_router(market_data_router)
app.include_router(darkpool_router)
app.include_router(lstm_router)
app.include_router(ai_research_router)

# ══════════════════════════════════════════════════════════════
# ENDPOINT MAP (after wiring):
# ══════════════════════════════════════════════════════════════
#
#  Frontend Page        →  Backend Endpoint          →  Data Source
#  ─────────────────────────────────────────────────────────────
#  Watchlist prices     →  GET /api/market-data/AAPL  →  yfinance
#  Macro / FRED cards   →  GET /api/fred              →  FRED API
#  Sectors RS ranking   →  GET /api/sectors            →  yfinance batch
#  Earnings IV scanner  →  GET /api/earnings/NVDA      →  yfinance
#  Dark Pool flow       →  GET /api/darkpool           →  mock (live-ready)
#  LSTM forecast        →  GET /api/lstm/SPY           →  yfinance + numpy
#  AI Analysis          →  POST /api/research/stage    →  yfinance + computed
#
# ══════════════════════════════════════════════════════════════
# NOTES:
# ══════════════════════════════════════════════════════════════
#
# 1. No new dependencies — all use yfinance, numpy, requests (already in requirements.txt)
#
# 2. If server.py already has conflicting routes (e.g. inline /api/earnings),
#    either remove the inline version or rename the router prefix.
#
# 3. Dark pool is mock data (seeded per day). To wire live data later,
#    replace the feed generation in darkpool_router.py with your data source.
#
# 4. AI Research currently returns computed analysis from yfinance.
#    To wire Claude API, set ANTHROPIC_API_KEY env var and update
#    ai_research.py to call the messages endpoint.
#
# 5. LSTM is a momentum extrapolation model, not a real LSTM.
#    Swap in a trained model from models/quant_models.py later.
#
# ══════════════════════════════════════════════════════════════
# CLAUDE CODE COMMAND (paste this to auto-wire):
# ══════════════════════════════════════════════════════════════
#
# Copy the 7 new .py files into nexus-backend/api/ and add the
# import + include_router lines to server.py. Do NOT remove any
# existing routes. Place the new imports near the existing router
# imports and the include_router calls near the existing ones.
#
