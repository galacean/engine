# Procedural mountain peaks

The main demo now generates **mountain peaks only**. Curved cliffs, paths, offshore
islands, platforms and riverside arrangements have been removed from its source
and controls. The atomic controls and sandstone studies remain separate tools.

Open `index.html` through a local HTTP server. Three.js and the original atomic
rock textures load from pinned jsDelivr URLs; no Engine build is required.

```sh
python3 -m http.server 8771 --bind 127.0.0.1 --directory world/demos/rock-ridge-study
# Open http://127.0.0.1:8771/

# Rebuild only the mountain demo
node world/demos/rock-ridge-study/build.mjs
# Mountain topology, persistence, geometry, Perlin and carved-surface checks
npm run test:mountain --prefix world/demos/rock-ridge-study
```

The entry defaults are seed **480**, **100%** height, **Seeded graph**, plan view,
**140% depth / 160% width / 180% irregularity**, and **Atomic rock texture · triplanar**.
Saved states from the former island entry migrate to mountains while retaining
seed, height, authoring mode, material, fractures, view and orbit. State echoes
and seed changes preserve orbit angles. The live count lists target summits,
terminal spurs, fitted masses and small rocks.

## Independent arrangement and shaping features

The demo has two independent switches. Both default to enabled, preserving the
existing mountain. Switching a feature off retains its settings for re-enabling.
Material, texture and camera remain presentation choices.

| Arrangement | Shaping / carving | Result |
| --- | --- | --- |
| On | On | Carved atomic masses fitted to the mountain ridge network |
| On | Off | Original seeded atomic masses fitted to that network |
| Off | On | Eight carved atomic variants shown separately for inspection |
| Off | Off | Eight original seeded atomic variants shown separately |

The inspection view uses a neutral grid with no ridge extraction, mountain
fitting or terrain. The same runtime seed generates the input atomic meshes in
all four combinations; disabling shaping bypasses surface processing, not seeded
source generation. Legacy **Original clay** states migrate to shaping disabled.

Implementation ownership follows those two features:

- `src/features/shaping/`: seed-generated recipes and atomic mesh source,
  vertical fracture definitions, Boolean carving and crease attributes.
- `src/features/arrangement/`: seeded topology, Perlin ridge extraction, mass
  fitting, scene construction and the inspection bypass.
- `src/features/pipeline.mjs`: generic stage composition; it contains no
  carving, ridge, material or view-specific decisions.
- `src/features/settings.mjs`: feature flag defaults and legacy compatibility.
- `src/runtime-rocks.mjs`: the default composition and compatibility exports.
  Previous root module paths remain re-export shims for existing consumers.

Each stage implements `{id, run(request, result, cache), bypass(request, result,
cache)}`. It owns its settings interpretation, enabled behavior, disabled behavior
and cache; it returns the next result without mutating the previous stage's
inputs. `createRuntimeMountainBuilder({source, stages})` accepts a different
source or ordered stage list. A new surface operation can be supplied through
`createShapingFeature({carve})`; a new layout strategy through
`createArrangementFeature({arrange, inspect})`. Register a new stage in the
composition to introduce another operation without editing the coordinator or
the other feature's implementation. The scene and mesh library contracts form
the boundary between the two groups.

The current atomic source and carved library are cached independently of the
arrangement. Arrangement retains two recent scenes so switching between shaped
and original meshes can reuse fitted results. Disabled feature parameters do not
invoke that feature. Cache keys survive the worker's structured message cloning.

`node world/demos/rock-ridge-study/src/verify-feature-pipelines.mjs` checks all four
combinations, exact full mesh/scene hashes against the pre-refactor seed-482
baseline, cache reuse across toggles and cloned worker requests, disabled edits,
seed invalidation, legacy flags and a separately registered extension stage.

## Seed-generated topology

`runtime-atomic-mountain-13` uses seed-generated topology and atomic meshes.
`src/features/arrangement/mountain-network.mjs` uses a seed-local random stream at runtime, before
reading any atomic mesh:

1. Choose 1–5 requested summits and 3–6 requested descending spurs. Place a dominant
   summit, then grow additional summits in available X/Z space. Every accepted
   summit chooses a nearby existing parent; the result can form a chain or fork.
   Summit spacing is at least 17 m. Counts can be reduced if space is exhausted.
2. Connect each summit pair with a shared saddle whose location and elevation are
   also seeded. A one-summit network has no fabricated saddle or secondary peak.
3. Grow descending spurs into open sectors. Their attachment, direction and length
   vary with the seed. Some have a shoulder; some descend directly to a tail.
4. Optionally split up to two shoulders into additional descending branches.
   Shared nodes have identical XYZ coordinates. Every edge is a continuous cubic
   curve; peaks and saddles are actual height extrema along their summit links.

There is no stored ridge layout, fixed main axis, alternating branch pattern, or
mandatory saddle→secondary peak→tail sequence. Size limits, spacing, slope profiles
and rejection criteria are explicit generation rules, not a library of layouts.
The supporting ground and footprint remain fixed inputs. Changing the mountain
seed regenerates topology, atomic recipes, atomic meshes, fracture seeds and fitting.

**Main peaks** (1–5) and **Side ridges** (3–8) control the summit and total terminal
spur counts, including forked spurs. Moving either slider switches off **Seed
controls counts** and keeps those counts across seed changes. Re-enable the
checkbox to let the seed choose counts again; the sliders then display the
generated counts. Summit links through saddles are additional network edges, not
side ridges. Manual counts use a more compact spatial search when necessary;
placement still rejects intersecting or crowded candidates. The status shows
actual accepted counts if a requested count cannot fit. These controls apply to
**Seeded graph**; Perlin mode derives its counts from the field and hides them.

**Show layout** draws the exact procedural target in blue. Orange measures the
assembled mesh surface at the same X/Z coordinates; it is not an extraction of
every exposed crest. Spheres mark peaks and diamonds mark saddles. Height scales
ground, target, rock geometry and measurements together from 25% to 200%.

## Runtime atomic recipes

`src/runtime-rocks.mjs` replaces the old `bake.mjs` recipe table. Each seed creates
eight atomic variants using the upstream `buildRock` and `simplifyRock` kernel
already vendored for the atomic controls study. Dimensions, profiles, top slope,
outline, wear, wall parameters and each mesh's own seed vary continuously within
the fitting roles' ranges. `peak`, `shoulder`, `cliff` and `bank` are role handles,
not stored rock shapes. Resolution remains 24 and the simplifier targets 1,000
triangles per base mesh. The original export's 0.1 mm position grid is retained
before carving to avoid nearly coplanar Float32 input noise producing tiny BSP
slivers. GPU-indistinguishable intersections are welded, and collapsed fan edges
are removed only when connectivity and all incident planes are preserved.

Topology and atomic recipes use independent deterministic streams. Editing counts
reuses the current seed's atoms; changing the seed rebuilds them. Carving and mass
fitting run in a Web Worker, with one running job and only the latest pending edit.
The current mountain stays visible until the replacement is ready. If the host
blocks workers, the same generator runs on the main thread and can briefly block
interaction. Both paths produce the same data and have no baked fallback.

The live build embeds the kernel and supporting ground, not an atomic mesh library.
`src/geometry.json` is retained only as a historical regression fixture for the
previous carving and fitting tests. The original thread-local `bake.mjs` now serves
only as an optional diagnostic export of `generateRuntimeRocks(seed)`; the viewer
does not load its output.

## Fracture runtime optimization — 2026-11-12

`bsp-runtime-optimization-1` preserves the existing cutter definitions, arithmetic
tolerances, polygon order and triangulation. It adds conservative polygon bounds
to reject wholly separated plane tests, skips empty BSP branches, delays split
arrays until a polygon actually crosses a plane, accumulates tree traversal
results without repeated array concatenation, and uses numeric spatial-cell maps
and scalar vector math in welding and boundary stitching.

All 70 before/after cases reproduce positions, indices, face tags, normals, surface
attributes and irregular fracture paths exactly. The rendered crease attributes
also match on all eight seed-482 meshes. Existing checks cover 120 control extremes,
closed/wound GPU meshes, continuous cutter walls without exposed end caps, sharp
planar cut normals, and connected fitted assemblies. The frozen reference in
`src/fixtures/solid-carve-before.mjs` comes from commit `1326a3fd5` and is used only
for tests and timings; it is never bundled into the demo. See
[exact geometry parity](evidence/carve-optimization-parity.json).

The demo now shows the last build's carving and fitting time. Count edits report
**Carving cached**; height edits do not rebuild the carved library. The readout
measures CPU generation phases, excluding worker transfer, GPU buffers, texture
loading and drawing. The single-rock comparison hides this assembly readout.

Reproduce the quality checks and run the timing comparison separately from other
CPU-heavy work:

```sh
npm run test:fractures --prefix world/demos/rock-ridge-study
npm run benchmark:fractures --prefix world/demos/rock-ridge-study
```

The benchmark warms both complete paths, then runs three alternating-order paired
trials with fresh atomic meshes and empty fracture caches. It asserts identical
geometry and fitted mountains for every pair. See the settings, source hashes and
individual trials in [performance evidence](evidence/fracture-performance.json).

On this machine (Node 20.18.1, macOS arm64), seed 482 with 130% depth, 160% width,
180% irregularity and the Perlin field at 100% height measured:

| CPU phase | Before median | After median | Speedup |
| --- | ---: | ---: | ---: |
| Carve eight unique meshes | 6.407 s | 2.434 s | 2.63× |
| Generate, carve and fit the mountain | 9.087 s | 5.496 s | 1.65× |

Carving ranges were 6.402–6.558 s before and 2.178–2.502 s after. The eight meshes
retain exactly 169,198 triangles; the speedup does not reduce mesh detail or alter
fracture shape. Browser transfer and rendering remain additional costs.
The browser check at the same settings verified clay and triplanar views, live
timing, cached reuse and depth edits; no JavaScript errors were recorded. Its
single uncached carving observation was 1.409 s, recorded separately from the
paired Node comparison in [browser evidence](evidence/carve-optimization-browser.json).

## Connected mass fitting

The fitter grows outward from the dominant summit, then refits and prunes whole
masses. Structural footprints remain at least 12 m long, with a budget of 30.
A 3.2 m soft curve band at 100% height permits local shape differences; this is a
loss dead zone, not a maximum error guarantee. The surface between ridges also
participates in fitting. At most two small accents occupy low edges; there is no
small-rock ridge-fill or summit-stack pass.

Accepted pieces overlap in sampled solid mesh volume. Independent ray checks
verify contact witnesses. The resulting mountain is a connected assembly of
intersecting meshes; Boolean union, collision integration and navigation acceptance
are outside this study.

## Perlin authoring

**Ridge source → Perlin field** retains the lab-derived alternative. It extracts
maxima and connecting saddle passes from a masked coarse field, rather than using
the directly grown network. **Surface** compares the fitted rocks, coarse field,
and detailed field; the existing frequency, octave, lacunarity and persistence
controls remain available.

Only wavelengths of at least 24 m determine structural topology. Watershed basins,
maximum connecting passes and prominence pruning retain up to four major peaks;
additional transit peaks can remain when needed for connectivity. The graph is
simplified into shared XYZ nodes and monotone cubic paths. Smaller octaves add
bounded surface variation, fade out at ridge constraints, and cannot spawn small
ridge-filling rocks. At frequency 4, increasing octaves changes detail while
preserving the structural network. The dated lab assessment below records the
source and limits of this port.

## Atomic generator texture projection

The texture source is the **new atomic rock generator**,
`galacean/engine` branch `codex/procedural-rock-example`, commit
`b2887feee34df433303d1c3197a679e4c219367d`. Both the standalone page and inline
preview load its original **1024×1024** maps from commit-pinned jsDelivr URLs:

- `world/demos/procedural-rock/assets/marble_cliff_05_disp_1k.png` is used as sRGB
  grayscale base color, just as upstream. It does not displace geometry.
  SHA-256: `ff42aabd9538c79e6b433b4669c855f4101a7661faf2c2905cb011a1fd3c59ef`.
- `world/demos/procedural-rock/assets/marble_cliff_05_nor_gl_1k.png` is the linear
  OpenGL normal map. SHA-256:
  `d15777107c9c5da1382e6e64635898ab67615cf1b970f5f8ee577a081a4adbf3`.

The upstream credits [Marble Cliff 05](https://polyhaven.com/a/marble_cliff_05)
by Amal Kumar / Poly Haven under [CC0](https://polyhaven.com/license).
The shader port is covered by the upstream Galacean MIT license.

`src/atomic-rock-material.mjs` ports the generator's `RockSurfaceColor.glsl` and
`Projection.glsl`: signed world-space YZ/XZ/XY projections, fourth-power normal
weights, luminance base color, and surface-gradient blending of the normal map.
The original defaults are retained: **#b8bcc2 tint**, **0.35 normal strength**,
**roughness 1**, and a repeat of **half each rock's longest fitted OBB dimension**.
The maps are shared; each rock gets its own repeat uniform. World normals use the
inverse transpose for nonuniform scale, and the blended detail normal is transformed
back to view space for Three.js lighting. The maps use repeat wrapping, trilinear
mipmaps and up to 4× anisotropy. Fracture faces need no UVs, and mesh positions,
geometry generation and fitting are unchanged by the material.

## Fractured slab surface study — 2026-11-11

The visual reference is [Modular Cliff Rock Slab](https://www.cgtrader.com/3d-models/exterior/landscape/modular-cliff-rock-slab-game-ready-asset).
Its preview emphasizes broad angular faces, long joints, uneven stepped breaks,
chipped edges and fine grain. The listing describes a sculpted and textured asset.
This study interprets those features procedurally on the existing atomic meshes;
it does not contain the seller's mesh, textures or sculpt data and does not reproduce
the reference exactly. The original rounded outline still influences the result.

Use **Before / after shaping** to compare the base atomic mesh with the current
shaping result. Both panels share transform, camera, framing, lighting and clay
shading, and render separately so neither casts shadows onto the other. The
comparison stacks below 540 px and preserves orbit. Both meshes come from the
worker pipeline; the viewer performs no hidden comparison carving. Disabling
shaping shows the base mesh in both panels.

**Rock finish** selects texture, procedural stone or clay independently of the
feature switches. **Rock close-up** frames the highest mass, or the first atomic
variant when arrangement is disabled. Changing finish keeps the orbit angles.

### Fracture controls

**Depth**, **Width**, and **Irregularity** range from 0% to 200% and update when
the slider is released. `independent-fracture-depth-8` separates penetration from
aperture: depth moves the inner tip, while the V-wall slope compensates inversely
for depth. Width scales the aperture without moving the tip. A seeded width
profile still varies along the fracture; unequal wall angles and lateral bends
keep it irregular. Each wall retains one slope along the sweep so all panels
remain planar, with no internal end caps or twisted ledges.

The aperture is referenced to the sampled source skin. Its actual intersection
with a curved face can drift slightly as depth changes; it no longer scales
with depth. At seed 487, width 80%, irregularity 180%, the first peak fracture at
its third station measured:

| Depth | Old mouth width | New mouth width | Inward penetration |
| --- | ---: | ---: | ---: |
| 40% | 0.02744 | 0.06766 | 0.04548 |
| 130% | 0.08920 | 0.06879 | 0.14782 |
| 200% | 0.13722 | 0.06901 | 0.22741 |

Units are normalized radial coordinates, measured from the actual mesh triangles
and source/cut seams. Fivefold penetration changes the opening by 2.0% in this
sample, versus fivefold previously. Regression tests also measure all five joints
on the peak, cliff and shoulder, and check that width changes leave penetration
unchanged. See `SeedWorldFractureDimensions.spec.ts` and
[measurements](evidence/fracture-dimensions.json). The original atomic silhouette,
sharp planar walls and independently adjustable normal smoothing are retained.

Irregularity scales lateral bends and the seeded width/depth profile. Zero
irregularity gives straight lateral paths with tapered ends. Zero depth or width
returns the exact rounded atomic body without any cuts.

In **Before / after shaping**, controls update the pipeline's carved library.
With arrangement enabled, the fitter then places the updated meshes; with it
disabled, the library can be inspected directly. Carving and fitting may take
several seconds on uncached settings. Obsolete mesh buffers are disposed instead
of retaining every slider combination. Shaping controls are hidden when shaping
is off and disabled in noise-field views. Feature switches and parameters are
saved with seed, height and orbit.

### Carving contract

The earlier displacement method could create fins even while preserving winding:
its per-vertex backoff factors introduced discontinuities in the intended cut.
The active generator now constructs the surface by solid subtraction. It does not
run displacement, local backoff, geometric smoothing, or spike removal. The comparison also uses solid subtraction; the old displacement function
has been removed.

1. Define five continuous fracture cutters in a normalized rock frame. The live
   generator retains the rounded atomic body; six whole-body plane cutters belong
   only to the historical comparison. Each fracture sweeps one unequal V profile
   along six stations with uneven heights, lateral bends and a seeded aperture
   profile. The depth slider moves the inner tips and compensates the wall slopes
   to keep the mouth approximately fixed. Side angles differ but stay constant
   along each fracture, making every wall panel planar. Adjacent panels share
   complete section edges with no interior end caps. End rings exit outside the
   source body at seeded heights; platform cuts exit below the protected cap.
   Lateral variation follows physical aspect ratio, and cuts reserve a solid core.
2. Subtract those closed solids from the actual upstream mesh. The fracture
   sweeps may be non-convex, but every cutter polygon is convex and planar. The BSP
   implementation in `src/features/shaping/solid-carve.mjs` follows
   [Evan Wallace's CSG algorithm](https://evanw.github.io/csg.js/docs/); its MIT
   notice is included. Intersections create new edge vertices. Surviving source
   polygons remain on their source planes; exposed cutter polygons provide the
   new fracture faces. No existing vertex is pushed and then partly restored.
3. Share intersection points across both incident polygon boundaries before
   triangulation. This constructs a conforming closed mesh without moving its
   surfaces. Float32-coincident intersections are welded; degenerate fan edges
   collapse only when the manifold link condition and all incident plane tags are
   preserved. Native reduction cancels opposite, zero-volume triangle pairs
   before compaction. Each triangle retains its source or cutter plane identity.
4. Keep each new cut face's render normal on its plane, including internal
   triangulation edges. Original regions interpolate the upstream smooth normals;
   the independent fracture-normal control blends only normals, never positions.
   Fitting and rendering consume identical triangle positions. Stone shading
   adds fine grain and joint tone, but does not deform the mesh.
5. Refit the connected rock assembly against the carved surfaces, including solid
   overlap witnesses and the measured orange guide. The procedural target is
   independent of the cutters. Height scales the entire result consistently.

## Verification

- 200 seeds reproduce exactly and form connected trees with shared XYZ junctions.
  They produce all five summit counts, 3–8 terminal spurs, 0–2 forks, and 148
  distinct degree/role signatures. This checks topology variation rather than
  coordinate jitter alone. See [topology evidence](evidence/mountain-topology-validation.json).
- 210 manual count combinations across seven seeds reach the requested 1–5 main
  peaks and 3–8 side ridges and replay exactly. Automatic counts ignore old slider
  values. A further 400 crowded cases cover 1 or 5 peaks with 8 side ridges.
  Persistence checks include manual counts, and job-queue checks cover
  stale results, stale failures, cancellation and rapid edits.
- Runtime mesh and assembly checks are separate from the historical fixture tests
  below; see [runtime evidence](evidence/runtime-rock-validation.json). The live
  scene payload is checked to contain no baked atomic meshes. Seeds regenerate
  each variant, same-seed buffers replay exactly, and count edits reuse atoms.
  Thirty-two base meshes across four seeds and sixteen carved meshes across two
  seeds pass closed-solid and GPU-triangle checks. Four runtime assemblies pass
  independent contact witnesses, mass budgets, replay and height scaling. Their
  worst RMS deviation is 2.694 m; one narrow fracture gives a local under-target
  residual of 12.956 m, so the soft fitting band is not a per-point bound.
- Seven historical original-mesh assemblies (seeds 0, 42, 334, 382, 464, 465, and 4294967295)
  pass finite/bounded geometry, independent contact witnesses, sparse accent and
  structural-size budgets, exact replay, dense surface measurement, height
  scaling, and a local branch-height response check. Worst RMS deviation is
  2.457 m at 100% height. See [ridge evidence](evidence/ridge-validation.json).
- The retained Perlin path passes five mountain assemblies, four control extremes
  and 36 numeric fixtures from the lab. Its worst sampled RMS deviation is
  2.144 m. See [Perlin evidence](evidence/perlin-validation.json).
- The carved-surface suite checks twelve prototypes and five mountain assemblies:
  closed, wound solids; finite GPU triangles; cutter-plane faces and normals;
  preserved source planes, summit/bottom heights and flat caps; independent mesh
  contacts; target independence; and height scaling. Worst sampled RMS deviation
  is 2.676 m at 100% height. See [surface evidence](evidence/surface-validation.json).
- Persistence tests execute the viewer's real state handlers, checking migration
  from a saved island, retained material/fracture/noise settings, seed rebuilds,
  and post-drag state echoes without camera resets.
- The runtime browser review confirmed worker generation, 3/4 and 5/8 manual
  counts, seed changes with manual counts retained, automatic count selection,
  and saved counts restored on reload. Seeds 480 and 481 produced different mesh
  fingerprints matching Node; count edits kept the fingerprint unchanged. No
  browser JavaScript errors were recorded. See [browser evidence](evidence/runtime-browser-validation.json).
- The preceding revision's browser review at 200% height and 140%/160%/180% fracture settings confirmed
  seed 464 changes from one summit to five at seed 465. Textured and clay views,
  oblique and plan views, restored state, and the Perlin coarse-field view rendered
  without JavaScript or shader errors. Native drag gestures were not revalidated.

These samples do not establish a bound for every seed or artistic realism. The
carved library remains a floating-point BSP prototype without production LOD or
performance acceptance. The earlier 120-case fracture-control validation is
preserved in [fracture-controls-validation.json](evidence/fracture-controls-validation.json);
fracture cutter construction itself is unchanged in this revision. Runtime mesh
sampling checks selected seeds, not all possible recipes or slider combinations.

## Perlin lab assessment — 2026-11-09

Inspected the existing `codex/rockform-shaping-studies` worktree at
`28bdc6a96cf276711af14a2e9088a87525e75c0f`, including its local experiments. Relevant
source files matched the materialized TypeScript copies used for focused tests.
The saved browser build is dated 2026-11-04; equality between its bundled JavaScript
and today's dirty source was not established. Exact source hashes and observed
results are in [lab-analysis.json](evidence/lab-analysis.json).

The lab is a useful reference for noise authoring and shared-node editing. Its
current field/curve contracts need adaptation for independent 3D ridge targets.

### Reuse these parts

- `perlin-heightmap/PerlinNoise.ts`: seeded gradient noise, stable octave offsets,
  amplitude normalization and a resolution-independent sampling function. Octave
  `i` has frequency `baseFrequency * lacunarity^i` and weight `persistence^i`.
- `obb-heightfield/AlgorithmControls.ts`: separate seed, frequency, octaves,
  lacunarity, persistence, amplitude, falloff and normalization controls. Edits
  preserve existing seeded phases rather than rerolling the terrain.
- `obb-heightfield/PerlinHeightfield.ts`: one shared noise field, independent OBB
  masks and height calibration, plus cache reuse. Calibration preserves each
  cell's maximum height, not the location of its summit or a ridge connection.
- `obb-heightfield/LandformShapes.ts` and `LandformControls.ts`: saved shared node
  identities, branch relinking, explicit regeneration, editable width/sharpness
  and generation separated from evaluation.

The lab paths above are relative to
`world/gallery/demos/terrain/asset-assembly/` on that lab branch. Only the pure noise
algorithm has now been ported into this standalone study. The lab's OBB controls,
feature graph, triangulator and package engine are unchanged.

### What the inspected lab ridge graph did

`GeographicFeatureNode.position` is a two-component world X/Z coordinate. Each
ridge is a quadratic curve with one added-height value, width and sharpness.
`landformHeight()` adds that profile to an existing surface. Its seeded starter
derives an axis and dominant anchor from OBBs, then creates three ridge branches
sharing that anchor. It does not extract ridges from the Perlin field and does not
store explicit XYZ peak/saddle elevations or their continuity constraints.

The resulting surface and displayed lines are three-dimensional, but the saved
ridge is a 2D plan plus a terrain-relative uplift. That is the key contract gap
for this study's independent 3D target network.

### Authoring direction from the assessment

The prototype above implements coarse-field extraction, simplified XYZ curves,
bounded fine detail and mass fitting. Manual node editing, persistent topology
across regeneration, and dedicated bend/relief controls below remain future work.

1. Generate a coarse height field within the authored footprint, using a seed,
   broad feature wavelength, overall height and directional bias. Start with a
   small number of coarse octaves. Keep broad shape and fine detail separate.
2. Identify major peaks and saddle connections on that coarse field. Trace and
   simplify crest paths into a connected graph; remove insignificant branches
   using prominence and minimum spacing related to structural mass size. This
   extraction and pruning stage now exists in this study, not in the lab.
3. Save explicit XYZ nodes and continuous 3D curves, including peak/saddle roles,
   shared junctions, widths and allowed fitting deviation. Artists can edit or
   regenerate the graph without losing its identity on every slider adjustment.
4. Use bounded noise to vary horizontal bend and vertical relief. Apply one
   shared displacement at each junction and taper local perturbations around
   pinned peaks/saddles so branch endpoints remain coincident. Give bend and
   relief separate amplitudes. Fixed/world-space sampling avoids per-branch
   normalization changing junction heights.
5. Fit broad atomic masses to the graph and its width envelope. Higher-frequency
   noise belongs in surface variation and sparse detail; it must not cause the
   structural fitter to create a rock at each new local extremum.

A height field can supply XYZ crest paths extending across both horizontal axes;
it does not require fitting a silhouette in one viewing plane. It remains
single-valued in Y over X/Z, so caves and folded or stacked ridge targets require
a different source representation. The explicit graph can remain independent of
that source and can also be generated directly, as in the present demo.

### Controls to carry forward

| Lab control | Ridge authoring meaning |
| --- | --- |
| Base frequency | Broad bend/peak spacing; expose wavelength in metres |
| Octaves | Number of variation scales, not number of branches or rocks |
| Lacunarity | Wavelength ratio between successive scales |
| Persistence | Influence of smaller variations on the broad form |
| Height amplitude | Overall relief; separate from roughness strength |
| Seed | Deterministic initial variation; regenerate topology explicitly |
| Falloff/mask | Footprint and shoreline transition |

With the lab defaults of frequency 4, lacunarity 2 and five octaves, the layers
span 4, 8, 16, 32 and 64 cycles per logical domain. Across 100 m their nominal
wavelengths are 25, 12.5, 6.25, 3.125 and 1.5625 m. The finest scales are much
smaller than this fitter's 12 m minimum structural length. They should not become
independent structural ridge targets.

A probe of the actual lab generator at seed 18, fixed normalization and 257×257
samples found 8, 63 and 438 interior local maxima at one, three and five octaves
with persistence 0.5. Five octaves at persistence 0.8 produced 1,397. These are
strict eight-neighbor sample maxima, not geologically significant peaks or a
ridge extraction result; this one-seed comparison illustrates why scale filtering
is needed before building topology. The probe values are preserved in the evidence.
