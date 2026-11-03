# Rock lab migration into Seed World

This integration covers the **vertex-defined slab geometry path over Perlin with
an ascent mask, plus individual OBB width/height/depth controls**, the lab's
triangle mesh collision adapted to native Seed walking (2026-10-15), and
**cellular curvature with the lab's Original painted rock surface** and a saved
per-OBB **Random ascent / Perlin noise · ascent mask** choice (2026-10-16). It is a focused
extraction, rather than a migration of the complete rock lab or its renderer.

On 2026-10-19 the surface choice also becomes an independent per-OBB override.
The shared setting is now the default for OBBs without an override; existing
saved global selections retain their meaning.

The same date adds per-OBB automatic/manual base slope and variation from the
lab's `SlopeSeeding.ts`. Automatic base is `2 × height / min(width, depth)` and
variation defaults to 0.8, replacing Seed's former fixed 2 / 0.35 initialization.
This intentionally changes the generated shape for OBBs without slope overrides.

On 2026-10-22 the selected grayscale A/B material model from thread
`01a13497-6dd6-78f2-b0f8-89bf37d37b80`, source commit `28bdc6a96`, replaces
grass-palette tinting of bare stone. The texture supplies grayscale detail;
independent rock A/B colors supply pigment. Summer keeps the source's fitted
stone colors, with derived spring, autumn and winter presets. This is a native
material integration; the lab palette editor and its other blend modes are not
imported.

On 2026-10-26 the A/B model is superseded by a grayscale PNG multiplied by one
Color uniform, defaulting to white. Native document import retires the former
seasonal palette fields; geometry, grass and collision ownership stay unchanged.

The original slab comparison source was `codex/rockform-shaping-studies` at
`813f76ae8f6e6c4018091a8768c0ebbc959240a1` on 2026-10-14. Cellular curvature was
extracted on 2026-10-16 from the latest worktree of thread
`01a13d99-81c8-7690-b10d-fae379afcbb2`, `/Users/owen/.codex/worktrees/f861/engine-next`,
at HEAD `90a507caba985340a56b183b8dddce7a67f636a7`, including its local
uncommitted experiments. Some remaining files, especially the LOD and surface
filter work, are not committed in that source checkout. This inventory describes
the inspected source state; it does not imply those experiments are available
from the remote branch. The lab checkout is not changed by this integration.

## Delivered functionality

Open `demos/terrain/seed-world-planner/index.html?seed=1&debug=1`, enter the
native scene with **生成 3D**, then expand **05 Rocks / 岩石 → Rock formation**
in the debug panel. The ordinary scene no longer mounts a floating rock panel.
Picking a rock in debug mode opens its individual OBB controls in that same panel.
The planning editor keeps its whitebox representation; the generated rock
surfaces in this PR belong to the native Seed World 3D scene.

- Global Perlin controls: seed, frequency, octaves, lacunarity, persistence and
  ascent-mask exponent. These affect Perlin-mode OBBs. Each masked Perlin field
  is calibrated to its own seeded ascent peak before the overlapping fields take
  their upper envelope. Random-ascent OBBs use their ascent field directly.
- Global vertex-defined slab controls: seed, size, coverage, deformation depth
  and variation. Coverage zero exposes the projected network without slab
  movement.
- Saved **Default rock surface** selection: **Cellular curvature · rock faces** (the
  default, including Reset formation) or slabs. New projects and projects without
  a saved surface choice use curvature; explicitly saved slab selections are
  preserved. Curvature uses the lab's inset/base relief/
  detail equations, four-corner slope activation and continuous coverage, with
  cell size, inset, depth, detail and coverage controls. These are mutually
  exclusive geometry stages for each OBB, not stacked displacement or a material-only switch.
- Curvature uses the grayscale painted-rock PNG with selective triplanar sampling,
  green guide coverage, cavity visibility and per-cell edge-normal blending.
  Shared texture repeat defaults to 60 m; both surfaces use native PBR lighting.
- **Shared material → Rock Color** exposes one bilingual Color control. White
  preserves the asset's grayscale; other colors multiply the sampled value in
  linear space. Native Scene storage, undo/redo and reset preserve authored values.
  Color edits update both formation and companion-rock materials without
  generating/uploading meshes or rebuilding grass, collision or building supports.
  Rock grass continues to consume Seed's existing grass palette.
- An individual OBB selector, **Rock surface**, **Height mode** and width/height/depth inputs.
  **Apply OBB settings** submits changed dimensions and modes together. An explicit
  surface override stays fixed across global default changes; **Inherit surface**
  removes that local field and resolves the linked parameter source or global
  default. Shared Perlin/slab/curvature parameters are grouped separately. Missing
  mode fields retain Perlin behavior; Random ascent and Perlin can coexist in
  one formation and work with either surface. GPU picking selects
  the same box identity. Height grows upward from its existing bottom; position,
  yaw, neighboring dimensions and the root seed are retained. Reset restores
  generated dimensions and the default Perlin mode. Formations containing
  Random ascent use each guide's final contribution for overlap picking;
  all-Perlin formations preserve existing picking/collision ownership.
- Independent OBB slope controls: **Automatic slope from OBB size**, **Manual base
  slope (m/m)** and **Slope variation**. Automatic slopes use the lab's named box
  seed stream plus coherent face variation, and manual slopes use linear face
  variation. Both Random ascent and Perlin masks consume the result. Sparse
  native authoring preserves base inheritance, explicit zero variation, local
  edits, history, reset and replay. Derived rates are not stored as author input.
  Seed accepts finite positive manual rates rather than importing the lab UI's
  0.25–10 policy or legacy rate-12 cap; the upward-axis safety floor remains.
- Mixed slab/curvature formations share a canonical heightfield, indexed network
  and collider. Faces use the owning OBB's surface, and vertices incident to both
  surface styles stay on the guide to avoid cracks. Local orientation/area repair
  addresses failures introduced by that join, without changing existing uniform
  curvature. The shared curvature cell size
  sets their network scale. Drawing partitions only the expanded corner stream
  into at most two submeshes with the appropriate materials; picking identity and
  canonical collision indexing remain aligned.
- Sparse authoring in the existing `PlanningSession`, native Scene and project
  storage. The existing Session transaction/history supports undo, redo, reset,
  source resolution and replay. There is no new lab-recipe persistence format.
- One worker and a 64 MiB completed-geometry cache. In plans without buildings,
  a rock-only OBB edit regenerates its containing formation; other formations
  retain their CPU meshes and GPU buffers. Global noise/slab changes regenerate
  the affected formations while terrain, vegetation, bridges, water and camera
  remain alive. When buildings are present, rock geometry/settings changes use
  the full candidate scene transaction so building support snapshots and rock
  triangles publish together; World resources may be rebuilt.
- Native terrain contact, normal transport, rock picking, acoustic OBB updates,
  staged publication, cancellation and failed-edit retention. Planning/query
  volume data continues to use the published planning OBBs.
- Non-convex PhysX colliders from final rendered rock triangles, with the lab's
  capsule collide-and-slide mechanics adapted to native walking. Mesh edits stage
  matching collider replacements; terrain/bridge support, riding/debug ownership
  and first-person controls remain native. OBB collision flags filter physical faces.

The surface pipeline is:

`published OBBs → seeded Voronoi ascent fields → per-OBB [direct Random ascent OR
independently calibrated Perlin × ascent mask] → upper-envelope heightfield → baked vertex-network projection → [vertex-defined slabs +
guide-normal transport OR cellular curvature + recomputed normals] → Seed World
PBR rendering, picking and matching triangle collision`.

## Lab sections covered

Source paths below are relative to `world/gallery/demos/terrain/asset-assembly/`.

| Lab section / source | Coverage in this integration |
| --- | --- |
| `obb-heightfield/CellularSlabDeformation.ts` — vertex-defined slabs | Migrated to `VertexSlabs.ts`. The implementation matches after import adaptation: existing vertex corners, cross-cell polygon influence, strongest outward proposal, fixed canonical connectivity and local inversion checks. |
| `obb-heightfield/SurfaceNormalTransport.ts` — guide-normal transport | Migrated with the same implementation, used after slab movement. |
| `perlin-heightmap/PerlinNoise.ts` — seeded fractal Perlin | Migrated with the same implementation. Seed World exposes the selected six controls and automatic per-OBB peak calibration, rather than the complete lab algorithm/falloff editor. |
| `obb-heightfield/AscendingBoundary.ts` and `VoronoiOutline.ts` — ascent source | Voronoi seeding matches the lab; ascent construction is adapted to the selected Voronoi-only path. Each OBB can use it directly as Random ascent or as a Perlin ascent mask. Circle handling and the other starting-shape modes are excluded. Source-OBB containment does not imply final-mesh clipping. |
| `obb-heightfield/SlopeSeeding.ts` — base slope and variation | Migrated from f861 HEAD `90a507caba985340a56b183b8dddce7a67f636a7` to `Slope.ts` / `AscentMask.ts`: size ratio, default 0.8 variation, separate whole-box seed and coherent face samples. Per-OBB mode/rate/variation are native authoring adaptations. Manual input limits and the legacy rate cap are omitted; sampled vertical profiles remain excluded. |
| `shared/cellular-rock-surface/cellular/asymmetric.glb` — baked network | Copied unchanged: 6,989,016 bytes, SHA-256 `1775fb16f049cf29f7420674da20ec8979c4760b1791d07c9700632ef436de36`. Both surfaces use this decoder/crop path; there is no runtime Voronoi topology generation. |
| `shared/cellular-rock-surface/cellularDeformation.ts`, `cellularFracture.ts` and `obb-heightfield/RockSurface.ts` — Cellular curvature · rock faces | Vertex inset, recovered depth/noise relief and continuous-coverage equations extracted to `CellularCurvature.ts` / `Generate.ts`. Same 0.75–1.25 slope activation and 8 m / 1 / 1 / 1 / 1 defaults; Seed supplies its native terrain and selected ascent/Perlin guide. |
| `LandscapeMaterial.ts`, `cellularLighting.ts`, `renderBuffers.ts` and `textures/tiny-glade-rocky-terrain.png` — Original painted rock | Selected original-texture branch, stable per-cell triplanar offsets, coverage/grass blend and cavity visibility are migrated. The 2026-10-22 shading update replaces nearest-edge switching with shared vertex normals, symmetric edge bisectors, signed triangle altitudes and bounded width noise; grass/rock coverage shares the same continuous normal field. On 2026-10-26 the source PNG was converted once to sRGB-encoded grayscale luminance, retaining resolution and alpha; hashes and processing are recorded in `assets/painted-rock.provenance.json`. Private shader includes preserve Seed's native PBR and picking; canonical geometry and collision are not expanded. |
| `shared/cellular-rock-surface/RockColorBlend.ts` and `LandscapeMaterial.ts` — stone pigment | The previously migrated grayscale A/B fit was replaced on 2026-10-26 by a grayscale PNG multiplied by one native Color uniform. No runtime luminance extraction, seasonal A/B endpoints, percentile ramp or saturation/influence remapping remains. Controls and storage continue to use Seed authoring and uniform-only material publication. |
| OBB editor — individual size and fixed lower face | Size semantics, height mode and surface choice are adapted to stable planning box IDs and sparse native authoring. Mixed-surface union and native material publication are Seed adaptations; the full lab transform editor is not migrated. |
| Seed preview rock experiment — terrain fitting and local updates | Reimplemented against the current native Seed publication/authoring owners. The older experimental preview owner is not imported. |
| `obb-heightfield/TraversalRuntime.ts` and `TraversalSurface.ts` — mesh collider and capsule traversal | Readable indexed `ModelMesh`, non-convex `MeshColliderShape`, static collider, degenerate-face filtering, gravity, 50° slope and 0.32 m step are adapted in `Collider.ts` / `Navigation.ts`. Seed retains its 1.8 m height / 0.5 m radius capsule, controls, camera and native terrain/bridge support. |

Matching algorithm implementations are not a claim of bit-for-bit parity with an
arbitrary saved lab scene: Seed World supplies its own OBB layout, seed streams,
formation domains, terrain contact and fixed 65×65 field. The lab normally uses
an independently editable field and a 129×129 default grid. Seed keeps its
per-guide compact ascent smoothing; the latest lab's post-union smoothing and
independent height-preservation evaluator are not migrated by the mode selector.
Canonical connectivity is preserved within the slab stage. Changing OBB bounds
can change the cropped network and supported triangle subset; render-attribute
expansion for picking is separate from that canonical CPU geometry.

## What remains in the source lab

These are exclusions from this PR, not commitments to migrate them later.

| Area left in the lab | Relevant source / section | Boundary |
| --- | --- | --- |
| Separate painterly-slab finish, neutral-clay/material switching, limestone maps, brush strokes and full normal/material sliders | `PAINTERLY_SURFACE.md`, `PainterlySurface.ts`, `PainterlyMaterial.ts`, `PainterlyPreview.ts`, `RockSurfaceSettings.ts` | Original painted rock and its slope coverage/cellular edge treatment are included for curvature. Other finishes, brush tools and the full material editor remain in the lab. |
| Experimental color/multiply/off modes, arbitrary grass pigment influence and offline palette fitting UI | `RockColorBlend.ts`, lab color controls | Seed now uses grayscale texture × Color instead of the lab A/B model; rock grass retains its existing palette owner. |
| Alternative cellular source patterns | Shared cellular pattern generators, `RockSurfaceSettings.ts` | Cellular curvature uses the existing asymmetric baked network; alternate topology generation and per-pattern seeding remain separate. |
| Random descent modes, Perlin descent masks, outline polygon/circle/mix editing, per-vertex heights/subdivisions/rates, ascent zoom distributions, slope intervals, freeform playground, falloff/composition operations and manual amplitude | `README.md` terrain algorithm, ascent-mask and starting-shape sections; `PerlinHeightfield.ts`, `AlgorithmControls.ts`, `AscentZoom.ts`, `SlopeProfile.ts`, `Playground.ts` | Direct Random ascent and ascent-mask Perlin are included per OBB; the broader algorithm laboratory is not. |
| Independent smoothing configuration, height preservation controls and intermediate evaluation caches | `HeightSmoothing.ts`, `SmoothingConstraints.ts`, `HeightfieldCache.ts` | Seed uses its fixed compact ascent-mask smoothing and completed-formation cache. It does not port the complete lab evaluator or all per-guide caches. |
| Plateau, terrace, passage/ramp corridor stacks, ordering and comparisons | `SurfaceFilters.ts`, `SurfaceFilterControls.ts`, `SurfaceFilterExamples.ts` | Surface filters and their examples are not migrated. |
| Geographic feature graph, manual curves, shelf/solid construction and topology tooling | `FeatureMesh.ts`, `GeographicRockSurface.ts`, `SurfaceCellNetwork.ts` and the geographic-feature sections | These stages are not dependencies of the extracted heightfield/slab path. |
| Full OBB translation/rotation/tilt editor, continuous sliders, guide/vertex/polygon overlays, cameras and comparisons | `main.ts`, `index.html`, `renderer.ts`, `PainterlyPreview.ts` | Seed exposes the requested size/height-mode controls and picking integration. |
| Lab project/recipe editor, recovery, JSON/heightfield/OBJ export, generated fixtures, artistic references and offline fitting/import tools | `model.ts`, `examples/`, `offline/`, rock-building-block libraries | Native Seed authoring is persisted; lab projects/assets and exporters are not imported wholesale. |
| Three-level simplification, silhouette/error policy, projected-size selection, visibility scheduling, dither transitions, focus/comparison UI and upload admission | Seed source `spatial/runtime/ROCK_LOD.md`, `PlanningRockLodGeometry.ts`, `PlanningRockLodPolicy.ts`, `PlanningRockMeshSimplification.ts`, `PlanningRockComparison.ts` | One representation per formation is generated here. The lab's multi-worker/LOD scheduler, larger layered caches and LOD test harness remain separate. |
| Complete lab traversal presentation and topology-changing overhangs/openings | `TraversalRuntime.ts` third-person camera, jump/respawn and mode UI; solid stages | Triangle mesh collision is migrated. Lab camera/jump/respawn UI and new solid topology remain unmigrated; native Seed walking consumes the existing rendered triangles. |

## Retired experiments are not a migration backlog

The source's `RETIRED_EXPERIMENTS.md` records automatic geographic-template UI,
entry/terminal/underside connection experiments, A/B two-pass minimum composition
and the dedicated polygon/circle comparison. Those controls were retired before
this integration; retained helper modules and historical fixtures do not make
these active requirements. Earlier placed polygon-slab shells and whole-cell cap
group deformation are also superseded by vertex-defined deformation.

## Reconciliation and limits

The cellular-curvature branch starts from freshly fetched remote `dev/2.0` at
`e925866cd54a0602066f11f2c1370e12740f7647` on 2026-10-16. The previous rock
integration is already merged in PR #59. Reconciled again with remote
`ec858eaa9eb43bed3b2691a8e99d18f02cace684` before delivery, retaining PR #67's
canonical lake-bed sampling fix. The painted-surface correction is further reconciled
with `3c299028890dd42513fbbc146446f417772fc957`, preserving animal habitat/food
and shared vegetation layer sizing. Native editable buildings,
farming ownership and streaming updates are retained alongside suspension-bridge/approach creation,
bridge resource retention, picking and disposal, water authoring/publication and
transaction cancellation are retained. The rock ground adapter crops the native fixed height grid. Its height-array
identity and crop geometry participate in cache invalidation; local terrain
refinements were removed on 2026-10-15.

The per-OBB surface, height and slope controls are reconciled with remote
`dev/2.0@79fdabfb3ecbe96f2240cc501cdf0612518f8e42` on 2026-10-19. The native
debug inspector retains the upstream farming controller and Water DevTools,
alongside the bilingual rock controls. Upstream building support sampling and
its full candidate publication for rock edits in scenes with buildings are
preserved; the local publication path remains available without buildings.

The 65×65 mask, network projection and polygon influence remain sampled
approximations. Outward slab movement and reconstructed triangles are not an
exact clip to the OBB union. Fixed topology cannot manufacture an unsupported
opening or independently layered undercut. Local validity checks do not prove
global self-intersection freedom.

Before reconciliation, a Seed 1 / Formation 40 resize measured about 0.65–0.71 s
end to end (1.33 s on a first edit after reload), versus 31.7 s through the full
scene rebuild. One containing formation was regenerated/uploaded and 50 were
retained. These desktop development measurements include load variance and a
remaining brief main-thread pause; they are not a frame-smooth editing, mobile,
whole-world-startup or GPU-completion guarantee. They also do not measure the
current full scene publication required for rock edits when buildings are present.
Reconciliation checks are recorded separately in `../V2_IMPLEMENTATION.md`.
