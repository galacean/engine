# Geometry × Rule × Unit in Seed World

## Current entry

The public entry is `parts/architecture/index.ts`, exported through `parts/index.ts`.
Production and demos run one pipeline: `Building.European.*` drafts, `designBuilding`,
`implementBuilding` and `renderBuilding`, driven by `BuildingManager`. See
[parts/README.md](parts/README.md) for the flow and API, and
[components/README.md](components/README.md) for the editing and save boundaries.
Seed World uses the v7-groups save key and does not load or convert older saves.

This is the admitted round/rectangular-house + Gothic example domain, not a claim
that every Tiny Glade feature has been ported. The earlier port-8769 laboratory is
preserved separately; [LEGACY-LAB.md](LEGACY-LAB.md) describes it. Do not use its
native server as a fallback in this runtime.

> **Historical notes.** The sections below record recovered geometry rules, decisions
> and evidence from the removed masonry pipeline. `ConstructionRuntime`,
> `MasonryDocument`, `MasonrySession`, `prepareMasonry` and the paths they mention are
> no longer entry points. Read them as background, not as current API.

## Removed masonry author format

`MasonryDocument` was the version 1 author format and owned only intent:

```ts
{
  version: 1,
  construction: {
    version: 1,
    environment: { type: "host_terrain" },
    identity_order: ["tower", "annex"],
    buildings: [/* stable IDs, circle/rectangle, height, roof and dormers */]
  },
  bindings: [{
    id: "roof-cover", geometry_id: "tower-roof",
    rule: { type: "overlap_rows" },
    footprint: { width: .5, height: .4375, depth: .1 },
    seed: "source", unit_id: "roof_tile"
  } /* one binding per building roof */],
  overrides: [{
    id: "repair", binding_id: "roof-cover",
    region: { space: "surface_uv", polygon: [[2,.4],[4,.4],[4,1.4],[2,1.4]] },
    effect: { unit_id: "brick" }
  }],
  placement: { position: [0,0,0], rotationY: 0 }
}
```

This is an explanatory excerpt. `assets/examples/round-gothic.json` is complete.
The parser rejects unknown/unsupported fields instead of silently approximating.
Placement uses meters and radians. Host terrain requires explicit placement;
horizontal position/yaw map local geometry into the host height field. Grounding
derives the actual render Y. Layout seeds and local UV overrides remain local.

- Geometry owns metric domains and stable identity. Native identity order retains
  tombstones; dense render slots are separate from those identities.
- Rules own logical placements, original clipping and closure dependencies. They
  consume geometry, footprint and seed rather than the material name.
  For recovered wall rows/corners, `footprint` is a target specification relative
  to the version-1 reference `{ width: .5, height: .4375, depth: .1 }`: changing it
  scales native row/column spacing, random variation, corner occupancy and seam
  units before generation. Actual edge/corner pieces remain fitted and varied.
  The reference preserves the recovered default bytes; it does not promise every
  brick is a box of those exact dimensions. Shared wall seams use the symmetric
  mean of their owners' unit scales. Generic grids use direct metric pitches;
  parallel strips, foundations, platforms and enclosures scale their rule's
  characteristic spans from the same reference. Building outlines/elevations
  remain geometry parameters. An explicit wall seed overrides its source seed
  without changing topology identity.
  Gothic roof strips also consume the host roof's target dimensions and explicit
  seed before subdivision, overlap and thickness are generated. Their authored
  arch/body transform and opening stay fixed; `seed: "source"` retains the native
  position-derived tile random stream. The default specification preserves the
  native tile packing within the existing browser-math tolerance.
- Units own immutable meshes/materials and compact ABI adapters. Tile, brick and
  wooden-plank roof variants derive from the same logical arrangement.
- Overrides select stable binding + metric UV regions. They never persist vertex
  indices or transient fragment IDs. Parent hiding propagates to closure cells.
- Wall connections are automatically derived from source shapes and shared hole
  ownership. They are rebuilt with construction; no manual connection setup is
  needed for the admitted circle/circle, circle/rectangle and rectangle/rectangle
  cases. Connections and masonry consume the same published height profile:
  `topY/maxY` retains eave height, `top[]` supplies sampled gable height, and
  `maxYGable` supplies the original theoretical upper bound.
- Bound wall stitches and flat/pitched merlons enter the same editable placement
  plans as their owner surfaces. Native alternating brick ownership and selected
  timber ownership are retained; inter-roof pieces belong to the flat roof.
  Wall edit anchors use perimeter arclength and height above the published minimum
  ground; roof anchors use the flat roof chart. An edit affects pieces owned by
  that binding, not every piece touching either participant. Default variants keep
  the native packed records. Replacements and UV visibility use unified selection;
  coarse geometry consumes the same ownership and batches by owner/binding/material.
  Legacy examples without wall bindings retain their static wall/connection draws.

The author asset lives in project storage at `World/Masonry.json`, type
`MasonryAuthoring`. `MasonrySession` serializes prepare → durable save → activation.
Failed preparation or saving preserves the accepted scene. Project publication
serializes patches against the latest package and rejects stale full snapshots,
so an unrelated planning/editor save cannot overwrite the masonry asset.

## Building decoration API

The Seed World Agent registers the PlannedMasonrySystem component extension in
`PlannedMasonryComponentEditor.ts`. Its generated Editor declaration and
`planned-masonry-components.md` describe property edits, shared preflight and
application, persistence and independent ground lamps. The old
`PlannedMasonryAgent.ts` adapter is used only by standalone fixtures.

Use `decorationCatalog` for descriptions, hosts, ranks and dimensions;
`listComponents`/`inspectComponent` for identities and accepted configurations;
`editBuilding`/`editDecoration` for property changes, or `preflight` and
`applyComponents` for one atomic final-state batch. The catalog
currently includes Cottage, Gothic, arrow-slit and corner windows; independent
and eave-crossing roof windows; Cottage/Gothic doors; an open arch;
Cottage/Gothic flat-roof hatches; and wall/roof lanterns. These are explicit
assembly types, not a door/window merging or style-cycling policy.

Omitting `type` selects the host default: a wall window, a pitched-roof dormer,
or a flat-roof hatch. Explicit types are honored or rejected. The caller chooses
whether “another style” means another window, a door or an opening. A change of
host must supply that host's coordinates (`u` on the whole wall perimeter,
`uv` on the roof); resetting `type` asks for the new default.

`preflight` reports placement issues and available numeric constraints; it does
not reserve a position. `apply` revalidates against the latest state in a serial,
one-building transaction. A rejected batch does not partially save. Updates
keep the attachment ID and unspecified author fields; `reset` removes explicit
optional values. The command is persisted immediately and is not rolled back by
a later failure in an unrelated general editor script.

For color, use `woodColor` for timber and `lightColor`/`lightIntensity` for lamps;
there is no generic decoration `color` field. `frameMaterial` choices come from
the catalog; `wall` follows the selected type's host-material path. Material
replacement and local wall/roof edits remain owned by the existing construction
bindings and overrides. Original model/material UVs remain separate from those
editing coordinates.

`tests/decoration-author-runtime.html?matrix=1&rank=1` exercises the real command
and three explicitly selected render representations; add `shape=circle` for a
circular host. `type=dormer-cottage&closeup=1` limits the matrix to a close-up of
that assembly, using generated attachment bounds for framing. The matrix is not
an automatic-LOD or full-scene performance test. Seed World itself was separately
checked with its actual registered tool and production camera-driven scheduler;
original-game pixel parity is not implied by these integration checks.

## Runtime API and generation

```ts
const next = await prepareMasonry(document, {
  engine, parent, camera, signal,
  terrain: () => publishedTerrainSource // required for host_terrain
});
await saveAuthorDocument(document);
next.commit();
previous?.destroy();
```

The caller owns the returned handle. Preparation is invisible; teardown cancels
pending Workers and releases owned renderer resources. Material changes with an
unchanged resolved rule, and local-region changes, reuse resident geometry. With
`rule: auto`, changing material can select a different arrangement and rebuild
the affected group. Host placement or terrain-revision changes
rebuild the contact profiles; original-environment placement can reuse geometry.
Structural changes build another candidate on the same Engine before activation.
Full structural rebuilds allocate/upload new scene-owned instance and feedback
buffers. Immutable GPU templates and textures are shared by reference-counted
leases on that Engine; static fetch bytes and shader programs are also cached.

The order is source normalization → published wall profiles → automatic wall
connections/holes → masonry/corners/plaster → Gothic placement and roof pieces →
dormer bins → roof domains and logical rows/closures → unit packing → GPU load.
`ConstructionCompiler.ts`, `ConstructionLayout.ts` and
`ConstructionRenderPackage.ts` own these boundaries. `SurfaceProjector.js` owns
framework editing charts; those charts are not claimed to be Tiny Glade internals.

`EngineResidentScene.ts` submits Engine MeshRenderer/BufferMesh draws and uses the
host camera. The original shader deformation and clipping consume compact GPU
records. `EngineRoofFeedback.ts` uses the engine implementation from
[PR #3071](https://github.com/galacean/engine/pull/3071), pinned to
`d8c9b3d32efd824953797d204fb1485103b55716`. Its `readBinding.buffer` is directly bound
to subsequent rendering. Normal execution contains no GPU state, vertex, depth
or pixel readback. The preserved 60-step initialization is the recovered fixture
timeline, not evidence that Tiny Glade waits 60 frames to show a house.

Original BC7 textures are uploaded compressed when the Engine reports the actual
internal-format capability. BC4 currently uses its decoded fallback because the
Engine has no BC4 TextureFormat. All texture uploads go through Engine APIs.
The adapter removes duplicate output gamma conversion and accounts for Engine
render-target Y orientation in shader derivatives. It does not rewrite the
original material algorithm to match a screenshot.

## Verification and measured scope

Decoration integration regressions use the shared Gallery Vitest configuration
so their TS and JSON imports follow the production Vite module pipeline. From
the repository root, after selecting the pinned Node toolchain:

```sh
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run --config demos/terrain/project-tests/vitest.config.ts demos/terrain/project-tests/DecorationLighting.spec.ts demos/terrain/project-tests/CottageDoorProducer.spec.ts
```

This checks light selection/fading, emitter translation/off, shader injection and
native door placement/editing. It is not a rendered image or GPU performance gate.

The standalone sine regression runs from this directory with Node 24:

```sh
node --experimental-transform-types --test tests/recovered-sine.test.mjs
```

The architecture migration is complete. Current generation, editing and persistence
use the flat building-part pipeline; see [parts/README.md](parts/README.md).
Historical dev/2.0 execution snapshots, adapter tests and comparison browser pages
have been retired. The following numerical/pixel figures describe historical
verification, not an available old-runtime mode.

The four semantic comparisons cover 90 dynamic buffers. Counts, ordering, IDs,
flags, half values, wall/connection/plaster buffers and roof material variants are
exact. Accepted floating differences are confined to named float lanes (observed
Gothic position maximum 3.58e-7 m); the gate allows 1e-5 only in those lanes.
The earlier 35-case roof suite has 19,005 instances and a maximum 1.90735e-6 m.

The 24 Engine/offline pixel comparisons at 256×256 have zero alpha differences.
Mean absolute channel error is 0.0128–0.0349 on a 0–255 scale, maximum 14. Small
roof-shading differences remain; this is not pixel-bit identity. Full-page Seed
checks cover material replacement, local hiding, structural regeneration and
saved-project reload. Source intent and overrides survive both regeneration and
reload; the final page is restored to the original example appearance.

The circle/circle and gable additions pass 46 further full-scene buffer checks,
with 44 exact and only existing Gothic float lanes differing by at most 8.95e-8 m.
Circle connections separately pass 14 original cases including the intersect →
separate → restore sequence. Four gable dimension/rotation/height cases match
original wall bricks and plaster exactly, as do the four prior level-wall cases.
The offline gable oracle explicitly dispatches the original roof-change message
to the wall-height publisher; the earlier capture that omitted this dispatch is
retained as invalid gable evidence, not used as a golden.

Twelve additional 256×256 pixel comparisons (two scenes × three materials ×
full/local) have zero alpha differences, mean channel error 0.0130–0.0295/255 and
maximum channel error 15. Live Seed checks cover both templates, material and
local edits, a circle-radius or gable-height rebuild, and persisted reload with
the offline oracle service stopped. Warm full preparation was 0.56–0.77 s;
material/local preparation was 1.8–4.4 ms. These are masonry timings, not complete
Seed terrain startup or GPU completion timings. Reports are retained in the
local investigation's `resident-migration/topology-ts` directory.

On this machine, observed Worker generation is about 0.37–0.64 s in the recorded
runs. A live Seed height edit prepared in 0.73 s; saved-project restoration took
0.81 s for masonry alone. These are observed warm development runs, not a cold
network-load budget or the whole terrain startup. A material edit took ~3.4 ms
preparation + 1.8 ms resolution/upload, with 7,620 uploaded bytes. Full resident
GPU upload is about 28.5 MB. Metrics measure CPU submission, not GPU completion.

## Explicit limits

Seed World now supplies its published final R16 height field through
`ConstructionTerrainSource` (revision, samples, resolution, world origin/size and
decode). `host_terrain` regenerates wall/connection bottom profiles in TS using
world XZ after placement/yaw. Support profiles and roof/connection geometry use
world Y, without Tiny Glade's scene-specific sea-floor clamps. The renderer root
has Y=0. Each wall owns a separate layout frame at its sampled minimum minus one
meter; brick noise and plaster UVs use that frame, while positions, clip heights
and patch bounds are translated back to world Y. A distant building cannot change
an existing wall's datum or rows. Changes to that wall's own terrain can regenerate
its arrangement; this is an explicit host adaptation, not native translation parity.
`placement.position[1]` remains retained author data, not a floating-height offset.
The bundled `original_cottage_terrain` remains an explicit offline comparison mode
and retains the recovered constants/arrangement.

The Seed Session reconciles a rigid placement/yaw edit against the accepted view's
published supports before preparation and persistence. It shares the mean eave
movement across the group and solves each authored wall height, retaining relative
eave differences. Only those author heights/placement are saved, never supports.
Explicit simultaneous structural/height edits are used as authored; terrain refresh
rebuilds derived state without changing heights. The native UI's unknown height
clamps are not guessed: a move requiring nonpositive height rejects atomically.
This currently covers grounded material-0 groups, not elevated/wood-wall policies.

The current stone-wall family follows the recovered ordinary wall/brick/plaster
bottom profile. Tiny Glade's separate `maintain_stone_foundation` branch requires
wooden walls (material 1); that family is not implemented here. No extra cylindrical
base is inserted underneath stone walls. Original sampling density is retained;
very sharp/high-frequency terrain can exceed its approximation, and arbitrary
cliffs or collision-free placement against other scene objects are not guaranteed.

Terrain revision or horizontal placement/yaw changes invalidate resident geometry.
Material/local edits reuse it when the resolved arrangement is unchanged. Seed refreshes after final terrain publication, not
each animated terrain-transition frame. Refresh reads the latest accepted author
inside the session queue, does not persist derived geometry, and retains the old
scene on candidate failure. Existing saved original-environment works change only
through the explicit “适应当前地形” action; new imports/template drafts use host terrain.

Current terrain-support coverage lives in the Building* project tests and the
masonry tests (`node world/gallery/demos/terrain/seed-world-planner/masonry/tests/run.mjs`).
The architecture-migration comparison harnesses and temporary reports have been retired.
CPU profile contact diagnostics measure sampled/interpolated boundaries, not GPU mesh watertightness.

Circle/circle intersections cover crossing, tangency, containment and separation.
Coincident circles, including different phases, take the geometric no-crossing
branch instead of evaluating the original nonfinite intersection. Internal
tangency and containment are accepted without inventing crossing seams. These
degenerate-case guards are host corrections, not new native-parity claims.
Default material-0 gable walls are derived from roof parameters, including brick
rows, corner caps and plaster clipping. Whole-scene gable verification covers
profile=1, ridge=1, eave=.2, axis=0, zero tip and edge mode, with dimension,
rotation and height edits. That whole-scene gable corpus does not establish
overhang or the complete half-timber gable family, arbitrary path/arch profiles,
or all flat-plaster hole branches. The rectangular horizontal wood-wall producer
described below and explicit `opening-arch` decorations have separate production
paths and tests; they are not evidence that the entire native half-timber family
has been ported. Door, window, frame, wall-lamp and lantern assets have host
attachments; other original decorator families are not implied by those assets.
Rectangular roofs accept the recovered profile
parameter combinations, not arbitrary profiles. Their guards remain explicit.
Wall and roof bindings expose `auto`, `overlap_rows`, `staggered_rows`, `grid`,
`horizontal_rows` and `parallel_rows`, with nonperiodic `surface_uv` overrides. `auto` selects the
material default; an explicit rule remains selected after material replacement.
`horizontal_rows` on rectangular walls uses the recovered horizontal wood80/gable96
producer for wooden planks, including decoration SDF cuts, host intersections,
target unit dimensions, and persistent author-chart edits. Other materials keep
the selected horizontal arrangement through the generic placement path. Circular
walls use generic horizontal placement; this does not claim the original curved
wood producer. The existing `parallel_rows` rule remains vertical, and the current
`auto` wooden-plank default remains `parallel_rows` pending curved-host coverage.
`posts_and_rails` requires an enclosure strip. Recovered roof-edge/Gothic/junction
assemblies keep their specialized construction rules and inherit their owner's
material, target dimensions and local-edit ownership; they are not independently
selectable arrangement bindings in author data. This does not complete every
generic arrangement rule from the investigation laboratory.

Focused migration typechecking and comparison/UI tests pass. The whole terrain
workspace gate is not claimed: existing missing Engine/shader-compiler declaration
outputs prevent that broad check in the current materialization. See
[ACCEPTANCE.md](ACCEPTANCE.md) for the earlier laboratory evidence; current migration
reports retain their own input/output hashes and browser measurements.

## Seed World planned buildings

Seed World now translates each planned building OBB into the same construction
source, rule binding and material-unit runtime. The OBB remains layout intent and
identity; it is no longer the normal rendered building. Rectangle/round-house
selection, yaw, dimensions and native seeds are deterministic. Potentially touching
houses compile together for the existing connection kernels. `ConstructionBuilding.seed`
keeps a house's procedural identity stable when grouping changes.

Roofless `kind: "wall" | "fence"` sources use strip geometry. Courtyard walls use
`staggered_rows`; fences use `posts_and_rails`, with upright posts and rails following
the sampled terrain endpoints. These are host-framework enclosure rules, not a
claim that the original Tiny Glade fence algorithm was recovered. The original
brick/wood/tile units and the common material/UV override resolver are reused.

`PlannedMasonryWorld` first publishes support-surface meshes for every house,
then prepares requested groups in a serial Worker queue. There is no four-building
limit. `MasonryLodPolicy.ts` requests three levels from projected building/unit
size, with separate entry/exit thresholds. `MasonryLodTransition.ts` supplies the
same ordered-coverage transition mechanism used by the tree LOD integration.
Visibility and prefetch do not discard resident geometry on camera turns.
Inactive resources remain for up to 45 seconds, subject to the 128 MiB inactive
cache and 256 MiB scene-owned detail budgets; full-detail selection additionally
budgets two million triangles above medium detail, including outgoing fades.
These are scheduling budgets, not a whole-scene memory or frame-time guarantee.
Near/mid representations retain material units; far support surfaces retain
material patterns, owner edits, Gothic shapes and attached decorations, while
omitting individual unit bevel geometry. Immutable GPU resources use shared leases;
retiring one group cannot destroy another group's resources. Construction
uses no GPU-to-CPU audit readback. Interactive framebuffer picking remains separate.
Structural segment/capsule queries use generated support triangles rather than the
old OBB, and do not promise brick-level or Gothic-level collision fidelity.

`World/PlannedMasonry.json` stores sparse per-seed material, rule, building-parameter,
roof-mode and UV author changes, keyed by stable source/binding IDs. Layout and
generated buffers are not duplicated.
Edits prepare, persist, then publish; failed saves preserve the accepted scene.
The existing independent `World/Masonry.json` example is untouched. Seed publishes
its final terrain immediately while planned buildings exist, rather than animating
the terrain under fixed house foundations. This changes the regeneration transition,
not the final terrain/layout.

Run the focused Seed tests via `masonry/tests/run.mjs` as documented there. The
browser fixture at `shared/tiny-glade/tests/planned-world-runtime.html` exercises
actual Engine/Worker generation, coarse and fine picking, wall/fence materials,
local masks, save failure and saved reload. Its reported frame intervals are
observations of the test browser, not an isolated full-scene FPS benchmark.

Planned support surfaces use a dedicated PBR shader (`Masonry/SupportSurface`),
with shadows, fog and selection/picking, and no metric-debug grid or placeholder
texture. Far surfaces use simplified material patterns and support geometry.
Transient Worker-module/resource loading failures are retried by the serial near
queue with a shared 2–30 second exponential backoff. Generator errors are not
retried indefinitely. Current errors clear on successful recovery; cumulative
failure counts remain observable. A stopped local dev server must be restored
before module workers or uncached assets can load. The browser acceptance fixture
now exercises three eviction/re-entry cycles and offers a loading-recovery test
button; intentionally block its Worker module on the test server, then restore it
to verify automatic recovery without losing author edits.


### Brick material-unit LOD (2026-10-16)

`EngineResidentScene` selects each brick's representation from the recovered wall64 instance basis and camera projection. The native threshold is a projected bounding-radius metric of 30 (render height clamped 1080–2160); the host uses a complementary ordered-coverage band from 26 to 34. This is independent of the whole-building near/mid decision; the existing retained residency and coarse-shell transition remain in place. Forced `setLod(0|1)` is available for diagnostics. Normal operation uses `setLodStates`.

Full bricks retain the original 300-triangle mesh. Low bricks use the original half-cube's 18 indices (6 triangles), native deformation and three SDF steps, per-pixel bevel classification, normal cube and corrected hit depth. WebGL uses an explicit 0–7 vertex attribute (a non-instanced vertex input is required), independent zero-based compact instance lists, a 2D array with explicit z interpolation, and conventional Engine depth. GPU output is not read back. CPU only partitions existing source instances and uploads changed lists/coverage; unchanged camera/selection skips repartitioning.

The VFS library owns the SDF programs, proxy indices and content-addressed texture; runtime reads no module URL. The shared 24,448-byte immutable template contains a 16³ field and 16/8/4 normal cube levels. `tools/export-brick-sdf.py --assets assets/original --out <evidence-dir> --webgl-out <evidence-dir>/webgl` rebuilds it offline from the original brick mesh; there is no Python or native-function replay in runtime. The reconstruction uses closest-triangle signed distance instead of the original mesh_to_sdf propagation and is not asserted byte-identical to a native runtime capture. Normal levels are ray-cast independently, as in the recovered producer. WebGL padding mips are never sampled. `export-brick-sdf-programs.py` regenerates the native GLSL adapter, including roof-domain and local-cell clipping at the actual hit. Pass that result and the reconstructed binary to `tests/export-construction-assets.py --sdf-programs <programs.json> --sdf-template <digest.bin>` when importing a v2 library. The v1 library format is retired; no runtime fallback is provided.

Material LOD is representation-specific: verified Tiny Glade roof tiles use 30→12 triangles, wooden planks 296→12 (76-triangle special straight plank), while foundations use surface height tracing. They must not be replaced indiscriminately by brick SDF proxies. The old 36/148-triangle brick simplifications and their exporter dependency were removed. Roof/wood original mesh LODs remain.

Validation entries: `tests/brick-sdf-shader.html`, `tests/brick-lod-appearance.html`, `tests/masonry-lod-runtime.html`. The appearance fixture displays forced low as a stress diagnostic, but gates the actual screen-selected result against full detail at the identical camera; close-up forced low outside its intended screen range is not the acceptance target.


2026-10-16 CR 目标规格补齐：平台/坡顶交接的垛口由平台 roof binding 的 footprint 和 seed 驱动。宽度控制原生随机分段，厚度控制构件厚度，高度仅在既有垛口包络内细分；因此目标规格不是精确成品尺寸，也不会改变接触候选与洞口。默认参数经 17 组原生捕获对照，最大实例差约 1.97e-6 米；保留排列顺序及整数元数据。半规格的实际近/粗模材质、局部修改和恢复验收通过，正常渲染零读回；不代表全场景性能或完整 CR 已通过。


保留实验室发布回归：`node world/gallery/demos/masonry-lab/tests/publication.test.mjs` 检查真实页面处理器的异步提交资格；`python3 world/gallery/shared/tiny-glade/tests/lab-publication-http.py --provider <retained-surface-layout> --assets <resident-package>` 用真实本地 provider 和全新临时 Store 检查 HTTP 发布版本。后者不运行原函数回放、不修改已有项目。几何缓存 digest 与发布 revision 分离，材料/局部修改同样推进发布版本；前后端需一起更新。

## Placement responsibilities (2026-10-20)

The framework contract is **geometry + material unit + arrangement rule**. Native
kernels and shaders are implementation references, not the owner of this API.
For flat decks and their boundary bands:

- `ConstructionFlatRoof` derives the metric surface, boundary curves, hard corners,
  contact-hole chart and installation frames. It defines the physical band and wall-height datum; it does not subdivide
  rows or alternate occupied boundary slots. The default course rule retains
  the supporting wall's height phase instead of restarting at the deck.
- `SurfacePlacement.placeSurfaceUnits({ geometry, unit, rule })` arranges rows on a
  queried surface. `BoundaryPlacement.placeBoundaryUnits({ geometry, unit, bands,
  seed })` binds rules to boundary bands. Neither algorithm depends on a building
  kind or a renderer. `MaterialPlacementDefaults` owns target-unit boundary presets.
- `PlacementSupport` is the shared placement/support representation. Near rendering
  and LOD receive the same cells; neither invents another distribution. Geometry
  adapters retain existing metric UVs, identity and clipping relationships.

`MasonryBinding.rule.type` selects the deck rule. Optional `rule.boundary` selects
**the upper boundary band** independently; the lower band remains continuous.
The flat deck and bands currently share their binding's material, footprint and
seed. The standalone boundary kernel accepts its own material specification; this
is not yet a separate per-band material picker in the Seed World editor.

```ts
await world.edit(roofBindingId, {
  boundaryRule: { type: "continuous", pitch: 0.69, jitter: 0.05 }
});
await world.edit(roofBindingId, {
  boundaryRule: { type: "alternating", pitch: 0.82, jitter: 0.03 }
});
await world.edit(roofBindingId, { boundaryRule: null }); // restore material preset
```

`pitch` is the target slot length in metres; closure/hard corners fit the actual
spacing. `jitter` is nonnegative metre perturbation, clamped by the recovered
split kernel to preserve order. `alternating` fits an even slot count and leaves
even slots empty. Explicit rules survive material replacement, local edits,
JSON save/load and switching away from/back to flat-roof mode. They are inactive
on a pitched roof or when its rim is disabled. `world.list()` returns the explicit
`boundaryRule` or null; invalid values and non-roof edit targets fail the transaction.
Raw author JSON stores this under `binding.rule.boundary`; Seed World author state
stores it under `boundary_rules` and derives the binding on regeneration.

Default stone decks now use the original irregular stone-floor height, normal,
seed and roughness fields through `ConstructionStoneFloor*`; explicit surface
rules still place individual units. Default boundary bands use the recovered
mode-1 random-course kernel through `BoundaryCourses` and `BoundaryPlacement`.
The arrangement emits source seed, thickness and four-corner deformation;
`UnitPacking` retains those fields for brick rendering. Other units consume the
same placements. Explicit upper rules leave lower courses unchanged.

The flat parapet's structural faces retain the stable semantic boxes. Its visual
faces use the same UV chart with four-corner offsets, so changing material cannot
publish a false structural change. Plaster edge erosion uses the actual roof
height datum, independently of the randomized brick rows. The shared native
field, rather than a fixed low-row height, controls its ragged upper edge.

Original mode-1 encoder inputs have byte-for-byte fixture coverage; geometry
mounting, hard-corner clipping, target-size adaptation and scene lighting remain
host responsibilities, not a claim of full Tiny Glade scene/pixel equivalence.


### VFS decoration preset export

After importing the base library, run from the repository root:

```sh
node world/gallery/shared/tiny-glade/tests/export-decoration-assets.mjs
```

This offline command materializes recovered stone decorations, stone frames and wood opening
programs/templates/bytes into `assets/original/library.json` and its content-addressed Buffer
files. It verifies every emitted digest and byte length. `BuiltinConstructionLibrary` installs
these assets in VFS. Both fine and coarse renderers consume that explicit library unchanged;
there is no runtime merge or module-byte fallback. Runtime instance/cut-list packing remains
in `runtime/DecorationWoodCutAssets.ts`; the preset builders live under `offline/`.
Other decoration mesh catalogs and example terrain still have module consumers and are not
claimed migrated by this stage.
