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

## Seed-generated topology

`runtime-atomic-mountain-13` uses seed-generated topology and atomic meshes.
`src/mountain-network.mjs` uses a seed-local random stream at runtime, before
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
slivers. No post-carve displacement or surface repair is added.

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

Use **Surface comparison** to see the previous straight `solid-carving-4` cuts beside
`fracture-controls-6` on the same highest mass. Both panels share the same transform,
camera, framing, lighting and untextured clay. Each renders alone, so neither
casts shadows onto the other. The comparison stacks below 540 px. Entering it
preserves the viewing angle; choosing Low angle or Side first gives the matching
paired view. The straight-cut construction retains its historical comparison
behavior; both sides now use the same newly generated atomic mesh for this seed.

Use **Rock finish** in an assembly view to compare stone, clay and original
geometry. **Rock close-up** frames the highest mass. Stone and fractured clay
share the same carved mesh and fitted assembly. Original clay refits the same
independent target using the runtime atomic meshes. Changing finish keeps the orbit angles.

### Fracture controls

**Depth**, **Width**, and **Irregularity** range from 0% to 200% and update when
the slider is released. All three at 100% exactly reproduce the preceding
`irregular-fractures-5` geometry and render attributes on the 12 historical fixtures.
Depth scales the inward incision; width scales the V opening, so its visible
aperture also grows with depth. Irregularity scales lateral bends and depth
variation. Zero irregularity gives straight tapered paths. Zero depth or width
removes the joints while retaining the broad face cuts.

In **Surface comparison**, the controls update only the right-hand rock. The
reference, selected prototype, placement and viewing angle stay fixed while
tuning; only one mesh is rebuilt. Assembly views rebuild the library and refit
the masses against the adjusted surface. They may take several seconds to update.
Obsolete mesh buffers are disposed instead of retaining every slider combination.
Controls are disabled for Original clay and noise-field views. Settings are saved
with the seed, height and orbit within the current entry's saved-state revision.

### Carving contract

The earlier displacement method could create fins even while preserving winding:
its per-vertex backoff factors introduced discontinuities in the intended cut.
The active generator now constructs the surface by solid subtraction. It does not
run displacement, local backoff, smoothing, spike removal, or an artifact-repair
pass. The comparison also uses solid subtraction; the old displacement function
has been removed.

1. Define six broad plane cutters and five continuous fracture cutters in a
   normalized rock frame. Broad planes run through the foot and crown so their
   stopping points cannot create collars or plinths. They preserve the original
   summit point. Flat platform slabs omit the broad plane cuts to protect their
   walking surface. Each fracture sweeps one unequal V profile along six stations
   with uneven heights, lateral bends and depth changes. Depth changes also vary
   the opening width. The two side angles differ but stay constant along that
   fracture, which makes every wall panel planar. Adjacent panels share their
   complete section edges; there are no interior end caps. Their ends taper out
   just beyond the broad face at independently seeded heights, avoiding square
   slot ends. Lateral variation is scaled to the rock's physical aspect ratio;
   all cuts leave a central core. Platform cutters exit outside the source body
   below the protected cap.
2. Subtract those closed solids from the actual upstream mesh. The fracture
   sweeps may be non-convex, but every cutter polygon is convex and planar. The BSP
   implementation in `src/solid-carve.mjs` follows
   [Evan Wallace's CSG algorithm](https://evanw.github.io/csg.js/docs/); its MIT
   notice is included. Intersections create new edge vertices. Surviving source
   polygons remain on their source planes; exposed cutter polygons provide the
   new fracture faces. No existing vertex is pushed and then partly restored.
3. Share intersection points across both incident polygon boundaries before
   triangulation. This constructs a conforming closed mesh without moving its
   surfaces. Each triangle retains either its original triangle ID or cutter
   plane ID, allowing independent geometric checks of the construction.
4. Keep each new cut face's render normal on its plane, including internal
   triangulation edges. Original surface regions use 30-degree crease normals.
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
