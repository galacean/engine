# Rock ridge arrangement study

This standalone study arranges baked upstream atomic rocks around an independent,
seeded 3D ridge network. The default Perlin mode extracts that network from a
coarse noise field; the previous seeded graph remains available for comparison.
It includes curved cliffs, an uphill bend, an offshore
vista, mountain peaks, walkable shelf geometry, and riverbank groups. The cliff,
island and mountain scenes use the procedural ridge fitter.

Open `index.html` through a local HTTP server. The checked-in page is ready to run;
it uses pinned Three.js 0.160.0 from jsDelivr. No Engine build or package install is
needed for the study. Fractured stone, fractured clay and the original clay meshes
can be compared. This is a standalone surface study; Seed materials and runtime
navigation are not integrated.

The entry preview opens the complete offshore island at seed **425**, **145%**
height, in low-angle clay. It applies the current solid fracturing to every rock
with **120% depth, 140% width, and 130% irregularity**, using the original Perlin
field settings (frequency 4, five octaves, lacunarity 2, persistence 0.85).
All arrangement and fracture controls remain available. The entry has a separate
saved-state revision so the older demo's saved view cannot replace this requested
starting scene; changes made in this revision persist normally.

For individual shape controls, open [Atomic rock controls](atomic-controls/index.html).
Its 27 parameter choices run the upstream single-rock generator and compare source/reduced
meshes. Choose one parameter at a time or enable combined edits.

For the sandstone photograph target, open [Procedural sandstone processing](sandstone-study/index.html).
It cuts a clean upstream atomic mesh into broad buttresses, open vertical joints,
uneven bed breaks and localized chips. Compare all five stages in clay or sandstone,
change the seed and dimensions, and replay the versioned recipe. See the
[pipeline and reproduction commands](sandstone-study/README.md).

```sh
# From the repository root
python3 -m http.server 8771 --bind 127.0.0.1 --directory world/demos/rock-ridge-study
# Open http://127.0.0.1:8771/

# Regenerate the page and run the geometry checks
node world/demos/rock-ridge-study/build.mjs
node world/demos/rock-ridge-study/src/verify-ridges.mjs
node world/demos/rock-ridge-study/src/verify-perlin.mjs
node world/demos/rock-ridge-study/src/verify-surfaces.mjs
node world/demos/rock-ridge-study/src/verify-fracture-controls.mjs
```

## Current fitter

`ridge-fracture-controls-11` generates the full network before reading any rock geometry.
Shared XYZ junctions connect continuous curves with procedural peaks and saddles.
The blue lines show that exact input; orange lines sample the actual mesh surface
at the same X/Z positions. Orange is not an extraction of every mesh crest.

The fitter grows a connected body outward from the dominant peak, using structural
footprints at least 12 m long. It moves, rotates, scales and replaces whole masses,
then prunes redundant pieces. Soft curve bands let the meshes retain their shape:
1.8 m for cliffs, 2.8 m for islands and 3.2 m for mountains at 100% height. These are
dead zones in the objective, not guaranteed maximum errors. The search also scores
the surface between branches and penalizes excess volume and piece count.

Small rocks have a separate budget of two, are no taller than 3 m at 100% height,
and are grounded near low edges. There is no small-rock ridge-fill or summit-stack
pass. All accepted pieces overlap the connected body in sampled solid mesh volume.
Independent ray checks verify the stored contact witnesses.

For seed 382:

The counts below describe the **Seeded graph** mode retained from version 4.

| Scene | Previous pieces | Structural masses | Small rocks |
| --- | ---: | ---: | ---: |
| Curved cliff | 80 | 9 | 2 |
| Offshore vista | 105 | 9 | 2 |
| Mountain peaks | 119 | 14 | 2 |

Height scales the full scene from 25% to 200%. Seed changes regenerate the network;
orbit, preset views and target/surface overlays remain interactive. Camera state
echoes no longer reset the view at drag end. The earlier isolated camera-state
checks passed; native drag automation did not establish gesture-level proof.

## Perlin ridge prototype

The viewer opens the current island comparison at seed 425, height 100%, frequency
4, three octaves, lacunarity 2 and persistence 0.85. The generator's regression
baseline remains seed 18 with persistence 0.5. Use **Ridge source** to compare with
the earlier generator, and **Surface**
to switch between fitted rocks, the coarse field, and the field with fine detail.
Open **Noise controls** to change the four noise parameters. Height continues to
scale the entire field, target curves and rock assembly from 25% to 200%.

`src/perlin-ridges.mjs` ports the lab's seeded gradient noise and octave phase
logic, then adds an extraction stage that the lab did not contain:

1. Sample a masked 65 × 49 field in world X/Z. The noise domain is 100 m; the
   masks follow each scene's footprint, including the curved cliff band.
2. Use only wavelengths of at least 24 m for structure. Ascending paths assign
   cells to local maxima. The highest pass between each pair of adjacent basins
   supplies a candidate saddle connection.
3. Build a maximum-pass spanning tree. Keep up to four major peaks by prominence
   and 12 m separation, then retain the connecting subtree. Smaller transit peaks
   needed by those connections can remain. Trace outward descending spurs on the
   same coarse field; do not invent branches from a camera silhouette.
4. Collapse ordinary degree-two cells, smooth and simplify the paths, and save
   shared XYZ nodes with peak/saddle/junction/tail roles. Cubic curves interpolate
   every retained node. Monotone Hermite height interpolation preserves extrema;
   intermediate bends do not become rock anchors. Smoothing can depart slightly
   from the sampled field between nodes.
5. Fit the existing broad connected masses to the graph and its width envelope.
   Long extracted edges offer intermediate candidate positions at 8 m intervals
   so large pieces can grow continuously toward distant nodes. Candidate spacing
   does not set rock size; every accepted structural footprint is still >=12 m.
   Finer octaves add at most 1.2 m of amplitude-weighted surface variation before
   height scaling, fading to zero on the target curves. They cannot spawn graph
   nodes or a small-rock repair pass. Small rocks retain their separate budget of
   two and structural pieces remain at least 12 m long.

At frequency 4, only the first octave is structural: increasing octaves adds
detail while preserving identical XYZ curves. At frequency 2 and lacunarity 2,
the first two octaves are structural; changing from one to two can move peaks and
saddles. The control summary shows the wavelength and the split. Frequency is
limited to 1–4 cycles per 100 m so the base layer stays above the structural
cutoff. A seed with only one significant peak has descending spurs and no invented
saddle. Parameter changes regenerate topology; this prototype has no node-drag
editor or manual edit preservation yet.

For default Perlin seed 18 at 100% height with **Original clay**:

| Scene | Structural masses | Small rocks | Ridge edges |
| --- | ---: | ---: | ---: |
| Curved cliff | 3 | 2 | 16 |
| Offshore vista | 9 | 2 | 5 |
| Mountain peaks | 11 | 2 | 9 |

The differing edge and rock counts are intentional: several short ridge edges
can guide one large mass. The source field is an authoring reference; pruned hills
and the full source surface are not all reproduced by the ridge envelope.

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
paired view. The previous meshes and render normals match commit `e788d6e5a`
exactly across all 12 prototypes.

Use **Rock finish** in an assembly view to compare stone, clay and original
geometry. **Rock close-up** frames the highest mass. Stone and fractured clay
share the same carved mesh and fitted assembly. Original clay refits the same
independent target using the baked meshes. Changing finish keeps the orbit angles.

### Fracture controls

**Depth**, **Width**, and **Irregularity** range from 0% to 200% and update when
the slider is released. All three at 100% exactly reproduce the preceding
`irregular-fractures-5` geometry and render attributes across all 12 prototypes.
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

### Verification and limits

The surface suite checks all 12 prototypes and eight fitted assemblies, including
island seed 425 with both three and five octaves, mountain seed 416, the long cliff
connection at seed 19, and the earlier seeded graph. It checks closed, consistently
wound topology; nonzero triangles after Float32 conversion; retained source-plane
geometry; exact cutter-plane faces and render normals; varied exposed fracture
wall directions; no exposed cutter end caps or back faces; the original summit and bottom heights;
unchanged platform caps; identical rendered/measured positions; deterministic
replay; connected mass contacts; target independence; and height transforms.
All 2,500 samples across the 3 m platform route retain their original height.
See [surface-validation.json](evidence/surface-validation.json).

The control suite checks 120 meshes: both disabled-joint settings and the eight
combinations of 10%/200% depth, 10%/200% width, and 0%/200% irregularity across
the 12 prototypes. It verifies closed, connected, consistently wound solids,
nonzero GPU triangles, no exposed end caps, retained summits and platform caps.
Separate checks confirm that depth and width change actual removed volume,
irregularity changes geometry, defaults restore correctly, and replay is
deterministic. See [fracture-controls-validation.json](evidence/fracture-controls-validation.json).

The direction regression remains a check on non-platform steep faces. Short
platform-side cuts have protected tops and proportionally large termination
regions, so their contour orientation is recorded but not used as a cliff-style
vertical-direction acceptance test. Planarity and topology are checked for every
prototype, including platform slabs. These checks prove construction properties,
not geological realism or overall artistic quality.

Browser review covered the matched island and uphill-path clay comparisons at
736 px, the stacked comparison at 320 px, and island seed 425 at 100% and 145%
height with three octaves and 0.85 persistence. The reviewed cuts have uneven
planar turns and tapered ends without the earlier triangular fins. The final
browser session reported no JavaScript or shader errors. Native orbit gestures
were not revalidated in this revision.

Control review also exercised zero irregularity, combined 150% depth / 60% width /
180% irregularity, persistence after reload, and the resulting full island refit.
The comparison retained its left-hand reference and framing during slider changes.
The controls fit at 736 px and stack at 320 px; the final session had no console
errors. The tuned island contains 11 structural masses, no small accents and 21
sampled contact edges; its sampled fit RMS is 2.04 m.

The current library has 14,772–37,864 triangles per prototype. Generating its twelve
carved meshes took 7.7 seconds in the recorded local Node check; the viewer
caches them. It has no production LOD or performance acceptance. This is a
floating-point BSP prototype validated on the twelve closed upstream meshes, not
a certified robust Boolean kernel for arbitrary degenerate input.

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

### What the existing ridge graph does

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

## Verification and limits

- The noise port matches 36 numeric fixtures generated directly from the lab's
  current `PerlinNoise.ts`. Its source hash is recorded in
  [perlin-lab-fixtures.json](evidence/perlin-lab-fixtures.json).
- The new Perlin suite checks 15 default assemblies (five seeds across three
  scenes), four mountain control extremes, and one long-edge cliff regression.
  It verifies field-derived maxima,
  shared noncoplanar connected curves, monotone C1 interpolation, source/target
  immutability, exact replay, octave separation, height scaling, shoreline bounds,
  broad mass scale and independently ray-checked mesh contact witnesses.
  The 15 default assemblies use 3–17 structural masses and 1–2 small rocks.
  Worst RMS deviation is 2.144 m; a local deviation reaches 6.371 m at 100% height.
  These are measured prototype residuals, not guarantees over every seed or
  parameter combination. See [perlin-validation.json](evidence/perlin-validation.json).
- The ridge fitter passed 20 categories of checks over 15 assemblies: five seeds
  each for cliff, island and mountain. Each has one connected body, 7–21 structural
  masses and at most two small rocks. Seed 382 input curves exactly match the
  preceding demo's stored baseline. Height transforms were checked at 25/130/200%.
- The independent dense fit check samples at 0.15 m. The worst RMS error is
  2.3023 m; local deviations reach 7.1277 m at 100% height. Five seeds do not prove
  every seed or a continuous error bound. See [ridge-validation.json](evidence/ridge-validation.json).
- The lab's current noise, cell-normalization and landform suites passed 63 tests
  across three files. In the saved build, the stacked mountain with geographic
  features disabled rendered successfully at two and five octaves, retaining a
  175.49 m peak through per-OBB calibration.
- Enabling the feature graph in the inspected mountain setups produced
  `Could not retain a boundary vertex in its heightfield cell`. The saved combined
  path therefore needs repair/revalidation before adoption. This assessment did
  not repair the separate lab checkout.
- The Perlin update was visually checked at 736 and 320 px, including cliff,
  island and mountain masses, both source-field views, octave/frequency edits,
  seed regeneration, height changes and the earlier generator comparison.
  At 320 px the controls had no horizontal overflow. No runtime JavaScript
  errors were observed. Native drag automation again did not establish an orbit
  gesture, so gesture-level acceptance remains unverified.
  Numerical overlap witnesses do not establish physical
  stability. The rocks remain overlapping independent meshes, without Boolean
  union, collision integration or navigation acceptance.

`geometry.json` contains 12 baked meshes from `galacean/engine`, branch
`codex/procedural-rock-example`, commit
`b2887feee34df433303d1c3197a679e4c219367d`. The parameters and mesh statistics are
embedded with each prototype. Rebuilding this study consumes those checked-in
meshes; it does not require the upstream atomic generator. The standalone shell
was exported from the inline visualization and is retained as a local template,
so rebuilding the demo does not depend on a Codex installation.
