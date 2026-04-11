/* ═══════════════════════════════════════════════════════════════════════
   STAGE SCANNER TAB — Integration Guide
   ═══════════════════════════════════════════════════════════════════════
   1. Add nav entry:  { id: 'stage-scanner', label: 'Stage Scanner', icon: '🔬' }
   2. Add page container:  <div id="page-stage-scanner" class="page-content"></div>
   3. Paste this entire block into your <script> section
   4. Wire showPage('stage-scanner') → renderStageScanner()
   ═══════════════════════════════════════════════════════════════════════ */

function renderStageScanner() {
  const container = document.getElementById('page-stage-scanner');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <h2 style="color: var(--accent, #00e5ff); margin-bottom: 4px;">🔬 Stage Scanner</h2>
      <p style="color: #888; font-size: 13px; margin-bottom: 16px;">
        Batch Weinstein Stage Analysis — scan your universe, surface setups
      </p>

      <!-- Input Bar -->
      <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
        <input id="scanner-input" type="text"
          placeholder="AAPL, NVDA, MSFT, META, AMZN, GOOGL, TSLA..."
          style="flex: 1; min-width: 300px; padding: 10px 14px; background: #1a1a2e;
                 border: 1px solid #333; border-radius: 6px; color: #e0e0e0;
                 font-family: 'JetBrains Mono', monospace; font-size: 13px;" />
        <button id="scanner-load-watchlist" onclick="scannerLoadWatchlist()"
          style="padding: 10px 16px; background: #1a1a2e; border: 1px solid #444;
                 border-radius: 6px; color: #aaa; cursor: pointer; font-size: 13px;
                 white-space: nowrap;">
          📋 Load Watchlist
        </button>
        <button id="scanner-run-btn" onclick="runStageScan()"
          style="padding: 10px 20px; background: #00e5ff; color: #000; border: none;
                 border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px;
                 white-space: nowrap;">
          ► Run Scan
        </button>
      </div>

      <!-- Filter Tabs -->
      <div id="scanner-filters" style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
        <button class="scanner-filter active" data-filter="ALL" onclick="filterScanResults('ALL', this)">ALL</button>
        <button class="scanner-filter" data-filter="2A" onclick="filterScanResults('2A', this)"
          style="border-color: #00e676;">2A BUY</button>
        <button class="scanner-filter" data-filter="2" onclick="filterScanResults('2', this)"
          style="border-color: #4caf50;">STAGE 2</button>
        <button class="scanner-filter" data-filter="1" onclick="filterScanResults('1', this)"
          style="border-color: #ffd600;">BASING</button>
        <button class="scanner-filter" data-filter="3" onclick="filterScanResults('3', this)"
          style="border-color: #ff9800;">TOPPING</button>
        <button class="scanner-filter" data-filter="4" onclick="filterScanResults('4', this)"
          style="border-color: #f44336;">STAGE 4</button>
      </div>

      <!-- Status -->
      <div id="scanner-status" style="color: #888; font-size: 12px; margin-bottom: 10px;"></div>

      <!-- Stage Distribution Bar -->
      <div id="scanner-dist" style="margin-bottom: 16px;"></div>

      <!-- Sort Controls -->
      <div id="scanner-sort" style="display: none; margin-bottom: 10px; font-size: 12px; color: #888;">
        Sort:
        <span class="scanner-sort-btn active" onclick="sortScanResults('stage', this)">Stage</span> ·
        <span class="scanner-sort-btn" onclick="sortScanResults('rs', this)">RS</span> ·
        <span class="scanner-sort-btn" onclick="sortScanResults('vol', this)">Volume</span> ·
        <span class="scanner-sort-btn" onclick="sortScanResults('pctHigh', this)">% from High</span>
      </div>

      <!-- Results Table -->
      <div id="scanner-results" style="overflow-x: auto;"></div>
    </div>

    <style>
      .scanner-filter {
        padding: 6px 14px; background: transparent; border: 1px solid #444;
        border-radius: 4px; color: #aaa; cursor: pointer; font-size: 12px;
        font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
      }
      .scanner-filter:hover { background: #1a1a2e; color: #fff; }
      .scanner-filter.active { background: #1a1a2e; color: #fff; border-color: #00e5ff; }
      .scanner-sort-btn { cursor: pointer; padding: 2px 6px; border-radius: 3px; }
      .scanner-sort-btn:hover { color: #fff; }
      .scanner-sort-btn.active { color: #00e5ff; text-decoration: underline; }
      #scanner-results table {
        width: 100%; border-collapse: collapse; font-size: 12px;
        font-family: 'JetBrains Mono', monospace;
      }
      #scanner-results th {
        text-align: left; padding: 8px 10px; color: #888;
        border-bottom: 1px solid #333; white-space: nowrap; position: sticky; top: 0;
        background: #0d0d1a;
      }
      #scanner-results td {
        padding: 7px 10px; border-bottom: 1px solid #1a1a2e; white-space: nowrap;
      }
      #scanner-results tr:hover td { background: #111128; }
      .stage-badge {
        display: inline-block; padding: 2px 8px; border-radius: 3px;
        font-weight: 700; font-size: 11px; letter-spacing: 0.5px;
      }
    </style>
  `;
}

// ── State ──────────────────────────────────────────────────────────────

let _scanResults = [];
let _scanCurrentFilter = 'ALL';
let _scanCurrentSort = 'stage';

// ── Load Watchlist ─────────────────────────────────────────────────────

function scannerLoadWatchlist() {
  // Pull tickers from your existing watchlist (adjust key/source as needed)
  const wl = JSON.parse(localStorage.getItem('watchlist') || '[]');
  const tickers = wl.map(w => typeof w === 'string' ? w : w.ticker || w.symbol).filter(Boolean);
  if (tickers.length === 0) {
    document.getElementById('scanner-status').textContent = '⚠ Watchlist empty — type tickers manually';
    return;
  }
  document.getElementById('scanner-input').value = tickers.join(', ');
}

// ── Run Scan ───────────────────────────────────────────────────────────

async function runStageScan() {
  const input = document.getElementById('scanner-input').value.trim();
  if (!input) return;

  const tickers = input.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
  const statusEl = document.getElementById('scanner-status');
  const btn = document.getElementById('scanner-run-btn');

  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';
  statusEl.textContent = `Scanning ${tickers.length} ticker${tickers.length > 1 ? 's' : ''}...`;
  document.getElementById('scanner-results').innerHTML = '';
  document.getElementById('scanner-dist').innerHTML = '';

  try {
    const resp = await fetch(`${API_BASE}/api/research/stage-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers })
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();

    _scanResults = data.results || [];
    const ts = new Date(data.timestamp).toLocaleTimeString();

    statusEl.innerHTML = `✓ <b>${data.scanned}</b>/${data.total} scanned · ` +
      `${data.failed} failed · Benchmark ${data.benchmark}: <b>${data.benchmark_stage || '?'}</b> · ${ts}`;

    renderStageDist(data.stage_distribution);
    document.getElementById('scanner-sort').style.display = 'block';
    filterScanResults(_scanCurrentFilter, document.querySelector('.scanner-filter.active'));

  } catch (err) {
    statusEl.textContent = `✗ Error: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '► Run Scan';
  }
}

// ── Stage Distribution Bar ─────────────────────────────────────────────

function renderStageDist(dist) {
  const el = document.getElementById('scanner-dist');
  if (!dist || Object.keys(dist).length === 0) { el.innerHTML = ''; return; }

  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const order = ['1A','1','1B','2A','2','2B','3A','3','3B','4A','4','4B'];
  const colors = {
    '1A':'#555','1':'#777','1B':'#ffd600',
    '2A':'#00e676','2':'#4caf50','2B':'#81c784',
    '3A':'#ff9800','3':'#f57c00','3B':'#e65100',
    '4A':'#f44336','4':'#d32f2f','4B':'#b71c1c',
  };

  let bars = '';
  for (const s of order) {
    if (!dist[s]) continue;
    const pct = (dist[s] / total * 100).toFixed(0);
    bars += `<div style="flex: ${dist[s]}; background: ${colors[s] || '#444'};
      height: 22px; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #000; min-width: 30px;
      border-right: 1px solid #0d0d1a;" title="${s}: ${dist[s]} (${pct}%)">
      ${s} ${dist[s]}
    </div>`;
  }

  el.innerHTML = `<div style="display: flex; border-radius: 4px; overflow: hidden;">${bars}</div>`;
}

// ── Filter ─────────────────────────────────────────────────────────────

function filterScanResults(filter, btn) {
  _scanCurrentFilter = filter;
  document.querySelectorAll('.scanner-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderScanTable();
}

// ── Sort ───────────────────────────────────────────────────────────────

const STAGE_ORDER = {'1A':0,'1':1,'1B':2,'2A':3,'2':4,'2B':5,'3A':6,'3':7,'3B':8,'4A':9,'4':10,'4B':11,'ERR':99,'?':99};

function sortScanResults(key, btn) {
  _scanCurrentSort = key;
  document.querySelectorAll('.scanner-sort-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderScanTable();
}

// ── Render Table ───────────────────────────────────────────────────────

function renderScanTable() {
  const el = document.getElementById('scanner-results');
  let rows = [..._scanResults];

  // Filter
  if (_scanCurrentFilter !== 'ALL') {
    if (_scanCurrentFilter === '1') {
      rows = rows.filter(r => r.stage.startsWith('1'));
    } else if (_scanCurrentFilter === '2') {
      rows = rows.filter(r => r.stage.startsWith('2'));
    } else if (_scanCurrentFilter === '3') {
      rows = rows.filter(r => r.stage.startsWith('3'));
    } else if (_scanCurrentFilter === '4') {
      rows = rows.filter(r => r.stage.startsWith('4'));
    } else {
      rows = rows.filter(r => r.stage === _scanCurrentFilter);
    }
  }

  // Sort
  rows.sort((a, b) => {
    if (_scanCurrentSort === 'stage') return (STAGE_ORDER[a.stage] ?? 50) - (STAGE_ORDER[b.stage] ?? 50);
    if (_scanCurrentSort === 'rs') return (b.mansfield_rs ?? -999) - (a.mansfield_rs ?? -999);
    if (_scanCurrentSort === 'vol') return (b.vol_ratio ?? 0) - (a.vol_ratio ?? 0);
    if (_scanCurrentSort === 'pctHigh') return (b.pct_from_52w_high ?? -999) - (a.pct_from_52w_high ?? -999);
    return 0;
  });

  if (rows.length === 0) {
    el.innerHTML = '<p style="color:#666; padding: 20px;">No results match filter.</p>';
    return;
  }

  const stageColor = (s) => {
    if (s.startsWith('2')) return { bg: '#0a2e1a', fg: '#00e676' };
    if (s === '1B') return { bg: '#2e2a0a', fg: '#ffd600' };
    if (s.startsWith('1')) return { bg: '#1a1a1a', fg: '#888' };
    if (s.startsWith('3')) return { bg: '#2e1a0a', fg: '#ff9800' };
    if (s.startsWith('4')) return { bg: '#2e0a0a', fg: '#f44336' };
    return { bg: '#1a1a1a', fg: '#888' };
  };

  const rsColor = (v) => v == null ? '#555' : v > 0 ? '#00e676' : '#f44336';
  const volBadge = (sig) => {
    const m = { Breakout: '#00e676', Churning: '#ff9800', 'Dry-up': '#888', Normal: '#555' };
    return `<span style="color:${m[sig] || '#555'}">${sig || '—'}</span>`;
  };
  const boolDot = (v) => v == null ? '—' : v ? '✅' : '❌';

  let html = `<table>
    <thead><tr>
      <th>TICKER</th><th>STAGE</th><th>LABEL</th><th>ACTION</th>
      <th>PRICE</th><th>30w SMA</th><th>SLOPE</th>
      <th>MRS</th><th>VOL</th><th>VOL SIG</th>
      <th>CANSLIM</th><th>KELL</th>
      <th>% HIGH</th><th>% LOW</th>
      <th>TRANSITION</th>
    </tr></thead><tbody>`;

  for (const r of rows) {
    const sc = stageColor(r.stage);
    html += `<tr>
      <td style="color:#fff; font-weight:700;">${r.ticker}</td>
      <td><span class="stage-badge" style="background:${sc.bg}; color:${sc.fg};">
        ${r.stage}${r.qualifier}</span></td>
      <td style="color:#ccc;">${r.stage_label || ''}</td>
      <td style="color:#aaa; font-size:11px;">${r.action_bias || ''}</td>
      <td>${r.price ?? '—'}</td>
      <td>${r.sma_30w ?? '—'}</td>
      <td style="color:${r.sma_30w_slope === 'Rising' ? '#00e676' : r.sma_30w_slope === 'Falling' ? '#f44336' : '#ffd600'}">
        ${r.sma_30w_slope || '—'}</td>
      <td style="color:${rsColor(r.mansfield_rs)}">${r.mansfield_rs ?? '—'}</td>
      <td>${r.vol_ratio ?? '—'}×</td>
      <td>${volBadge(r.vol_signal)}</td>
      <td>${boolDot(r.canslim_ma_stack)}</td>
      <td>${boolDot(r.kell_ema_stack)}</td>
      <td style="color:${(r.pct_from_52w_high ?? -99) > -10 ? '#00e676' : '#f44336'}">
        ${r.pct_from_52w_high != null ? r.pct_from_52w_high + '%' : '—'}</td>
      <td style="color:#4caf50">${r.pct_from_52w_low != null ? '+' + r.pct_from_52w_low + '%' : '—'}</td>
      <td style="color:#ff9800; font-size:11px;">${r.transition_risk || '—'}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  el.innerHTML = html;
}
