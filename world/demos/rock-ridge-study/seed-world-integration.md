# Seed World integration — 2026-11-13

The native Seed World rock worker now consumes the shared arrangement and shaping
pipelines from `packages/terrain/src/rock-ridge`. The study imports the same code
through compatibility exports. Its pinned output hashes remain unchanged.

## Native behavior

- Applied to planned mountain rock volumes. Decorative and streamed ground stones
  retain their existing meshes and cache keys when mountain controls change.
- Independent arrangement/shaping switches; seeded or manual graph counts; optional
  Perlin field; fracture depth, width, irregularity; existing OBB height/size edits.
- Flags are opt-in for existing worlds and persist through native scene properties.
- Native projected rock textures, per-corner sharp normals, indexed collision mesh,
  owner IDs, grass support and building support all use the published surface.
- Generation uses the current atomic terrain generator. One seeded atom library is
  reused across the world's mountain topology seeds. Native carving reduction uses
  a 0.0005 relative Meshopt error ceiling and the authoring triangle target.
- The native adapter scales each generated assembly into its existing OBB. Tall,
  narrow envelopes therefore produce taller, narrower mountains; the controls can
  resize these envelopes. This integration does not replace the world planner.

## Preview and observed publication

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
