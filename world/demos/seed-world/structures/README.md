# Seeded mountain peak variations

Open `seed-world/index.html?view=structures&seed=499`, or use **10 mountain variations** in Seed World's rock formation panel. The standalone development entry is `seed-world/structures/index.html?seed=499`.

Every example stays within the existing mountain peak profile. One seed generates 64 mountain candidates at runtime, then chooses ten with different front, side and top silhouettes. There is no list of ten shape types or stored layouts. Reusing the set seed reproduces the ten results.

The existing mountain network generates a dominant crown, lower secondary peaks, shared saddles, descending spurs and optional forks. A bounded profile variation changes footprint proportions, peak heights, saddle depth and flank width. The existing connected-rock fitter arranges broad atomic masses along that network; its contact checks and two-small-rock budget remain active. Arches, rings, detached towers and freeform graph structures are outside this generator's domain.

Implementation:

- `packages/terrain/src/rock-ridge/features/arrangement/mountain-profile.mjs` varies the existing mountain network and calls its existing fitter.
- `mountain-examples.mjs` compares the same ridge envelopes used by the fitter, after principal-axis alignment, and selects runtime seeds. `Examples.worker.ts` runs selection off the UI thread.
- `ridge.mjs` exposes the shared envelope independently of rasterization; ordinary ridge generation retains its existing behavior.
- The native `RockFormationClient` / `MountainSurface` owns atomic generation, optional carving, corner normals, OBB publication and materials.

Each mountain owns a separate eight-rock atomic library and parameter set. Independent deterministic streams generate its ridge seed and atomic seed; width, height, crown scale, wear, wall relief and the other atomic parameters vary per example. The gallery lists primary-rock parameters for comparison. Arrangement and shaping/carving remain independently switchable; fracture controls are shared adjustments across the set. A per-job `atomicSeed` overrides `worldSeed` for the atomic library and participates in the native mesh cache key. Without an explicit override, mountain profile mode derives an individual library from each formation seed; standard ridge mode retains existing world-level sharing. Full-world mountains can use the same bounded variations through **Mountain profile variation**. The internal `seededShapes` setting key is retained for saved-document compatibility; it now selects the mountain profile strategy.

The gallery retains individual inspection, shared orbit, clay / original triplanar material, front / side / top views, live height and fracture controls. Regeneration preserves the camera. The preview uniformly fits each mountain into its OBB so its generated proportions remain visible.

Selection compares the procedural envelope before fitting actual atoms. It is a diversity heuristic within the mountain family, not a guarantee of ten equally distinct final silhouettes for every seed. Final rocks overlap as individual meshes, not a boolean union.

Validation:

```sh
pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs SeedWorldMountainProfiles SeedWorldMountainFeatures SeedWorldRockPanel SeedWorldRockFormationClient
WORLD_DEMO=seed-world/structures pnpm --dir world build
pnpm --dir world check:boundaries
```
