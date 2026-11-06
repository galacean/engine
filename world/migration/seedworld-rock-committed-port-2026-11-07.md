# Seed World committed rock work port

Destination: `galacean/engine`, based on `experimental/engine-next@fd89c13ad1c3a4da271cf21f3ea3bcd557562b97`.
Source: `galacean/engine-next`, `codex/seedworld-rock-runtime@2406bcf4944bc50361d8d066707da2f8b310c4d2`.
Comparison base in the source repository: `dev/2.0@e44e84a3198bcd1de2d8d46ffdedde0ed7773263`.

The user requested the committed work only, then explicitly confirmed keeping the
terrain-wide lift reverted. The source worktree's other uncommitted work remains
there. This port consumes committed Git objects; only the confirmed bounded local
grounding change and its regression come from the source worktree.

## Commit accounting

Ten topic commits and four reconciliation merges exist beyond the source comparison
base. Most topic behavior was already carried into the destination by the package
migration; duplicating the old Gallery tree would restore obsolete ownership and
resource paths. The remaining changes are ported into the current packages.

| Source topic commit | Functionality | Destination treatment |
| --- | --- | --- |
| `47757c3c4` | Smooth grass coverage across rock faces | Already in terrain `GrassSurface.ts`; unchanged implementation apart from imports/formatting. |
| `ab2f3aa2c` | Rock debug picking with baseline selection preserved | Already in Seed World; port the original 20-case routing regression with current native-host fixtures. |
| `5a950c7f9` | Arrow-key camera look while WASD moves | Already in terrain `TerrainNavigationRuntime.ts` and animals `FreeControl.ts`; unchanged implementations apart from imports/formatting. |
| `641abc1cd` | Close deformed ground-contact edges | Already in world-planning `GroundContact.ts`; preserve it. The terrain-wide upper lift is deliberately excluded by the user's follow-up; local contact is now bounded by authored height. |
| `bae9f4271` | Receiver-plane shadow depth correction | Already in terrain `ShadowReceiver.glsl`; unchanged implementation apart from formatting. |
| `fda64d73c` | Minimap direction and viewport angle | Already in the Seed World debug sidebar; unchanged implementation apart from imports/formatting. |
| `fca264342` | Editable platform/peak generation profile | Already in the destination; retain source dimensions, stable IDs, per-OBB overrides, companion and landscape behavior. Add the original profile/companion regressions. |
| `50669f4bf` | Consolidated runtime documentation | Destination already carries it; update its moved entry paths, upper-height controls and grounding contract here. |
| `62de00b3e` | Share painted rock material between slabs/cellular | Already in the destination, including native tint/grass integration. Keep newer resource paths and color fixes. Port the committed view expectations. |
| `6e09e3185` | Upper-height percentage controls and zero default | Port to terrain types/ascent generation and world-planning settings, authoring, profile and native panel; carry its virtual runtime type declaration and original tests. |

Reconciliation commits `04e462fe9`, `4ac6a137c`, `dd79b7c0c`, and `2406bcf49`
introduce source-branch integration history; this port retains the newer destination
base instead of replaying those merges across the package migration.

## Scope retained in the old worktree

The uncommitted 6 m/m slope cap, 8 m cellular/lab defaults, crease-aware normals,
adaptive cellular projection, other shader/contact blending work, and native
editing fixes are not part of this committed-only transfer. The bounded grounding
rollback is the sole explicitly confirmed exception. The destination's other
existing defaults and newer package implementations remain authoritative.

## Validation

The port rebased cleanly from the initial `430b0bfaf` destination to `fd89c13ad`.
The focused tests, typecheck, boundary check and production build passed again
after that reconciliation, retaining the newer planning changes.

- Destination locked dependencies and `pnpm --dir world prepare:engine` completed.
- Eight focused files / **159 tests passed** using the destination Engine alpha.52
  and actual workspace packages: native rock editing, percentage panel controls,
  generation profiles, companion rocks, shape slopes, terrain contact, view and
  picking. Imports/resources are relocated; behavioral assertions are retained.
- `pnpm --dir world typecheck` passed; its native Engine baseline has one existing
  diagnostic, with no new World/modified-engine diagnostics.
- `pnpm --dir world check:boundaries` passed: imports/dependencies resolve, no
  package imports a Demo, and the package graph is acyclic.
- Targeted ESLint: zero errors; two existing unused-variable warnings in the
  settings' material-field exclusion destructuring.
- `pnpm --dir world build` completed for Seed World. Build output
  retains existing large-chunk and duplicate asset-emission warnings; no fresh browser/GPU check is claimed.
- Virtual runtime declaration changes are limited to the committed rock types
  entry. The source's 45 modified/untracked files were hashed and remain unchanged.

Reproduce the focused tests from repository root:

```sh
pnpm --dir world exec vitest run --config scripts/acceptance/seed-world-fixes.config.mjs \
  SeedWorldRockSlopePanel.spec.ts SeedWorldRockSlope.spec.ts \
  SeedWorldRockGenerationProfile.spec.ts SeedWorldCompanionRockProfile.spec.ts \
  SeedWorldRockFormationView.spec.ts SeedWorldRockFormationEdit.spec.ts \
  SeedWorldRockGroundContact.spec.ts SeedWorldRockPickRouting.spec.ts
```
