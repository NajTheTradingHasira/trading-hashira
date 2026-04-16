# SPY Logic AI Tape Reading — Frontend (Dual Provider)

## Overview
Add an "AI Tape Reading" section to the SPY Logic page with two provider buttons — Perplexity (web search) and Claude. Each fires independently, renders in its own panel. Two-tab layout so you can compare reads.

**Surgical edits to `~/trading-hashira/index.html` — do NOT rewrite the full file.**

---

## STEP 1: Add the AI Tape Read section to the page HTML

Find the closing `</div>` of `pg-spylogic` (the very last `</div>` that closes the page). BEFORE that closing tag, insert:

```html
      <!-- AI Tape Reading -->
      <div style="margin-top:12px">
        <div class="card" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div style="font-weight:700;font-size:14px">AI Tape Reading</div>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="btn" id="spy-ai-ppx-btn" onclick="NX.loadSPYAnalysis('perplexity')" style="font-size:11px;background:rgba(0,255,255,0.1);border:1px solid rgba(0,255,255,0.3);color:var(--cyan)">⚡ PERPLEXITY</button>
              <button class="btn" id="spy-ai-claude-btn" onclick="NX.loadSPYAnalysis('claude')" style="font-size:11px;background:rgba(187,134,252,0.1);border:1px solid rgba(187,134,252,0.3);color:var(--purple)">⚡ CLAUDE</button>
              <button class="btn" onclick="NX.loadSPYAnalysis('perplexity');NX.loadSPYAnalysis('claude')" style="font-size:11px">⚡ BOTH</button>
            </div>
          </div>
          <!-- Provider tabs -->
          <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
            <button class="tab-btn active" id="spy-ai-tab-ppx" onclick="NX.switchSPYAITab('perplexity')" style="padding:6px 14px;font-size:11px;border-bottom:2px solid var(--cyan);color:var(--cyan);background:transparent;border-radius:0">Perplexity</button>
            <button class="tab-btn" id="spy-ai-tab-claude" onclick="NX.switchSPYAITab('claude')" style="padding:6px 14px;font-size:11px;border-bottom:2px solid transparent;color:var(--text-muted);background:transparent;border-radius:0">Claude</button>
          </div>
          <!-- Perplexity output -->
          <div id="spy-ai-ppx" style="display:block">
            <div class="empty-state" style="padding:30px"><div class="icon" style="color:var(--cyan)">⊘</div>Click PERPLEXITY for web-search-powered tape reading<br/><span style="font-size:10px;color:var(--text-dim);margin-top:6px;display:block">sonar-pro · web search enabled · 5-min cache</span></div>
          </div>
          <!-- Claude output -->
          <div id="spy-ai-claude" style="display:none">
            <div class="empty-state" style="padding:30px"><div class="icon" style="color:var(--purple)">⊘</div>Click CLAUDE for reasoning-powered tape reading<br/><span style="font-size:10px;color:var(--text-dim);margin-top:6px;display:block">claude-sonnet-4 · deep reasoning · 5-min cache</span></div>
          </div>
        </div>
      </div>
```

---

## STEP 2: Add the JS methods to NX

Find the NX object and add these methods (place near `loadSPYLogic` / `evaluateSPYLogic`):

```javascript
  loadSPYAnalysis(provider){
    provider = provider || 'perplexity';
    const panelId = provider === 'perplexity' ? 'spy-ai-ppx' : 'spy-ai-claude';
    const btnId = provider === 'perplexity' ? 'spy-ai-ppx-btn' : 'spy-ai-claude-btn';
    const el = document.getElementById(panelId);
    const btn = document.getElementById(btnId);
    if (!el) return;

    // Show the tab for this provider
    NX.switchSPYAITab(provider);

    const color = provider === 'perplexity' ? 'var(--cyan)' : 'var(--purple)';
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)"><div style="font-size:16px;margin-bottom:8px">⏳</div>Generating ' + provider + ' tape reading...<br/><span style="font-size:10px;color:var(--text-dim)">Fetching live data → AI analysis → ~15 seconds</span></div>';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

    const base = NX.getBase();
    fetch(base + '/api/spy-logic/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider })
    })
      .then(r => r.json())
      .then(d => {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }

        if (d.error || !d.analysis) {
          el.innerHTML = '<div style="padding:20px;color:var(--red)">⚠ ' + (d.error || 'No analysis returned') + '</div>';
          return;
        }

        // Build header with metadata
        const ts = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '';
        const priceStr = d.market_data?.price ? '$' + d.market_data.price : '';
        const vwapStr = d.market_data?.vwap ? '$' + d.market_data.vwap : '';
        const header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:6px">'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span style="padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;background:' + (provider === 'perplexity' ? 'rgba(0,255,255,0.1)' : 'rgba(187,134,252,0.1)') + ';color:' + color + '">' + provider.toUpperCase() + '</span>'
          + '<span style="font-size:11px;color:var(--text-muted)">SPY ' + priceStr + ' · VWAP ' + vwapStr + '</span>'
          + '</div>'
          + '<span style="font-size:10px;color:var(--text-dim)">' + ts + '</span>'
          + '</div>';

        el.innerHTML = header + NX._renderSPYMarkdown(d.analysis);
      })
      .catch(e => {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        el.innerHTML = '<div style="padding:20px;color:var(--red)">⚠ ' + provider + ' request failed: ' + e.message + '</div>';
      });
  },

  switchSPYAITab(provider){
    const ppxPanel = document.getElementById('spy-ai-ppx');
    const claudePanel = document.getElementById('spy-ai-claude');
    const ppxTab = document.getElementById('spy-ai-tab-ppx');
    const claudeTab = document.getElementById('spy-ai-tab-claude');
    if (!ppxPanel || !claudePanel) return;

    if (provider === 'perplexity') {
      ppxPanel.style.display = 'block';
      claudePanel.style.display = 'none';
      if (ppxTab) { ppxTab.style.borderBottomColor = 'var(--cyan)'; ppxTab.style.color = 'var(--cyan)'; }
      if (claudeTab) { claudeTab.style.borderBottomColor = 'transparent'; claudeTab.style.color = 'var(--text-muted)'; }
    } else {
      ppxPanel.style.display = 'none';
      claudePanel.style.display = 'block';
      if (claudeTab) { claudeTab.style.borderBottomColor = 'var(--purple)'; claudeTab.style.color = 'var(--purple)'; }
      if (ppxTab) { ppxTab.style.borderBottomColor = 'transparent'; ppxTab.style.color = 'var(--text-muted)'; }
    }
  },

  _renderSPYMarkdown(md){
    let html = md;

    // Tables: convert markdown tables to styled HTML
    html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, function(match, header, body) {
      const headers = header.split('|').map(h => h.trim()).filter(Boolean);
      let table = '<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">';
      table += '<thead><tr>' + headers.map(h => '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--cyan);color:var(--cyan);font-size:10px;text-transform:uppercase;letter-spacing:0.05em">' + h + '</th>').join('') + '</tr></thead>';
      table += '<tbody>';
      const rows = body.trim().split('\n');
      rows.forEach((row, i) => {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
        table += '<tr style="background:' + bg + '">' + cells.map(c => '<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06)">' + c + '</td>').join('') + '</tr>';
      });
      table += '</tbody></table></div>';
      return table;
    });

    // Headers
    html = html.replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:14px;color:var(--cyan);margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(0,255,255,0.15)">$1</div>');
    html = html.replace(/^### (.+)$/gm, '<div style="font-weight:700;font-size:13px;margin:14px 0 8px;color:var(--text)">$1</div>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>');

    // Scenario blocks
    html = html.replace(/^([A-C])\.\s+(.+)$/gm, '<div style="font-weight:700;font-size:13px;margin:14px 0 4px;color:var(--cyan)">$1. $2</div>');

    // Nested bullets (2+ spaces before dash)
    html = html.replace(/^\s{2,}[-•]\s+(.+)$/gm, '<div style="display:flex;gap:8px;padding:2px 0 2px 20px;font-size:11px"><span style="color:var(--text-dim);flex-shrink:0">·</span><span style="color:var(--text-muted)">$1</span></div>');

    // Top-level bullets
    html = html.replace(/^[-•]\s+(.+)$/gm, '<div style="display:flex;gap:8px;padding:3px 0;font-size:12px"><span style="color:var(--cyan);flex-shrink:0">›</span><span style="color:var(--text-muted)">$1</span></div>');

    // Paragraphs
    html = html.replace(/^(?!<)(.+)$/gm, '<p style="font-size:12px;color:var(--text-muted);margin:4px 0;line-height:1.6">$1</p>');

    // Clean empties
    html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

    return '<div style="padding:4px 0">' + html + '</div>';
  },
```

---

## STEP 3: Update the page loader

Find the page loader entry for spylogic. It should currently be:

```javascript
spylogic:()=>{ NX.loadSPYLogic(); },
```

Replace with:

```javascript
spylogic:()=>{ NX.loadSPYLogic(); },
```

**Do NOT auto-fire the AI analysis on page load** — it's an expensive API call. The data engine (`loadSPYLogic`) auto-fires to populate dropdowns. The AI tape read fires only when the user clicks a button.

(If the entry already has `NX.loadSPYAnalysis()` appended from a prior edit, remove it.)

---

## STEP 4: Deploy

```bash
cd ~/trading-hashira
git add -A
git commit -m "SPY Logic dual AI tape reading — Perplexity + Claude tabs with BOTH button"
git push
```

---

## Verification
1. Navigate to SPY Logic page
2. AI Tape Reading section at bottom shows two tabs (Perplexity / Claude)
3. Three buttons: ⚡ PERPLEXITY, ⚡ CLAUDE, ⚡ BOTH
4. Clicking PERPLEXITY generates in the Perplexity tab with cyan badge
5. Clicking CLAUDE generates in the Claude tab with purple badge
6. Clicking BOTH fires both simultaneously — switch tabs to compare
7. Tab switching preserves content (doesn't re-fetch)
8. 5-minute per-provider cache — rapid re-clicks return cached result
9. Loading states show per-panel with provider name
10. Each panel shows header bar with provider badge, SPY price, VWAP, timestamp
