# Rock ridge arrangement study

This standalone study arranges baked upstream atomic rocks around an independent,
seeded 3D ridge network. It includes curved cliffs, an uphill bend, an offshore
vista, mountain peaks, walkable shelf geometry, and riverbank groups. The cliff,
island and mountain scenes use the procedural ridge fitter.

Open `index.html` through a local HTTP server. The checked-in page is ready to run;
it uses pinned Three.js 0.160.0 from jsDelivr. No Engine build or package install is
needed for the study. The rendering is a clay comparison, not Seed materials or
runtime navigation.

```sh
# From the repository root
python3 -m http.server 8771 --bind 127.0.0.1 --directory world/demos/rock-ridge-study
# Open http://127.0.0.1:8771/

# Regenerate the page and run the geometry checks
node world/demos/rock-ridge-study/build.mjs
node world/demos/rock-ridge-study/src/verify-ridges.mjs
```

## Current fitter

`ridge-masses-4` generates the full network before reading any rock geometry.
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

| Scene | Previous pieces | Structural masses | Small rocks |
| --- | ---: | ---: | ---: |
| Curved cliff | 80 | 9 | 2 |
| Offshore vista | 105 | 9 | 2 |
| Mountain peaks | 119 | 14 | 2 |

Height scales the full scene from 25% to 200%. Seed changes regenerate the network;
orbit, preset views and target/surface overlays remain interactive. Camera state
echoes no longer reset the view at drag end. The earlier isolated camera-state
checks passed; native drag automation did not establish gesture-level proof.

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
`world/gallery/demos/terrain/asset-assembly/` on that lab branch. They have not been
copied into this study or integrated into the current package-based engine.

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

### Proposed ridge authoring flow

1. Generate a coarse height field within the authored footprint, using a seed,
   broad feature wavelength, overall height and directional bias. Start with a
   small number of coarse octaves. Keep broad shape and fine detail separate.
2. Identify major peaks and saddle connections on that coarse field. Trace and
   simplify crest paths into a connected graph; remove insignificant branches
   using prominence and minimum spacing related to structural mass size. This
   extraction and pruning stage is proposed work, not an existing lab capability.
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
- The updated demo was visually checked at 736 and 320 px, with live seed and
  height changes. Numerical overlap witnesses do not establish physical
  stability. The rocks remain overlapping independent meshes, without Boolean
  union, collision integration or navigation acceptance.

`geometry.json` contains 12 baked meshes from `galacean/engine`, branch
`codex/procedural-rock-example`, commit
`b2887feee34df433303d1c3197a679e4c219367d`. The parameters and mesh statistics are
embedded with each prototype. Rebuilding this study consumes those checked-in
meshes; it does not require the upstream atomic generator. The standalone shell
was exported from the inline visualization and is retained as a local template,
so rebuilding the demo does not depend on a Codex installation.
