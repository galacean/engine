# Cold Smoke Mountain · 邻山与远景 Lab

Reproduces the **neighboring mountain generation & rendering pipeline** and **panoramic mountain vista** from `next-gallery/demos/cold-smoke` (`寒烟山 · Mount Cold Smoke`) inside `engine-next`, while combining it with **interactive OBB Guiding Shapes** and **editable Gullies, Valleys, and Ridges**.

## Entry URL

Open `/world/demos/cold-smoke-mountain/index.html` on the World dev server.

## Pipeline Architecture

1. **Interactive Guiding Shapes (`MountainGuideOBB` + Central Valley Corridor)**:
   - Place, select, rotate, resize, or delete 3D Oriented Bounding Box guides (`massif`, `wall`, `ridge`, `basin`) alongside Cold Smoke's winding valley corridor and 36 m open apron (`corridor`).
   - Adjacent `massif` / `wall` / `ridge` OBBs combine through a smooth polynomial upper envelope while `basin` OBBs carve glacial bowls and valley floors.
2. **Cold Smoke Neighboring Mountain Relief & Fall-Line Tributaries**:
   - **3-Octave Squared Ridged Multifractal (`sampleColdSmokeRelief`)**: Reproduces `Course.relief(x, z, e, cell)` ($r_k = 1 - |\text{vnoise2}|$, weighted $r_k^2$), scaled quadratically by `mountainWeight` ($m^2$) and per-guide `reliefBoost` so towering peaks rise on the valley flanks without intruding on the valley floor.
   - **4-Octave Cascaded Fall-Line Gullies (`sampleGullyWave`)**: Reproduces `Course.gullies(px, pz, dx, dz, seed)` (`700 m → 260 m → 124 m → 59 m`). Computes the macro gradient $(g_x, g_z)$ of the guide shapes + relief, rotates $90^\circ$ across the slope, shapes sharp rocky ribs and rounded couloir floors via $1.27 - 2\sqrt{\max(0, 0.5 - 0.5\cos\phi)}$, and feeds each octave's spatial derivative $(e_x, e_z)$ into the next finer octave so runnels bend and join main couloirs like tributaries.
   - **3D Folded Sedimentary Rock Strata (`strataAt`)**: Reproduces `Course.strata(x, y, z)` (`TAU / 1024` 3D folded bedding), carving physical snow-holding benches and steep cliff risers on the CPU and driving the GPU rock shader.
3. **Authored & Click-to-Carve Gullies, Valleys & Ridges (`GullyValleyFeature`)**:
   - Add, remove, or edit quadratic Bézier `gully`, `valley`, and `ridge` curves, including oblique fishbone tributary side-chutes.
   - Use **"+ Carve Gully on 3D Click"** or **"+ Carve Valley on 3D Click"** to click any slope in the 3D scene and automatically trace a new feature along the steepest descent fall-line (`traceFallLineFeature`).
4. **Multi-Scale Laplacian Cavity AO, Horizon Self-Shadowing & Panoramic Vista**:
   - Bakes central-difference slopes $(s_x, s_z)$, 2-scale Laplacian concavity (`lapNear - 0.72 * lapFar` from `04_terrain.js`) for gully snow retention and cavity AO, and ray-marched sun-horizon tangents (`hz`) toward the sun azimuth.
   - Shades banded rock strata, 4-family vertical fracture joint chutes, sawtooth sub-bed steps, under-bench overhangs, snow ledges, and exponential-squared atmospheric perspective into the zero-triangle **`ColdSmokeMountainVista`** sky (multi-layer ridged horizon ranges, cloud sea deck, distant valley city lights, and night aurora).
