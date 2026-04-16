# SPY Logic — Wire RUN TRADE LOGIC to fire AI too

## Overview
Update the "RUN TRADE LOGIC" button so it refreshes live data AND fires both Perplexity and Claude tape readings in parallel. One-button full refresh.

**Surgical edit to `~/trading-hashira/index.html`.**

---

## STEP 1: Update the RUN TRADE LOGIC button onclick

Find the button in the `pg-spylogic` HTML:

```html
<button class="btn" onclick="NX.loadSPYLogic()" style="background:var(--cyan);color:#000;font-weight:700">▶ RUN TRADE LOGIC</button>
```

Replace with:

```html
<button class="btn" onclick="NX.runFullSPYAnalysis()" style="background:var(--cyan);color:#000;font-weight:700">▶ RUN TRADE LOGIC</button>
```

---

## STEP 2: Add the `runFullSPYAnalysis()` method to NX

In the NX object, near `loadSPYLogic` and `loadSPYAnalysis`, add:

```javascript
  runFullSPYAnalysis(){
    // Refresh live data (zones, dropdowns, breadth)
    NX.loadSPYLogic();
    // Fire both AI providers in parallel
    NX.loadSPYAnalysis('perplexity');
    NX.loadSPYAnalysis('claude');
  },
```

---

## STEP 3: Deploy

```bash
cd ~/trading-hashira
git add -A
git commit -m "SPY Logic: RUN TRADE LOGIC now fires live data + both AI tape reads"
git push
```

---

## Verification
1. Navigate to SPY Logic page
2. Click RUN TRADE LOGIC
3. Live data bar updates at top
4. Dropdowns and supply zones refresh
5. Both Perplexity and Claude panels show loading state simultaneously
6. Both complete in ~15 seconds, switch tabs to compare
