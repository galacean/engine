# Seeded structure examples

Open `seed-world/index.html?view=structures&seed=498`, or use **10 seeded examples** in Seed World's rock formation panel. The standalone development entry is `seed-world/structures/index.html?seed=498`.

A set seed generates 64 candidate spatial structures at runtime. A deterministic farthest-point selection chooses ten candidates using front, side and top silhouettes of their mass envelopes. Principal-axis alignment and coherent reflections prevent yaw-only copies from counting as different shapes. This is a diversity heuristic, not a guarantee that every seed yields ten equally interesting compositions.

There is no list of shape types or stored arrangement recipes. One stochastic graph-growth process varies node count, footprint anisotropy, radial concentration, height, breadth, connection density, fragmentation, curvature and clearance. Loops, branches, gaps and overhead connections emerge from those values. All supporting masses reach a common ground plane.

The implementation is divided by responsibility:

- `packages/terrain/src/rock-ridge/features/arrangement/growth/plan.mjs`: seeded spatial graph and mass envelopes.
- `diversity.mjs`: inexpensive three-view comparison and set selection, run in `Examples.worker.ts`.
- `assemble.mjs`: fitting complete atomic rocks to the generated envelopes, including tilted 3D frames.
- `features/arrangement/strategies.mjs`: injectable algorithm registry. The existing ridge algorithm remains available.
- Seed World's existing `RockFormationClient` / `MountainSurface`: atomic generation, optional carving, corner normals, native OBB publication and materials.

All ten examples share the set's atomic library. Changing an arrangement seed does not rebuild or carve that library. Arrangement and shaping/carving remain independent. The **Seeded spatial shapes** setting also makes full-world mountain formations use this same growth algorithm; ordinary rocks retain their existing path. The generated proportions are uniformly fitted inside the published OBB, rather than stretched separately to fill its three axes.

The gallery offers a shared orbit camera, individual inspection, clay / original triplanar material, front / side / top views, live height, and the existing fracture controls. Generating again preserves the current camera and reproduces the set. **Next seed** generates a fresh set.

The diversity proxy uses rounded mass envelopes, before costly carving. Final rocks remain overlapping individual meshes, not a boolean union. Visual inspection of the actual native meshes is still required when assessing a new generator revision.

Validation:

```sh
pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs SeedWorldSeededStructures SeedWorldMountainFeatures SeedWorldRockPanel
WORLD_DEMO=seed-world/structures pnpm --dir world build
pnpm --dir world check:boundaries
```
