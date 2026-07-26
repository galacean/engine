# Water PCG browser validation

## Public Showcase and Feature acceptance

Start the gallery from `world-gallery`, then run the public acceptance gates:

```sh
pnpm exec vite . --config vite.config.js --host 127.0.0.1 --port 4179
node demos/water-pcg/e2e/water-showcase-smoke.mjs
node demos/water-pcg/e2e/water-showcase-camera-smoke.mjs
node demos/water-pcg/e2e/water-feature-cases-smoke.mjs
node demos/water-pcg/e2e/water-showcase-performance.mjs
WATER_PCG_HEADED=1 node demos/water-pcg/e2e/water-showcase-ocean-lifecycle.mjs
```

The Showcase smoke loads River, Pool, Ocean, and Grasslands twice in fresh `1280 × 720`, DPR 1 contexts. It requires exact route identity, High quality/optics, real reflection and refraction, scene-specific signals, healthy canvas output, public-only navigation, no Stats panel, and zero page/request/WebGL errors. The camera smoke proves that all four normal Showcase routes use Galacean `FreeControl`: holding `W` moves the camera, releasing it stops movement, pointer drag rotates the view, and acceptance routes remain fixed. It also requires the River Debug panel, full Pool HUD, Ocean Diagnostics GUI, and Grasslands diagnostics panel on interactive routes; the Grasslands acceptance route deliberately hides its HUD while the older three keep their existing panel behavior. The Feature gate loads all seventeen public feature routes independently, requires every runtime debug panel to be visible, and verifies the shared `window.waterPcgFeature` A/B contract: enabled state has a positive finite causal signal, disabled state returns to zero, re-enable and reset restore the feature. Refraction, reflection, Gerstner waves, nearshore waves, breakers, shore/contact foam, micro-surface, wetness, and heightfield use fixed-canvas causal pixel gates.

The performance script is a formal headed, native-WebGL2 gate by default. Each Showcase receives a two-second warmup followed by at least 300 frames and five seconds of sampling; average FPS must be at least 55, frame P95 at most 20 ms, Planar ownership at most one Camera/RT, River/Ocean/Grasslands static mesh uploads stable, and tracked resources unchanged. Supported GPU timer queries are recorded; unsupported timers remain explicitly `unavailable`. `WATER_PCG_PERF_FAST=1` runs a short headless `smoke-only` profile and does not claim the formal FPS/P95 result. `WATER_PCG_URL` targets another server, `WATER_PCG_HEADED=1` keeps smoke/feature browsers visible, and `WATER_PCG_ACCEPTANCE_OUTPUT_DIR` overrides the default `/tmp/water-pcg-acceptance` report root. These gates do not create or update PNG Goldens.

River, Pool, and Ocean are functional-only regression cases during rapid water-system iteration. They have no tracked Showcase screenshot baselines and the visual runner rejects them; their regressions are covered by Showcase Smoke, Camera, Feature A/B, Performance, and Lifecycle gates instead of pixel equality. The optional shared visual lane is scoped only to the separately reviewed Grasslands case and is not part of routine functional regression.

Grasslands visual `capture` is the non-mutating candidate path. `compare` remains fail-closed until its reviewed baseline exists. `update` requires the explicit Grasslands `WATER_PCG_VISUAL_CASE`, a review reason of at least twelve characters, and `WATER_PCG_VISUAL_UPDATE_APPROVAL=approved:<case-id>` after human approval. The update preflights every tracked PNG, stages the complete baseline in a sibling transaction directory, and only then swaps the baseline root with rollback on failure. A Grasslands candidate uses:

```sh
WATER_PCG_VISUAL_CASE=showcase-grasslands-stylized-water \
  node demos/water-pcg/e2e/water-showcase-visual.mjs capture
```

Do not run `update` for Grasslands until its three shared Showcase images receive a separate human approval. The optional Grasslands shared lane intentionally uses seed `20260723`; the dedicated M3 Reference Parity/8-state Regression lane uses seed `20260724`, so their screenshots are independent evidence and must not be substituted for one another.

The Ocean lifecycle gate is a separate headed, native-WebGL2 proof for the completed beach-dusk feature stack. It runs `OFF -> ON -> OFF`, measures each phase for at least 300 frames and five seconds after warmup, checks finite GPU timer samples, exact nearshore/foam/wet-sand update-rate and idle-stop contracts, fixed resource ownership, and zero disabled-state updates. It then performs ten `Ocean -> River -> Ocean` rounds of 300 frames each and requires an exact deterministic state signature and canvas PNG hash on every Ocean return. Each round explicitly disposes Ocean meshes, materials, nearshore textures, foam textures and event queue, wet-sand textures, splash resources, Planar Camera, and Planar render target, with balanced create/destroy counts and zero live owners.

## Water Optics P0 smoke

Run the deterministic Medium Water Optics Lab gate against the local gallery server:

```sh
node demos/water-pcg/e2e/water-optics-p0-smoke.mjs
WATER_OPTICS_HEADED=1 node demos/water-pcg/e2e/water-optics-p0-smoke.mjs
```

`WATER_OPTICS_URL` can target another server. The smoke uses fresh `1280 × 720`, DPR 1 browser contexts, keeps `surfaceTime=12.5`, and validates the immutable `window.waterPcgOptics` metrics, a non-uniform canvas, one-or-fewer Camera copy/Planar resources, zero runtime/browser/WebGL errors, and deterministic source hashes across three reload rounds. Formal capture uses `stats=0`; a separate `stats=1` context proves that the source Camera creates exactly one `.gl-perf` panel. Chromium's expected `ReadPixels` performance notice from the explicit canvas variance probe is reported separately and is not treated as a shader, framebuffer, or WebGL API error. Every success or failure is persisted under `output/playwright/water-optics-p0-smoke/<run-id>/result.json`, including run timestamps, Git HEAD/dirty provenance, browser version, diagnostics, and cleanup failures; stdout is only a copy of that machine-readable report.

## Water Optics P0 visual and performance gates

Run the frozen Medium/High semantic visual gate and the paired performance sampler:

```sh
node demos/water-pcg/e2e/water-optics-p0-visual.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_SCENARIO=refraction-plus-planar node demos/water-pcg/e2e/water-optics-performance.mjs
```

The visual gate creates a fresh Chromium context per tier at `1280 × 720`, DPR 1, `surfaceTime=12.5`, and `stats=0`. Before Chromium starts, it reads each tier's `roi.json` and all six PNGs directly from the local baseline root, verifies schema version, exact file set/names, fixed environment, ROIs, frozen thresholds, and SHA-256, then passes only those verified bytes to the page as `data:` URLs. It never fetches a baseline from `WATER_OPTICS_URL`. Missing files, invalid JSON, metadata drift, or a hash mismatch fail closed before page navigation. It then performs a real full-frame PNG comparison at `256 × 144` analysis resolution: a pixel differs only when a channel exceeds two bytes, and the differing-pixel ratio must be at most `0.5%`. Independent semantic ROI gates measure refraction ON/OFF, above-water exclusion, foreground leakage, shallow/medium/deep transmittance ordering, 60 consecutive border frames, real Cube Probe versus Sky, one Planar Camera/RT, oblique clip OFF/ON, and the `B/D/C/A/F` composition decision. The reflection-only underwater magenta sentinel must cover at least `5%` of its frozen ROI with clipping off and at most `0.5%` with clipping on. Diagnostic runs may set `WATER_OPTICS_VISUAL_FAST=1`, select one tier with `WATER_OPTICS_VISUAL_TIER=medium|high`, or point `WATER_OPTICS_P0_BASELINE_ROOT` at an isolated local copy; those modes do not replace the formal two-tier result.

The formal pixel calibration also gates four asymmetric Planar direction markers in reflection-color and final-framebuffer captures (`<= 3 px` CPU-projection alignment), the shared CPU/shader surface-optics equation (`<= 2/255` maximum channel error), and a pure-transmission fixture (`Final-to-Displaced MAD <= 2/255`, Fresnel maximum `<= 1/255`, at least 1,024 valid pixels, and non-trivial Displaced-to-Centered MAD). Hidden-marker negative controls, marker order/separation, moving-boat Planar causality, exact Probe fallback for invalid Planar camera postures, Local Foam locality/master-off behavior, and crossing-column revealed-reflection pixels are separate fixed gates. The latest formal Medium/High report completed at `2026-07-22T19:53:31.671Z` with `status=passed`, tier `failures=[]`, zero differences across all three Goldens per tier, and 60 border frames per tier: `world-gallery/output/playwright/water-optics-p0-visual/2026-07-22T19-46-24-951Z/result.json`. Full measurements are frozen in [the P0 acceptance record](./water-optics-p0-acceptance.md).

The fail-closed local-byte hardening was rerun in Medium diagnostic mode at `world-gallery/output/playwright/water-optics-p0-visual/2026-07-22T18-47-40-088Z/result.json`: local schema/SHA preflight passed, all three comparisons report `baselineTransport=sha256-verified-local-data-url`, and every Golden has `diffPixelCount=0`. Separate isolated-root injections for a missing PNG and a hash-mismatched PNG each exited with status 1 before Chromium launched. This diagnostic does not replace the formal two-tier report above.

The schema-v4 performance runner uses `OFF -> ON -> OFF` in the same page. `WATER_OPTICS_PERF_SCENARIO=refraction-only` fixes Sky fallback with zero Planar Camera/RT/bytes; `refraction-plus-planar` requires one Planar Camera/RT, non-zero Planar bytes, and both `frame-envelope` and `planar-pass` timer scopes. Formal defaults require a two-second warmup, at least 300 valid frames, and at least five seconds per phase. Every formal page is created with `stats=0`; `frame-envelope` is the formal total-optics Gate, while `planar-pass` is an additional Planar sub-Gate that cannot substitute for the total result. Headed Chromium is pinned to the primary display so a secondary monitor's refresh rate cannot silently change the frame envelope; the exact browser launch arguments are persisted in every report. When WebGL2 exposes `EXT_disjoint_timer_query_webgl2`, reports include valid GPU samples, conservative Off-baseline incremental total-optics P95, direct Planar P50/P95/max, dropped/pending counts, rAF timing, Engine bytes, and Water-owned bytes. Unsupported or unresolved timer evidence remains explicit `gpuEvidenceStatus=unavailable`, keeps the formal result `incomplete`, and exits non-zero instead of being reported as a pass. The legacy `WATER_OPTICS_PERF_REFLECTION=sky|planar` input remains compatible, but cannot conflict with the explicit scenario.

`@galacean/engine-toolkit-stats` already extends Engine `Script` and is attached directly to the source Camera Entity. The sampler opens separate Sky and Planar `stats=1` diagnostic contexts, requires exactly one `.gl-perf` in each, and verifies that formal capture rejects Stats-enabled runs. In the final Stats-isolation implementation, `stats=0` returns before `.gl-perf` lookup during frame updates, so formal sampling no longer queries the Stats DOM every frame. Stats is display-only, and Stats values never replace timer-query GPU evidence.

Final reference-Mac schema-v4 reports passed with zero dropped/pending queries: `2026-07-22T19-55-47-866Z` (Medium Refraction-only), `2026-07-22T19-57-28-677Z` (Medium Refraction+Planar), `2026-07-22T19-58-33-638Z` (High Refraction-only), and `2026-07-22T19-59-13-718Z` (High Refraction+Planar), all below `world-gallery/output/playwright/water-optics-performance/`. These use the P1 `cross-body-optics` preset as a superset exercise of the shared optics implementation; they do not expand the single-Pool P0 product scope. Together with the formal pixel-calibration report above, P0 is `completed-local`. macOS Safari was attempted and blocked; Android/iOS remain unexecuted. No mobile support or P2 authorization is implied.

The six frozen P0 screenshots live under `baselines/water-optics/p0/{medium,high}`:

- `refraction-final.png`
- `reflection-final.png`
- `planar-clip-mask.png`

Each tier's `roi.json` records the exact PNG file names, fixed environment, semantic ROIs, thresholds, capture state, and SHA-256 hashes. P0 has no automatic baseline-update mode: automation writes captures only to `world-gallery/output/playwright` and never overwrites either the default or an isolated baseline root. For an intentional change, set `WATER_OPTICS_P0_BASELINE_REVIEW_REASON` to a concrete reason of at least 12 characters. The run then writes full-resolution `old.png`, `new.png`, amplified absolute `diff.png`, hashes, comparison metrics, and `review.json` below its `baseline-review/` directory, but still leaves the committed baseline untouched. Promotion requires an explicit human review of that bundle and a separate file change.

## Water Optics P1 body matrix and arbitration gate

Run the Medium/High cross-body and multi-water gate against the local gallery server:

```sh
node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
WATER_OPTICS_HEADED=1 node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_P1_RENDERER_LANE=native-hardware node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
WATER_OPTICS_P1_NIGHTLY=1 node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
```

The normal gate runs ten lifecycle rounds per tier; nightly runs one hundred. The cross-body preset renders real Heightfield Pool, compiler/uploader-backed River geometry, and Ocean materials through one shared optical profile and binding instance. Submerged marker strips make refraction causally observable in every body. The gate proves that the River's Planar request is ineligible and falls back, while the camera keeps at most one opaque copy, one depth copy, one Planar camera, and one Planar render target. Experimental is exercised only as an explicit `Experimental -> High` resolution path and may not allocate another Planar target class.

Safari and iOS use a separate dependency-free W3C WebDriver semantic lane:

```sh
# macOS Safari; starts a task-owned safaridriver when no endpoint is already running.
pnpm run acceptance:water-optics-safari-device

# iOS Simulator or physical iOS device.
WATER_OPTICS_SAFARI_TARGET=ios-simulator \
WATER_OPTICS_SAFARI_DEVICE_NAME="iPhone 16 Pro" \
pnpm run acceptance:water-optics-safari-device

WATER_OPTICS_SAFARI_TARGET=ios-device \
WATER_OPTICS_SAFARI_DEVICE_UDID="<udid>" \
WATER_OPTICS_URL="http://<device-reachable-host>:4179/demos/water-pcg/#water-optics-lab" \
pnpm run acceptance:water-optics-safari-device

pnpm run test:water-optics-safari-device
```

The runner supports `macos`, `ios-simulator`, and `ios-device` capability profiles, records the actual viewport/DPR and a SHA-256 of any UDID, and never writes the raw UDID to `result.json`. It validates Medium and High API semantics, real screenshots, ten lifecycle rounds, 300 stable-owner frames, six-frame owner handoff, secondary-runtime cleanup, and the explicit Experimental-to-High fallback. Every normal outcome writes `output/webdriver/water-optics-p1-safari-device-acceptance/<run>/result.json`: `passed` exits 0, `failed` exits 1, and `blocked`/`incomplete` exit 2. Missing devices, an unreachable driver, or disabled Safari Remote Automation are blockers, never passes. The runner may invoke `safaridriver --port`; it never invokes `safaridriver --enable`. Set `WATER_OPTICS_SAFARI_AUTOSTART=0` when connecting to an externally managed W3C endpoint via `WATER_OPTICS_WEBDRIVER_URL`.

The arbitration preset lazily creates a second real Heightfield Pool, keeps two eligible requests visible for 300 frames, then hides the actual primary Pool and requires selected and rendered ownership to transfer within six frames. Leaving the preset must release the lazily created secondary Heightfield runtime; static basin/marker fixture resources remain hidden until page teardown and are not reported as per-preset runtime allocations.

Visual validation is split into two explicit renderer lanes:

- `canonical-golden` is the default and launches Chromium with `--use-angle=swiftshader`. Headed and headless therefore consume the same reviewed four-image baseline under `baselines/water-optics/p1/{medium,high}`. Every `roi.json` is schema v2 and records the required renderer provenance, SHA-256, fixed environment, full-frame PNG gate (`<= 0.5%` differing pixels with a two-byte per-channel tolerance), ROI MAD (`<= 0.035`), and ROI luminance variance (`>= 0.0005`). A renderer mismatch fails before comparison.
- `native-hardware` requires headed Chromium, available `WEBGL_debug_renderer_info` evidence, a non-software renderer, and the expected renderer substring. The reference-Mac default is `ANGLE Metal Renderer`; fixed alternative hardware lanes must set `WATER_OPTICS_P1_NATIVE_RENDERER_SUBSTRING` explicitly. It is a semantic compatibility lane rather than a second Golden source: nonblank body/dual ROIs, measurable refraction ON/OFF in River, Pool, and Ocean, measurable Sky/Planar signal in Planar-eligible Pool/Ocean, exact River `planar-ineligible` fallback, one selected/rendered Planar owner, deterministic state restoration, and the same lifecycle/arbitration/resource gates. It cannot update committed baselines.

Baseline replacement is an explicit canonical-only review action. The update run first keeps all candidates under the output directory, applies nonblank ROI plus refraction/reflection/restoration semantic gates, closes the browser successfully, stages all four PNGs and both schemas, and only then swaps the complete P1 baseline directory. Failure before the commit-point rename restores the previous directory or reports both absolute recovery paths; failure to remove the old backup after commit keeps the valid new baseline and records a recoverable warning rather than misreporting the commit:

```sh
WATER_OPTICS_P1_RENDERER_LANE=canonical-golden \
WATER_OPTICS_P1_UPDATE_BASELINES=1 \
WATER_OPTICS_P1_BASELINE_UPDATE_REASON="describe the intentional scene or renderer change" \
node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
```

The update reason is mandatory. A successful update writes a fail-closed review bundle under that run's `baseline-review/` directory: full-resolution `old.png`, `new.png`, an amplified absolute `diff.png`, and `manifest.json` with the reason, hashes, and comparison metrics. The committed `roi.json` also retains the reason and previous capture hashes. The directory swap is refused when any review artifact is missing.

The Chromium gate reports only Chromium evidence. Experimental is validated only as the explicit `Experimental -> High` fallback with zero additional Planar target class; P2 Composite/SSR/history is not part of this gate. The reviewed atomic baseline update is `world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-06-07-614Z/result.json`. Post-update headless canonical CI10 is `2026-07-22T20-07-53-543Z`, canonical Nightly100 is `2026-07-22T20-09-18-755Z`, and headed native Metal CI10 is `2026-07-22T20-12-48-298Z`, all below the same P1 output directory. Both canonical reports produced zero Golden differences; the native report passed renderer provenance, causal feature signals, arbitration, lifecycle, resource, fallback, and restoration under `ANGLE Metal Renderer: Apple M5 Pro`. A post-update headed canonical run has not been recorded and is not claimed. The macOS Safari W3C lane is blocked; iOS and Android remain open. See [P1 acceptance evidence](./water-optics-p1-acceptance.md) and the [P1 device matrix](./water-optics-p1-device-matrix.md).

The performance runner exposes the complete P1 Medium/High matrix as two explicit scenarios:

```sh
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=medium WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-only node demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=medium WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-plus-planar node demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=high WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-only node demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=high WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-plus-planar node demos/water-pcg/e2e/water-optics-performance.mjs
```

The final schema-v4 reports are `2026-07-22T19-55-47-866Z`, `2026-07-22T19-57-28-677Z`, `2026-07-22T19-58-33-638Z`, and `2026-07-22T19-59-13-718Z` below `world-gallery/output/playwright/water-optics-performance/`; they cover Medium/High × Refraction-only/Refraction+Planar and record the top-level `scenario` plus `formalGateSummary`. Every formal page uses `stats=0`. Separate Sky/Planar `stats=1` diagnostics each contain exactly one `.gl-perf` and are rejected as formal captures; Stats remains display-only. No `packages/core` file changed: all current implementation is world-gallery-local, while P2 remains awaiting approval.

## P1 water showcase smoke

Run the P1 pool and Ocean gate against an already-running local gallery server:

```sh
node demos/water-pcg/e2e/p1-water-showcase-smoke.mjs
P1_WATER_HEADED=1 node demos/water-pcg/e2e/p1-water-showcase-smoke.mjs
P1_WATER_MIN_ACTIVE_FPS=45 P1_WATER_MAX_ACTIVE_P95_MS=33.4 node demos/water-pcg/e2e/p1-water-showcase-smoke.mjs
P1_WATER_CONTINUITY_ONLY=1 node demos/water-pcg/e2e/p1-water-showcase-smoke.mjs
```

`P1_WATER_URL` can target another gallery server. Every run writes success or failure to `world-gallery/output/playwright/p1-water-showcase-smoke/<run-id>/result.json`; `P1_WATER_OUTPUT_DIR` can redirect the parent directory. The smoke opens `#p1-water-showcase` in Medium and Low, then opens `#curved-main-river` with `mode=ocean` in both quality tiers. It verifies the public `window.waterPcgP1` debug API, actual fleet ownership for every `1/4/8/16` body switch, bounded queue capacity/peak/drop metrics, moving-wake acceptance and aggregation, stationary rejection without continuing foam injection, `source/history/final` temporal-foam views, retained lifetime, exponential decay to exact idle, zero uploads after idle, at most one R8 upload per frame, and the existing Low zero-texture analytic fallback.

The pool continuity gate itself covers only Medium and High. For each tier it performs three complete `outside -> surface-air -> inside -> surface-water -> outside` rounds. `window.waterPcgUnderwater.opticalContinuity` exposes the surface and underwater resolved profile values, their canonical fingerprints, configured and active reference-identity checks, the fingerprint last written to the real underwater shader material, bind count, and a fixed `1.25m` medium-only CPU/shader-contract readback. Every state must remain finite, both resolved-profile and same-depth medium-colour deltas must stay at or below `1e-12`, and each round must produce exactly one enter plus one exit. Fixed canvas screenshots and non-blank normalized ROI statistics are retained for human review, but frames from different camera states are deliberately never compared for equality. The gate also preserves lazy material creation on entry, material destruction on exit, and zero post-process executions after exit. `P1_WATER_CONTINUITY_ONLY=1` runs just this Medium/High evidence path.

The Medium pool also runs a dedicated active-phase performance matrix for `4/8/16` bodies. Each count uses a paired `dynamic OFF -> ON -> OFF` measurement at the same `60 FPS` target, so the default hard gate compares the active phase with a same-page control instead of assuming identical CI hardware. The active Galacean FPS must remain at least `65%` of the slower control, and its animation-frame P95 must remain within `2.5x` of the noisier control; a failed ratio is sampled once more before the run fails. Every phase also requires one `uniform` current snapshot at revision `0`, exactly one snapshot build, zero full `WaterSurfaceProvider` queries from the foam path, and a temporal-foam update cap of `30 Hz`. Raw FPS, P50/P95/max frame timing, update counts, snapshot state, and query deltas are included in the final JSON. Set `P1_WATER_MIN_ACTIVE_FPS` and/or `P1_WATER_MAX_ACTIVE_P95_MS` only when a reference machine should additionally enforce absolute budgets; both variables must be finite positive numbers and are disabled by default.

The Ocean gate checks the fixed `25`-patch Low and `37`-patch Medium ring layouts, camera-cell snapping without buffer rebuilds, and Sky, missing-Probe fallback, Low Planar fallback, and Medium Planar ownership. Per-camera reflection metrics must never exceed one planar camera or one owned render target. The reference Medium run requires Planar to allocate, render, and produce a measurable canvas difference from Sky; `P1_WATER_ALLOW_PLANAR_FALLBACK=1` is an explicit opt-in for environments that are intentionally validating instrumented failure cleanup instead. The smoke also requires non-trivial canvas luminance variance, so valid metrics cannot hide a blank Ocean. Browser console errors, WebGL compile/link/`INVALID_OPERATION` warnings, page errors, failed requests, or cleanup errors fail the run. Queue saturation is not forced through a test-only production hook: a zero drop count is valid when per-emitter aggregation keeps the peak below capacity, while the queue's deterministic overflow/replacement branch remains covered by the focused unit test.

## Interactive indoor pool smoke

Run the two-way buoyancy and surface-interaction gate against the same local gallery server:

```sh
node demos/water-pcg/e2e/indoor-pool-buoyancy-smoke.mjs
POOL_HEADED=1 node demos/water-pcg/e2e/indoor-pool-buoyancy-smoke.mjs
```

`POOL_URL` can target another gallery server. `POOL_SCREENSHOT_PATH` writes one impact-stage screenshot after the dynamic geometry exceeds `0.01m` and the ripple front exceeds `3m`. The WebGL2 gate covers Medium `129 × 53` simulation / `257 × 105` render grids, Low `65 × 27` simulation / `129 × 53` render grids, real PhysX free fall and rebound, entry plus continuous coupling, expanding/reflected waves, final settling, one mesh upload per render frame, reset-by-recreation, 30/60/120 render-rate sampling, and zero PhysX requests from the other three non-physics tabs. Actual render-rate closeness is a hard assertion in headed mode or with `POOL_REQUIRE_ACTUAL_FPS=1`; headless mode still proves the fixed physics step and finite state remain unchanged.

## Buoyancy PhysX smoke

Start the isolated gallery page, then run the deterministic browser gate:

```sh
pnpm exec vite . --config vite.config.js --host 127.0.0.1 --port 4179
node demos/water-pcg/e2e/buoyancy-smoke.mjs
```

`BUOYANCY_URL` can point at another gallery server and `BUOYANCY_HEADED=1` keeps the browser visible. Headless Chromium can throttle `requestAnimationFrame`; measured FPS is always recorded, while closeness to the requested 30/60/120 rates and monotonic growth are hard assertions in headed mode or with `BUOYANCY_REQUIRE_ACTUAL_FPS=1`. The smoke fixes the River surface clock at `12.5` and verifies:

- one-Pontoon equilibrium and four-Pontoon disturbance recovery through continuous two-second stability windows;
- native PhysX wake-up, kinematic skipping, transformed-parent Pontoon coordinates/radius, and an actual offshore Pontoon;
- the multi-tributary reach `1/20/100 × 4`, reach `20 × 8`, and junction `100 × 4` query/performance matrix;
- a prewarmed reach `100 × 4` steady-state window using CDP heap sampling, forced-GC heap usage, V8 GC tracing, and `ScriptDuration`/`TaskDuration` per fixed step;
- requested and measured Galacean render update rates at 30/60/120 FPS while `fixedTimeStep` remains unchanged;
- zero PhysX requests from both the existing River/Ocean entry and the standalone Heightfield entry.

Render parity is checked independently at every interior vertex of the visible River surface mesh: the expected height uses the same attributes uploaded to the shader, while the actual height comes through `RiverWaterSurfaceProvider`. Boundary vertices are excluded because the Provider intentionally rejects the bank edge. Reach and junction queries use visible-triangle barycentric interpolation and select the highest visible surface across overlaps. P0 retains a `0.05` world-unit ceiling; the focused curved/multi/pool suite currently reports exact sampled parity. The smoke fails on browser console, page, request, physics, allocation-contract, or numeric errors and prints all measured P50/P95, heap/GC, main-thread, actual-FPS, parity, and isolation evidence as JSON.

The allocation result is deliberately split by source. `featureOwnedSampledBytes === 0` applies to allocations directly attributed to `water-pcg/runtime`; total page allocations can still come from Galacean rendering, DevTools instrumentation, or the PhysX JavaScript/native bridge. Treat the sampled result together with the source audit and caller-owned identity tests, not as a claim that the entire browser page allocates zero bytes.

## Debug visual baselines

These images are the visual baselines for the `multi-tributary-river` example at `1200 × 765`, Medium quality, and a fixed `surfaceTime=12.5`.

- `authoring-control-points.png`
- `geometry-raw-mesh.png`
- `fields-sdf.png`
- `surface-macro-height.png`
- `final.png`

The captures intentionally include both the Water PCG Debug panel and dat.GUI. Before replacing a baseline, open `/demos/water-pcg/?quality=medium&surfaceTime=12.5`, select the multi-tributary example, switch with `window.waterPcgDebug.select(...)`, and verify that the browser console has no warnings or errors.
