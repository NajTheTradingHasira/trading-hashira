# SPY Trading Logic — Install into Trading Hashira

## Overview
Replace the **Backtester** page (`pg-backtest`) with a new **SPY Logic** page (`pg-spylogic`). This is a self-contained intraday bias engine for SPY 0DTE trading — decision matrix, supply map, execution checklist, scenario library, and interactive bias engine with dropdowns.

**Rules:**
- Surgical edits only — NO download-and-replace
- All CSS uses existing Trading Hashira variables (`--card-bg`, `--cyan`, `--border`, `--bg`, `--text`, `--text-muted`, `--text-dim`, `--green`, `--red`, `--purple`, `--yellow`)
- Monospace font inherited from body — do NOT import external fonts
- All JS wired into the `NX` namespace
- Preserve every other page and function untouched

---

## STEP 1: Update PAGES array

Find the backtest entry in the `PAGES` array. It will look approximately like:

```
{id:'backtest',label:'Backtester',icon:'↻',key:'R',group:'QUANT'},
```

Replace it with:

```
{id:'spylogic',label:'SPY Logic',icon:'⊘',key:'R',group:'QUANT'},
```

If the entry has already been renamed to something like "Should I Be Trading" or similar, replace whatever is in that slot.

---

## STEP 2: Replace the `pg-backtest` HTML block

Find the entire `<div class="page" id="pg-backtest">...</div>` block and replace it with the following. If the page id was already renamed, find whatever replaced it. The new page id is `pg-spylogic`:

```html
    <!-- SPY Trading Logic -->
    <div class="page" id="pg-spylogic">
      <!-- Hero row -->
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:12px;margin-bottom:12px">
        <div class="card" style="padding:20px">
          <div style="display:inline-block;padding:3px 10px;border-radius:20px;background:rgba(0,255,255,0.1);color:var(--cyan);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px">0DTE FRAMEWORK</div>
          <div style="font-size:22px;font-weight:700;line-height:1.1;margin-bottom:10px;max-width:18ch">Decide whether today favors buying pullbacks or fading rallies.</div>
          <div style="color:var(--text-muted);font-size:12px;margin-bottom:16px">Feed it opening context, VWAP state, internals, and location vs supply. Returns directional bias, entry style, and invalidation.</div>
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <button class="btn" onclick="NX.runSPYLogic()" style="background:var(--cyan);color:#000;font-weight:700">▶ RUN TRADE LOGIC</button>
            <button class="btn" onclick="document.getElementById('spy-levels').scrollIntoView({behavior:'smooth'})">⬇ SUPPLY MAP</button>
          </div>
          <div id="spy-stance" class="card" style="padding:14px;background:linear-gradient(135deg,rgba(0,255,255,0.06),var(--card-bg));border:1px solid rgba(0,255,255,0.2)">
            <div style="font-weight:700;margin-bottom:4px;font-size:12px">CURRENT STANCE</div>
            <div style="color:var(--text-muted);font-size:12px" id="spy-stance-text">Default: short failed rallies into overhead supply unless price accepts above supply and reclaims VWAP with confirming internals.</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="card" style="padding:14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:6px">PRIMARY QUESTION</div>
            <div style="font-size:15px;font-weight:700;line-height:1.2">Long pullback or short rally?</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Depends on opening auction, VWAP acceptance, and reaction at supply.</div>
          </div>
          <div class="card" style="padding:14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:6px">BIAS TRIGGER</div>
            <div style="font-size:15px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums">VWAP + Internals</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Location without confirmation is not enough.</div>
          </div>
          <div class="card" style="padding:14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:6px">PRIMARY SETUP</div>
            <div style="font-size:15px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums">Lower-high fade</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Best when opening impulse stalls into supply and loses VWAP.</div>
          </div>
          <div class="card" style="padding:14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:6px">INVALIDATION</div>
            <div style="font-size:15px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums">Accept above supply</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Do not stay short if price reclaims and holds above the zone.</div>
          </div>
        </div>
      </div>

      <!-- Two-column body -->
      <div style="display:grid;grid-template-columns:0.92fr 1.08fr;gap:12px">
        <!-- Left column -->
        <div style="display:grid;gap:12px">
          <!-- Decision Matrix -->
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-weight:700;font-size:14px">Decision Matrix</div>
              <span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border)">FAST READ</span>
            </div>
            <div style="display:grid;gap:6px">
              <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:6px 8px;color:var(--text-dim);font-size:9px;text-transform:uppercase;letter-spacing:0.08em">
                <div>Condition</div><div>Bias</div><div>Execution</div>
              </div>
              <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02);font-size:11px">
                <div>Open below supply, rally stalls, VWAP lost</div>
                <div><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,77,77,0.15);color:var(--red)">SHORT RALLIES</span></div>
                <div style="color:var(--text-muted)">Wait for lower high into resistance, buy puts on failure.</div>
              </div>
              <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02);font-size:11px">
                <div>Open above supply, hold above, VWAP defended</div>
                <div><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,255,136,0.15);color:var(--green)">BUY PULLBACKS</span></div>
                <div style="color:var(--text-muted)">Use first orderly retest of breakout zone.</div>
              </div>
              <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02);font-size:11px">
                <div>Inside range, internals mixed, price whipping VWAP</div>
                <div><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,200,0,0.15);color:var(--yellow)">REDUCE SIZE</span></div>
                <div style="color:var(--text-muted)">Wait for ORB break or confirmed reclaim/reject.</div>
              </div>
              <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02);font-size:11px">
                <div>Gap down into demand, immediate VWAP reclaim</div>
                <div><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,255,136,0.15);color:var(--green)">CTR-TREND LONG</span></div>
                <div style="color:var(--text-muted)">Target move back toward prior value / OR mid.</div>
              </div>
            </div>
          </div>

          <!-- Supply Map -->
          <div class="card" style="padding:16px" id="spy-levels">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-weight:700;font-size:14px">Supply Map</div>
              <span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border)">EDITABLE</span>
            </div>
            <div style="display:grid;gap:8px" id="spy-levels-grid">
              <div style="padding:12px;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,0.03),transparent);border:1px solid rgba(255,255,255,0.06)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="font-weight:700;font-variant-numeric:tabular-nums">Zone 1: <input id="spy-z1" value="560–563" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 6px;width:90px;color:var(--text);font-family:inherit;font-size:12px"/></div>
                  <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,77,77,0.15);color:var(--red)">SUPPLY</span>
                </div>
                <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Use for failed first-hour rallies, especially if price loses VWAP and cannot regain on bounce.</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,0.03),transparent);border:1px solid rgba(255,255,255,0.06)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="font-weight:700;font-variant-numeric:tabular-nums">Zone 2: <input id="spy-z2" value="555–557" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 6px;width:90px;color:var(--text);font-family:inherit;font-size:12px"/></div>
                  <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,200,0,0.15);color:var(--yellow)">PIVOT</span>
                </div>
                <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Reversion target after exhausted opening drive. Decision node for trend continuation vs balance.</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,0.03),transparent);border:1px solid rgba(255,255,255,0.06)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="font-weight:700;font-variant-numeric:tabular-nums">Zone 3: <input id="spy-z3" value="548–550" style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 6px;width:90px;color:var(--text);font-family:inherit;font-size:12px"/></div>
                  <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,255,136,0.15);color:var(--green)">DEMAND</span>
                </div>
                <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Only buy when tape stabilizes, VWAP reclaimed, and flush shows responsive buying — not trend-day liquidation.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right column -->
        <div style="display:grid;gap:12px">
          <!-- Execution Checklist -->
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-weight:700;font-size:14px">Execution Checklist</div>
              <span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border)">BEFORE ENTRY</span>
            </div>
            <div style="display:grid;gap:6px">
              <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <span style="color:var(--cyan);font-size:14px;flex-shrink:0;margin-top:1px">✓</span>
                <div><div style="font-weight:700;font-size:12px">Locate price vs supply/demand</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px">Do not take a momentum signal in isolation; anchor to structure first.</div></div>
              </div>
              <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <span style="color:var(--cyan);font-size:14px;flex-shrink:0;margin-top:1px">✓</span>
                <div><div style="font-weight:700;font-size:12px">Assess VWAP state</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px">Holding above favors pullback longs; loss and rejection favors short rallies.</div></div>
              </div>
              <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <span style="color:var(--cyan);font-size:14px;flex-shrink:0;margin-top:1px">✓</span>
                <div><div style="font-weight:700;font-size:12px">Demand internal confirmation</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px">A/D, TICK, sector confirmation, breadth should agree with direction.</div></div>
              </div>
              <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <span style="color:var(--cyan);font-size:14px;flex-shrink:0;margin-top:1px">✓</span>
                <div><div style="font-weight:700;font-size:12px">Wait for the retest</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px">First breakdown or breakout is information; the retest is often the trade.</div></div>
              </div>
            </div>
          </div>

          <!-- Scenario Library -->
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-weight:700;font-size:14px">Scenario Library</div>
              <span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border)">ROAD MAP</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <div style="padding:12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
                <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,77,77,0.15);color:var(--red);margin-bottom:8px">SCENARIO A</span>
                <div style="font-weight:700;font-size:12px;margin-bottom:4px">Opening rip into supply</div>
                <div style="font-size:11px;color:var(--text-muted)">Let first push exhaust. If internals fade and VWAP breaks, short the lower-high rally.</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
                <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,255,136,0.15);color:var(--green);margin-bottom:8px">SCENARIO B</span>
                <div style="font-weight:700;font-size:12px;margin-bottom:4px">Gap and go above supply</div>
                <div style="font-size:11px;color:var(--text-muted)">If price accepts above zone and back-tests, treat supply as support. Buy pullbacks.</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
                <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,200,0,0.15);color:var(--yellow);margin-bottom:8px">SCENARIO C</span>
                <div style="font-weight:700;font-size:12px;margin-bottom:4px">Range chop around VWAP</div>
                <div style="font-size:11px;color:var(--text-muted)">Expect theta burn and false starts. Reduce size or wait for expansion from ORB.</div>
              </div>
            </div>
          </div>

          <!-- Interactive Bias Engine -->
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-weight:700;font-size:14px">Interactive Bias Engine</div>
              <span style="padding:3px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--card-bg);color:var(--text-dim);border:1px solid var(--border)">CUSTOMIZE</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div>
                <label style="display:block;margin-bottom:4px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Opening Context</label>
                <select id="spy-opening" class="nx-input" style="width:100%" onchange="NX.runSPYLogic()">
                  <option value="below">Below supply</option>
                  <option value="inside">Inside supply</option>
                  <option value="above">Above supply</option>
                  <option value="gapdown">Gap down to demand</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:4px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">VWAP State</label>
                <select id="spy-vwap" class="nx-input" style="width:100%" onchange="NX.runSPYLogic()">
                  <option value="lost">Lost VWAP</option>
                  <option value="holding">Holding above VWAP</option>
                  <option value="chop">Whipping around VWAP</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:4px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Internals</label>
                <select id="spy-internals" class="nx-input" style="width:100%" onchange="NX.runSPYLogic()">
                  <option value="weak">Weak / diverging</option>
                  <option value="strong">Strong / confirming</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:4px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Retest Pattern</label>
                <select id="spy-retest" class="nx-input" style="width:100%" onchange="NX.runSPYLogic()">
                  <option value="lowerhigh">Lower high</option>
                  <option value="higherlow">Higher low</option>
                  <option value="none">No retest yet</option>
                </select>
              </div>
            </div>
            <div id="spy-engine-output" class="card" style="margin-top:12px;padding:14px;background:linear-gradient(135deg,rgba(0,255,255,0.06),var(--card-bg));border:1px solid rgba(0,255,255,0.2)">
              <div style="font-weight:700;margin-bottom:4px;font-size:12px" id="spy-engine-title">BIAS OUTPUT</div>
              <div style="color:var(--text-muted);font-size:12px" id="spy-engine-text">Select market conditions above. Auto-evaluates on change.</div>
            </div>
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:var(--text-dim)">Logic is a framework, not a signal service. Final entry quality depends on tape, spread, option liquidity, and whether price is trading into a real inflection.</div>
          </div>
        </div>
      </div>
    </div>
```

---

## STEP 3: Add JS logic to NX namespace

Find the spot in the NX object methods (look for the pattern of page-specific methods like `loadBacktest` or near the end of other `load*` methods). Add the `runSPYLogic` method. If `loadBacktest` exists, you can replace it.

Add this method inside the NX object:

```javascript
  runSPYLogic(){
    const opening = document.getElementById('spy-opening')?.value || 'below';
    const vwap = document.getElementById('spy-vwap')?.value || 'lost';
    const internals = document.getElementById('spy-internals')?.value || 'weak';
    const retest = document.getElementById('spy-retest')?.value || 'lowerhigh';
    let title = 'BIAS OUTPUT';
    let text = 'Stand aside until the auction becomes clearer.';

    if ((opening === 'below' || opening === 'inside') && vwap === 'lost' && internals === 'weak' && retest === 'lowerhigh') {
      title = '🔴 SHORT RALLIES';
      text = 'Opening impulse is failing under supply. Preferred trade: 0DTE puts on a lower-high retest into resistance. Invalidation: reclaim of VWAP + acceptance above the failed level.';
    } else if ((opening === 'above' || opening === 'gapdown') && vwap === 'holding' && internals === 'strong' && retest === 'higherlow') {
      title = '🟢 BUY PULLBACKS';
      text = 'Price holding above value with confirming internals. Preferred trade: buy first orderly pullback into reclaimed level or VWAP. Invalidation: loss of VWAP with no responsive bid.';
    } else if (vwap === 'chop' || internals === 'mixed' || retest === 'none') {
      title = '🟡 REDUCE SIZE / WAIT';
      text = 'Conditions not aligned. Expect noise, poor follow-through, rapid premium decay. Wait for cleaner retest or break from the opening range.';
    } else if (opening === 'gapdown' && vwap === 'lost' && internals === 'weak') {
      title = '🔴 TREND-DOWN WATCH';
      text = 'Do not force a bounce. If gap-down demand fails and VWAP stays overhead, rallies are liquidity events to fade rather than pullbacks to buy.';
    } else if (opening === 'above' && vwap === 'holding' && internals === 'strong') {
      title = '🟢 BULLISH LEAN';
      text = 'Price accepted above supply with confirming breadth. Look for pullback entries; avoid chasing. Invalidation: loss of VWAP + failed retest of breakout zone.';
    } else if (opening === 'below' && vwap === 'holding' && internals === 'strong') {
      title = '🟡 POTENTIAL REVERSAL';
      text = 'Below supply but holding VWAP with strong internals — watch for reclaim attempt. Need acceptance above supply to flip long. Do not front-run.';
    } else if ((opening === 'above' || opening === 'inside') && vwap === 'lost' && internals === 'weak') {
      title = '🔴 FAILED BREAKOUT';
      text = 'Was above or inside supply but lost VWAP with weak internals. Classic failed breakout — short the lower-high retest if it develops.';
    }

    const stanceEl = document.getElementById('spy-stance-text');
    const titleEl = document.getElementById('spy-engine-title');
    const textEl = document.getElementById('spy-engine-text');
    if (stanceEl) stanceEl.textContent = text;
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
  },
```

---

## STEP 4: Wire page loader

Find the page loader object/switch (where page-specific functions fire when navigating, e.g. `backtest:()=>{...}` or similar). Replace the backtest loader with:

```javascript
spylogic:()=>{ NX.runSPYLogic(); },
```

If the old `backtest` loader calls `NX.loadBacktest()`, replace the entire entry.

---

## STEP 5: Remove old backtest JS (if exists)

If there's a `loadBacktest()` method in the NX object, delete it entirely. Guard: only delete if it exists — it may already have been removed in a prior cleanup.

---

## STEP 6: Responsive breakpoint

Find the existing `@media` rules in the `<style>` block. Add this rule alongside them (do NOT duplicate if similar already exists):

```css
@media(max-width:900px){
  #pg-spylogic>div:first-child,
  #pg-spylogic>div:nth-child(2){ grid-template-columns:1fr !important; }
  #pg-spylogic .card div[style*="grid-template-columns:repeat(4"]{ grid-template-columns:1fr 1fr !important; }
  #pg-spylogic .card div[style*="grid-template-columns:repeat(3"]{ grid-template-columns:1fr !important; }
}
```

---

## STEP 7: Deploy

```bash
cd ~/trading-hashira
git add -A
git commit -m "SPY Logic page — replaces Backtester with 0DTE intraday bias engine"
git push
```

Then if Vercel doesn't auto-deploy:
```bash
vercel --prod --yes
```

---

## Verification

After deploy, open incognito → `trading-hashira.vercel.app` → navigate to **SPY Logic** in the nav. Confirm:
1. Four stat cards render in the hero grid
2. Decision matrix has 4 rows with colored bias tags
3. Supply map has 3 editable zones
4. Four dropdowns auto-evaluate on change
5. "Run Trade Logic" button updates both the hero stance and engine output
6. Mobile responsive — stacks to single column below 900px
7. All other pages still work (spot-check Dashboard, Watchlist, Dark Pool)
