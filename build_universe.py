"""
Trading Hashira — Ticker Universe Builder
==========================================
Regenerates tickers.json by pulling S&P 100 and NASDAQ 100 constituents
from Wikipedia, merging with hardcoded core/custom/etf lists, and deduplicating.

Usage:  python build_universe.py
Output: tickers.json (overwrites in place)

Silent fallback: if Wikipedia is unreachable, keeps the last saved tickers.json.
"""

import json
import pathlib
import re
import sys

TICKERS_PATH = pathlib.Path(__file__).parent / "tickers.json"

# ── Hardcoded lists (authoritative — never overwritten by Wikipedia) ──────

CORE = [
    "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "TSLA", "AMD",
    "CRM", "NFLX", "PLTR", "AVGO", "JPM", "GS", "V", "UNH",
    "MA", "HD", "BA", "CAT", "LMT", "NOW", "RIOT", "CRWD",
    "COIN", "SNOW", "NET", "SQ", "SHOP", "LCID",
]

ETFS = ["SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "GLD", "SLV", "TLT", "BITO"]

CUSTOM = ["MSTR", "MARA", "SMCI", "ARM", "SOFI", "BAC", "F", "NIO", "SNAP", "GOOG", "BRK-B"]

SECTORS = {
    "NVDA": "Technology", "AAPL": "Technology", "MSFT": "Technology",
    "META": "Communication", "GOOGL": "Communication",
    "AMZN": "Consumer Discretionary", "TSLA": "Consumer Discretionary",
    "AMD": "Technology", "CRM": "Technology", "NFLX": "Communication",
    "PLTR": "Technology", "AVGO": "Technology",
    "JPM": "Financials", "GS": "Financials", "V": "Financials",
    "UNH": "Healthcare", "MA": "Financials",
    "HD": "Consumer Discretionary", "BA": "Industrials",
    "CAT": "Industrials", "LMT": "Industrials",
    "NOW": "Technology", "RIOT": "Financials", "CRWD": "Technology",
    "COIN": "Financials", "SNOW": "Technology", "NET": "Technology",
    "SQ": "Financials", "SHOP": "Technology",
    "LCID": "Consumer Discretionary",
    "MSTR": "Technology", "MARA": "Financials", "SMCI": "Technology",
    "ARM": "Technology", "SOFI": "Financials", "BAC": "Financials",
    "F": "Consumer Discretionary", "NIO": "Consumer Discretionary",
    "SNAP": "Communication", "GOOG": "Communication", "BRK-B": "Financials",
    "SPY": "ETF", "QQQ": "ETF", "IWM": "ETF", "DIA": "ETF",
    "XLF": "ETF", "XLE": "ETF", "GLD": "ETF", "SLV": "ETF",
    "TLT": "ETF", "BITO": "ETF",
}

# ── Wikipedia scraping ────────────────────────────────────────────────────

WIKI_PAGES = [
    ("https://en.wikipedia.org/wiki/S%26P_100", "S&P 100"),
    ("https://en.wikipedia.org/wiki/Nasdaq-100", "NASDAQ 100"),
]


def _fetch_wiki_tickers() -> list[str]:
    """Pull ticker symbols from Wikipedia S&P 100 and NASDAQ 100 tables."""
    try:
        import urllib.request
    except ImportError:
        return []

    all_syms: set[str] = set()
    for url, label in WIKI_PAGES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TradingHashira/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            # Only parse the FIRST sortable wikitable (current constituents),
            # skip historical/former member tables that appear later.
            table_match = re.search(r'<table[^>]*class="[^"]*wikitable[^"]*sortable[^"]*"[^>]*>(.*?)</table>', html, re.DOTALL)
            if not table_match:
                table_match = re.search(r'<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>(.*?)</table>', html, re.DOTALL)
            table_html = table_match.group(1) if table_match else html

            found: set[str] = set()
            # Extract tickers from <td> cells in the constituents table
            for m in re.finditer(r'<td[^>]*>(.*?)</td>', table_html, re.DOTALL):
                text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                if re.fullmatch(r'[A-Z]{1,5}(?:\.[A-Z])?', text):
                    found.add(text)
            # Also catch "NYSE: TICKER" / "NASDAQ: TICKER" patterns
            for m in re.finditer(r'(?:NYSE|NASDAQ|Nasdaq)\s*:\s*([A-Z]{1,5}(?:\.[A-Z])?)', table_html):
                found.add(m.group(1))
            # Blocklist: common acronyms that aren't tickers
            blocklist = {'NYSE', 'SEC', 'ETF', 'USA', 'CEO', 'IPO', 'LLC', 'INC',
                         'EST', 'UTC', 'PDF', 'FAQ', 'RSS', 'XML', 'API', 'USD',
                         'EUR', 'GBP', 'MBA', 'GDP', 'FDA', 'FBI', 'FTC', 'DOJ',
                         'OTC', 'DNA', 'RNA', 'HIV', 'NFL', 'NBA', 'NHL'}
            for s in found:
                s = s.strip().replace(".", "-")  # BRK.B -> BRK-B
                if re.fullmatch(r'[A-Z]{1,5}(?:-[A-Z])?', s) and s not in blocklist:
                    all_syms.add(s)
            print(f"  [{label}] pulled {len(found)} symbols from Wikipedia")
        except Exception as e:
            print(f"  [{label}] Wikipedia fetch failed: {e} — skipping")
    return sorted(all_syms)


def build():
    """Build and write tickers.json."""
    known = set(CORE + ETFS + CUSTOM)

    print("Fetching index constituents from Wikipedia...")
    wiki_tickers = _fetch_wiki_tickers()

    # Extended = wiki tickers that aren't already in core/etfs/custom
    if wiki_tickers:
        extended = sorted(set(wiki_tickers) - known)
        print(f"  {len(extended)} new tickers added to 'extended'")
    else:
        # Fallback: keep existing extended from tickers.json if it exists
        print("  Wikipedia unreachable — keeping existing extended list")
        extended = []
        if TICKERS_PATH.exists():
            try:
                existing = json.loads(TICKERS_PATH.read_text())
                extended = existing.get("extended", [])
            except (json.JSONDecodeError, KeyError):
                pass
        if not extended:
            # Minimum seed from current modules
            extended = ["PG", "JNJ", "LLY", "COST", "ORCL", "ADBE", "INTC",
                        "XOM", "CVX", "GE", "RTX"]

    from datetime import date

    registry = {
        "_meta": {
            "description": "Centralized ticker registry for Trading Hashira. Regenerate with: python build_universe.py",
            "updated": date.today().isoformat(),
            "chunk_size": 30,
        },
        "core": CORE,
        "etfs": ETFS,
        "custom": CUSTOM,
        "extended": extended,
        "sectors": SECTORS,
    }

    TICKERS_PATH.write_text(json.dumps(registry, indent=2) + "\n")
    total = len(set(CORE + ETFS + CUSTOM + extended))
    print(f"\nWrote tickers.json — {total} unique tickers across all categories")
    print(f"  core: {len(CORE)}  |  etfs: {len(ETFS)}  |  custom: {len(CUSTOM)}  |  extended: {len(extended)}")


if __name__ == "__main__":
    build()
