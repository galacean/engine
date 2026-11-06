# Seed World rock formation

The native Seed World renderer projects a baked cellular network onto each OBB's
Random ascent or Perlin noise ascent mask, then applies vertex-defined slabs or
cellular curvature. Vertex-defined slabs with Original painted rock are the default.
Deformation code and the required network asset live in this package; authoring,
grounding and world integration live in `packages/world-planning/src/integrations/terrain/rock-formation`.

Open `/world/demos/seed-world/index.html?seed=1&debug=1`, click **生成 3D**,
then expand **05 Rocks / 岩石 → Rock formation / 岩石形态**. Labels, options and
buttons follow the native **English / 中文** format. Picking a rock selects its OBB.
Edits use `PlanningSession`, native project persistence and undo/redo.

## Configuration

- **Generation profile / 生成配置** is the native `world.rockGeneration` authoring
  component. Its default platform probability is **1**, selecting blunt
  platforms without Perlin peaks while retaining the rock facets and painted
  rock material. Lower probabilities still mix in peaks through independent
  sampling, not an exact population quota. Saved explicit probabilities remain
  authoritative; resetting the generation profile restores the current defaults.
  World Seed + stable OBB ID select the form; ordering, neighboring edits and
  dimensions do not reroll it. Changing the probability moves only OBBs whose
  stable sample crosses the threshold.
- Platforms use Random ascent, **1× the original height**, a **12 m/m**
  manual base slope, **0.2** slope variation and **0%** upper-height variation.
  Peaks retain **1× tier height**, Perlin ascent, automatic OBB-derived slopes,
  **0.8** slope variation and **0%** upper-height variation. These profile values
  are editable in the debug panel and through `PlanningSession`; no lab resource
  or generated recipe is saved.
- The height and slope defaults preserve the broad cap of the earlier 0.25×
  height / 3 m/m profile: multiplying both by four restores the source height
  without changing the slope's horizontal run. Explicit upper-height variation can
  still give each stone a faceted, nonuniform crown.
- Scattered landscape rocks inherit this profile in the authoring projection,
  before worker jobs, picking and collision consume their published volumes.
  Their stable landscape IDs select the shape. Initial generation, local profile
  edits, instance resets, scenery reveal and water-only ecology rebuilds all
  restore the same shape from the unscaled source height. Explicit `solid.height`
  values, including inherited values, remain authoritative.
- Tree-foot companion stones use the same profile, sampled by World Seed + stable
  instance ID. Each original stone family shares one platform and one peak mesh
  (eight meshes for the four current families), with no per-instance mesh build.
  Height multipliers apply once to the original source height; the placement
  footprint, contact plane, instance transforms, picking and LOD identities stay
  fixed. Streamed cells reproduce the same choices. Changing only the platform
  probability rebinds existing meshes, while individual OBB edits leave companion
  geometry untouched. Profile edits use the existing local publication transaction.
- Scattered landscape stones and tree-foot companions are bare rock: their jobs
  disable surface grass before generation, so neither green substrate coverage
  nor blade-support patches are produced. Main rock formations retain surface
  grass. The eligibility is included in worker cache identity; geometry, original
  height, painted stone detail and collision are independent of this choice.
- Profile heights always derive from the immutable unedited layout baseline.
  Explicit parent-solid height, per-OBB dimensions, height mode, surface, slope
  and top-height overrides (including inherited sources and explicit zero
  variation) win field by field. Reset restores the current profile; undo/redo
  and native authoring export replay the same choices without cumulative scaling.
- Global controls set the fallback surface, Perlin noise, slab deformation and
  cellular curvature. The default surface is **Vertex-defined slabs / 顶点定义岩层**,
  using the existing 28 m slab size, 0.65 coverage, 2 m depth and 0.85 variation.
  Its finer projected network and transported normals reduce the long vertical
  grooves on full-height small stones without lowering their height. Explicit
  cellular-curvature overrides remain available. Cell size defaults to 24 m, with inset 0.35, depth multiplier
  0.6 and detail multiplier 0.2 for larger, less fragmented faces.
- The shared default height mode is Random ascent; each OBB can override its surface, Random ascent / Perlin ascent height mode,
  slope and width/height/depth. Sibling settings and identities stay fixed.
- Automatic slope uses `2 × height / min(width, depth)` in m/m. Variation defaults
  to 0.2. Disable automatic mode to set a finite positive manual rate. Only authored
  overrides are saved; size-derived rates are recalculated after resize.
- **Upper height variation / 上层高度变化 (%)** is independently editable per OBB,
  with shared platform/peak fallbacks. The panel uses 0–100%; authoring and saved
  documents retain 0–1. Missing values default to 0%, while explicit values,
  including zero and inherited overrides, retain their meaning. It changes upper
  vertex heights without rerolling outlines, slope rates, seeds or neighboring
  OBBs. Reset/undo/redo and native project replay use the same authoring path.
- Shared painted-rock texture scale defaults to **60 m per repeat**. Saved positive
  values survive native Scene export/import. A texture-only edit updates material
  uniforms on main and companion rocks without regenerating geometry or grass.
  Vertex-defined slabs and cellular curvature share this texture, world-space
  projection and roughness, including mixed OBB formations and companion stones.
  Tree-foot companion stones and scattered landscape stones use a white multiplier (`#ffffff`). Slabs retain their transported surface normals; cellular
  faces retain their edge lighting and stable cell texture offsets. Grass roots
  sample the same textured substrate as the surface beneath them in both modes.
- The painted-rock PNG is grayscale with its original alpha and resolution retained.
  Its original sRGB pixels were decoded to linear light, converted to Rec. 709
  luminance, divided by the measured peak luminance to place its brightest texel
  at white, and encoded back to sRGB once in the asset. This removes the source
  texture's dark overall exposure while preserving relative linear luminance.
  Runtime sampling does not extract luminance, normalize exposure or fit an A/B ramp.
- **Shared material / 共用材质 → Rock Color / 岩石颜色** controls the main rock formations' linear RGB
  multiplier: `grayscale texture × Color`. The default is fitted to the original
  rocky_terrain pixels in linear RGB (displayed as **#96967a**). White shows the normalized light grayscale;
  darker Color values control overall albedo, and a colored value tints it directly. Rock grass retains its independent native palette.

Apply and reset use native authoring, save/replay and undo/redo. Color-only edits
update shared material uniforms with no rock, collider, building support or grass
regeneration. Retired seasonal A/B palette, balance, strength and saturation fields
are removed at native document import; absent channels inherit the source tint.

Reset removes the relevant authored overrides. Height grows upward from the
existing bottom; position, yaw and the root seed remain fixed. Every editable OBB
owns its generation domain and mesh, including OBBs in the same POI. Overlapping
rocks remain independently generated surfaces.

## Local publication and collision

`Jobs.ts` keys editable work by `rockObbId`, not POI membership, so resizing one
box cannot change a sibling's noise domain, sampling or worker cache key.
`Client.ts` generates geometry in a worker and reuses unchanged resident meshes,
even when they exceed the optional 64 MiB history cache. `Publication.ts` stages
the changed OBB, its collider, grass and dependent building supports as one
accepted update. The renderer continues running during local preparation.

Building support invalidation intersects changed old/new rock triangles with
rotated building footprints and foundation margins. `PlannedMasonryCollection`
coordinates affected component groups and prepares fallible bindings before any
live group is replaced. Unrelated rocks, building views, terrain, water, vegetation
and camera resources remain resident. Abort, stale ownership and failed preparation
release candidates and retain the published scene.

Walking uses the final indexed mesh through native PhysX mesh colliders. Generated
rock support samples also feed native building placement and navigation. PhysX
cooking for a replaced formation remains synchronous on the main thread; local
publication is not a guarantee of zero frame stalls.

## Grass on generated rocks

`GrassSurface.ts` computes a continuous coverage field in the worker from guide
slope and corner-angle-weighted final surface slopes. Every incident triangle
receives the same coverage at a shared vertex, so grass color blends across
edges instead of switching whole faces on or off. Physical blade placement
separately checks each final face's slope and root support; walls and undersides
remain ineligible, while suitable ledges can receive sparse grass. Coverage is
independent of painted rock color and does not change stone shading or geometry.

The runtime reuses Seed World's existing grass assets, instancing, materials,
wind, seasonal palette and resource ownership. Candidate roots use the asset's
basal footprint and test actual elevation, terrain burial, water, roads, bridges
and building footprints. Rock material ground cover shares the native grass
palette, including generated companion stones.

`GrassPatches.ts` tracks each formation by mesh identity. An individual OBB edit
replaces only that formation's patches and retains neighboring patches. After
publication, nearby 8 m patches populate cooperatively: at most eight attempts per
slice, a 2 ms CPU target, 512 instances per upload and two retired patches per
frame. Hiding retains buffers; leaving the retention range releases them.
Cancellation, disposal and upload errors have explicit cleanup paths.

The rock debug group includes coverage preview and counters for accepted clumps,
pending patches, changed/retained formations and peak CPU slice duration. These
are CPU diagnostics, not GPU timings. Trees, flowers and other local plants on
rock surfaces are not included. Resident rock grass still needs independent
invalidation when a later local water/terrain edit changes its exclusions.

## Runtime asset and limits

`assets/asymmetric.glb` is the required `asymmetric-baked/2` periodic network.
Its adjacent provenance file records its hash, topology and 0.09-unit joint
spacing. Runtime crops and projects the existing vertices; no offline generator,
asset library, lab entry point or experimental engine hook is required.
Cellular displacement is constrained before mixed-surface repair and normal
reconstruction. Rendering expands attributes while collision keeps the canonical
indexed mesh.

After either deformation, the retained mesh perimeter is buried 5 cm beneath
the native terrain. Contact uses the terrain's a--d triangles and checks grid
and diagonal crossings along each edge, so long edges cannot bridge a terrain
dip. Only perimeter Y values are lowered; X/Z, connectivity, OBB ownership and
interior vertices stay fixed. Final normals, grass support and collision consume
the corrected geometry.

Grounding does not lift the whole upper body above the highest terrain under its
footprint. The local foot offset fades quadratically to zero at the authored
crest and is capped by the height budget. Uphill terrain can therefore bury part
or all of a low rock. Normal surface relief still applies; the bound is on the
grounding guide, not an exact clip of every deformed vertex to the OBB.

Painted cellular faces retain flat interiors and blend continuously toward shared
area-weighted vertex normals and symmetric edge bisectors. Signed triangle
altitudes keep the blend width correct on stretched faces and small formations;
bounded world-space noise varies the width without creating inverted bands.
The shared normal field also spans grass/rock coverage transitions. This changes
shading metadata only; geometry, collision and grass support use the same mesh.

Rock shadow reception uses `ShadowReceiver.glsl` to compare each shadow-filter
sample against the actual triangle plane instead of one center depth. Derivatives
are taken in world space before applying a single cascade matrix, so neighboring
cascades cannot corrupt the slope estimate. A bounded texel-footprint allowance
handles hardware comparison filtering and Depth16 precision. The existing caster,
scene bias, filter weights, shadow strength/fade, cloud shadows and picking stay
on their native paths. This targets self-shadow banding; it does not change the
painted texture or cellular geometry.

The 65×65 mask, terrain contact and projected network remain sampled
approximations. Slab displacement is not an exact clip to the OBB union; fixed
topology does not create arbitrary caves or overhangs. Whole-scene initialization
and non-rock edits retain the native publication paths.

## Verification

Generated rock grass uses the production Grass shader. `shared/GrassSurfaceField.glsl`
owns near/far palette evaluation, `shared/SurfaceRelief.glsl` owns the baked normal
gradient, and `shared/RockGrassGround.glsl` evaluates the substrate for both rock
fragments and grass roots through GLSL includes. Attached roots use the rock's
visual coverage and interpolated smooth normal, never the terrain mask underneath it.
`TransitionCoverage.ts` averages incident corner coverage by triangle area on
the canonical mesh and caches it per immutable formation snapshot. Painted rock
vertices and sampled roots interpolate this same field. Placement and blade height
retain the original per-face suitability mask. Sparse fringe tips blend toward
the shared substrate colour so green tips do not detach from pale rock surfaces.
The existing 13-float instance record carries coverage, painted texture offset and
surface kind in its three surface-weight slots. A renderer macro distinguishes
these records from ordinary terrain and legacy surface grass, including pooled
batch reuse. Colour/texture-scale publication updates resident and future roots.
Fully covered roots skip stone sampling; edge roots borrow the existing rock
texture. No extra texture allocation, instance buffer or render pass is added.
Additional shader sampling is not a measured GPU performance improvement.

Focused terrain-project tests cover generation, native asset integrity, per-OBB
authoring, history, cache reuse, texture-only publication, final-mesh grass,
resource cleanup and transactional building supports. Terrain/Water typechecks
and the Seed World production build cover their native consumers. Current
validation and its browser/GPU boundary are recorded in `../V2_IMPLEMENTATION.md`.
`../../project-tests/SeedWorldRockShadow.browser.html` runs the production receiver
and original engine sampler against synthetic Depth16 shadow maps in WebGL2. It
checks sloped receivers, retained blocker shadows, cascade boundaries, shadow
strength/fade and finite grazing-angle results; it is not an exact-scene visual
reproduction.
The native `../../project-tests/SeedWorldCellularLighting.browser.html` regression
runs the production edge shader in WebGL2 with float readback to check seam
continuity, planar faces, shared vertices and coverage transitions.
`../../project-tests/SeedWorldRockColor.browser.html` checks the production color
shader, including source-hue removal, season transitions and A/B endpoints.

### Terrain contact shading (2026-10-30)

Rock material continuity now includes the actual Terrain contact, independently of meadow coverage and blade eligibility. `shared/TerrainHeightField.glsl` owns the existing Terrain height decode and baked geometry-normal lookup; `shared/RockTerrainContact.glsl` uses the same native single-alphamap surface evaluator as Seed's ground grass. Both rock fragments and attached grass roots call this one contact implementation. Height is sampled in the vertex stage, with signed clearance interpolated across rock triangles; no fragment height-map reads, additional textures, mesh attributes, instance stride, geometry or draw calls are introduced. The contact band fades over 0.85 metres above ground and blends ground colour, roughness, normal and snow response. The rock keeps its own appearance above that band, and unsupported slopes still cannot spawn blades. Terrain-owned textures remain borrowed and follow the existing material rebinding lifecycle.

The contact path is enabled for Seed's untextured single-map Terrain representation; unrelated textured/multiple-map configurations retain their previous shading. It uses interpolated vertex clearance rather than per-fragment terrain intersection, so sharply varying terrain inside a large rock triangle remains an approximation. Geometry and shadow receiver algorithms are unchanged. Runtime cost is four height fetches per participating vertex plus material/normal reads in the contact band (and attached-root evaluation); GPU/FPS cost has not been benchmarked.

### Terrestrial grass ownership

Terrestrial blades use the final Terrain surface at their root for the entire clump, including road and river-bed weights. Nearby rocks must not override this with raw rock pigment or a blade-height ramp: a tall blade above green terrain still belongs to green terrain. Rock-attached grass retains the shared rock contact evaluator. The face-contact exception below samples the final rock appearance rather than raw rock pigment.

### Rock-only blade termination (2026-10-30)

Terrestrial grass retains its original continuous coverage and dimensions: no neighbouring rock clearance index, instance buffer or shader collapse. Only attached rock grass tapers at the meadow edge, using `smoothstep(0.25, 0.7, min(physicalCoverage, substrateCoverage))`. This scales the whole clump to zero at low coverage while preserving dense interiors. Support checks use the original root radius and four probes, without a full-plant radius or extra 25 cm inset. These coverage thresholds are dimensionless, not a fixed world-space distance.

### Grass colour at actual rock contacts (2026-10-30)

`GrassRockAppearance.ts` assigns an optional nearby finite triangle to each ground/attached grass instance without changing transforms, candidate counts, density or support. It packs the world corners, shared meadow coverage, smooth normals, texture descriptor and rock-vertex terrain clearances. Clearances use the same bilinear R16 height field as the rock shader, not float geometry heights or blade height. The shared `GrassRockAppearance.glsl` projects each wind-deformed vertex onto that triangle and reuses `RockGrassGround.glsl` plus `RockTerrainContact.glsl` to obtain the final substrate colour, normal and snow response. Contact is full within 6 cm and fades out by 35 cm of the finite face. Ground elsewhere retains its root Terrain palette. Attached blades no longer restore a separate green tip colour over their supporting palette.

The per-clump triangle choice is a local approximation at corners/overlapping rocks, not a screen-space backdrop lookup or a full per-vertex mesh search. It does not remove physical intersections. Affected batches add seven vec4 attributes (112 bytes per instance, allocated to batch capacity), two varyings and vertex sampling; no new textures, draw calls or fragment texture reads are added by this path. CPU indexing/query and GPU frame costs are unmeasured. Rock edits, terrain rebinds/height changes, new batches and size changes refresh records; pooled rock batches disable the macro on retirement, and buffers are destroyed with batches. Refresh scheduling yields between batches after 2 ms; an individual batch may exceed this budget.
