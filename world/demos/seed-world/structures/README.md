# Seeded mountain peak variations

Open `seed-world/index.html?view=structures&seed=499`, or use **10 mountain variations** in Seed World's rock formation panel. The standalone development entry is `seed-world/structures/index.html?seed=499`.

Every example stays within the existing mountain peak profile. One seed generates 64 mountain candidates at runtime, then chooses ten with different front, side and top silhouettes. There is no list of ten shape types or stored layouts. Reusing the set seed reproduces the ten results.

The existing mountain network generates a dominant crown, lower secondary peaks, shared saddles, descending spurs and optional forks. A bounded profile variation changes footprint proportions, peak heights, saddle depth and flank width. The existing connected-rock fitter arranges broad atomic masses along that network; its contact checks and two-small-rock budget remain active. Arches, rings, detached towers and freeform graph structures are outside this generator's domain.

Implementation:

- `packages/terrain/src/rock-ridge/features/arrangement/mountain-profile.mjs` varies the existing mountain network and calls its existing fitter.
- `mountain-examples.mjs` compares the same ridge envelopes used by the fitter, after principal-axis alignment, and selects runtime seeds. `Examples.worker.ts` runs selection off the UI thread.
- `ridge.mjs` exposes the shared envelope independently of rasterization; ordinary ridge generation retains its existing behavior.
- The native `RockFormationClient` / `MountainSurface` owns atomic generation, optional carving, corner normals, OBB publication and materials.

The ten mountains share one eight-rock atomic library, generated and carved from the set seed at initialization. Each mountain has its own ridge seed and profile parameters, shown in the comparison table. Arrangement and shaping/carving remain independently switchable. A per-job `atomicSeed` can override `worldSeed`; individual libraries are supported but are not required by this gallery. Full-world mountains use the same bounded profile strategy through **Mountain profile variation**. The internal `seededShapes` key is retained for saved-document compatibility.

The gallery sets `RockFormationJob.triangleBudget` to **1,000 for each complete mountain**, including every placed mass. The ten examples therefore publish at most 10,000 triangles in total; the ground planes are separate preview furniture. This is distinct from the existing `targetTriangles` setting per atomic rock. The native adapter divides a formation budget across bounds and then across masses by placed surface area, retaining supporting pieces. Both the job budget and atomic seed participate in the mesh cache key.

The budgeted path reduces the generated source to 128 triangles before running the existing irregular solid-fracture algorithm. A 192-triangle proxy supports fitting, with a 1.5 m ridge raster and the study-only dense ridge-error measurement disabled. Final per-mass LODs are reduced directly from the carved source, preserving extrema and the floor/lips of the larger joints. Cut normals are reconstructed on the actual retained planes. Smaller fracture detail can disappear at this budget; carving itself is not bypassed. Jobs without a formation budget retain the existing full-quality path.

The gallery retains individual inspection, shared orbit, clay / original triplanar material, front / side / top views, live height and fracture controls. Regeneration preserves the camera. The preview uniformly fits each mountain into its OBB so its generated proportions remain visible.

The initialization target is **10 seconds for all ten mountains**, from page navigation through module/engine/worker startup, seed selection, atomic generation, carving, fitting, final LODs, upload, texture readiness and the first rendered frame. The page reports the actual time and triangle counts, including an explicit over-target state. Candidate selection overlaps engine initialization; the first load does not reuse generated geometry. `#initialization.dataset.stages` records the measured breakdown, and each card records its final triangle count and retained carved-wall triangle count. Regeneration is measured separately. Performance depends on the machine and serving mode; a CPU-only benchmark is not end-to-end acceptance.

Selection compares the procedural envelope before fitting actual atoms. It is a diversity heuristic within the mountain family, not a guarantee of ten equally distinct final silhouettes for every seed. Final rocks overlap as individual meshes, not a boolean union.

Validation:

```sh
pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs SeedWorldMountainProfiles SeedWorldMountainBudget SeedWorldMountainFeatures SeedWorldRockPanel SeedWorldRockFormationClient
WORLD_DEMO=seed-world/structures pnpm --dir world build
pnpm --dir world check:boundaries
```
