// Terrain demo visual-regression check.
//
// Purpose: after any change to terrain shader / loader / material / consumer, run this to make sure
// the rendered scene has not silently drifted. Mirrors the compare pattern from /e2e/fixtures
// (originImage vs downloads) — kept local to the demo so infrastructure lives with the code that
// depends on it, not in the root e2e harness which is engine-wide.
//
// Layout:
//   e2e/visual-diff.mjs          — this script; drives the demo through each variant via `window.__terrain`.
//   e2e/baselines/*.png    — reviewer-approved reference images (source of truth, checked in).
//   e2e/downloads/*.png    — freshly captured per-run frames (gitignored).
//   e2e/diff/*.png         — pixel diff on mismatch (gitignored).
//
// Usage:
//   1. cd world-gallery && npx vite serve . --port 3777       (or reuse existing dev server)
//   2. node world-gallery/demos/terrain/e2e/visual-diff.mjs
//   Optional: VDIFF_UPDATE=1 rewrites baselines from downloads (approve visual change).
//
// Deliberately kept as a single .mjs file (per user preference "针对terrain特殊一点，写在一个文件中").
// The root /e2e harness is engine-wide (odiff + playwright + config.ts registry) — this script
// just needs the demo running behind a URL and a pass/fail on pixel drift, so pulling in that
// harness's case/config/screenshot plumbing would be overkill.

import pw from "/Users/shensi/Git/galacean/world/node_modules/@playwright/test/index.js";
import odiff from "odiff-bin";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from "fs";

const { chromium } = pw;
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = resolve(HERE, "baselines");
const DL_DIR = resolve(HERE, "downloads");
const DIFF_DIR = resolve(HERE, "diff");
const URL = process.env.VDIFF_URL ?? "http://127.0.0.1:3777/demos/terrain/index.html";
const UPDATE_BASELINE = process.env.VDIFF_UPDATE === "1";
const DIFF_THRESHOLD = 0.02; // 2% pixel diff allowed — anti-alias jitter, driver noise.

for (const d of [BASE_DIR, DL_DIR, DIFF_DIR]) mkdirSync(d, { recursive: true });
// Wipe downloads + diff on every run so stale outputs never mislead. Baselines are only touched when
// VDIFF_UPDATE is on.
for (const dir of [DL_DIR, DIFF_DIR]) {
  for (const f of readdirSync(dir)) if (f.endsWith(".png")) unlinkSync(resolve(dir, f));
}

// Camera pose is fixed by main.ts. Variants tweak the material's debug mode via setDebug(mode, id)
// and screenshot. Debug modes reference the TerrainDebugMode enum:
//   0 Off · 1 LayerMask · 2 HoleMask · 3 NavMask · 4 BlendWeight
//   5 UvRotation · 6 UvScale · 7 HeightmapView · 8 AutoshaderMask
const variants = [
  { name: "default",              apply: () => window.__terrain.material.setDebug(0, 0) },
  { name: "debug-heightmap",      apply: () => window.__terrain.material.setDebug(7, 0) },
  { name: "debug-layer-water",    apply: () => window.__terrain.material.setDebug(1, 2) },
  { name: "debug-hole",           apply: () => window.__terrain.material.setDebug(2, 0) },
  { name: "debug-autoshader",     apply: () => window.__terrain.material.setDebug(8, 0) },
  { name: "autoslope-loose",      apply: () => {
    const m = window.__terrain.material;
    m.setDebug(0, 0);
    m.setAutoshader(0.5, 0);
  }},
  { name: "autoslope-tight",      apply: () => {
    const m = window.__terrain.material;
    m.setDebug(0, 0);
    m.setAutoshader(3.0, 0);
  }}
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(err.stack || err.message));
page.on("requestfailed", (req) => errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

console.log("navigating", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForFunction(() => window.__terrain != null, null, { timeout: 15000 });
// Hide the dat.gui panel + status HUD so overlays don't jitter the diff.
await page.addStyleTag({ content: ".dg.ac { display: none !important; } #status { display: none !important; }" });
await page.waitForTimeout(400);

let mismatch = 0;
let missing = 0;

for (const v of variants) {
  await page.evaluate(v.apply);
  await page.waitForTimeout(200);
  const dlPath = resolve(DL_DIR, `${v.name}.png`);
  await page.screenshot({ path: dlPath, fullPage: false });

  const basePath = resolve(BASE_DIR, `${v.name}.png`);
  if (UPDATE_BASELINE) {
    copyFileSync(dlPath, basePath);
    console.log(`  baseline updated · ${v.name}`);
    continue;
  }
  if (!existsSync(basePath)) {
    missing++;
    console.log(`  MISSING baseline · ${v.name} → run with VDIFF_UPDATE=1 to seed`);
    continue;
  }
  const diffPath = resolve(DIFF_DIR, `${v.name}.png`);
  const result = await odiff.compare(basePath, dlPath, diffPath, { threshold: 0.02, antialiasing: true });
  const pct = result.match ? 0 : ("diffPercentage" in result ? result.diffPercentage : NaN);
  if (result.match || (typeof pct === "number" && pct <= DIFF_THRESHOLD)) {
    console.log(`  OK      · ${v.name}${pct ? ` (${pct.toFixed(3)}%)` : ""}`);
  } else {
    mismatch++;
    console.log(`  DRIFT   · ${v.name} · diff=${typeof pct === "number" ? pct.toFixed(3) + "%" : "structural"} → ${diffPath}`);
  }
}

await browser.close();

if (errors.length) {
  console.log("\n--- page errors ---");
  for (const e of errors) console.log(e);
}

const summary = `\n${variants.length} variants · ${mismatch} drift · ${missing} missing baseline`;
if (mismatch || missing || errors.length) {
  console.log(summary);
  process.exit(1);
}
console.log(summary + " · all clean");
