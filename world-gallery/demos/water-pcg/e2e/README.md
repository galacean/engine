# Water PCG browser validation

## Interactive indoor pool smoke

Run the two-way buoyancy and surface-interaction gate against the same local gallery server:

```sh
node demos/water-pcg/e2e/indoor-pool-buoyancy-smoke.mjs
POOL_HEADED=1 node demos/water-pcg/e2e/indoor-pool-buoyancy-smoke.mjs
```

`POOL_URL` can target another gallery server. `POOL_SCREENSHOT_PATH` writes one impact-stage screenshot after the dynamic geometry exceeds `0.01m` and the ripple front exceeds `3m`. The gate covers Medium `129 × 53` simulation / `257 × 105` render grids, WebGL1 Low `65 × 27` simulation / `129 × 53` render grids, real PhysX free fall and rebound, entry plus continuous coupling, expanding/reflected waves, final settling, one mesh upload per render frame, reset-by-recreation, 30/60/120 render-rate sampling, and zero PhysX requests from the other three non-physics tabs. Actual render-rate closeness is a hard assertion in headed mode or with `POOL_REQUIRE_ACTUAL_FPS=1`; headless mode still proves the fixed physics step and finite state remain unchanged.

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

Render parity is checked independently at every interior vertex of the visible River surface mesh: the expected height uses the same attributes uploaded to the shader, while the actual height comes through `RiverWaterSurfaceProvider`. Boundary vertices are excluded because the Provider intentionally rejects the bank edge. Reach and junction queries use visible-triangle barycentric interpolation and select the highest visible surface across overlaps. P0 retains a `0.05` world-unit ceiling; the focused curved/multi/lake/pool suite currently reports exact sampled parity. The smoke fails on browser console, page, request, physics, allocation-contract, or numeric errors and prints all measured P50/P95, heap/GC, main-thread, actual-FPS, parity, and isolation evidence as JSON.

The allocation result is deliberately split by source. `featureOwnedSampledBytes === 0` applies to allocations directly attributed to `water-pcg/runtime`; total page allocations can still come from Galacean rendering, DevTools instrumentation, or the PhysX JavaScript/native bridge. Treat the sampled result together with the source audit and caller-owned identity tests, not as a claim that the entire browser page allocates zero bytes.

## Debug visual baselines

These images capture the `multi-tributary-river` example at `1200 × 765`, Medium quality, WebGL 1, and a fixed `surfaceTime=12.5`.

- `authoring-control-points.png`
- `geometry-raw-mesh.png`
- `fields-sdf.png`
- `surface-macro-height.png`
- `final.png`

The captures intentionally include both the Water PCG Debug panel and dat.GUI. Before replacing a baseline, open `/demos/water-pcg/?webgl=1&quality=medium&surfaceTime=12.5`, select the multi-tributary example, switch with `window.waterPcgDebug.select(...)`, and verify that the browser console has no warnings or errors.
