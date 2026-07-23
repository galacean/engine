# Water Optics P0 acceptance record

- Date: 2026-07-22
- Reference browser: Chromium 140.0.7339.16
- Reference GPU: ANGLE Metal / Apple M5 Pro
- Reference viewport: 1280 × 720, DPR 1
- Fixed visual time: 12.5 seconds
- Engine Core changes: none

## Result

P0 is `completed-local`: functional, Golden/semantic visual, pixel calibration, resource, smoke, headed frame, and reference-device GPU gates pass for Medium and High. On Chromium 140 / Apple M5 Pro, `EXT_disjoint_timer_query_webgl2` produced valid total-optics and Planar-pass samples; all four final schema-v4 Refraction-only / Refraction+Planar reports ended with `protocolStatus=pass`, `frameStatus=pass`, `gpuStatus=pass`, and `overallStatus=pass`.

This is reference-device evidence, not a universal platform claim. No passing Safari, Android Chrome, or iOS Safari support evidence exists. macOS Safari was attempted and blocked in `world-gallery/output/webdriver/water-optics-p1-safari-device-acceptance/2026-07-22T19-05-15-046Z/result.json` (exit 2); Android and iOS remain unexecuted.

## Automated validation

- TypeScript: `pnpm -C world-gallery typecheck:water-pcg` passed.
- Final combined Water PCG unit/shader suite: 88 files, 515 tests passed.
- P0 smoke: `world-gallery/output/playwright/water-optics-p0-smoke/2026-07-22T20-13-23-812Z/result.json` passed with three fresh-context reloads and zero browser/runtime/WebGL errors.
- Stats isolation: `stats=0` created zero `.gl-perf` panels; `stats=1` created exactly one source-Camera panel.
- Formal visual, Golden, and pixel-calibration report: `world-gallery/output/playwright/water-optics-p0-visual/2026-07-22T19-46-24-951Z/result.json` (`completedAt=2026-07-22T19:53:31.671Z`).
- Final schema-v4 performance reports: `2026-07-22T19-55-47-866Z` and `2026-07-22T19-57-28-677Z` for Medium Refraction-only / Refraction+Planar; `2026-07-22T19-58-33-638Z` and `2026-07-22T19-59-13-718Z` for High Refraction-only / Refraction+Planar. All are below `world-gallery/output/playwright/water-optics-performance/`.
- These performance reports use the P1 `cross-body-optics` preset as a superset reference-device exercise of the shared optics implementation. They are not a single-Pool P0 scene and do not expand the P0 product scope stated below.
- Formal protocol: a fresh context per tier, 60 consecutive border frames, real full-frame Golden comparison, fixed ROI thresholds, and `stats=0`; both tiers passed with zero failures.
- Golden comparison is a real PNG pixel gate, not a hash-only check. Each `1280 x 720` screenshot is reduced to the fixed `256 x 144` full-frame analysis image; a pixel differs only when a channel exceeds two bytes, and at most `0.5%` of full-frame pixels may differ. All six Medium/High comparisons measured `0 / 36,864` differing pixels.
- Local-byte harness hardening: `world-gallery/output/playwright/water-optics-p0-visual/2026-07-22T18-47-40-088Z/result.json` passed the Medium diagnostic with schema/SHA preflight and three `sha256-verified-local-data-url` comparisons at zero differing pixels. Isolated missing-PNG and hash-mismatch injections both exited with status 1 before Chromium launch; this diagnostic does not replace the formal two-tier report.

## Frozen semantic evidence

| Gate                               |    Medium |      High |         Frozen threshold |
| ---------------------------------- | --------: | --------: | -----------------------: |
| Refraction ON/OFF linear MAD       |   0.03085 |   0.04061 |                  ≥ 0.015 |
| Foreground rail linear MAD         |         0 |         0 |                  ≤ 0.008 |
| Foreground rail leak ratio         |         0 |         0 |                   < 0.5% |
| Border sentinel maximum, 60 frames |         0 |         0 |      ≤ 0.1% of water ROI |
| Probe/Sky linear MAD               |   0.05867 |   0.05970 |                   ≥ 0.02 |
| Planar clip-off magenta coverage   |    83.59% |    84.19% |                     ≥ 5% |
| Planar clip-on magenta coverage    |        0% |        0% |                   ≤ 0.5% |
| Planar texture                     | 320 × 180 | 640 × 360 |     1/4 and 1/2 viewport |
| Planar estimated bytes             |   460,800 | 1,843,200 | RGBA8 + Depth24 estimate |

Medium selected `precomposed` because legacy Final materially missed the shader target while precomposed matched it. High independently confirmed the repeated-background model at the fixed calibration pixel. For both tiers, precomposed with DepthWrite off and on matched the shader-composited target at the frozen P95 threshold.

## Pixel calibration evidence

The formal report status is `passed`; Medium and High both have `failures=[]`, all three Golden comparisons per tier have zero differing pixels, and each tier completed 60 border frames.

| Gate | Frozen threshold | Medium | High |
| --- | --: | --: | --: |
| Four-direction Reflection maximum alignment error | ≤ 3 px | 0.628613 px | 0.372264 px |
| Four-direction Final maximum alignment error | ≤ 3 px | 0.372264 px | 0.372264 px |
| Final-to-Reflection maximum overlap error | ≤ 3 px | 0 px | 0 px |
| Hidden-marker maximum significant pixels | 0 | 0 | 0 |
| Moving reflector Planar / Probe MAD | Planar ≥ 0.0015; Probe ≤ 0.0008 | 0.010317 / 0 | 0.010125 / 0 |
| Local Foam Final inside / outside MAD | inside ≥ 0.003; inside ≥ 4 × outside | 0.268416 / 0 | 0.266334 / 0 |
| Local Foam master-off MAD | ≤ 1/255 | 0 | 0 |
| Invalid Planar posture equals explicit Probe | exact fixed-image match | pass | pass |
| Crossing-column minimum revealed reflection pixels | ≥ 8 | 35 | 34 |
| CPU reference maximum channel error | ≤ 2/255 | 0.0022234567 | 0.0013224735 |
| Final framebuffer to shader error | ≤ 2/255 | 0 | 0 |
| Pure-transmission valid pixels | ≥ 1,024 | 129,337 | 129,016 |
| Pure Final-to-Displaced MAD | ≤ 2/255 | 0 | 0 |
| Pure Fresnel maximum | ≤ 1/255 | 0 | 0 |
| Pure Displaced-to-Centered MAD | > 0.005 distortion minimum | 0.03217788 | 0.04346557 |

The causal Planar orientation gate keeps the same Planar source throughout and validates four asymmetric color markers. Hidden-marker negative controls report zero significant pixels; visible Reflection and Final captures satisfy color count/advantage, left-right/up-down order, mutual separation, CPU projection alignment, and Final-to-Reflection overlap. The water-only moving-boat ROI changes under Planar but remains identical under Probe. Camera-too-close, underwater, and back-facing Planar requests match explicit Probe pixels while Camera/RT counts remain zero for 30 frames. Local Foam is visible and local in Final, suppresses refraction only inside its mask, and becomes an exact no-op when the master Foam switch is off.

The CPU reference compares the shader-composited linear color with the shared CPU surface-optics equation. The pure-transmission fixture uses zero absorption, scattering, Fresnel, and reflection contribution; `Final == Displaced` while `Displaced != Centered`, proving that the displaced opaque sample reaches the final framebuffer without an unwanted blend term.

## Headed performance evidence

Each schema-v4 run performs a Stats-disabled `OFF -> ON -> OFF` total-optics frame-envelope capture. Refraction+Planar additionally records an independent Planar-pass scope. Every phase warmed up for at least two seconds and sampled for at least five seconds.

| Tier | Scenario | Active FPS | Active Frame P95 | Incremental total-optics GPU P95 / budget | Planar GPU P95 / budget | GPU samples, frame / Planar | Water-owned bytes | Engine bytes | Overall |
| --- | --- | --: | --: | --: | --: | --: | --: | --: | --- |
| Medium | Refraction-only | 120.0000 | 9.70 ms | 0.849583 ms / N/A | N/A | 1,801 / N/A | 5,001,216 | 38,687,942 | pass |
| Medium | Refraction+Planar | 119.9976 | 9.80 ms | 0.849208 / 2.5 ms | 0.657125 / 2.5 ms | 1,801 / 300 | 5,462,016 | 39,148,742 | pass |
| High | Refraction-only | 119.9984 | 9.80 ms | 1.126375 ms / N/A | N/A | 1,802 / N/A | 16,982,016 | 92,171,894 | pass |
| High | Refraction+Planar | 120.0000 | 9.70 ms | 1.151916 / 4.0 ms | 1.093208 / 4.0 ms | 1,802 / 600 | 21,129,216 | 96,319,094 | pass |

The total-optics GPU value is the incremental frame-envelope P95 estimate against the conservative Off baseline. The Planar value is measured in a separate `planar-pass` timer scope and is additional evidence, not a substitute for the total-optics Gate. All required scopes reported `protocol/frame/gpu/overall=pass`, with zero dropped samples and zero pending queries. Refraction-only retained zero Planar Camera/RT/bytes; Refraction+Planar retained exactly one Camera and RT.

The separate Sky and Planar `stats=1` diagnostic contexts each contained exactly one `.gl-perf` panel and finite Stats snapshots. Both correctly rejected formal capture with `Formal Water Optics performance capture requires stats=0.` In the final implementation used by these reports, the `stats=0` frame-update path returns before `.gl-perf` lookup and no longer queries the Stats DOM every frame. Stats remains display-only: its FPS/DrawCall/Triangles snapshots help humans inspect the Demo, but do not replace rAF P95, Engine/Water memory accounting, or either GPU timer Gate. The reports record repository HEAD `6983cf587df019d70284b534db34145ec718d764` with `dirty=true`, so these are final task-state local-worktree evidence rather than commit-pinned release results.

## Frozen P0 baselines

The six reviewed screenshots are under `baselines/water-optics/p0/{medium,high}`:

- `refraction-final.png`
- `reflection-final.png`
- `planar-clip-mask.png`

Each `roi.json` stores the exact PNG file names, fixed environment, semantic ROIs, thresholds, capture state, and SHA-256 hashes. Before launching Chromium, the visual harness reads the schema and all PNG bytes from the local baseline root and rejects missing/extra names, schema/environment/ROI/threshold drift, unreadable files, and SHA mismatch. The page receives only the verified local bytes as `data:` URLs, so `WATER_OPTICS_URL` cannot supply or replace a Golden. `WATER_OPTICS_P0_BASELINE_ROOT` may select an isolated local copy for diagnostics. P0 intentionally has no automatic baseline-update mode: captures remain under `world-gallery/output/playwright` and never overwrite these baselines. The full-frame Golden gate is paired with semantic ROI gates for refraction strength, above-water exclusion, foreground leakage, depth ordering, border sentinels, Probe/Sky separation, and Planar clip behavior.

## Quality-tier boundary

- Medium and High share one `WaterOpticalProfile`; quality changes resolution, update rate, and sampling rather than the physical medium.
- Medium uses the 1-tap Planar path and a `320 x 180` Planar target at this viewport. High uses a `640 x 360` target and exposes the 5-tap cross filter as an explicit opt-in; the reviewed default Golden remains deterministic with that optional filter disabled.
- Experimental is not a third implemented P0 renderer. The P2 RFC is delivered but awaiting approval; until it is separately approved and implemented, an Experimental request resolves explicitly to High with a fallback reason and must allocate no Composite, SSR, or history target.
- Low is intentionally excluded from this feature's implementation and acceptance scope.

## Scope and limitations

- P0 product claims cover the fixed single-main-water Heightfield/Pool path only.
- Refraction covers opaque objects present in Scene Color/Depth; transparent fish, glass, and particles are not in the opaque copy.
- `@galacean/engine-toolkit-stats` already extends Engine `Script`; no water-specific subclass or wrapper is introduced. It is attached once with `sourceCameraEntity.addComponent(Stats)` and never attached to the Planar Camera. It remains display-only and is not used as the formal P95/memory source or as a reason to modify Engine Core.
- No passing Safari, Android Chrome, or iOS Safari evidence exists and none may be labeled supported; the attempted macOS Safari lane is blocked, while Android/iOS remain unexecuted.
- River/Ocean shared binding and multi-water arbitration are outside this P0 record and are covered by the separate P1 acceptance record; cross-platform device closure remains pending. The P2 RFC is delivered but awaiting approval, so Dedicated Composite, SSR, temporal history, Waterline, and Caustics remain unimplemented and unauthorized.
