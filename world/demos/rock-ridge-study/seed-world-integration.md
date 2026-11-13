# Seed World integration — 2026-11-13

The native Seed World rock worker now consumes the shared arrangement and shaping
pipelines from `packages/terrain/src/rock-ridge`. The study imports the same code
through compatibility exports. The rounded-body update below intentionally changes
atomic profiles and carving; cold seeded replay replaces the old fixed hashes.

## Native behavior

- Applied to planned mountain rock volumes. Decorative and streamed ground stones
  retain their existing meshes and cache keys when mountain controls change.
- Independent arrangement/shaping switches; seeded or manual graph counts; optional
  Perlin field; fracture depth, width, irregularity, normal smoothing; existing OBB height/size edits.
- Flags are opt-in for existing worlds and persist through native scene properties.
- Native projected rock textures, smooth body / adjustable cut normals, indexed collision mesh,
  owner IDs, grass support and building support all use the published surface.
- Generation uses the current atomic terrain generator. One seeded atom library is
  reused across the world's mountain topology seeds. Native carving reduction uses
  a 0.0005 relative Meshopt error ceiling and the authoring triangle target.
- The native adapter scales each generated assembly into its existing OBB. Tall,
  narrow envelopes therefore produce taller, narrower mountains; the controls can
  resize these envelopes. This integration does not replace the world planner.

## Initial integration publication (before rounded-body update)

URL: `http://127.0.0.1:5197/world/demos/seed-world/index.html?seed=1&template=original&debug=1&view=3d`

Open **05 Rocks > Rock formation**. Both mountain switches were enabled and the
native Apply action returned **已应用**. **View selected mountain** was exercised,
and the resulting textured, fractured mountains were visually inspected.

Seed 1, first full-world apply, measured from the native canvas diagnostics:

| Measurement | Result |
| --- | ---: |
| Mountain volumes generated / uploaded | 65 |
| Decorative meshes retained | 64 |
| Worker preparation wall time | 66,954 ms |
| Worker generation CPU | 36,826 ms |
| Carving CPU | 3,497 ms |
| Ridge arrangement CPU | 30,585 ms |
| GPU mesh setup CPU | 1,373 ms |
| Building support update CPU | 12,691 ms |
| Total scene publication wall time | 83,893 ms |
| Final planned formations | 129 |
| Final rock bodies | 1,223 |
| Final triangles | 1,222,260 |
| Bodies above the 1,000-triangle target | 0 |

These are one observed first-publication run, not isolated benchmarks. Rendering,
streaming and validation were active. Full-world editing is still a bulk Apply
operation; these numbers do not establish interactive full-world regeneration.

## Validation

- 113 distinct relevant tests across nine suites passed (overlapping reruns not
  double counted). Coverage includes all four feature combinations, seed replay,
  rotated OBB containment, ownership, sharp render normals, decorative stones,
  native property round-trip, panel payloads, edit publication, clients, material
  compilation and the existing union path.
- Latest mountain/panel rerun: 9/9 passed.
- World typecheck, package-boundary checks, and the final production build passed.
  The final build used `/private/tmp/seed-world-ridge-build` to avoid reloading the
  running preview while emitting generated HTML.
- Standalone feature verifier retained exact base-mesh, carved-mesh and scene hashes
  under Node 20.18.1. The standalone demo was rebuilt successfully.
- A pre-existing `Runtime picking shader preparation failed` warning was observed
  before feature activation. Selector-based framing and publication succeeded;
  this task does not establish that GPU picking or walking every generated surface
  has been validated.

## Rounded atomic bodies — 2026-11-13

The earlier version sharpened whole pieces in three places: narrow crown recipes,
six planar hull cuts, and flat per-triangle native shading. Runtime atoms now keep
broad crowns and shoulders. Fractures sample the actual curved source body and
subtract local connected wedges; only their walls are sharp. Their end caps stay
outside the body, avoiding horizontal shelves.

New Boolean vertices interpolate the original atomic normal field on retained
triangles. Native reduction preserves source/cut seams, welds GPU-equivalent
positions, and transforms the normals correctly through nonuniform placement.
Zero fracture width or depth retains exact source positions and indices. Both
feature switches and the existing triplanar material remain independent.

At depth 1.3 / width 1.6 / irregularity 1.8, all 16 current-kernel atoms from seeds
1 and 425 retained 91.4–94.9% of source volume. Across 216 support directions per
atom, the largest silhouette support loss was 3.24% of the original span. These
are sampled geometric checks, not a claim about every possible seed or view.

Validation includes 115 native tests, with five mountain tests rerun after the
normal and precision changes. The new tests cover closed reduced surfaces,
source silhouette retention, sharp cut normals, rounded body normals, and zero
width/depth identity. World typechecking and package-boundary checks also passed.
The study's feature verifier checks independent cold replay and toggle caches.

The 120 fracture-control boundary cases passed. Physical fracture mouth edges
were checked on the retained curved surface, using world up projected into its
tangent plane. On the ten non-platform historical fixtures, 81.6–95.0% of seam
length was within 30 degrees of surface up. The old interpolated color-mask
metric is retained for historical inspection; it no longer gates the new rounded
body against a planar-hull baseline.

The final production build passed in `/private/tmp/seed-world-rounded-build`.
Standalone checks passed for 12 surface fixtures / five fitted assemblies, 120
control-boundary meshes, runtime seeded assemblies, and exact optimized/reference
Boolean parity on 70 meshes. Seed World was visually verified in its textured
view, and seed 425 was checked with matched base/carved clay views. The live
preview reached `ready`; its eight-atom carving stage reported about 4.3 seconds
of CPU time during the full world build (not an isolated benchmark).

Seam preservation has a measured cost: the eight seed-1 carved atoms reduce to
1,162–1,216 triangles at the 1,000 target. The target remains soft under the
0.0005 error ceiling; the adapter keeps the original body and fracture edges.

## Fracture normal smoothing — 2026-11-13

A separate render-only normal stage adds **Fracture normal smoothing** under
Mountain shaping. The range is 0–1 (0–100% in the study), default 0.65. Zero
recovers the hard plane normals; one shares angle-weighted normals across cut
edges. The amount does not change carved vertices, triangles, collision, grass
support, or arrangement, and it is excluded from the expensive stage cache keys.
The standalone/inline slider updates GPU normal buffers while dragging, without
rebuilding the scene or resetting its orbit. Native Seed World uses Apply.

Validation: 16 focused tests passed across four suites, covering shared-normal
continuity, triangulation independence, unchanged native positions/indices/grass,
saved settings, panel payloads, and rounded-body regression checks. The viewer
state verifier passed normal-only updates and orbit retention. World typechecking
and package boundaries passed; the production build completed successfully in
`/private/tmp/seed-world-fracture-normals-build`.

Browser checks: the seed-425 clay comparison was inspected at 0%, 100%, and 65%.
Its last-build carving/fitting diagnostics and base fingerprint stayed unchanged
while smoothing changed. Seed World seed 1 loaded with both mountain features
enabled, exposed the 0.65 control, and the selected textured mountain was framed
and inspected. The inline artifact was refreshed from the same packed viewer.
