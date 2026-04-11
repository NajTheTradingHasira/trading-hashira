/*
 * WHALE FLOW — Frontend Renderer
 * 
 * Drop this into your NX object in index.html as the loadWhaleFlow method.
 * The "SCAN WHALE" button should call NX.loadWhaleFlow().
 * 
 * Expected endpoint: GET /api/options/whale
 * Response shape: { summary: {...}, flows: [...], hits: N, scanned: N }
 */

async loadWhaleFlow() {
  const el = document.getElementById('cv-whale');
  if (!el) return;
  el.innerHTML = '<div class="loading-pulse" style="text-align:center;padding:60px 0;color:var(--text-dim)">Scanning whale flow across 20 tickers…</div>';

  try {
    const res = await fetch(`${NX.api}/api/options/whale`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const flows = data.flows || [];
    const s = data.summary || {};

    // ── Summary Banner ──
    const pcr = s.put_call_ratio != null ? s.put_call_ratio.toFixed(2) : '—';
    const regime = (s.put_call_ratio || 0) > 1.2 ? 'BEARISH' : (s.put_call_ratio || 0) < 0.7 ? 'BULLISH' : 'NEUTRAL';
    const regimeColor = regime === 'BULLISH' ? 'var(--green)' : regime === 'BEARISH' ? 'var(--red)' : 'var(--text-dim)';

    const summaryHTML = `
      <div class="card" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
        <div class="m-card" style="border:none;padding:0;background:none">
          <div class="label">REGIME</div>
          <div class="value" style="color:${regimeColor};font-size:18px;font-weight:700">${regime}</div>
        </div>
        <div class="m-card" style="border:none;padding:0;background:none">
          <div class="label">PUT/CALL $</div>
          <div class="value accent-c">${pcr}</div>
        </div>
        <div class="m-card" style="border:none;padding:0;background:none">
          <div class="label">CALL NOTIONAL</div>
          <div class="value up">$${(s.total_call_notional/1e6).toFixed(1)}M</div>
        </div>
        <div class="m-card" style="border:none;padding:0;background:none">
          <div class="label">PUT NOTIONAL</div>
          <div class="value down">$${(s.total_put_notional/1e6).toFixed(1)}M</div>
        </div>
        <div class="m-card" style="border:none;padding:0;background:none">
          <div class="label">HITS</div>
          <div class="value neutral">${data.hits} / ${data.scanned} tickers</div>
        </div>
      </div>`;

    // ── Flow Table ──
    const rowsHTML = flows.map(f => {
      const sentColor = f.sentiment === 'BULLISH' ? 'var(--green)' : f.sentiment === 'BEARISH' ? 'var(--red)' : 'var(--text-dim)';
      const sideColor = f.side === 'CALL' ? '#00e676' : '#ff5252';
      const notionalFmt = f.notional >= 1e6 ? `$${(f.notional/1e6).toFixed(1)}M` : `$${(f.notional/1e3).toFixed(0)}K`;
      const flagsHTML = f.flags.map(fl => `<span style="background:var(--card-bg);border:1px solid var(--border);border-radius:3px;padding:1px 6px;font-size:9px;color:var(--accent-c);margin-right:4px">${fl}</span>`).join('');

      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:600;color:var(--accent-c)">${f.ticker}</td>
        <td style="padding:8px 6px;color:${sideColor};font-weight:600;font-size:11px">${f.side}</td>
        <td style="padding:8px 6px">${f.strike}</td>
        <td style="padding:8px 6px;font-size:11px;color:var(--text-dim)">${f.expiry}</td>
        <td style="padding:8px 6px;font-weight:600">${f.volume.toLocaleString()}</td>
        <td style="padding:8px 6px;color:var(--text-dim)">${f.oi.toLocaleString()}</td>
        <td style="padding:8px 6px;font-weight:600;color:${f.vol_oi >= 10 ? 'var(--red)' : f.vol_oi >= 5 ? '#ffc107' : 'var(--text-dim)'}">${f.vol_oi}x</td>
        <td style="padding:8px 6px">${f.iv}%</td>
        <td style="padding:8px 6px;font-weight:600;color:var(--accent-c)">${notionalFmt}</td>
        <td style="padding:8px 6px;color:${sentColor};font-weight:600;font-size:11px">${f.sentiment}</td>
        <td style="padding:8px 6px">${flagsHTML}</td>
      </tr>`;
    }).join('');

    const tableHTML = `
      <div class="card" style="overflow-x:auto">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>WHALE FLOW — ${flows.length} HITS</span>
          <span style="font-size:10px;color:var(--text-dim)">${new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-dim);letter-spacing:1px">TICKER</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">SIDE</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">STRIKE</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">EXPIRY</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">VOL</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">OI</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">V/OI</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">IV</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">NOTIONAL</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">BIAS</th>
            <th style="text-align:left;padding:8px 6px;font-size:10px;color:var(--text-dim)">FLAGS</th>
          </tr></thead>
          <tbody>${rowsHTML || '<tr><td colspan="11" class="empty-state" style="padding:30px;text-align:center">No whale flow detected</td></tr>'}</tbody>
        </table>
      </div>`;

    el.innerHTML = summaryHTML + tableHTML;

  } catch (e) {
    el.innerHTML = `<div class="empty-state" style="padding:40px;text-align:center">
      <div style="font-size:14px;margin-bottom:8px">Whale flow endpoint error</div>
      <div style="font-size:11px;color:var(--text-dim)">${e.message}</div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:8px">GET /api/options/whale</div>
    </div>`;
  }
},
