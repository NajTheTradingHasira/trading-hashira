// ══════════════════════════════════════════════════════════════════════════════
// TRADING HASHIRA — OPTIONS TRACKER MODULE v1.0
// ══════════════════════════════════════════════════════════════════════════════
// localStorage key: 'optionsPositions' (separate from stock positions)
// Supports: Manual entry, Paste parser (Webull/Robinhood/Moomoo), CSV import
// ══════════════════════════════════════════════════════════════════════════════

// ── CSS Styles (add to your <style> block) ─────────────────────────────────────
function getOptionsTrackerStyles() {
  return `
    /* Options Tab Switcher */
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

    /* Options Form */
    .options-form-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin-bottom: 20px; padding: 16px;
      background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333;
    }
    .options-form-group { display: flex; flex-direction: column; gap: 4px; }
    .options-form-group label {
      font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .options-form-group input, .options-form-group select {
      padding: 8px 10px; background: #111; border: 1px solid #333;
      border-radius: 4px; color: #fff; font-size: 13px;
      font-family: 'JetBrains Mono', monospace;
    }
    .options-form-group input:focus, .options-form-group select:focus {
      outline: none; border-color: #00e5ff;
    }
    .options-form-actions {
      display: flex; gap: 10px; align-items: flex-end;
    }
    .options-btn {
      padding: 8px 16px; border-radius: 4px; font-size: 12px;
      font-family: 'JetBrains Mono', monospace; cursor: pointer;
      border: 1px solid #333; transition: all 0.2s;
    }
    .options-btn-primary {
      background: #00e5ff; color: #000; border-color: #00e5ff; font-weight: 600;
    }
    .options-btn-primary:hover { background: #00b8cc; }
    .options-btn-secondary { background: transparent; color: #888; }
    .options-btn-secondary:hover { color: #fff; border-color: #666; }
    .options-btn-danger { background: transparent; color: #ff5252; border-color: #ff5252; }
    .options-btn-danger:hover { background: #ff5252; color: #fff; }

    /* Import Section */
    .options-import-section {
      display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .options-paste-area {
      width: 100%; min-height: 100px; padding: 12px; margin-bottom: 10px;
      background: #0a0a14; border: 1px dashed #444; border-radius: 6px;
      color: #aaa; font-size: 12px; font-family: 'JetBrains Mono', monospace;
      resize: vertical;
    }
    .options-paste-area:focus { outline: none; border-color: #00e5ff; }
    .options-paste-preview {
      margin-top: 10px; padding: 12px; background: #0d0d1a;
      border-radius: 6px; border: 1px solid #333; max-height: 200px; overflow-y: auto;
    }
    .options-paste-preview-row {
      display: flex; gap: 16px; padding: 6px 0; border-bottom: 1px solid #222;
      font-size: 12px; color: #ccc;
    }
    .options-paste-preview-row:last-child { border-bottom: none; }

    /* Positions Table */
    .options-table-container { overflow-x: auto; }
    .options-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
    }
    .options-table th {
      text-align: left; padding: 10px 12px; color: #666;
      border-bottom: 1px solid #333; white-space: nowrap;
      text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;
    }
    .options-table td {
      padding: 10px 12px; border-bottom: 1px solid #1a1a2e; white-space: nowrap;
    }
    .options-table tr:hover td { background: rgba(0,229,255,0.03); }
    .options-type-call { color: #4caf50; font-weight: 600; }
    .options-type-put { color: #ff5252; font-weight: 600; }
    .options-dte-warning { color: #ff9800; }
    .options-dte-danger { color: #ff5252; font-weight: 600; }
    .options-pnl-positive { color: #4caf50; }
    .options-pnl-negative { color: #ff5252; }
    .options-broker-badge {
      display: inline-block; padding: 2px 6px; border-radius: 3px;
      font-size: 10px; text-transform: uppercase;
    }
    .options-broker-webull { background: #1a3a5c; color: #4da6ff; }
    .options-broker-robinhood { background: #1a3d2e; color: #4caf50; }
    .options-broker-moomoo { background: #3d2e1a; color: #ff9800; }

    /* Stats Row */
    .options-stats-row {
      display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .options-stat-card {
      flex: 1; min-width: 140px; padding: 16px;
      background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #333;
    }
    .options-stat-label { font-size: 10px; color: #666; text-transform: uppercase; }
    .options-stat-value { font-size: 20px; color: #fff; font-weight: 600; margin-top: 4px; }

    /* Modal */
    .options-modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8); z-index: 1000; display: flex;
      align-items: center; justify-content: center;
    }
    .options-modal {
      background: #0d0d1a; border: 1px solid #333; border-radius: 12px;
      padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;
    }
    .options-modal-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #333;
    }
    .options-modal-title { font-size: 16px; color: #fff; font-weight: 600; }
    .options-modal-close {
      background: none; border: none; color: #666; font-size: 20px; cursor: pointer;
    }
    .options-modal-close:hover { color: #fff; }

    /* Empty State */
    .options-empty-state {
      text-align: center; padding: 60px 20px; color: #666;
    }
    .options-empty-state-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .options-empty-state-text { font-size: 14px; }
  `;
}

// ── HTML Template ──────────────────────────────────────────────────────────────
function getOptionsTrackerHTML() {
  return `
    <div id="options-tracker">
      <!-- Tab Switcher -->
      <div class="portfolio-tab-row">
        <button class="portfolio-tab-btn" onclick="switchPortfolioTab('stock')">Stock</button>
        <button class="portfolio-tab-btn active" onclick="switchPortfolioTab('options')">Options</button>
      </div>

      <!-- Stats Row -->
      <div class="options-stats-row">
        <div class="options-stat-card">
          <div class="options-stat-label">Total Positions</div>
          <div class="options-stat-value" id="opt-stat-count">0</div>
        </div>
        <div class="options-stat-card">
          <div class="options-stat-label">Total Cost</div>
          <div class="options-stat-value" id="opt-stat-cost">$0</div>
        </div>
        <div class="options-stat-card">
          <div class="options-stat-label">Calls / Puts</div>
          <div class="options-stat-value" id="opt-stat-ratio">0 / 0</div>
        </div>
        <div class="options-stat-card">
          <div class="options-stat-label">Nearest Expiry</div>
          <div class="options-stat-value" id="opt-stat-dte">—</div>
        </div>
      </div>

      <!-- Import Buttons -->
      <div class="options-import-section">
        <button class="options-btn options-btn-primary" onclick="showOptionsModal('manual')">+ Add Position</button>
        <button class="options-btn options-btn-secondary" onclick="showOptionsModal('paste')">📋 Paste Import</button>
        <button class="options-btn options-btn-secondary" onclick="triggerCSVImport()">📁 CSV Import</button>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="handleCSVImport(event)">
      </div>

      <!-- Positions Table -->
      <div class="options-table-container">
        <table class="options-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Type</th>
              <th>Strike</th>
              <th>Expiry</th>
              <th>DTE</th>
              <th>Qty</th>
              <th>Cost</th>
              <th>Total</th>
              <th>Broker</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="options-table-body">
            <!-- Populated by JS -->
          </tbody>
        </table>
        <div id="options-empty-state" class="options-empty-state" style="display:none;">
          <div class="options-empty-state-icon">📭</div>
          <div class="options-empty-state-text">No options positions yet.<br>Add manually or paste from your broker.</div>
        </div>
      </div>
    </div>

    <!-- Modal Container -->
    <div id="options-modal-container"></div>
  `;
}

// ── State & Storage ────────────────────────────────────────────────────────────
const OPTIONS_STORAGE_KEY = 'optionsPositions';

function getOptionsPositions() {
  try {
    return JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveOptionsPositions(positions) {
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(positions));
}

function generateId() {
  return 'opt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ── OCC Symbol Parser (Webull Format) ──────────────────────────────────────────
// Format: "SPY 260330P00634000" or "GOOG 260417C00317500"
function parseOCCSymbol(occSymbol) {
  const cleaned = occSymbol.trim().toUpperCase();
  
  // Pattern: TICKER YYMMDD[C|P]STRIKE8
  const match = cleaned.match(/^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  
  const [, ticker, yy, mm, dd, optType, strikeRaw] = match;
  
  // Parse expiry
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const expiry = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  // Parse strike (8 digits = dollars * 1000, e.g., 00634000 = $634.00)
  const strike = parseInt(strikeRaw, 10) / 1000;
  
  return {
    ticker,
    optionType: optType === 'C' ? 'CALL' : 'PUT',
    strike,
    expiry
  };
}

// ── Webull Statement Parser ────────────────────────────────────────────────────
function parseWebullPaste(text) {
  const positions = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    // Look for OCC-style symbols in the line
    const occMatch = line.match(/([A-Z]+)\s*(\d{6}[CP]\d{8})/);
    if (occMatch) {
      const fullSymbol = occMatch[1] + ' ' + occMatch[2];
      const parsed = parseOCCSymbol(fullSymbol);
      if (parsed) {
        // Try to extract quantity and price from the line
        const numbers = line.match(/-?\d+\.?\d*/g) || [];
        const qty = Math.abs(parseInt(numbers.find(n => Math.abs(parseFloat(n)) < 1000 && parseFloat(n) !== 0) || '1', 10));
        const price = parseFloat(numbers.find(n => parseFloat(n) > 0 && parseFloat(n) < 10000 && n.includes('.')) || '0');
        
        positions.push({
          ...parsed,
          qty: qty || 1,
          avgCost: price || 0,
          side: 'LONG',
          broker: 'webull'
        });
      }
    }
  }
  
  // Deduplicate by combining same contracts
  const deduped = {};
  for (const pos of positions) {
    const key = `${pos.ticker}_${pos.expiry}_${pos.optionType}_${pos.strike}`;
    if (deduped[key]) {
      deduped[key].qty += pos.qty;
    } else {
      deduped[key] = { ...pos };
    }
  }
  
  return Object.values(deduped);
}

// ── Robinhood Format Parser ────────────────────────────────────────────────────
// Format: "GOOG $317.50 Call 4/17/26" or similar
function parseRobinhoodPaste(text) {
  const positions = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    // Pattern: TICKER $STRIKE Call/Put MM/DD/YY
    const match = line.match(/([A-Z]+)\s*\$?([\d.]+)\s*(Call|Put|C|P)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
    if (match) {
      const [, ticker, strike, typeRaw, mm, dd, yy] = match;
      const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      
      positions.push({
        ticker: ticker.toUpperCase(),
        optionType: typeRaw.toUpperCase().startsWith('C') ? 'CALL' : 'PUT',
        strike: parseFloat(strike),
        expiry: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        qty: 1,
        avgCost: 0,
        side: 'LONG',
        broker: 'robinhood'
      });
    }
  }
  
  return positions;
}

// ── Universal Paste Parser ─────────────────────────────────────────────────────
function parsePastedPositions(text) {
  // Try Webull OCC format first
  let positions = parseWebullPaste(text);
  if (positions.length > 0) return { positions, format: 'webull' };
  
  // Try Robinhood format
  positions = parseRobinhoodPaste(text);
  if (positions.length > 0) return { positions, format: 'robinhood' };
  
  // Try generic parsing
  positions = parseGenericPaste(text);
  return { positions, format: 'generic' };
}

function parseGenericPaste(text) {
  const positions = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    // Look for any recognizable pattern
    const ticker = line.match(/^([A-Z]{1,5})\b/)?.[1];
    const strike = line.match(/\$?([\d.]+)\s*(strike|call|put|c|p)/i)?.[1];
    const isCall = /call|^c\b/i.test(line);
    const isPut = /put|^p\b/i.test(line);
    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    
    if (ticker && strike && (isCall || isPut) && dateMatch) {
      const [, mm, dd, yy] = dateMatch;
      const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      
      positions.push({
        ticker,
        optionType: isCall ? 'CALL' : 'PUT',
        strike: parseFloat(strike),
        expiry: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        qty: 1,
        avgCost: 0,
        side: 'LONG',
        broker: 'unknown'
      });
    }
  }
  
  return positions;
}

// ── CSV Import ─────────────────────────────────────────────────────────────────
function triggerCSVImport() {
  document.getElementById('csv-file-input').click();
}

function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const positions = parseCSV(text);
    if (positions.length > 0) {
      showImportPreview(positions, 'csv');
    } else {
      alert('Could not parse any positions from CSV. Check format.');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset for re-import
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
  const positions = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx]; });
    
    // Try to map common column names
    const ticker = row.ticker || row.symbol || row.underlying || '';
    const optionType = (row.type || row.option_type || row.optiontype || '').toUpperCase();
    const strike = parseFloat(row.strike || row.strike_price || '0');
    const expiry = row.expiry || row.expiration || row.exp_date || '';
    const qty = parseInt(row.qty || row.quantity || row.contracts || '1', 10);
    const cost = parseFloat(row.cost || row.avg_cost || row.price || '0');
    
    if (ticker && (optionType === 'CALL' || optionType === 'PUT' || optionType === 'C' || optionType === 'P')) {
      positions.push({
        ticker: ticker.toUpperCase(),
        optionType: optionType.startsWith('C') ? 'CALL' : 'PUT',
        strike,
        expiry: normalizeDate(expiry),
        qty: Math.abs(qty) || 1,
        avgCost: cost,
        side: 'LONG',
        broker: 'csv'
      });
    }
  }
  
  return positions;
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  // Try various formats
  const formats = [
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /(\d{2})\/(\d{2})\/(\d{2})/, // MM/DD/YY
  ];
  
  for (const fmt of formats) {
    const match = dateStr.match(fmt);
    if (match) {
      if (fmt === formats[0]) return dateStr;
      if (fmt === formats[1]) return `${match[3]}-${match[1]}-${match[2]}`;
      if (fmt === formats[2]) return `20${match[3]}-${match[1]}-${match[2]}`;
    }
  }
  return dateStr;
}

// ── Days to Expiry Calculator ──────────────────────────────────────────────────
function calculateDTE(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return diff;
}

// ── Modal System ───────────────────────────────────────────────────────────────
function showOptionsModal(type) {
  const container = document.getElementById('options-modal-container');
  
  if (type === 'manual') {
    container.innerHTML = `
      <div class="options-modal-overlay" onclick="closeOptionsModal(event)">
        <div class="options-modal" onclick="event.stopPropagation()">
          <div class="options-modal-header">
            <div class="options-modal-title">Add Options Position</div>
            <button class="options-modal-close" onclick="closeOptionsModal()">&times;</button>
          </div>
          <div class="options-form-grid">
            <div class="options-form-group">
              <label>Ticker</label>
              <input type="text" id="opt-ticker" placeholder="SPY" maxlength="5" style="text-transform:uppercase">
            </div>
            <div class="options-form-group">
              <label>Type</label>
              <select id="opt-type">
                <option value="CALL">CALL</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div class="options-form-group">
              <label>Strike</label>
              <input type="number" id="opt-strike" placeholder="600" step="0.5">
            </div>
            <div class="options-form-group">
              <label>Expiry</label>
              <input type="date" id="opt-expiry">
            </div>
            <div class="options-form-group">
              <label>Quantity</label>
              <input type="number" id="opt-qty" placeholder="1" min="1" value="1">
            </div>
            <div class="options-form-group">
              <label>Avg Cost ($)</label>
              <input type="number" id="opt-cost" placeholder="5.25" step="0.01">
            </div>
            <div class="options-form-group">
              <label>Side</label>
              <select id="opt-side">
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>
            <div class="options-form-group">
              <label>Strategy</label>
              <select id="opt-strategy">
                <option value="Core">Core</option>
                <option value="Swing">Swing</option>
                <option value="Scalp">Scalp</option>
                <option value="Hedge">Hedge</option>
              </select>
            </div>
            <div class="options-form-group">
              <label>Broker</label>
              <select id="opt-broker">
                <option value="robinhood">Robinhood</option>
                <option value="webull">Webull</option>
                <option value="moomoo">Moomoo</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="options-btn options-btn-secondary" onclick="closeOptionsModal()">Cancel</button>
            <button class="options-btn options-btn-primary" onclick="saveManualPosition()">Add Position</button>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'paste') {
    container.innerHTML = `
      <div class="options-modal-overlay" onclick="closeOptionsModal(event)">
        <div class="options-modal" onclick="event.stopPropagation()">
          <div class="options-modal-header">
            <div class="options-modal-title">Paste Positions</div>
            <button class="options-modal-close" onclick="closeOptionsModal()">&times;</button>
          </div>
          <p style="color:#888;font-size:12px;margin-bottom:12px;">
            Paste positions from Webull, Robinhood, or Moomoo. Auto-detects format.
          </p>
          <textarea class="options-paste-area" id="paste-input" placeholder="Paste your positions here...
Example (Webull): SPY 260417P00600000
Example (Robinhood): GOOG $317.50 Call 4/17/26"></textarea>
          <div id="paste-preview"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
            <button class="options-btn options-btn-secondary" onclick="closeOptionsModal()">Cancel</button>
            <button class="options-btn options-btn-secondary" onclick="previewPaste()">Preview</button>
            <button class="options-btn options-btn-primary" onclick="confirmPasteImport()" id="confirm-paste-btn" disabled>Import</button>
          </div>
        </div>
      </div>
    `;
  }
}

function closeOptionsModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('options-modal-container').innerHTML = '';
}

// ── Manual Entry Save ──────────────────────────────────────────────────────────
function saveManualPosition() {
  const ticker = document.getElementById('opt-ticker').value.trim().toUpperCase();
  const optionType = document.getElementById('opt-type').value;
  const strike = parseFloat(document.getElementById('opt-strike').value);
  const expiry = document.getElementById('opt-expiry').value;
  const qty = parseInt(document.getElementById('opt-qty').value, 10) || 1;
  const avgCost = parseFloat(document.getElementById('opt-cost').value) || 0;
  const side = document.getElementById('opt-side').value;
  const strategy = document.getElementById('opt-strategy').value;
  const broker = document.getElementById('opt-broker').value;
  
  if (!ticker || !strike || !expiry) {
    alert('Please fill in Ticker, Strike, and Expiry.');
    return;
  }
  
  const position = {
    id: generateId(),
    ticker,
    optionType,
    strike,
    expiry,
    qty,
    avgCost,
    side,
    strategy,
    broker,
    openDate: new Date().toISOString().split('T')[0],
    notes: ''
  };
  
  const positions = getOptionsPositions();
  positions.push(position);
  saveOptionsPositions(positions);
  
  closeOptionsModal();
  renderOptionsTable();
}

// ── Paste Preview & Import ─────────────────────────────────────────────────────
let _parsedPastePositions = [];

function previewPaste() {
  const text = document.getElementById('paste-input').value;
  const { positions, format } = parsePastedPositions(text);
  _parsedPastePositions = positions;
  
  const previewEl = document.getElementById('paste-preview');
  const confirmBtn = document.getElementById('confirm-paste-btn');
  
  if (positions.length === 0) {
    previewEl.innerHTML = '<div style="color:#ff5252;padding:12px;">No positions detected. Check your paste format.</div>';
    confirmBtn.disabled = true;
    return;
  }
  
  previewEl.innerHTML = `
    <div style="color:#4caf50;padding:8px 0;font-size:11px;">✓ Detected ${positions.length} position(s) · Format: ${format}</div>
    <div class="options-paste-preview">
      ${positions.map(p => `
        <div class="options-paste-preview-row">
          <span style="color:#fff;font-weight:600;">${p.ticker}</span>
          <span class="${p.optionType === 'CALL' ? 'options-type-call' : 'options-type-put'}">${p.optionType}</span>
          <span>$${p.strike}</span>
          <span>${p.expiry}</span>
          <span>×${p.qty}</span>
          ${p.avgCost ? `<span>@$${p.avgCost.toFixed(2)}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  confirmBtn.disabled = false;
}

function confirmPasteImport() {
  if (_parsedPastePositions.length === 0) return;
  
  const positions = getOptionsPositions();
  for (const p of _parsedPastePositions) {
    positions.push({
      ...p,
      id: generateId(),
      strategy: 'Core',
      openDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
  }
  saveOptionsPositions(positions);
  
  _parsedPastePositions = [];
  closeOptionsModal();
  renderOptionsTable();
}

// ── Import Preview Modal ───────────────────────────────────────────────────────
function showImportPreview(positions, source) {
  _parsedPastePositions = positions;
  
  const container = document.getElementById('options-modal-container');
  container.innerHTML = `
    <div class="options-modal-overlay" onclick="closeOptionsModal(event)">
      <div class="options-modal" onclick="event.stopPropagation()">
        <div class="options-modal-header">
          <div class="options-modal-title">Import Preview (${source.toUpperCase()})</div>
          <button class="options-modal-close" onclick="closeOptionsModal()">&times;</button>
        </div>
        <div style="color:#4caf50;padding:8px 0;font-size:12px;">✓ Found ${positions.length} position(s)</div>
        <div class="options-paste-preview">
          ${positions.map(p => `
            <div class="options-paste-preview-row">
              <span style="color:#fff;font-weight:600;">${p.ticker}</span>
              <span class="${p.optionType === 'CALL' ? 'options-type-call' : 'options-type-put'}">${p.optionType}</span>
              <span>$${p.strike}</span>
              <span>${p.expiry}</span>
              <span>×${p.qty}</span>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
          <button class="options-btn options-btn-secondary" onclick="closeOptionsModal()">Cancel</button>
          <button class="options-btn options-btn-primary" onclick="confirmPasteImport()">Import All</button>
        </div>
      </div>
    </div>
  `;
}

// ── Delete Position ────────────────────────────────────────────────────────────
function deleteOptionsPosition(id) {
  if (!confirm('Delete this position?')) return;
  
  let positions = getOptionsPositions();
  positions = positions.filter(p => p.id !== id);
  saveOptionsPositions(positions);
  renderOptionsTable();
}

// ── Render Table ───────────────────────────────────────────────────────────────
function renderOptionsTable() {
  const positions = getOptionsPositions();
  const tbody = document.getElementById('options-table-body');
  const emptyState = document.getElementById('options-empty-state');
  
  if (positions.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    document.querySelector('.options-table').style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    document.querySelector('.options-table').style.display = 'table';
    
    // Sort by expiry (nearest first)
    positions.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    
    tbody.innerHTML = positions.map(p => {
      const dte = calculateDTE(p.expiry);
      const dteClass = dte <= 7 ? 'options-dte-danger' : dte <= 21 ? 'options-dte-warning' : '';
      const totalCost = p.qty * p.avgCost * 100; // Options are 100 shares per contract
      const brokerClass = `options-broker-${p.broker}`;
      
      return `
        <tr>
          <td style="color:#fff;font-weight:600;">${p.ticker}</td>
          <td class="${p.optionType === 'CALL' ? 'options-type-call' : 'options-type-put'}">${p.optionType}</td>
          <td>$${p.strike.toFixed(2)}</td>
          <td>${p.expiry}</td>
          <td class="${dteClass}">${dte}d</td>
          <td>${p.side === 'SHORT' ? '-' : ''}${p.qty}</td>
          <td>$${p.avgCost.toFixed(2)}</td>
          <td>$${totalCost.toFixed(0)}</td>
          <td><span class="options-broker-badge ${brokerClass}">${p.broker}</span></td>
          <td>
            <button class="options-btn options-btn-danger" style="padding:4px 8px;font-size:10px;" onclick="deleteOptionsPosition('${p.id}')">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  updateOptionsStats(positions);
}

// ── Update Stats ───────────────────────────────────────────────────────────────
function updateOptionsStats(positions) {
  const count = positions.length;
  const totalCost = positions.reduce((sum, p) => sum + (p.qty * p.avgCost * 100), 0);
  const calls = positions.filter(p => p.optionType === 'CALL').length;
  const puts = positions.filter(p => p.optionType === 'PUT').length;
  
  let nearestDTE = '—';
  if (positions.length > 0) {
    const dtes = positions.map(p => calculateDTE(p.expiry)).filter(d => d >= 0);
    if (dtes.length > 0) {
      nearestDTE = Math.min(...dtes) + 'd';
    }
  }
  
  document.getElementById('opt-stat-count').textContent = count;
  document.getElementById('opt-stat-cost').textContent = '$' + totalCost.toLocaleString();
  document.getElementById('opt-stat-ratio').textContent = `${calls} / ${puts}`;
  document.getElementById('opt-stat-dte').textContent = nearestDTE;
}

// ── Tab Switcher ───────────────────────────────────────────────────────────────
function switchPortfolioTab(tab) {
  const tabs = document.querySelectorAll('.portfolio-tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  if (tab === 'options') {
    document.getElementById('options-tracker').style.display = 'block';
    // Hide stock portfolio content (adjust selector based on your existing code)
    const stockContent = document.querySelector('.portfolio-stock-content');
    if (stockContent) stockContent.style.display = 'none';
  } else {
    document.getElementById('options-tracker').style.display = 'none';
    const stockContent = document.querySelector('.portfolio-stock-content');
    if (stockContent) stockContent.style.display = 'block';
  }
}

// ── Initialize ─────────────────────────────────────────────────────────────────
function initOptionsTracker() {
  // Inject styles if not already present
  if (!document.getElementById('options-tracker-styles')) {
    const style = document.createElement('style');
    style.id = 'options-tracker-styles';
    style.textContent = getOptionsTrackerStyles();
    document.head.appendChild(style);
  }
  
  renderOptionsTable();
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATION INSTRUCTIONS
// ══════════════════════════════════════════════════════════════════════════════
// 
// 1. Add the CSS (getOptionsTrackerStyles()) to your <style> block
// 
// 2. In your renderPortfolio() function, inject the HTML:
//    document.getElementById('main-content').innerHTML = getOptionsTrackerHTML();
//    initOptionsTracker();
// 
// 3. Wrap your existing stock portfolio content in:
//    <div class="portfolio-stock-content">...existing content...</div>
// 
// 4. The Options tab uses localStorage key 'optionsPositions' — completely
//    separate from any existing stock positions
// 
// ══════════════════════════════════════════════════════════════════════════════
