# P3 final wind implementation

Status: implemented as the only production P3 tree path. The former Unity Source and Hero Unity-Parity render paths, Materials, Shader transfers, capture tools, calibration scripts, and UV2 wind-weight stream have been removed rather than kept as compatibility branches.

The same P3 field is also the only runtime source for production grass/flowers/shrubs, volumetric-cloud advection, rain drift, snow drift, and water micro-surface transport. Terrain no longer publishes the former scalar `scene_WindForce`, `scene_WindDirection`, `scene_WindGust`, `scene_WindTurbulence`, `scene_WindWavesScale`, or `scene_WindFlowDensity` globals, and its serializable wind configuration is physical `speedMps` plus an optional deterministic seed.

## Final architecture

P3 keeps the existing physical wind field and replaces only the expensive, insufficiently structured tree consumer. A tree now consumes wind through this causal chain:

```text
WindSystem (m/s, spectrum, travelling gust, local exposure)
  -> shared 64 x 64 GPU slow/fast second-order response bases
  -> species-calibrated whole-tree mode (mean lean, inertia, recoil, direction drift)
  -> GPU fixed-depth woody hierarchy (root -> stage 0 -> stage 1 -> stage 2)
  -> deformed parent frame
  -> baked leaf aerodynamic frame / petiole rotation
  -> bounded blade flex and normal-only high-frequency flutter
```

No leaf may use raw pressure to translate the crown ahead of its parent. Every child pivot is transported by all solved parent transforms before its own local degree of freedom is applied. This is the invariant that prevents detached branches, crown/trunk phase separation, and leaf-first macro motion.

## The seven implemented items

### 1. Offline mechanical bake

`generate-tree-wind-attachments.mjs` converts authored tree geometry into mechanical elements. It finds connected woody components and their parent-facing open boundary, clamps the complete branch-root section to zero local compliance, and uses that section centroid as the child pivot and the complete section as the geodesic seed. This is the C0 connection invariant: every root-section vertex is transported rigidly by the parent chain before any child-relative bend, so no wind magnitude can open a gap between an intersecting branch mesh and its trunk. The bake then estimates radius in eight geodesic bins, integrates compliance against the fourth-power radius law, includes descendant foliage load, and bakes the root-to-tip progress of every leaf card. The rooted component retains that radius-aware compliance progress across every LOD; the Shader blends it with a root-clamped Euler-Bernoulli mode whose crown keeps a non-zero slope, so coarse meshes still express increasing root-to-crown softness instead of becoming a rigid tilted block. `material_WindTrunkModeParams.w` controls the root-rigidity contrast, `material_WindTreeComplianceGain` scales the retained GPU load response as linear species compliance, and the runtime trunk-amplitude tuning scales both the requested equilibrium angle and its mechanical travel limit. These independent terms preserve a pinned root while allowing visibly soft trees without forcing every species to share one angle cap. This moves topology search, nearest attachment work, radius inference, and hierarchy expansion out of the frame.

### 2. Fixed-depth parent chain

Each element stores a pre-expanded chain of at most three woody stages plus its terminal attachment. The vertex shader contains three compile-time blocks; it does not traverse parent indices, branch dynamically on arbitrary depth, or keep per-element simulation state. Three stages are sufficient for the current mobile Hero-tree assets and bound both ALU and texture work.

### 3. Per-element GPU mechanics atlas

All instances of the same asset share one immutable `.treewind` atlas:

- transform atlas: four `RGBA16F` pivot texels per element, asset-bounds-relative;
- dynamics/frame atlas: two `RGBA8` texels per element: three compliances/depth, then octahedral petiole hinge/signed span twist/parent-branch attachment progress;
- vertex stream: one normalized `UNSIGNED_SHORT VEC2` (`TEXCOORD_3`) containing only element identity and local compliance progress.

The former `TEXCOORD_3..7` float-anchor layout is gone. Per-vertex mechanical payload is exactly 4 bytes rather than 32-40 bytes.

### 4. Quantized, bounded data

Pivots use half-float relative coordinates inside the asset AABB; dynamics use 8-bit normalized channels; identity/progress use normalized 16-bit channels. The loader validates magic, version, dimensions, byte counts, and fixed record shape before uploading point-filtered, clamp-wrapped data textures.

The eight current assets use 2,160-4,352 elements and 87,104-174,144 bytes of mechanical data each. Atlas padding included, storage is 40.0-40.7 bytes per element; it is paid once per asset, not once per tree instance. A leaf vertex performs one additional cached `RGBA8` frame fetch; no per-leaf basis is duplicated into the vertex stream.

Every leaf card now owns a coherent local aerodynamic frame. The offline bake derives its petiole edge, root-to-tip span, winding-consistent rest normal, and one parent-branch attachment coordinate shared by all four card vertices. The shader transports that frame through the solved trunk and fixed-depth parent chain, then solves the smallest signed rotation around the baked petiole axis that makes the leaf plane contain the projected flow. Leaf-span progress is used only for differential blade flex; it never enters a parent transform. Because the authored quads are metre-scale leaf-cluster proxies rather than individual physical leaves, their geometric feathering is limited to 0.18 radians (about 18% tip travel relative to card span); the remaining equilibrium rotation is carried by the represented sub-leaf normal response. Mean streamlining therefore changes silhouette at 4-12 m/s without pulling opaque leaf texels away from a transparent proxy root, while cluster roll and micro flutter remain bounded local motion layered after the parent pose.

### 5. Compile-time Wind SLOD

LOD variants remove work rather than multiplying it by zero:

| Tier | Mechanical depth | Transform fetches (branch / leaf) | Structural motion |
| --- | --: | --: | --- |
| LOD0 / Full | 3 | 3 / 4 | full parent chain, tree-tip, cluster, blade and normal response |
| LOD1 / Reduced | 1 | 1 / 2 | shared GPU whole-tree mode, one coherent primary-branch band, tree-tip response, mean leaf adherence and two parent-correlated low-frequency crown bands |
| LOD2 / Far | 0 | 0 / 0 | shared GPU whole-tree mode, continuous crown silhouette bend, mean leaf adherence and one atlas-free low-frequency leaf-cluster band |
| Animation Off | 0 | 0 / 0 | bind pose after projected maximum wind displacement is sub-pixel; no tree-wind Shader variant is evaluated |

LOD0 and LOD1 add one `RGBA8` dynamics fetch. The extra leaf fetch is its terminal/petiole pivot. Every animated tier reads the same two retained slow/fast response textures; vertices extrapolate their packed displacement/velocity only over the remainder of the capped 12 Hz interval. LOD1 compiles out the advected spectrum, local-field vertex fetches, secondary hierarchy, cluster roll, ripple, twist, twitch, and periodic flutter. LOD2 uses `MATERIAL_WIND_SLOD_FAR`: it compiles out the receiver profile, spectrum, local field, generic bend solve, mechanical atlas, and per-leaf mechanics while retaining the same bounded root/crown state, an atlas-free coarse leaf-cluster mode, and matching normal rotation. Authored LOD cross-fade therefore changes only the spatial basis and resolvable frequency bandwidth, never the mechanical state or phase. Every tier keeps evaluating while retained response is non-zero even after instantaneous air speed reaches zero, so recoil decays through the oscillator instead of snapping back to rest.

Wind SLOD selection is based on projected authored size, never on physical distance or instantaneous wind strength. A visible LOD2 tree remains animated. Animation may fade out only when the asset's maximum accepted wind displacement projects below one pixel and is fully disabled below half a pixel; the global retained response continues advancing while the receiver is static, so a returning tree samples the current state rather than restarting. The current production tree LOD groups cull below a screen-relative height of approximately `0.0255`, while their maximum accepted displacement is still resolvable there, so all currently visible authored trees consume Full, Reduced, or Far wind until geometry culling. A future HLOD or impostor may use the sub-pixel Animation Off tier without adding per-tree CPU response state.

Directional shadow cascades consume the same retained response but always use the aggregate root-pinned crown mode. They do not repeat LOD0 branch traversal, leaf aerodynamics, cluster motion, or normal transport for each cascade. This changes only the shadow-cost LOD; visible Forward geometry keeps its authored P3 tier.

### 6. Normal-response LOD

Position and normal quality are independent compile-time capabilities: `HIERARCHICAL`, `PARENT`, `TRUNK`, and `NONE`. This follows the useful part of Pivot Painter practice: do not pay for full normal transport after the change is below projected-pixel visibility. High-frequency leaf shedding is mostly a normal response at the mobile 20-30 Hz presentation tier; large geometry flutter is bounded to prevent temporal aliasing.

### 7. Baselines and acceptance gates

The isolated tree scene supports 1/8/32/1000-tree workloads and two separate comparisons:

- asset gate: Baseline -> P3 -> Baseline, isolating the mechanical consumer from geometry and submission cost;
- wind gate: wind OFF -> ON -> OFF on identical trees, isolating wind increment.

The gates reject more than 5% frame-time regression; the wind gate also rejects more than 1 ms GPU increment when timer queries are available. Shader and asset contracts verify Full/Reduced/Far material binding, fixed-depth code elimination, the two-response-fetch LOD2 path, zero mechanical-atlas fetches at LOD2, the 4-byte vertex record, asset/header integrity, a minimum three-vertex zero-compliance root section for every descendant woody component, pivot containment inside that section, retained non-root compliance, and leaf-card root/tip coherence. Forced-LOD visual acceptance additionally requires identical retained state and recoil phase, equivalent low-frequency crown travel, visible LOD1/LOD2 motion under Gale, and no motion-energy discontinuity during authored CrossFade. Physical iOS Safari and Android Chromium evidence remains a release gate and cannot be replaced by a desktop or software-renderer result.

There is no per-tree CPU response state. Two canonical GPU response passes solve every active field texel at 12 Hz and continue for seven slow-mode decay constants after the forcing becomes stationary. This drives residual velocity below 0.1% before the retained pass sleeps. The outer field texels blend to the same global retained response, so distant trees keep inertia without clamping to unrelated local history.

Ground vegetation likewise owns no per-instance state. One shared `RGBA16F` pass stores exact shrub and grass displacement/velocity endpoints; a second shared pass stores the flower stem/head response because its lower damping cannot be reconstructed by interpolating the shrub and grass endpoints. Each material samples exactly one retained texture. Both the GPU path and CPU raster fallback continue advancing for seven slowest-mode decay constants, and the outer texels converge to the global gust response, so distance from the camera changes spatial detail but never bypasses inertia or recoil.

`scene_WindVelocity` is a physical world-space transport vector for every consumer. Trees, grass, flowers, and shrubs bend toward its horizontal direction. Volumetric cloud density uses the Eulerian form `rho(x, t) = rho0(x - integral(v dt))`; its direction-cache reprojection uses the same negative sampling displacement. The visible cloud mass therefore travels in the same `+v` direction as the vegetation load instead of reversing it through texture-coordinate motion.

## Other P3 consumers

| Receiver | P3 sample | Response |
| --- | --- | --- |
| Grass, flowers, shrubs | one shared retained ground response lookup per vertex plus GPU spectrum/local field | exact grass/shrub endpoints and an independent exact flower response |
| Tree hierarchy | two shared slow/fast GPU response samples | species interpolation plus fixed-depth `.treewind` mechanics |
| Volumetric clouds | camera XZ at cloud base, cloud layer | low-frequency second-order transport; world-space vector advection and cache reprojection |
| Rain | camera rain-volume height, canopy layer | fast bounded response into ballistic particle acceleration |
| Snow | camera snow-volume height, canopy layer | slower high-drag response into particle acceleration |
| Water | scene wind vector | standing-water capillary/micro-normal advection; active rivers keep hydraulic transport and receive only bounded finest-band shear |

`wind-tree/index.html` is the compact visual gate: all eight live production tree assets and 24 production grass, flower, and shrub placements share one `WindSceneBridge`. The non-tree vegetation has no CPU instance adapter; its production Shader consumes the spatial P3 field directly.

## Cross-consumer LOD contract

Wind state and presentation cost are separate contracts. A quality or distance transition may remove imperceptible geometry, samples, particles, or ray steps; it must not reset, rescale, or fork the physical response state. The current and final ownership is:

| Receiver | Current LOD | Final rule |
| --- | --- | --- |
| Trees | Authored three-mesh CrossFade plus compile-time mechanical SLOD | Implemented: LOD0 Full, LOD1 Reduced, and LOD2 Far share one GPU response state; every visible tree remains animated, and only a sub-pixel future HLOD/impostor may enter Animation Off. |
| Dense grass | Instanced-cell distance culling plus one shared retained high-frequency ground response; continuous Shader fades remove micro/local motion over 36-72 m and meso motion over 120-220 m | Preserve the shared mean lodging/recovery state and reduce only differential motion/visible density. Never allocate state per blade. |
| Flowers | Authored geometry LOD/CrossFade; every visible tier reads the exact shared flower-response texture | Keep the flower head-mass profile separate from grass; fade head detail and density, but preserve the coherent primary stem bend through transitions. |
| Shrubs | Authored geometry LOD/CrossFade; every visible tier reads the shared retained shrub response | Keep the baked implicit branch compliance at visible tiers; reduce branch-card detail before removing the coherent whole-shrub bend. |
| Rain | Camera-relative volume; fixed 360 particles/s source; water impacts are full to 24 m and fade to zero at 55 m; terrain search is bounded to 90 m | Add presentation quality tiers for emission, impact queries, splash count, and overdraw. Keep the one atmospheric drift response unchanged and never solve per drop. |
| Snow | Camera-relative authored emitter with one shared atmospheric response; no explicit quality tier | Add emission/overdraw/turbulence-detail tiers. Keep the shared slower drift state unchanged and never solve per flake. |
| Clouds | Existing economy/balanced/high direction-cache and ray-detail presets (256/512 cache, 16/8/4 slices, 4/6/6 light steps, 0/1/2 detail steps) | Already the correct LOD class: reduce ray/detail/cache work while retaining one continuous world-space wind displacement and history. |
| Water | Existing low/medium/high geometry, 2/6/12 wave slots, surface, reflection, query, and spatial-field budgets | With macro wind-wave generation explicitly out of scope, couple wind only to continuous micro-capillary direction/strength and rain ripple/foam. It does not need the tree second-order pass. |

Rain, snow, and clouds intentionally keep one camera/medium response rather than a distance band: their physical medium is continuous around the observer. Their LOD belongs to emitted or traced presentation work. Water quality is already explicit: the Heightfield path consumes P3 vector direction and bounded speed through its existing micro-normal layers, while macro wind-generated waves remain intentionally out of scope.

## Bandwidth interpretation

The pessimistic cold-cache vertex cost at LOD0 is 28 bytes for a branch (3 x `RGBA16F` + `RGBA8`) and 36 bytes for a leaf (4 x `RGBA16F` + `RGBA8`), plus the 4-byte vertex attribute. Real traffic is lower because every leaf-card corner shares one element record and woody vertices reuse component records. The design therefore scales primarily with visible vertices and LOD, while the atlas allocation scales with unique asset types. Adding another 1,000 instances of the same species does not allocate another 1,000 mechanics atlases.

The two response passes sample shelter and local wind once per 64 x 64 texel. Tree vertices at every LOD then read only the two retained response bases; they do not repeat shelter or local-field sampling. This keeps gust packets and analytical local emitters spatially correct while making the structural solve independent of visible tree count.

## Source ownership

- Bake and format: `wind-vegetation/offline/generate-tree-wind-attachments.mjs`
- Runtime upload/binding: `src/project/TerrainTreeMechanicalGpuData.ts`
- Instance sharing, variants and Wind SLOD: `src/project/TerrainHeroTreeWind.ts`
- Cloud/rain/snow receivers: `src/environment/TerrainP3AtmosphericWind.ts`
- Cloud vector transport and cache reprojection: `VolumetricCloudMaterial.ts` and `VolumetricCloudDirectionCacheRenderer.ts`
- Decode and causal deformation: `shaders/shared/VegetationWind.glsl`
- Vertex contract: `shaders/vegetation/VegetationAttributes.glsl`
- Asset and shader gates: `project-tests/TerrainVegetationPrefabData.spec.ts` and `project-tests/VegetationShaderContract.spec.ts`
