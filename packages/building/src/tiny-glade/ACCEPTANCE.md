# PR3071 resident feedback verification — 2026-10-15

This file records historical migration stages and their measured evidence, not
the current runtime contract. In particular, the native/Python runtime boundaries
below were superseded by the TS migration. Use [README.md](README.md) for current
entry points, supported authoring operations, LOD policy and remaining limits.

The round-Gothic page on port 8769 now uses `galacean-feedback-v1`. The original
house workspace, both saved documents, the unpublished courses draft, published
overlap intent, camera and enabled layers are preserved. Tests ran privately
before deployment. The actual in-app browser was then reloaded and checked.

Comparisons preserve the existing diagnostic material view, not Tiny Glade's
final lighting/GI. Aesthetic acceptance remains with the user.

## Evidence and tests

Local evidence root (`R`):
`~/.local/share/rea/investigations/tiny-glade-2026-10-12/resident-migration/`.
`W` below is `R/feedback-implementation/`. Extracted assets and generated binaries
remain outside Git.

- `R/feedback-gravity-audit/engine-report.json`: actual PR3071 engine feedback,
  322 circular and 311 rectangular roof instances at 1/7/21/60 steps. All eight
  cases match original Metal state byte for byte. Also verifies packed UInt4
  NaN-like payloads, partial-range passthrough, GPU resize mappings, direct buffer
  drawing, particle resize and realtime SH blending. Production calls perform no
  readbacks; explicit audit calls are counted separately.
- `W/generated-parity.json` and `W/grid-generated-parity.json`: independently
  generated new packages versus previous resident packages, six cases each:
  original, wood, brick, roof tile, local hide and restore. All pixels identical.
  Normal `getBufferSubData` and `readPixels` are replaced with throwing guards;
  only the separate screenshot comparison may read pixels. Attribute bindings
  are checked against the exact computed buffer. GL errors and page errors: zero.
- `W/authoring.json`: real browser editing through JSON draft/load/generate;
  changed wall height, grid/overlap regeneration, independent edge material,
  region override retention, material replacement, local hide, reload and stale
  publication rejection. `W/publication-failure.json` injects candidate-load 503:
  the previous canvas/publication survive and the new draft remains saved.
- `W/contracts.json`: 12 generated comparisons with the retained override owner;
  all 16 Node tests pass, including fragment reordering/regeneration, identity
  collisions, dependency rejection and camera ABI.
- `W/deployment-package-parity.json`: final package has the exact same manifest
  apart from the source resource directory, and 296 identical assets, as the
  package used for overlap pixel verification. `W/deployment-check.json` verifies
  unchanged public documents/publication/camera and the new pipeline identity.
  `W/public-after.png` and `W/public-metrics.json` are from the user's in-app page.
- `surface-layout/experiments/resident-cpu-roof-20261015/final/report.json`:
  35 cases / 19,005 raw roof instances, full-precision emission fields and row
  context exact; another 100 standalone closures exact.
- `R/feedback-study/roof-surface-port/`: 30 cases / 7,655 support triangles with
  identical position/normal/UV bytes; 3,020 noise inputs and invalid-input checks.
- `R/feedback-study/pack-port/`: 6,891 cells, 208,471 half-input patterns and
  11,582 encoder records against the original; separate roof-design validation.
- `R/feedback-study/roof-anchors/check-1/report.json`: 633 complete placement
  records, 5,050 projections, 3,589 ambiguous ties and 573 bound-piece queries
  exact. Projection work 5.629s → 1.727s in the isolated comparison.
- `surface-layout/experiments/resident-cpu-roof-20261015/dormer-bins/report.json`:
  17 cases / 644 hole records exact, including empty, slot preservation, repeated
  inputs, boundaries and original first-49 capacity behavior. Pure binning <1ms.
- `R/feedback-gravity-audit/construction-cache-real-report.json`: immutable cache
  miss/hit, 66 original construction binaries exact. Nine additional tests cover
  concurrency, failed publication, dependency/code changes, damaged/missing
  artifacts, symlink retargeting and inputs changing during construction.
- Official world engine materialization and module build pass. Math, design,
  core and rhi-webgl declaration builds pass; the product bridge/adapter typecheck
  passes against the materialized package declarations. `git diff --check` passes.

## Final measured stages

Single local runs; CPU/browser/GPU contention and caches vary. These are not a
controlled speedup ratio or a Tiny Glade game benchmark. The previous recorded
full rebuild was 36.7s. The final pipeline's fresh tower-height 3.625 build, with
Gothic and persistent local/edge edits, is `W/final-fresh-timings.json`:

| Stage | Time |
| --- | ---: |
| Fresh native CPU construction including cache fingerprint/publication | 5,158ms |
| Recovered support geometry and resource preparation | 1,038ms |
| Roof placement and persistent editing anchors | 2,157ms |
| Instance ABI packing | 248ms |
| Roof connection topology | 110ms |
| CPU compiler total | 8,748ms |
| Export process | 694ms |
| Compiler + export, including process startup | **9,816ms** |

Unchanged-geometry initial package: `W/release/timings.json`, **4,528ms CPU**,
including 20ms construction reuse, 1,857ms geometry/resources, 2,253ms placement,
251ms packing and 111ms topology. This run uses the provider's Python 3.9.6 with
`-S`; all roof compilation succeeds with third-party site packages disabled.
Python 3.12 ran in 2.78s, but its changed floating summation produces tiny UV
rounding differences; it is not the deployed compiler runtime.

Actual deployed in-app page (`W/public-metrics.json`):

| Stage | Time |
| --- | ---: |
| Fetch / parse | 308 / 9.3ms |
| Engine bridge initialization | 90.9ms |
| Recovered render-program compilation | 150.8ms |
| Upload and feedback preparation CPU calls | 133.2ms |
| Full renderer load | **847.3ms** |
| 240 feedback dispatches, asynchronous GPU time | **10.27ms** |
| First draw, asynchronous GPU time | 7.08ms |
| Normal state/image/depth/vertex readback | **0** |

Feedback CPU submission (28.4ms here) is inside preparation, not additional time.
Timer-query values measure GPU execution; upload timings measure CPU calls.
The full upload is 18,132,222 bytes, including templates, textures and all material
variants; it is not 18MB of expanded roof vertices.

Private UI material replacement: 22.6ms input→submit, 1,440 bytes uploaded. Local
hide: 21.7ms, 432 bytes. Return to an already prepared overlap package: 396ms.
No construction/packing/feedback recomputation occurs for material or local edits.
RequestAnimationFrame callbacks in reports are not presentation fences.

## Boundaries

The original 60-step initialization timeline is retained for visual parity; it is
not evidence that the actual game waits 60 frames. Animation state stays on the
GPU, while persistent editing coordinates remain CPU-owned authored intent.

New wall/Gothic/structural construction still executes the explicit native CPU
provider. Shape-independent edits reuse its immutable bundle. The recovered roof
support, roof arrangement, anchors, dormer bins and instance packing are direct
algorithms in engine-next. This is not a claim that every Tiny Glade producer has
been ported or that all geometry computation belongs on the GPU.

Feedback uses the engine's PR3071 implementation and shared device. Original
material shaders are still submitted by the resident WebGL renderer; complete
MeshRenderer/render-graph integration and cross-package allocation reuse remain
outside this delivery. The original house display path remains available. No
Cozy implementation or compatibility layer is introduced. Unsupported native
families and unverified roof parameter combinations fail explicitly.


## First-structure optimization — 2026-10-15

Evidence root: `resident-migration/structure-optimization` in the retained local
investigation. No original provider files or material shaders were changed.

- `final-matrix/report.json`: current round/rect Gothic, changed height, moved
  contact, and no-Gothic input. All exported groups/plans/programs/textures/draws
  and authored documents match the original provider exactly. Pointer-bearing
  native records are compared through the real exporter relocation, not by
  ignoring output bytes. Fresh-owner structure generation is 3.38–3.93s before,
  1.10–1.31s after; these are warm-process measurements without output-cache hits.
- `pixel-final.json`: final current scene, wood/brick/tile replacements, local
  hide and restore all have zero differing pixel channels. Readback guards permit
  only the explicit audit capture; normal runtime has zero readbacks. Feedback
  output buffers remain the render attributes; repeated disposal passes.
- `roof-prepare/report.json`: 12 cases, 4,553 initial instances and all 60 static
  animation steps exactly match native outputs. `whole-decorators/report.json`:
  10 circle/rectangle Gothic/Cottage/empty variants, cache transforms, subtype,
  blueprint and trigger streams match; changing Roof88 invalidates trigger reuse.
- `final/report.json`: 855 wall64 and four timber80 records, connection outputs,
  original raw commands and owner partitions match. Necessary corner encoder,
  append-prefix and contiguous coverage checks remain in place.
- `supports-final/report.json`: four dynamic cases and nonempty Cottage supports
  (16 Brick64 + 10 WoodenPlank80) match. Platform construction runs once per owner.
- `event-runtime-first/report.json`: two real native scenes, all 66 binaries
  match; adapter mutations, allocator/free, unknown external/low-address guards,
  native execution budget and idempotent cleanup pass. Block trace coverage is
  deliberately absent, not reported as proof of unexecuted code.
- Cache boundary suite: 11 tests, including source/producer change, corruption,
  symlink retarget, changed-then-restored input, failed publication and concurrency.

Controlled fresh-process comparison (`cold-timings.json`), same 3.875m tower
input, new construction cache per implementation, Python 3.9.6 compiler and
Python 3.12 exporter, warm filesystem (not a cold disk benchmark):

| Stage | Original construction | Optimized construction |
| --- | ---: | ---: |
| Construction including cache validation | 5.000s | 2.279s |
| Geometry/resources | 1.123s | 1.096s |
| Arrangement/anchors | 2.349s | 2.229s |
| Packing | 0.276s | 0.255s |
| Connection topology | 0.128s | 0.114s |
| Compiler process + export | **10.038s** | **6.905s** |

The compiler/export measurement excludes browser loading and first-frame work.
Concurrent private UI verification took 8.90s server time and 9.57s input→submit,
showing that these measurements are not a latency guarantee. Material-only edit
was 21.3ms input→submit and 1,440 uploaded bytes. Changing structure retained the
local brick region, hidden region and independent brick roof edge; reload kept
all edits and stale publication returned 409 without changing the scene.

This round primarily removes CPU replay/diagnostic overhead and moves recovered
preparation out of native emulation. It does not claim an additional GPU topology
port: gravity, vertex deformation and hole clipping remain on the existing GPU
path, while CPU-dependent topology/identity stays CPU-owned. Remaining dominant
work includes process/module initialization, resource preparation and arrangement.

Deployment verified against original public workspace files and camera. The
new initial package is identical to the preceding package in every rendering
field; only its extraction-resource directory changes. The user's saved courses
draft remains separate from the published overlap result. Current page was
reloaded and visually checked after deployment (`public-after.png`).


## 2026-10-15 portable kernels and redundant work removal

Evidence directory: `resident-migration/runtime-migration` in the local Tiny Glade
investigation. No game binaries or generated assets are committed.

- Fresh construction, same 3.875 m tower input, separate empty construction caches,
  warm filesystem: compiler process + exporter **7033.4 → 3647.6 ms**. This is one
  paired observation, not a browser latency guarantee. Geometry/resources
  **1033.4 → 346.2 ms**, arrangement **2145.9 → 485.6 ms**, unit packing
  **221.2 → 66.9 ms**. Native construction itself is unchanged and its measured
  variation is not attributed to the JS port.
- 282 unchanged blobs / 91,404,260 bytes are referenced from the prepared asset
  owner instead of copied into each new publication.
- Real private UI fresh height change: **5822.2 ms** input-to-submit, including
  native generation, publication and a new GPU renderer. Material-only update:
  **19.8 ms**, 1618 bytes uploaded. Local hiding survived another height rebuild.
- Four retained cases (current, height, moved, no Gothic): groups, plans, programs,
  textures, draws, document and dimensions equal exactly. 5364 projection queries
  (anchors, unbound and bound projection) equal, including vertices and off-surface
  points. Invalid initial-state mutations reject before publication.
- Explicit browser audit: original, wood, brick, tile, local hide, restore all
  **zero differing channels**; direct feedback buffer bindings remain intact;
  normal-runtime readback guards did not fire. Browser-only portable kernel test:
  288 anchors and all three material buffer hashes equal the retained oracle.
- Python/native recovery remains necessary for new wall/Gothic topology. Generic
  arrangements beyond recovered overlap placement still run in the provider.
  This is not acceptance of a fully Python-free construction framework.


Final source verification after fingerprint caching: fresh compile + export
**3926.0 ms**; a fresh compiler process reusing only the construction bundle
**1603.2 ms** (layout and export still execute). The repeat construction stage
was **83.8 ms**. `final-timings.json` retains both observations and all exported
fields still match the pre-port package. 14 cache-boundary tests pass, including
same-size writes with restored mtime, inode replacement and corrupted fingerprint
metadata. The grid UI regression retained the local hidden region and wood unit
through regeneration/reload; its generic arrangement producer remains Python and
is not covered by the overlap timing improvement.
# Seed World TypeScript migration — 2026-10-15

Status: **roof algorithm slice verified; full Seed World migration incomplete**.
The user accepted small floating-point differences with structural and pixel
verification. Existing scenes/public author documents were not replaced.

Evidence root: `/tmp/seed-world-ts-migration/` (local, not a committed asset).

- `verified-roofs/report.json`: 35 cases / 19,005 instances, 31 byte-identical
  cases, maximum initial position difference 1.9073486328125e-6 m; 100 closure
  cases exact. This compares against previously recovered Python mathematics;
  no original machine code was newly replayed by this test.
- `browser-worker.json`: all 35 cases executed directly by the bundled TS in a
  browser Worker. Bundle inputs contain only the test and portable JS/TS modules.
  The `round-gothic` named kernel fixture took about 5 ms for 297 records in this
  run; this is not whole-scene construction or frame time.
- `matrix-verified/report.json`: current/height/moved/no-gothic compiler cases,
  exact shader/document/texture/ownership contracts, maximum admitted numeric
  difference 4.76837158203125e-7; 5,364 projection queries exact. Sources for wall
  and Gothic geometry were retained native bundles, so this does not verify a
  TS implementation of those producers.
- `pixel-*.json`: separate readback-audit results for original material, wood,
  brick, tile, local hide and restore. Readback is forbidden during ordinary
  renderer execution by the harness.

Remaining: independent TS wall/contact/Gothic producers; other arrangement and
support kernels; browser authoring/compiler coordinator; direct Seed World
render submission. Original replay cannot yet be removed from fresh construction.
Do not describe this delivery as a complete pure-browser building framework.
