/* ═══════════════════════════════════════════════════════════════════════
   FIX 1: COT SORT ORDER — Asset Class Grouping
   ═══════════════════════════════════════════════════════════════════════
   Replace your existing COT table rendering sort with this order array.
   Paste this into your COT rendering logic — wherever you iterate over
   the /api/cot/v2 response to build table rows.
   ═══════════════════════════════════════════════════════════════════════ */

const COT_ASSET_ORDER = [
  // ── Equity Indices ──
  'E-Mini S&P 500',
  'Nasdaq 100',
  'Dow Jones Mini',        // ← see Fix 2
  'Russell 2000',

  // ── Commodities ──
  'Gold',
  'Silver',
  'Crude Oil',

  // ── FX ──
  'U.S. Dollar Index',
  'Euro FX',
  'Japanese Yen',
  'British Pound',

  // ── Rates ──
  'Fed Funds',
  '2-Year T-Note',
  '10-Year T-Note',

  // ── Volatility ──
  'VIX Futures',
];

// Group labels for visual separators in the table
const COT_GROUP_MAP = {
  'E-Mini S&P 500': 'EQUITY INDICES',
  'Gold':           'COMMODITIES',
  'U.S. Dollar Index': 'FX',
  'Fed Funds':      'RATES',
  'VIX Futures':    'VOLATILITY',
};

/**
 * Sort COT results by asset class order.
 * Call this on your /api/cot/v2 response array before rendering.
 *
 * Usage:
 *   const sorted = sortCotByAssetClass(data.contracts);
 *   // then render sorted array, inserting group headers where COT_GROUP_MAP matches
 */
function sortCotByAssetClass(contracts) {
  return [...contracts].sort((a, b) => {
    const idxA = COT_ASSET_ORDER.indexOf(a.name);
    const idxB = COT_ASSET_ORDER.indexOf(b.name);
    // Unknown contracts go to the end
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

/**
 * Example: Inject group header rows into your table rendering loop.
 *
 *   let lastGroup = '';
 *   for (const c of sorted) {
 *     const group = COT_GROUP_MAP[c.name];
 *     if (group && group !== lastGroup) {
 *       lastGroup = group;
 *       html += `<tr><td colspan="8" style="color:#00e5ff; font-weight:700;
 *         padding: 12px 10px 6px; font-size:11px; letter-spacing:1px;
 *         border-bottom:1px solid #333;">${group}</td></tr>`;
 *     }
 *     html += renderCotRow(c);  // your existing row renderer
 *   }
 */
