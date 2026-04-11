"""
FIX 2: Dow Jones Mini — CFTC Code & Name Matching
═══════════════════════════════════════════════════
The E-mini Dow ($5) CFTC commodity code is 124601.
However, CFTC Socrata data uses the full contract name which varies:
  - "DJIA x $5"
  - "DJIA Consolidated"  
  - "DOW JONES INDUSTRIAL AVG- x $5"
  - "DOW JONES INDUSTRIAL AVERAGE - MINI"

The fix: add all known name variants to your contract matching dict
in cot_router.py.

══════════════════════════════════════════════════════════════════════
PATCH — Apply to your CONTRACTS dict in api/cot_router.py
══════════════════════════════════════════════════════════════════════
"""

# In your CONTRACTS dict (or equivalent mapping), add/replace the
# Dow Jones entry with these search terms:

# BEFORE (probably something like):
#   "Dow Jones Mini": {"code": "124601", "search_terms": ["DJIA"]},

# AFTER — expanded matching:
DOW_JONES_ENTRY = {
    "Dow Jones Mini": {
        "code": "124601",
        "search_terms": [
            "DJIA",
            "DOW JONES INDUSTRIAL",
            "DOW JONES MINI",
            "DJIA x $5",
            "DJIA CONSOLIDATED",
            "DOW JONES INDUSTRIAL AVG",
        ],
        # Also try matching by CFTC code directly as fallback
        "cftc_codes": ["124601", "12460"],
    }
}

# ══════════════════════════════════════════════════════════════════════
# If your matching logic only does name-based search, add a code-based
# fallback. Here's a drop-in helper:
# ══════════════════════════════════════════════════════════════════════

def match_contract(row_name: str, row_code: str, contract_config: dict) -> bool:
    """
    Match a CFTC data row against a contract config.
    Tries name-based matching first, then falls back to CFTC code.
    
    row_name: the 'contract_market_name' field from CFTC data
    row_code: the 'cftc_commodity_code' field from CFTC data
    contract_config: dict with 'search_terms' and optional 'cftc_codes'
    """
    name_upper = row_name.upper()
    code_clean = row_code.strip().rstrip('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    
    # Name match
    for term in contract_config.get("search_terms", []):
        if term.upper() in name_upper:
            return True
    
    # Code match (fallback)
    for code in contract_config.get("cftc_codes", []):
        if code_clean == code or code_clean.startswith(code):
            return True
    
    return False


# ══════════════════════════════════════════════════════════════════════
# USAGE in your v2 processing loop:
#
#   for name, config in CONTRACTS.items():
#       for row in raw_cftc_data:
#           if match_contract(row["contract_market_name"],
#                             row.get("cftc_commodity_code", ""),
#                             config):
#               # process this row for the contract
#               break
# ══════════════════════════════════════════════════════════════════════
