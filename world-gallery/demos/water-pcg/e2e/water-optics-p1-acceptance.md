# Water Optics P1 acceptance evidence

- Date: 2026-07-22
- Reference browser: Chromium 140.0.7339.16 / WebGL2
- Canonical renderer: ANGLE SwiftShader/Vulkan
- Native renderer: ANGLE Metal / Apple M5 Pro
- Reference viewport: 1280 x 720, DPR 1, MSAA 0
- Fixed visual time: 12.5 seconds
- Engine Core changes: none

Status: **local Chromium Medium/High P1 is complete across canonical Golden, native semantic compatibility, arbitration/lifecycle, Nightly100, Surface/Fully-underwater continuity, and reference-device GPU Gates**. Experimental is only the explicit High fallback, not an independent P2 renderer or performance tier. Overall P1 acceptance remains incomplete: the macOS Safari lane was attempted and blocked by unavailable Remote Automation, while Android real-device and iOS device/simulator rows remain unexecuted.

## Formal gates and renderer policy

```sh
# Canonical deterministic Golden, headless CI10
node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs

# The same canonical Golden in headed Chromium
WATER_OPTICS_HEADED=1 node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs

# Native GPU compatibility; semantic/causal gates, not another Golden
WATER_OPTICS_HEADED=1 WATER_OPTICS_P1_RENDERER_LANE=native-hardware node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs

# Canonical 100-round lifecycle gate
WATER_OPTICS_P1_NIGHTLY=1 node demos/water-pcg/e2e/water-optics-p1-acceptance.mjs
```

The report schema is v2 and fail-closes on renderer provenance:

- `canonical-golden` is the default. Chromium is launched with `--use-angle=swiftshader`; the report and each baseline `roi.json` must identify a SwiftShader renderer. Headed and headless use the same full-frame and ROI Golden thresholds.
- `native-hardware` requires headed Chromium, available `WEBGL_debug_renderer_info`, a renderer that does not match known software backends, and an explicit expected renderer substring. The reference-Mac default is `ANGLE Metal Renderer`; a fixed alternative hardware runner must set `WATER_OPTICS_P1_NATIVE_RENDERER_SUBSTRING`. It validates nonblank ROIs, causal feature signals, fallback/owner semantics, deterministic restoration, resource bounds, arbitration, and lifecycle. It is intentionally not allowed to update the canonical baseline.
- A baseline update is allowed only with `WATER_OPTICS_P1_RENDERER_LANE=canonical-golden WATER_OPTICS_P1_UPDATE_BASELINES=1` and a non-empty `WATER_OPTICS_P1_BASELINE_UPDATE_REASON` of at least 12 characters. Candidates remain outside the committed baseline until both tiers pass nonblank ROI, refraction/reflection signal, deterministic restoration, arbitration/lifecycle/resource, and browser-cleanup Gates. Each update writes full-resolution `old.png`, `new.png`, an amplified absolute `diff.png`, and a manifest containing the reason, hashes, and comparison metrics. The four PNGs and two schemas are staged together only when that review bundle is complete; each committed schema retains the reason and previous hashes. If the commit-point rename fails, the previous directory is explicitly restored; a failed restore reports both absolute recovery paths. If only old-backup cleanup fails after commit, the valid new baseline remains active and the report records a recoverable warning.

The earlier headed mismatch was a renderer-backend mismatch, not accepted nondeterminism: default headed Chromium used ANGLE Metal while headless Chromium used ANGLE SwiftShader. The old Metal-to-SwiftShader comparison exceeded the frozen full-frame threshold even though each backend was individually deterministic. The fix preserves the original `0.5%` differing-pixel and two-byte channel thresholds, records provenance, and separates deterministic regression from native compatibility instead of weakening the Gate or creating an unbounded per-GPU baseline set.

## Cross-body implementation correction

Native feature-signal validation exposed a real River fixture defect: the P1 matrix used `PrimitiveMesh.createPlane`, but the River shader expects compiler-authored `TEXCOORD_2/3` semantics for signed distance, flow time, half width, and water depth. Missing attributes reduced shore damping to zero, so River refraction ON/OFF produced no changed pixels even though binding readback was correct.

The matrix now compiles a deterministic 17-sample River through `RiverGeometryCompiler` and uploads it with `uploadRiverMeshes`. The fixture also places submerged red/green/blue marker strips below River and Ocean surfaces so refraction remains causally visible. The focused contract and the final combined Water PCG suite cover this path.

## Canonical Golden evidence

The four reviewed baselines are:

- `baselines/water-optics/p1/medium/body-matrix-final.png`
- `baselines/water-optics/p1/medium/dual-owner-debug.png`
- `baselines/water-optics/p1/high/body-matrix-final.png`
- `baselines/water-optics/p1/high/dual-owner-debug.png`

Each schema-v2 `roi.json` records the required canonical renderer, launch argument, fixed environment, SHA-256, thresholds, and unsupported-platform claims. The actual PNG Gate has two independent layers:

- Full frame: compare the fixed `256 x 144` analysis image, count a pixel only when a channel differs by more than two bytes, and require `diffPixelRatio <= 0.005`.
- Semantic ROIs: require mean absolute difference `<= 0.035` and luminance variance `>= 0.0005` for River, Pool/Heightfield, Ocean, primary Pool, and secondary Pool regions.

Reviewed atomic baseline update:

`world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-06-07-614Z/result.json`

- The required reason was recorded, both tiers passed all semantic/resource/lifecycle gates, all old/new/diff bundles were generated and validated by the harness and visually reviewed before promotion, and all four PNGs plus both schemas were swapped atomically with no staging/backup residue.
- Final PNG SHA-256 values are Medium body `b0707a7e...`, Medium dual `f65c5d50...`, High body `aa405f80...`, and High dual `dd5ab5d0...`.

Post-update canonical CI10:

`world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-07-53-543Z/result.json`

- The report records `rendererLane=canonical-golden`, `--use-angle=swiftshader`, WebGL2, DPR 1, MSAA 0, and `ANGLE ... SwiftShader Device`.
- Medium and High body-matrix and dual-Pool captures each have `0 / 36,864` differing pixels, zero ROI MAD, non-zero ROI variance, and `failures=[]`.
- Both tiers retained one owner for 300 frames and completed the pending owner handoff on frame 6 of the six-frame limit. The release/change/restore matrix destroyed one Camera/RT pair before each tier change and recreated one pair on restore, ending balanced; the separate ten-iteration stable-request stress had zero Camera/RT create growth. The lazy secondary Heightfield runtime ended at `create=1 / destroy=1 / live=0`.

Post-fix canonical Nightly100:

`world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-09-18-755Z/result.json`

- Medium and High each completed a 100-iteration release/change/restore matrix with one intentional Camera/RT destruction and recreation per transition, ending balanced. The separate stable-request stress recorded `requestAddCount=200`, `requestRemoveCount=200`, zero render-target/Camera create growth, and balanced final resources.
- Both tiers had zero body/dual differing pixels, retained one owner for 300 frames, observed pending ownership, completed handoff on frame 6 of the six-frame limit, and released the secondary Pool at `create=1 / destroy=1 / live=0`.
- The report completed at `2026-07-22T20:12:39.648Z` with global/Medium/High `failures=[]` and a recorded SwiftShader renderer in each tier.

## Native Metal semantic evidence

Native report:

`world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-12-48-298Z/result.json`

- Both tiers passed under `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)` with WebGL2, DPR 1, and MSAA 0.
- Refraction ON/OFF changed `2,717 / 2,767` full-frame pixels for Medium/High. Per-body changed pixels were River `345 / 343`, Pool `1,750 / 1,779`, and Ocean `652 / 675`, all above the 16-pixel causal minimum.
- The Sky-to-Planar transition changed the Planar-eligible Pool and Ocean ROIs. River remained an explicit `planar-ineligible` Probe fallback, while Ocean became the selected/rendered Planar owner for that transition; no false River Planar requirement was introduced.
- Restoring the initial state reproduced the exact initial pixel SHA-256 in both tiers.
- Both tiers passed nonblank body/dual ROI variance, 300 stable-owner frames, six-frame handoff, ten lifecycle rounds, balanced Camera/RT resources, secondary Pool cleanup, Experimental-to-High fallback, and zero page/request/shader/framebuffer/WebGL API errors.

Native semantic evidence does not claim that Metal pixels equal SwiftShader pixels. Canonical Golden evidence does not claim native Metal performance. Both lanes are required for the local Chromium conclusion above.

## Quality-tier and resource boundary

- Pool/Heightfield, the real River mesh, and Ocean consume the same optical-profile reference and binding instance.
- River defaults to `planarEligible=false` and resolves a Planar request through Probe with `planar-ineligible`. The eligible Ocean reports `planar-not-selected` when the larger Pool owns the single Planar slot.
- Every tier keeps at most one Camera depth copy, one opaque copy, one Planar Camera, and one live Planar render target.
- Medium and High selected Planar targets are respectively `320 x 180` and `640 x 360` in the fixed viewport.
- Experimental is only an explicit compatibility route: all three bodies report `requestedTier=experimental`, `resolvedTier=high`, and `water-optics-experimental-resolved-high`, with zero additional Planar target class. Dedicated Composite, SSR, temporal history, Waterline, and Caustics remain outside P1 and behind the separate Engine Core RFC.
- Low is intentionally excluded from this feature's implementation and acceptance scope.

## Stats and performance evidence

`@galacean/engine-toolkit-stats` already extends Engine `Script`; no water-specific subclass or wrapper is introduced. It is mounted once with `sourceCameraEntity.addComponent(Stats)` and never duplicated on the Planar Camera or used as the Golden/P95 Gate. Formal captures use `stats=0`; separate Sky and Planar `stats=1` contexts each prove exactly one `.gl-perf` panel and are rejected as formal captures.

Final headed schema-v4 sampling uses native ANGLE Metal and separates the explicit `refraction-only` (`reflection=sky`, no Planar allocation) and `refraction-plus-planar` scenarios. Every formal capture records `statsEnabled=false`; Refraction-only requires only the total-optics frame-envelope, while Refraction+Planar additionally requires the direct Planar-pass scope:

| Tier | Scenario | Active FPS | FPS ratio | Active Frame P95 | Frame P95 ratio | Incremental total-optics GPU P95 / budget | Planar GPU P95 / budget | GPU samples, frame / Planar | Water-owned bytes | Engine bytes | Overall |
| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| Medium | Refraction-only | 120.0000 | 1.000260 | 9.70 ms | 0.989796 | 0.849583 ms / N/A | N/A | 1,801 / N/A | 5,001,216 | 38,687,942 | pass |
| Medium | Refraction+Planar | 119.9976 | 1.000053 | 9.80 ms | 0.989899 | 0.849208 / 2.5 ms | 0.657125 / 2.5 ms | 1,801 / 300 | 5,462,016 | 39,148,742 | pass |
| High | Refraction-only | 119.9984 | 1.000307 | 9.80 ms | 1.000000 | 1.126375 ms / N/A | N/A | 1,802 / N/A | 16,982,016 | 92,171,894 | pass |
| High | Refraction+Planar | 120.0000 | 1.000013 | 9.70 ms | 0.989796 | 1.151916 / 4.0 ms | 1.093208 / 4.0 ms | 1,802 / 600 | 21,129,216 | 96,319,094 | pass |

Final reports: `world-gallery/output/playwright/water-optics-performance/2026-07-22T19-55-47-866Z/result.json` (Medium Refraction-only), `world-gallery/output/playwright/water-optics-performance/2026-07-22T19-57-28-677Z/result.json` (Medium Refraction+Planar), `world-gallery/output/playwright/water-optics-performance/2026-07-22T19-58-33-638Z/result.json` (High Refraction-only), and `world-gallery/output/playwright/water-optics-performance/2026-07-22T19-59-13-718Z/result.json` (High Refraction+Planar). All four commands exited `0`; every report records schema v4, `status=pass`, `gpuEvidenceStatus=valid`, `EXT_disjoint_timer_query_webgl2`, zero dropped/pending samples, and zero browser errors. Every required scope ends with `protocolStatus=pass`, `frameStatus=pass`, `gpuStatus=pass`, and `overallStatus=pass`. Refraction-only reports have `planarPass=null`, `planarCameraCount=0`, and `planarBytes=0`; both Planar reports have one active Planar Camera/RT and non-zero Planar bytes.

Stats remains display-only. Its interval snapshots are useful for FPS/DrawCall/Triangles HUD diagnostics, but they neither supply nor replace timer-query GPU evidence or formal rAF P95.

## Surface / Fully-underwater continuity

`world-gallery/output/playwright/p1-water-showcase-smoke/2026-07-22T19-33-35-241Z/result.json` passed the dedicated Medium/High continuity lane. Each tier completed three `outside -> surface-air -> inside -> surface-water -> outside` rounds and retained exactly one enter plus one exit per round. Surface, underwater-resolved, and shader-bound optical-profile fingerprints match; maximum resolved-profile and fixed-depth medium-color deltas are zero. All 15 screenshots per tier are nonblank, and material create/destroy plus post-exit zero-execution lifecycle gates pass. This is local Chromium evidence, not a mobile-device claim.

## Validation boundary

- Final combined validation: `typecheck:water-pcg` passed; 88 test files / 515 tests passed, including the four-test P1 matrix/harness contract.
- The formal local evidence chain is the atomic update `2026-07-22T20-06-07-614Z`, canonical CI10 `2026-07-22T20-07-53-543Z`, canonical Nightly100 `2026-07-22T20-09-18-755Z`, native Metal CI10 `2026-07-22T20-12-48-298Z`, and four schema-v4 performance reports listed above. All reports passed with `failures=[]` and no baseline transaction residue; expected ReadPixels driver diagnostics are recorded separately and are not gate failures.
- The macOS Safari W3C runner produced fail-closed evidence at `world-gallery/output/webdriver/water-optics-p1-safari-device-acceptance/2026-07-22T19-05-15-046Z/result.json`: `status=blocked`, exit 2, blocker `Create Safari session transport failed: This operation was aborted`. Android has no available `adb` tool/device, and the local Xcode toolchain has no usable `simctl`; no Safari/iOS/Android support is claimed.
- P2 remains `rfc-delivered / awaiting-approval`. No `packages/core` file was changed, and no P2 capability is inferred from P1's Experimental-to-High fallback.

See [the P1 device matrix](./water-optics-p1-device-matrix.md) for the exact support-claim boundary and the evidence required to close it.
