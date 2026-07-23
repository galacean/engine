# Water Optics P1 device matrix

Date: 2026-07-23

This matrix records evidence, not intended support. A row is supported only after its fixed visual or semantic signal, resource-lifecycle, error, and performance evidence exists; an installed browser or a fallback implementation alone is not sufficient.

| Platform / lane | Medium | High | Experimental | Current evidence / blocker |
| --- | --- | --- | --- | --- |
| macOS Chromium 140, WebGL2, canonical SwiftShader/Vulkan | Post-update headless Golden/resource CI10 and Nightly100 lifecycle passed; post-update headed canonical pending | Post-update headless Golden/resource CI10 and Nightly100 lifecycle passed; post-update headed canonical pending | Explicit `Experimental -> High` fallback passed; no P2 renderer | Atomic update: `world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-06-07-614Z/result.json`; headless canonical CI10: `2026-07-22T20-07-53-543Z`; headless Nightly100: `2026-07-22T20-09-18-755Z`. All post-update full-frame comparisons have zero differing pixels. The lane requires `--use-angle=swiftshader`, DPR 1, MSAA 0, and records renderer provenance. |
| macOS Chromium 140, WebGL2, native ANGLE Metal / Apple M5 Pro | Native semantic, feature-signal, resource, CI10 lifecycle, and GPU Gates passed | Native semantic, feature-signal, resource, CI10 lifecycle, and GPU Gates passed | Explicit `Experimental -> High` fallback passed; no P2 renderer | Final strict renderer/semantic report: `world-gallery/output/playwright/water-optics-p1-acceptance/2026-07-22T20-12-48-298Z/result.json`; final schema-v4 performance reports: `2026-07-22T19-55-47-866Z`, `2026-07-22T19-57-28-677Z`, `2026-07-22T19-58-33-638Z`, and `2026-07-22T19-59-13-718Z` below `world-gallery/output/playwright/water-optics-performance/`. Native Metal is not allowed to overwrite the canonical Golden. |
| macOS Safari 26.5, WebGL2 | Blocked | Blocked | Blocked | The dependency-free W3C runner is implemented, but Safari Develop > Allow Remote Automation is disabled on the reference Mac. Fail-closed evidence: `world-gallery/output/webdriver/water-optics-p1-safari-device-acceptance/2026-07-22T19-05-15-046Z/result.json` (`status=blocked`, exit 2, `failures=[]`). Its managed command is exactly `safaridriver --port 4444`; it does not invoke `--enable`, and no support pass is claimed. |
| Android Chrome, WebGL2, real device | Untested | Untested | Untested | No local `adb` tool/device is available. No real-device run was produced. |
| iOS Safari, WebGL2, real device/simulator | Blocked | Blocked | Blocked | The W3C runner has explicit `ios-simulator` and `ios-device` capabilities, hashed-UDID reporting, actual viewport/DPR capture, semantic/lifecycle checks, and screenshots. The local developer toolchain has no usable simulator and no real device is connected, so no support pass is claimed. |
| Native reference-Mac GPU timer | Valid / pass | Valid / pass | High fallback only; no independent P2 performance tier | `EXT_disjoint_timer_query_webgl2` supplied Medium Refraction-only `0.849583 ms / 1,801` frame samples, Medium+Planar `0.849208 / 0.657125 ms / 1,801+300` samples, High Refraction-only `1.126375 ms / 1,802` frame samples, and High+Planar `1.151916 / 1.093208 ms / 1,802+600` samples. Dropped/pending queries were zero. |

## Claim boundary

- Current passing product evidence is local Chromium only. A Safari/iOS runner implementation or a blocked report is not support evidence; do not label Safari, Android, or iOS as supported from this matrix.
- Chromium has two non-interchangeable lanes. `canonical-golden` establishes deterministic pixel regression under the recorded SwiftShader renderer; `native-hardware` establishes Metal compatibility through causal feature signals and lifecycle/resource semantics. A native semantic pass is not a Metal Golden, and a SwiftShader Golden is not native-GPU performance proof.
- The canonical lane requires the committed schema-v2 renderer provenance and fails if the actual unmasked renderer does not contain `SwiftShader`. The native lane requires headed Chromium, available unmasked renderer evidence, rejection of known software renderers, and a matching expected renderer substring (`ANGLE Metal Renderer` by default on the reference Mac).
- Medium and High use isolated browser contexts. Cross-tier replacement while an active Planar owner is rendering is exercised only through the explicit release/change/restore lifecycle sequence; no platform claim extends beyond the environments recorded above.
- Experimental currently resolves to High with `water-optics-experimental-resolved-high` and zero extra Composite/SSR/history resources. The P2 renderer remains unimplemented pending RFC approval.
- Stats is diagnostic only: one `@galacean/engine-toolkit-stats` Script is attached directly to the source Camera Entity, while formal Golden/performance captures use `stats=0`.
- No `packages/core` file changed; the current implementation is world-gallery-local. P2 remains unauthorized until the RFC receives separate approval.

## Evidence required to close a platform row

1. The canonical Chromium lane uses fixed Medium/High body-matrix and dual-owner scenes at `1280 x 720`, DPR 1, `surfaceTime=12.5`, WebGL2, and MSAA 0. Safari/iOS/mobile lanes record the actual viewport/DPR and use normalized semantic ROIs without consuming or updating the canonical Golden; every lane records available renderer provenance.
2. Pass semantic ROI variance and causal refraction/reflection feature-signal gates. Only the canonical SwiftShader lane consumes the committed full-frame Golden; Safari/mobile/native-GPU runs must not overwrite it.
3. Run at least ten lifecycle rounds, 300 stable-owner frames, and a six-frame lost-owner handoff; verify one-or-fewer Camera depth copy, opaque copy, Planar Camera, and Planar RT.
4. Record browser/device/OS/GPU, errors, requested/resolved tier and fallback reason, rAF timing, Engine bytes, Water RT bytes, and GPU timing status.
5. If no reliable GPU timer exists, keep the GPU and overall formal performance statuses incomplete. Stats or CPU submission time cannot replace that evidence.

## Safari / iOS W3C lane

Run `pnpm --dir world-gallery acceptance:water-optics-safari-device` for macOS Safari. Select `WATER_OPTICS_SAFARI_TARGET=ios-simulator|ios-device` for iOS; a physical device also requires `WATER_OPTICS_SAFARI_DEVICE_UDID` and a `WATER_OPTICS_URL` reachable from that device. The report stores only the UDID SHA-256.

This lane uses normalized ROIs only as scene semantics and records the browser's actual viewport and DPR; Safari/iOS cannot be forced to Chromium's DPR 1 canonical environment. It therefore never reads or updates the committed SwiftShader Golden. A platform row closes only when both Medium and High return `passed` with screenshots, WebGL2 provenance, zero page/runtime/WebGL errors, API source transitions, balanced lifecycle stress, 300 stable-owner frames, a handoff within six frames, and cleanup to one-or-fewer shared resources. GPU performance remains a separately timer-gated claim.
