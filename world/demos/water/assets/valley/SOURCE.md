# River Valley assets

Source: **Stylized Water 2 v1.7.0**, Staggart Creations, purchased locally by the project owner.
Scene: `Assets/StylizedWater2/_Demo/RiverDemo.unity`.
Original project: `/Users/xingyi/Documents/github_code/stylized-water-2-demo`.
These assets retain the source product's license and attribution; conversion does not relicense them.

Run from the repository root, with Unity 2021.3.45f1 and Python 3 + Pillow available:

```sh
node world/gallery/demos/water/scripts/export-river-valley.mjs \
  --source-project /Users/xingyi/Documents/github_code/stylized-water-2-demo \
  --reference-output /tmp/river-valley-reference
```

The command copies `Assets`, `Packages`, and `ProjectSettings` into a disposable project.
Only this copy changes Unity importer settings. `--unity-editor`, `--output`, and `--keep-project`
are available for another editor location, isolated reproducibility checks, and inspection.
Reference captures require graphics support; data export itself uses Unity batch mode without graphics.

`scene.json` records source paths/GUIDs/SHA-256 hashes, output checksums, original water material and
post-process parameters, coordinate conversion, scene transforms, and six monotonic height corrections.
The 30 original cross sections generate the runtime River; the embedded Unity water mesh is not rendered.
Height samples retain the native 1 m grid. The water query region is a grid-aligned crop with a 16 m margin;
the visible terrain corridor and the query crop use the same Water triangle interpolation.
The complete height array remains reference data; only the 5,068 cells listed in `terrain.cellIndices`
are rendered, instead of all 65,536 cells. The corridor follows the variable-width river and extends
10 m beyond each bank, rounded outward to native cells. Its exposed perimeter and underside are
closed with a 3 m thick visual section; this does not change the top surface or water queries.
No implicit terrain carving is applied.

`scenery.glb` contains the resolved rock/cliff/palm/shrub instances, mesh attributes, material slots and
masked foliage. Of the original 91 mesh renderers, 36 remain in the exported corridor. Vegetation pivots
must be within 8 m of a bank; rocks and cliffs remain whole when their world bounds contact the river
or its 2 m bank margin. Consequently some complete cliff silhouettes extend outside the terrain strip.
The manifest records these rules and the 55 removed instance IDs. The source has no additional active LOD levels.
Terrain grass uses the original 512×512 density map and prototype dimensions. Deterministic jitter
originally generated 39,681 clumps; the same 8 m vegetation margin retains 1,881 clumps, grouped into
16 m chunks. Removed instances, grass blades, and unused model/material payloads are excluded from GLB.
Unity does not serialize individual grass
transforms, so this preserves patch coverage rather than undocumented Unity random placement.
Crossed grass cards use a vertex-color root-darkening gradient to approximate the source grass shading.
`terrain-details.u16` retains the original density map. Texture conversion preserves alpha and limits
exported PNGs to 1024 pixels; source texture and material values remain recorded for later higher-resolution export.

`sky.rgba16f` preserves the Noon cubemap HDR values. Visible sky and water reflection share this resource;
the engine's realtime IBL baker supplies diffuse lighting and filtered specular reflection.
The reference capture freezes the original river's `_Speed` at zero. The four `*-full` images retain
the original effects; the four named camera images hide VFX/Lake and disable water caustics.
The original full-valley Galacean comparison captures use corresponding cameras at surface time zero,
1280×720. They predate the corridor crop. Current corridor captures and validation are recorded in
`../../demo/river/RiverValleyValidation.md`.

Water remains River High single scattering with camera-owned SSR. Differences deliberately retained:
physical transmission and light response, travel-time-based flow coordinates, terrain-detail jitter,
light plant sway, and color grading without the original LUT. Splash particles and mist were outside
the original scene adaptation; the subsequent contact-effects implementation is documented in
`../../demo/river/RiverContactEffects.md`. Caustics and the separate downstream Lake remain excluded.
Galacean uses FXAA for this scene; the Unity reference camera uses SMAA. These are not pixel-identical filters.
