// ══════════════════════════════════════════════════════════════════════════════
// TRADING HASHIRA — OPTIONS TRADE HISTORY MODULE v2.0
// ══════════════════════════════════════════════════════════════════════════════
// localStorage key: 'optionsTrades' (full trade log)
// Features: Buy/Sell logging, auto-position calculation, realized P&L
// Parsers: Webull full row, Robinhood, manual entry
// ══════════════════════════════════════════════════════════════════════════════

// ── CSS Styles ─────────────────────────────────────────────────────────────────
function getTradeHistoryStyles() {
  return `
    /* Tab Switcher */
    .portfolio-tab-row {
      display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid #333;
    }
    .portfolio-tab-btn {
      padding: 10px 24px; background: transparent; border: none;
      color: #888; font-size: 13px; font-family: 'JetBrains Mono', monospace;
      cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s;
    }
    .portfolio-tab-btn:hover { color: #fff; }
    .portfolio-tab-btn.active { color: #00e5ff; border-bottom-color: #00e5ff; }

    /* Sub-tabs within Options */
    .options-subtab-row {
      display: flex; gap: 8px; margin-bottom: 16px;
    }
    .options-subtab {
      padding: 6px 14px; background: transparent; border: 1px solid #333;
      border-radius: 4px; color: #888; font-size: 11px; cursor: pointer;
      font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
    }
    .options-subtab:hover { color: #fff; border-color: #555; }
    .options-subtab.active { color: #00e5ff; border-color: #00e5ff; background: rgba(0,229,255,0.1); }

    /* Stats Row */
    .options-stats-row {
      display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .options-stat-card {
      flex: 1; min-width: 120px; padding: 14px;
      background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333;
    }
    .options-stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .options-stat-value { font-size: 18px; color: #fff; font-weight: 600; margin-top: 4px; }
    .options-stat-value.positive { color: #4caf50; }
    .options-stat-value.negative { color: #ff5252; }

    /* Trade Form */
    .trade-form-section {
      padding: 16px; margin-bottom: 20px;
      background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333;
    }
    .trade-form-title {
      font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .trade-form-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 10px; margin-bottom: 12px;
    }
    .trade-form-group { display: flex; flex-direction: column; gap: 4px; }
    .trade-form-group label {
      font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .trade-form-group input, .trade-form-group select {
      padding: 8px 10px; background: #0a0a14; border: 1px solid #333;
      border-radius: 4px; color: #fff; font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
    }
    .trade-form-group input:focus, .trade-form-group select:focus {
      outline: none; border-color: #00e5ff;
    }
    .trade-form-group input::placeholder { color: #444; }

    /* Paste Area */
    .trade-paste-container { margin-bottom: 16px; }
    .trade-paste-area {
      width: 100%; min-height: 60px; padding: 10px; margin-bottom: 8px;
      background: #0a0a14; border: 1px dashed #444; border-radius: 6px;
      color: #aaa; font-size: 11px; font-family: 'JetBrains Mono', monospace;
      resize: vertical;
    }
    .trade-paste-area:focus { outline: none; border-color: #00e5ff; border-style: solid; }
    .trade-paste-area::placeholder { color: #444; }
    .trade-paste-hint {
      font-size: 10px; color: #555; margin-bottom: 8px;
    }
    .trade-paste-preview {
      padding: 10px; background: #0d0d1a; border-radius: 6px; border: 1px solid #333;
      max-height: 150px; overflow-y: auto; margin-bottom: 10px;
    }
    .trade-preview-row {
      display: grid; grid-template-columns: 60px 50px 60px 80px 40px 60px 70px 60px;
      gap: 8px; padding: 6px 0; border-bottom: 1px solid #222; font-size: 11px; color: #ccc;
    }
    .trade-preview-row:last-child { border-bottom: none; }
    .trade-preview-header { color: #666; font-size: 9px; text-transform: uppercase; }

    /* Buttons */
    .trade-btn {
      padding: 8px 14px; border-radius: 4px; font-size: 11px;
      font-family: 'JetBrains Mono', monospace; cursor: pointer;
      border: 1px solid #333; transition: all 0.2s;
    }
    .trade-btn-primary { background: #00e5ff; color: #000; border-color: #00e5ff; font-weight: 600; }
    .trade-btn-primary:hover { background: #00b8cc; }
    .trade-btn-secondary { background: transparent; color: #888; }
    .trade-btn-secondary:hover { color: #fff; border-color: #666; }
    .trade-btn-danger { background: transparent; color: #ff5252; border-color: #ff5252; }
    .trade-btn-danger:hover { background: #ff5252; color: #fff; }
    .trade-btn-success { background: transparent; color: #4caf50; border-color: #4caf50; }
    .trade-btn-warning { background: transparent; color: #ff9800; border-color: #ff9800; }
    .trade-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Tables */
    .trade-table-container { overflow-x: auto; }
    .trade-table {
      width: 100%; border-collapse: collapse; font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
    }
    .trade-table th {
      text-align: left; padding: 10px 8px; color: #555;
      border-bottom: 1px solid #333; white-space: nowrap;
      text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px;
      position: sticky; top: 0; background: #0d0d1a;
    }
    .trade-table td {
      padding: 8px; border-bottom: 1px solid #1a1a2e; white-space: nowrap;
    }
    .trade-table tr:hover td { background: rgba(0,229,255,0.03); }

    /* Type & Action Badges */
    .trade-type-call { color: #4caf50; font-weight: 600; }
    .trade-type-put { color: #ff5252; font-weight: 600; }
    .trade-action-buy { color: #4caf50; }
    .trade-action-sell { color: #ff9800; }
    .trade-pnl-positive { color: #4caf50; font-weight: 600; }
    .trade-pnl-negative { color: #ff5252; font-weight: 600; }

    /* DTE */
    .trade-dte-ok { color: #4caf50; }
    .trade-dte-warning { color: #ff9800; }
    .trade-dte-danger { color: #ff5252; font-weight: 600; }
    .trade-dte-expired { color: #666; text-decoration: line-through; }

    /* Broker Badges */
    .trade-broker-badge {
      display: inline-block; padding: 2px 6px; border-radius: 3px;
      font-size: 9px; text-transform: uppercase;
    }
    .trade-broker-webull { background: #1a3a5c; color: #4da6ff; }
    .trade-broker-robinhood { background: #1a3d2e; color: #4caf50; }
    .trade-broker-moomoo { background: #3d2e1a; color: #ff9800; }
    .trade-broker-unknown { background: #333; color: #888; }

    /* Contract Key */
    .trade-contract-key {
      font-size: 10px; color: #666; font-family: 'JetBrains Mono', monospace;
    }

    /* Empty State */
    .trade-empty-state {
      text-align: center; padding: 40px 20px; color: #555;
    }
    .trade-empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
    .trade-empty-text { font-size: 13px; }

    /* Position Card */
    .position-cards { display: flex; flex-direction: column; gap: 12px; }
    .position-card {
      padding: 14px; background: rgba(0,0,0,0.3); border-radius: 8px;
      border: 1px solid #333; display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr auto;
      gap: 16px; align-items: center;
    }
    .position-card:hover { border-color: #444; }
    .position-ticker { font-size: 16px; font-weight: 700; color: #fff; }
    .position-details { font-size: 11px; color: #888; }
    .position-metric { text-align: center; }
    .position-metric-value { font-size: 14px; font-weight: 600; color: #fff; }
    .position-metric-label { font-size: 9px; color: #555; text-transform: uppercase; }

    /* Summary Card */
    .pnl-summary {
      padding: 16px; margin-bottom: 20px;
      background: linear-gradient(135deg, rgba(0,229,255,0.05) 0%, rgba(0,0,0,0.3) 100%);
      border-radius: 8px; border: 1px solid #333;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px;
    }
    .pnl-summary-item { text-align: center; }
    .pnl-summary-value { font-size: 24px; font-weight: 700; }
    .pnl-summary-label { font-size: 10px; color: #666; text-transform: uppercase; margin-top: 4px; }
  `;
}

// ── HTML Template ──────────────────────────────────────────────────────────────
function getTradeHistoryHTML() {
  return `
    <div id="options-tracker">
      <!-- Tab Switcher: Stock | Options -->
      <div class="portfolio-tab-row">
        <button class="portfolio-tab-btn" onclick="switchPortfolioTab('stock')">Stock</button>
        <button class="portfolio-tab-btn active" onclick="switchPortfolioTab('options')">Options</button>
      </div>

      <!-- Sub-tabs: Positions | Trade History | P&L -->
      <div class="options-subtab-row">
        <button class="options-subtab active" onclick="switchOptionsView('positions')" id="subtab-positions">Open Positions</button>
        <button class="options-subtab" onclick="switchOptionsView('history')" id="subtab-history">Trade History</button>
        <button class="options-subtab" onclick="switchOptionsView('pnl')" id="subtab-pnl">P&L Summary</button>
      </div>

      <!-- P&L Summary Bar (always visible) -->
      <div class="pnl-summary">
        <div class="pnl-summary-item">
          <div class="pnl-summary-value" id="pnl-realized">$0</div>
          <div class="pnl-summary-label">Realized P&L</div>
        </div>
        <div class="pnl-summary-item">
          <div class="pnl-summary-value" id="pnl-open-cost">$0</div>
          <div class="pnl-summary-label">Open Cost Basis</div>
        </div>
        <div class="pnl-summary-item">
          <div class="pnl-summary-value" id="pnl-total-trades">0</div>
          <div class="pnl-summary-label">Total Trades</div>
        </div>
        <div class="pnl-summary-item">
          <div class="pnl-summary-value" id="pnl-win-rate">—</div>
          <div class="pnl-summary-label">Win Rate</div>
        </div>
      </div>

      <!-- Add Trade Section -->
      <div class="trade-form-section">
        <div class="trade-form-title">Add Trade</div>
        
        <!-- Paste Import -->
        <div class="trade-paste-container">
          <div class="trade-paste-hint">
            Paste Webull row: <code style="color:#00e5ff;">SPY 260330P00634000 ... B 4.00 1.41 -564.00 0.00 -0.19</code>
          </div>
          <textarea class="trade-paste-area" id="trade-paste-input" placeholder="Paste trade confirmation rows here (one per line)..."></textarea>
          <div id="trade-paste-preview"></div>
          <div class="trade-btn-row">
            <button class="trade-btn trade-btn-secondary" onclick="previewTradePaste()">Preview</button>
            <button class="trade-btn trade-btn-primary" onclick="confirmTradePaste()" id="confirm-trade-btn" disabled>Import Trades</button>
            <button class="trade-btn trade-btn-secondary" onclick="clearTradePaste()">Clear</button>
          </div>
        </div>

        <!-- Manual Entry -->
        <details style="margin-top: 16px;">
          <summary style="color: #888; cursor: pointer; font-size: 11px;">Manual Entry</summary>
          <div class="trade-form-grid" style="margin-top: 12px;">
            <div class="trade-form-group">
              <label>Ticker</label>
              <input type="text" id="trade-ticker" placeholder="SPY" maxlength="5" style="text-transform:uppercase">
            </div>
            <div class="trade-form-group">
              <label>Type</label>
              <select id="trade-type">
                <option value="CALL">CALL</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div class="trade-form-group">
              <label>Strike</label>
              <input type="number" id="trade-strike" placeholder="600" step="0.5">
            </div>
            <div class="trade-form-group">
              <label>Expiry</label>
              <input type="date" id="trade-expiry">
            </div>
            <div class="trade-form-group">
              <label>Action</label>
              <select id="trade-action">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div class="trade-form-group">
              <label>Qty</label>
              <input type="number" id="trade-qty" placeholder="1" min="1" value="1">
            </div>
            <div class="trade-form-group">
              <label>Price ($)</label>
              <input type="number" id="trade-price" placeholder="1.41" step="0.01">
            </div>
            <div class="trade-form-group">
              <label>Fees ($)</label>
              <input type="number" id="trade-fees" placeholder="0.19" step="0.01" value="0">
            </div>
            <div class="trade-form-group">
              <label>Date</label>
              <input type="date" id="trade-date">
            </div>
            <div class="trade-form-group">
              <label>Broker</label>
              <select id="trade-broker">
                <option value="webull">Webull</option>
                <option value="robinhood">Robinhood</option>
                <option value="moomoo">Moomoo</option>
              </select>
            </div>
          </div>
          <button class="trade-btn trade-btn-primary" onclick="addManualTrade()">+ Add Trade</button>
        </details>
      </div>

      <!-- View Containers -->
      <div id="view-positions"></div>
      <div id="view-history" style="display:none;"></div>
      <div id="view-pnl" style="display:none;"></div>
    </div>
  `;
}

// ── Storage ────────────────────────────────────────────────────────────────────
const TRADES_STORAGE_KEY = 'optionsTrades';

function getTrades() {
  try {
    return JSON.parse(localStorage.getItem(TRADES_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveTrades(trades) {
  localStorage.setItem(TRADES_STORAGE_KEY, JSON.stringify(trades));
}

function generateTradeId() {
  return 'trd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ── Contract Key (for grouping) ────────────────────────────────────────────────
function getContractKey(trade) {
  return `${trade.ticker}_${trade.expiry}_${trade.optionType}_${trade.strike}`;
}

function formatContractKey(trade) {
  const typeShort = trade.optionType === 'CALL' ? 'C' : 'P';
  return `${trade.ticker} ${trade.expiry} $${trade.strike} ${typeShort}`;
}

// ── OCC Symbol Parser ──────────────────────────────────────────────────────────
function parseOCCSymbol(occSymbol) {
  const cleaned = occSymbol.trim().toUpperCase().replace(/\s+/g, ' ');
  
  // Pattern: TICKER YYMMDD[C|P]STRIKE8 or TICKER YYMMDDC/P00STRIKE (with space)
  // Handle "SPY 260330P00634000" or "SPY260330P00634000"
  const match = cleaned.match(/^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  
  const [, ticker, yy, mm, dd, optType, strikeRaw] = match;
  
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const expiry = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const strike = parseInt(strikeRaw, 10) / 1000;
  
  return {
    ticker,
    optionType: optType === 'C' ? 'CALL' : 'PUT',
    strike,
    expiry
  };
}

// ── Webull Full Row Parser ─────────────────────────────────────────────────────
// Format: SPY 260330P00634000 [CUSIP] 03/30/2026 03/31/2026 C B 4.00 1.41 -564.00 0.00 -0.19 -564.19 OTH U A N N
function parseWebullRow(line) {
  // First, extract the OCC symbol
  const occMatch = line.match(/([A-Z]+\s*\d{6}[CP]\d{8})/);
  if (!occMatch) return null;
  
  const parsed = parseOCCSymbol(occMatch[1]);
  if (!parsed) return null;
  
  // Extract action: B = BUY, S = SELL
  const actionMatch = line.match(/\b([BS])\b/);
  const action = actionMatch ? (actionMatch[1] === 'B' ? 'BUY' : 'SELL') : 'BUY';
  
  // Extract numbers - look for patterns
  const numbers = line.match(/-?\d+\.?\d*/g) || [];
  
  // Filter to find qty, price, fees
  // Qty is usually a small whole number (1-100)
  // Price is usually 0.01 - 999.99
  // We need to be smart about this
  
  let qty = 1;
  let price = 0;
  let fees = 0;
  let grossAmount = 0;
  
  // Look for specific patterns
  // After B or S, next number is usually qty, then price
  const afterAction = line.split(/\b[BS]\b/)[1] || '';
  const afterNums = afterAction.match(/-?\d+\.?\d*/g) || [];
  
  if (afterNums.length >= 2) {
    qty = Math.abs(parseFloat(afterNums[0])) || 1;
    price = Math.abs(parseFloat(afterNums[1])) || 0;
  }
  if (afterNums.length >= 3) {
    grossAmount = parseFloat(afterNums[2]) || 0;
  }
  if (afterNums.length >= 5) {
    fees = Math.abs(parseFloat(afterNums[4])) || 0;
  }
  
  // Extract trade date
  const dateMatch = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  let tradeDate = new Date().toISOString().split('T')[0];
  if (dateMatch) {
    tradeDate = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
  }
  
  return {
    ...parsed,
    action,
    qty: Math.round(qty),
    price,
    fees,
    tradeDate,
    broker: 'webull'
  };
}

// ── Parse Multiple Lines ───────────────────────────────────────────────────────
function parseTradeLines(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const trades = [];
  
  for (const line of lines) {
    // Skip header rows
    if (line.includes('Symbol & Name') || line.includes('CUSIP') || line.includes('Currency')) continue;
    
    const parsed = parseWebullRow(line);
    if (parsed && parsed.ticker && parsed.strike && parsed.price > 0) {
      trades.push(parsed);
    }
  }
  
  return trades;
}

// ── DTE Calculator ─────────────────────────────────────────────────────────────
function calculateDTE(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function getDTEClass(dte) {
  if (dte < 0) return 'trade-dte-expired';
  if (dte <= 7) return 'trade-dte-danger';
  if (dte <= 21) return 'trade-dte-warning';
  return 'trade-dte-ok';
}

// ── Calculate Positions from Trades ────────────────────────────────────────────
function calculatePositions(trades) {
  const positions = {};
  
  for (const trade of trades) {
    const key = getContractKey(trade);
    
    if (!positions[key]) {
      positions[key] = {
        ticker: trade.ticker,
        optionType: trade.optionType,
        strike: trade.strike,
        expiry: trade.expiry,
        netQty: 0,
        totalBuyQty: 0,
        totalSellQty: 0,
        totalBuyCost: 0,
        totalSellProceeds: 0,
        totalFees: 0,
        trades: []
      };
    }
    
    const pos = positions[key];
    pos.trades.push(trade);
    pos.totalFees += trade.fees || 0;
    
    if (trade.action === 'BUY') {
      pos.netQty += trade.qty;
      pos.totalBuyQty += trade.qty;
      pos.totalBuyCost += trade.qty * trade.price * 100; // Options = 100 shares
    } else {
      pos.netQty -= trade.qty;
      pos.totalSellQty += trade.qty;
      pos.totalSellProceeds += trade.qty * trade.price * 100;
    }
  }
  
  return positions;
}

// ── Calculate P&L ──────────────────────────────────────────────────────────────
function calculatePnL(positions) {
  let realizedPnL = 0;
  let openCostBasis = 0;
  let closedTrades = 0;
  let winningTrades = 0;
  
  for (const key in positions) {
    const pos = positions[key];
    const closedQty = Math.min(pos.totalBuyQty, pos.totalSellQty);
    
    if (closedQty > 0) {
      // FIFO-ish P&L calculation
      const avgBuyPrice = pos.totalBuyCost / pos.totalBuyQty;
      const avgSellPrice = pos.totalSellProceeds / pos.totalSellQty;
      const closedPnL = (avgSellPrice - avgBuyPrice) * closedQty - pos.totalFees;
      realizedPnL += closedPnL;
      closedTrades++;
      if (closedPnL > 0) winningTrades++;
    }
    
    if (pos.netQty > 0) {
      // Open position cost basis
      const avgBuyPrice = pos.totalBuyCost / pos.totalBuyQty;
      openCostBasis += avgBuyPrice * pos.netQty;
    }
  }
  
  const winRate = closedTrades > 0 ? Math.round((winningTrades / closedTrades) * 100) : null;
  
  return { realizedPnL, openCostBasis, closedTrades, winRate };
}

// ── View Switcher ──────────────────────────────────────────────────────────────
let currentOptionsView = 'positions';

function switchOptionsView(view) {
  currentOptionsView = view;
  
  // Update subtab active states
  document.querySelectorAll('.options-subtab').forEach(t => t.classList.remove('active'));
  document.getElementById(`subtab-${view}`).classList.add('active');
  
  // Show/hide views
  document.getElementById('view-positions').style.display = view === 'positions' ? 'block' : 'none';
  document.getElementById('view-history').style.display = view === 'history' ? 'block' : 'none';
  document.getElementById('view-pnl').style.display = view === 'pnl' ? 'block' : 'none';
  
  renderCurrentView();
}

function renderCurrentView() {
  const trades = getTrades();
  const positions = calculatePositions(trades);
  const pnl = calculatePnL(positions);
  
  // Update summary bar
  const realizedEl = document.getElementById('pnl-realized');
  realizedEl.textContent = (pnl.realizedPnL >= 0 ? '+' : '') + '$' + pnl.realizedPnL.toFixed(2);
  realizedEl.className = 'pnl-summary-value ' + (pnl.realizedPnL >= 0 ? 'positive' : 'negative');
  
  document.getElementById('pnl-open-cost').textContent = '$' + pnl.openCostBasis.toFixed(2);
  document.getElementById('pnl-total-trades').textContent = trades.length;
  document.getElementById('pnl-win-rate').textContent = pnl.winRate !== null ? pnl.winRate + '%' : '—';
  
  // Render active view
  if (currentOptionsView === 'positions') {
    renderPositionsView(positions);
  } else if (currentOptionsView === 'history') {
    renderHistoryView(trades);
  } else if (currentOptionsView === 'pnl') {
    renderPnLView(positions, pnl);
  }
}

// ── Render Positions View ──────────────────────────────────────────────────────
function renderPositionsView(positions) {
  const container = document.getElementById('view-positions');
  
  // Filter to open positions only
  const openPositions = Object.entries(positions)
    .filter(([_, pos]) => pos.netQty > 0)
    .sort((a, b) => new Date(a[1].expiry) - new Date(b[1].expiry));
  
  if (openPositions.length === 0) {
    container.innerHTML = `
      <div class="trade-empty-state">
        <div class="trade-empty-icon">📭</div>
        <div class="trade-empty-text">No open positions.<br>Add trades to track your portfolio.</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="position-cards">
      ${openPositions.map(([key, pos]) => {
        const dte = calculateDTE(pos.expiry);
        const dteClass = getDTEClass(dte);
        const avgCost = pos.totalBuyCost / pos.totalBuyQty;
        const costBasis = avgCost * pos.netQty;
        
        return `
          <div class="position-card">
            <div>
              <div class="position-ticker">${pos.ticker}</div>
              <div class="position-details">
                <span class="${pos.optionType === 'CALL' ? 'trade-type-call' : 'trade-type-put'}">${pos.optionType}</span>
                $${pos.strike} · ${pos.expiry}
              </div>
            </div>
            <div class="position-metric">
              <div class="position-metric-value ${dteClass}">${dte}d</div>
              <div class="position-metric-label">DTE</div>
            </div>
            <div class="position-metric">
              <div class="position-metric-value">${pos.netQty}</div>
              <div class="position-metric-label">Contracts</div>
            </div>
            <div class="position-metric">
              <div class="position-metric-value">$${(avgCost / 100).toFixed(2)}</div>
              <div class="position-metric-label">Avg Cost</div>
            </div>
            <div class="position-metric">
              <div class="position-metric-value">$${costBasis.toFixed(0)}</div>
              <div class="position-metric-label">Cost Basis</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Render History View ────────────────────────────────────────────────────────
function renderHistoryView(trades) {
  const container = document.getElementById('view-history');
  
  if (trades.length === 0) {
    container.innerHTML = `
      <div class="trade-empty-state">
        <div class="trade-empty-icon">📋</div>
        <div class="trade-empty-text">No trades yet.<br>Paste trade confirmations to get started.</div>
      </div>
    `;
    return;
  }
  
  // Sort by date descending
  const sorted = [...trades].sort((a, b) => new Date(b.tradeDate) - new Date(a.tradeDate));
  
  container.innerHTML = `
    <div class="trade-table-container">
      <table class="trade-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticker</th>
            <th>Type</th>
            <th>Strike</th>
            <th>Expiry</th>
            <th>Action</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
            <th>Fees</th>
            <th>Broker</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(t => {
            const total = t.qty * t.price * 100;
            const brokerClass = `trade-broker-${t.broker || 'unknown'}`;
            return `
              <tr>
                <td>${t.tradeDate}</td>
                <td style="font-weight:600;color:#fff;">${t.ticker}</td>
                <td class="${t.optionType === 'CALL' ? 'trade-type-call' : 'trade-type-put'}">${t.optionType}</td>
                <td>$${t.strike}</td>
                <td>${t.expiry}</td>
                <td class="${t.action === 'BUY' ? 'trade-action-buy' : 'trade-action-sell'}">${t.action}</td>
                <td>${t.qty}</td>
                <td>$${t.price.toFixed(2)}</td>
                <td>$${total.toFixed(0)}</td>
                <td style="color:#666;">$${(t.fees || 0).toFixed(2)}</td>
                <td><span class="trade-broker-badge ${brokerClass}">${t.broker || '?'}</span></td>
                <td>
                  <button class="trade-btn trade-btn-danger" style="padding:2px 6px;font-size:9px;" onclick="deleteTrade('${t.id}')">✕</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render P&L View ────────────────────────────────────────────────────────────
function renderPnLView(positions, pnl) {
  const container = document.getElementById('view-pnl');
  
  // Get closed positions
  const closedPositions = Object.entries(positions)
    .filter(([_, pos]) => pos.totalSellQty > 0)
    .map(([key, pos]) => {
      const closedQty = Math.min(pos.totalBuyQty, pos.totalSellQty);
      const avgBuy = pos.totalBuyCost / pos.totalBuyQty;
      const avgSell = pos.totalSellProceeds / pos.totalSellQty;
      const pnl = ((avgSell - avgBuy) * closedQty) - pos.totalFees;
      const pnlPercent = ((avgSell / avgBuy) - 1) * 100;
      
      return { ...pos, closedQty, avgBuy, avgSell, pnl, pnlPercent };
    })
    .sort((a, b) => b.pnl - a.pnl);
  
  container.innerHTML = `
    <h3 style="color:#fff;font-size:14px;margin-bottom:16px;">Closed Trades P&L</h3>
    ${closedPositions.length === 0 ? `
      <div class="trade-empty-state">
        <div class="trade-empty-icon">📊</div>
        <div class="trade-empty-text">No closed trades yet.</div>
      </div>
    ` : `
      <div class="trade-table-container">
        <table class="trade-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Qty Closed</th>
              <th>Avg Buy</th>
              <th>Avg Sell</th>
              <th>Fees</th>
              <th>P&L</th>
              <th>P&L %</th>
            </tr>
          </thead>
          <tbody>
            ${closedPositions.map(p => `
              <tr>
                <td>
                  <span style="font-weight:600;color:#fff;">${p.ticker}</span>
                  <span class="${p.optionType === 'CALL' ? 'trade-type-call' : 'trade-type-put'}">${p.optionType}</span>
                  $${p.strike} ${p.expiry}
                </td>
                <td>${p.closedQty}</td>
                <td>$${(p.avgBuy / 100).toFixed(2)}</td>
                <td>$${(p.avgSell / 100).toFixed(2)}</td>
                <td style="color:#666;">$${p.totalFees.toFixed(2)}</td>
                <td class="${p.pnl >= 0 ? 'trade-pnl-positive' : 'trade-pnl-negative'}">
                  ${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)}
                </td>
                <td class="${p.pnlPercent >= 0 ? 'trade-pnl-positive' : 'trade-pnl-negative'}">
                  ${p.pnlPercent >= 0 ? '+' : ''}${p.pnlPercent.toFixed(1)}%
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

// ── Paste Preview ──────────────────────────────────────────────────────────────
let _parsedTrades = [];

function previewTradePaste() {
  const text = document.getElementById('trade-paste-input').value;
  const trades = parseTradeLines(text);
  _parsedTrades = trades;
  
  const previewEl = document.getElementById('trade-paste-preview');
  const confirmBtn = document.getElementById('confirm-trade-btn');
  
  if (trades.length === 0) {
    previewEl.innerHTML = '<div style="color:#ff5252;padding:10px;font-size:11px;">No valid trades detected. Check format.</div>';
    confirmBtn.disabled = true;
    return;
  }
  
  previewEl.innerHTML = `
    <div style="color:#4caf50;padding:6px 0;font-size:10px;">✓ Found ${trades.length} trade(s)</div>
    <div class="trade-paste-preview">
      <div class="trade-preview-row trade-preview-header">
        <span>TICKER</span>
        <span>TYPE</span>
        <span>STRIKE</span>
        <span>EXPIRY</span>
        <span>ACT</span>
        <span>QTY</span>
        <span>PRICE</span>
        <span>FEES</span>
      </div>
      ${trades.map(t => `
        <div class="trade-preview-row">
          <span style="color:#fff;font-weight:600;">${t.ticker}</span>
          <span class="${t.optionType === 'CALL' ? 'trade-type-call' : 'trade-type-put'}">${t.optionType}</span>
          <span>$${t.strike}</span>
          <span>${t.expiry}</span>
          <span class="${t.action === 'BUY' ? 'trade-action-buy' : 'trade-action-sell'}">${t.action}</span>
          <span>${t.qty}</span>
          <span>$${t.price.toFixed(2)}</span>
          <span style="color:#666;">$${(t.fees || 0).toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
  `;
  confirmBtn.disabled = false;
}

function confirmTradePaste() {
  if (_parsedTrades.length === 0) return;
  
  const trades = getTrades();
  for (const t of _parsedTrades) {
    trades.push({
      ...t,
      id: generateTradeId()
    });
  }
  saveTrades(trades);
  
  _parsedTrades = [];
  document.getElementById('trade-paste-input').value = '';
  document.getElementById('trade-paste-preview').innerHTML = '';
  document.getElementById('confirm-trade-btn').disabled = true;
  
  renderCurrentView();
}

function clearTradePaste() {
  _parsedTrades = [];
  document.getElementById('trade-paste-input').value = '';
  document.getElementById('trade-paste-preview').innerHTML = '';
  document.getElementById('confirm-trade-btn').disabled = true;
}

// ── Manual Entry ───────────────────────────────────────────────────────────────
function addManualTrade() {
  const ticker = document.getElementById('trade-ticker').value.trim().toUpperCase();
  const optionType = document.getElementById('trade-type').value;
  const strike = parseFloat(document.getElementById('trade-strike').value);
  const expiry = document.getElementById('trade-expiry').value;
  const action = document.getElementById('trade-action').value;
  const qty = parseInt(document.getElementById('trade-qty').value, 10) || 1;
  const price = parseFloat(document.getElementById('trade-price').value) || 0;
  const fees = parseFloat(document.getElementById('trade-fees').value) || 0;
  const tradeDate = document.getElementById('trade-date').value || new Date().toISOString().split('T')[0];
  const broker = document.getElementById('trade-broker').value;
  
  if (!ticker || !strike || !expiry || !price) {
    alert('Fill ticker, strike, expiry, and price.');
    return;
  }
  
  const trade = {
    id: generateTradeId(),
    ticker,
    optionType,
    strike,
    expiry,
    action,
    qty,
    price,
    fees,
    tradeDate,
    broker
  };
  
  const trades = getTrades();
  trades.push(trade);
  saveTrades(trades);
  
  // Clear form
  document.getElementById('trade-ticker').value = '';
  document.getElementById('trade-strike').value = '';
  document.getElementById('trade-expiry').value = '';
  document.getElementById('trade-price').value = '';
  document.getElementById('trade-fees').value = '0';
  
  renderCurrentView();
}

// ── Delete Trade ───────────────────────────────────────────────────────────────
function deleteTrade(id) {
  if (!confirm('Delete this trade?')) return;
  
  let trades = getTrades();
  trades = trades.filter(t => t.id !== id);
  saveTrades(trades);
  renderCurrentView();
}

// ── Tab Switcher (Stock/Options) ───────────────────────────────────────────────
function switchPortfolioTab(tab) {
  const tabs = document.querySelectorAll('.portfolio-tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  if (tab === 'options') {
    document.getElementById('options-tracker').style.display = 'block';
    const stockContent = document.querySelector('.portfolio-stock-content');
    if (stockContent) stockContent.style.display = 'none';
  } else {
    document.getElementById('options-tracker').style.display = 'none';
    const stockContent = document.querySelector('.portfolio-stock-content');
    if (stockContent) stockContent.style.display = 'block';
  }
}

// ── Initialize ─────────────────────────────────────────────────────────────────
function initTradeHistory() {
  // Inject styles
  if (!document.getElementById('trade-history-styles')) {
    const style = document.createElement('style');
    style.id = 'trade-history-styles';
    style.textContent = getTradeHistoryStyles();
    document.head.appendChild(style);
  }
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('trade-date');
  if (dateInput) dateInput.value = today;
  
  renderCurrentView();
}

// ══════════════════════════════════════════════════════════════════════════════
// MIGRATION: Clear old positions data
// ══════════════════════════════════════════════════════════════════════════════
function migrateFromPositions() {
  // If old positions exist, offer to clear them
  const oldPositions = localStorage.getItem('optionsPositions');
  if (oldPositions) {
    console.log('Found old optionsPositions data. Trade history uses optionsTrades instead.');
    // Optionally: localStorage.removeItem('optionsPositions');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
// Replace old Options module with this one:
// 
// 1. Remove old getOptionsTrackerStyles(), getOptionsTrackerHTML(), etc.
// 2. Add this entire file's functions
// 3. In renderPortfolio():
//    - Inject getTradeHistoryHTML()
//    - Call initTradeHistory()
// 
// localStorage key changed: 'optionsPositions' → 'optionsTrades'
// ══════════════════════════════════════════════════════════════════════════════
