# Terrain shader governance

## Gate

Shader work starts only after the renderer-independent Project architecture passes its fixture, loader, ownership, and low-DPR browser gates. Performance tuning remains out of scope until the rendering contract and visual parity gates pass.

## Goal

Restore the nine-Region visual fixture through four independent production capabilities:

- `Terrain.shader` shades canonical height, alphamap, hole, and terrain-layer resources.
- `Surface.shader` shades opaque meshes such as rock and bark.
- `Vegetation.shader` shades alpha-cutout, wind-deformed foliage and grass.
- `Billboard.shader` shades camera-facing alpha-cutout meshes through a cylindrical basis.

Each Prefab renderer binds its authored Material reference. Runtime code never chooses a Shader from a prototype name, placement category, mesh name, or texture name.

## Non-goals

- No compatibility layer for the retired combined Surface/Vegetation Shader.
- No procedural demo, procedural placement rule, or category-based Material inference.
- No terrain renderer replacement. Geometry Clipmap remains the production geometry path.
- No mobile or desktop performance claim at reduced DPR.
- No default detiling, macro variation, projection, dual scaling, or automatic layer generation.
- No post-processing, lightmap, additional-light, or reflection-probe parity in the first slice.

## Authoritative sources

- The verified source editor, renderer package, and runtime build are retained only in private evidence.
- Reference Terrain Lit source fingerprints:
  - Shader: `cd0e7223c14ff058689a0ec7f01e57087438e94b03a3872fd07723fda10b8f84`.
  - Input: `23f7b720ee3d3b29b6c21d0fc094db5e0ce65fd0901aea76b38e79c266a2ba1a`.
- Reference animated LOD dither fingerprint: `95fea0c28560e3f0355cdc35c98558296fa870c154c916a3939945779ebd874e`.
- Authored opaque Surface fingerprint: `f1a9118b99833462e121fe26e8545181452eb886f57a939e56940ae68a6aeac0`.
- Authored alpha-cutout Vegetation fingerprint: `46aa3068a73aa2fcb9d16c604a11313b91349ab7f736d99db90065e1c8b93562`.
- Authored cylindrical Billboard fingerprint: `0c8d02d8585823e34aa702826dfc9ba7bb7290284fcf48664443d368099b4d37`.
- Galacean core, shader, and loader packages `2.0.0-alpha.37`.

Fingerprints identify the locally verified source contents without persisting authoring paths in the repository.

## Target semantic mapping

| Authored semantic                | Production mapping                                                    |
| -------------------------------- | --------------------------------------------------------------------- |
| Terrain height and Clipmap morph | Vertex position and geometric normal before lighting                  |
| Terrain alphamaps                | Normalized layer weights; no packed legacy control-bit interpretation |
| Terrain layer diffuse alpha      | Albedo and authored smoothness contribution                           |
| Terrain layer normal and scale   | Tangent-space normal blended by normalized layer weights              |
| Opaque Surface maps              | Base color, normal, metallic/smoothness, and occlusion inputs         |
| Vegetation alpha and cutoff      | Alpha test in both forward and shadow passes                          |
| Vegetation lighting flatness     | Authored normal flattening before direct and environment lighting     |
| Vegetation translucency          | Back-light contribution driven only by light energy                   |
| Vegetation wind                  | Identical object-space deformation in forward and shadow passes       |
| Cylindrical billboard            | View-facing camera basis after graphics-API handedness conversion     |
| Grass distance fade              | Vegetation-only vertex collapse; independent from mesh LOD selection  |
| Direct light                     | Direct diffuse/specular contribution only                             |
| Environment light                | Indirect diffuse/specular contribution only                           |
| Shadow attenuation               | Multiplies direct light only                                          |
| Animated LOD crossfade           | Per-instance, time-based, signed dither in forward and shadow passes  |

With direct and environment lighting both disabled, lit object pixels approach black before fog or post-processing. Albedo is never an implicit emissive fallback.

## Verified boundary

The current low-DPR runtime fixture verifies these integration slices:

- Distinct Terrain, Surface, Vegetation, and Billboard production Shader resources loaded through the standard Project closure.
- Nine active canonical Regions with exact height, solid-hole, alphamap, and terrain-layer residency.
- Four lighting states, including exactly black object pixels when direct and environment lighting are both disabled, and shadow attenuation affecting direct light only.
- Shared Vegetation wind deformation in forward and ShadowCaster source, plus nonzero foliage and shadow pixel motion between fixed timestamps.
- Authored Vegetation alpha cutoff, two-sided normal evaluation, second-color tint, translucency, and Material-bound wind and distance-fade switches.
- Independent per-instance animated LOD state for tree and rock Prefabs with submitted start, approximately `0.25 s`, and `0.5 s` frames. At the midpoint both source and target meshes contribute visible pixels.
- Grass distance collapse without a synthetic LODGroup; disabling wind does not disable the distance-fade interval.
- The formal Billboard Prefab resolves only through its serialized Material and Shader refs. Its `14,367` instances share one mesh/material group; the browser probe observed instanced batches up to `1,024` instances.
- At camera azimuths separated by `90 degrees`, the isolated Billboard remains front-facing with `17,566` and `17,875` visible pixels and comparable `162 x 229` and `164 x 231` silhouettes. Forward and ShadowCaster compile the same cylindrical position, normal, tangent, wind, alpha-cutout, and LOD-dither path.
- Tree instance color remains canonical payload metadata; production mesh Shaders consume no implicit instance tint.
- Topology-matched Geometry Clipmap snapping, parity, horizontal vertex shift, height blend, geometric normal, hole lookup, and shared forward/shadow displacement.
- Separate production, core-debug, and extension-debug resources. Production source and compiled artifacts contain no debug selector or dormant extension interface.
- Core Terrain debug pixels distinguish source and rendered height and contain the full `0..1` morph interval.

This evidence establishes the declared fixed-scene rendering contract, not unrestricted pixel identity across every camera, weather, post-processing stack, or device. The following remain explicit non-claims:

- Detiling, macro variation, projection, and dual scaling extension programs prove compile-time isolation only; their visual algorithms are not part of this feature.
- Lightmaps, additional lights, reflection probes, and post-processing remain outside this Shader slice.
- Reduced-DPR functional evidence is not a performance result.

The complete scene fixture remains the acceptance target; smaller runtime fixtures only isolate individual invariants and cannot replace it.

## Billboard view-facing correction slice

### Goal and source mapping

The authored Billboard program uses one cylindrical camera basis for position, normal, and tangent in every geometry pass. The imported runtime mesh contains a planar carrier whose six normals are all local `+Z` and whose tangents are local `-X`; the Galacean mapping must therefore transform local `+Z` toward the camera-facing hemisphere after view-matrix handedness conversion. Position, geometry normal, shading normal, and tangent space must use the same corrected basis.

The runtime Material remains a standard Project resource referencing the independent Billboard Shader. Billboard renderers are not reclassified as ordinary Vegetation renderers, and no prototype name, placement category, or mesh name participates in Shader selection.

### Non-goals and risks

- Do not add translucency, wind, smoothness, tint, or shadow behavior that the authored Billboard Material does not enable.
- Do not change the billboard instance payload, batching, culling, LOD selection, or canonical schema.
- Do not modify engine camera or matrix conventions.
- Do not merge Billboard and Vegetation production Shaders.

The main risks are visually correct silhouettes with inverted lighting normals, a forward/shadow basis mismatch, and diagnostics that silently omit the Billboard path.

### Implementation and acceptance

1. Correct the graphics-API view-facing sign once in the shared Billboard deformation include used by Forward and ShadowCaster.
2. Add an independent Billboard core-diagnostic Shader and Material. The existing Vegetation debug selector drives both alpha-cutout capabilities while preserving their distinct geometry paths.
3. Prove the imported carrier normals and tangents, compiled Forward/ShadowCaster basis identity, standard Project resource closure, and production/debug compilation separation.
4. At the fixed valley camera, capture default lighting, direct-only lighting, Geometry Normal, and Direct Light views. Far Billboard trees must remain visible under direct-only lighting, must respond to the Vegetation selector, and must keep the authored source silhouette and color family.

## Design alternatives

### A. Independent capability Shaders with shared rendering primitives

Four Shader resources own distinct material schemas and forward/shadow entry points. Small shared includes own only stable lighting, shadow sampling, instance transforms, LOD dither, and vertex-weighted wind semantics. Billboard position, normal, and tangent reconstruction remain one shared function used by its own forward and shadow entry points.

This keeps Material meaning explicit, prevents vegetation variants from entering opaque batches, and lets production and debug programs compile independently.

### B. One mesh Shader selected by capability macros

One file would compile opaque and vegetation variants. It reduces file count but exposes two different material models through one interface, makes accidental Material/variant combinations valid, and repeats the retired coupling.

### C. Stock PBR with runtime patching

Stock PBR Materials could cover part of opaque shading, while runtime code patches vertex wind, LOD dither, and shadow behavior. The current Shader API has no deep vertex/shadow extension point; runtime patching would restore special registration and make forward/shadow parity implicit.

**Selected: A.** Its public boundary is four Shader capabilities plus standard Material refs. The shared modules hide cross-pass invariants without merging distinct material models.

## Data and runtime contract

- Project files declare Shader, Material, Texture, Prefab, glTF, Scene, and terrain resources with explicit typed dependencies.
- A Material references exactly one Shader resource and carries only that Shader's properties and compile-time capability macros.
- A Prefab renderer references its exact ordered Material. Bark and rock use Surface; leaves and grass use Vegetation because their serialized refs say so.
- LOD selection consumes the Prefab's local reference point, reference size, decreasing screen heights, exact renderer selectors, fade mode, and animated-crossfade flag.
- Transition state belongs to each surface instance, never a cell, prototype, range, or category.
- Animated crossfade duration is `0.5 s`, matching the verified source global setting.
- During a transition, both source and target LOD renderer sets are submitted. Their signed dither factors are complementary and derived from one per-instance transition clock.
- Culling a cell may skip work, but cannot replace, merge, or reset the contained instances' LOD transition state.

## Production and debug compilation boundary

Production Shader resources contain no `DebugView` uniform and no debug output branch.

Core debug resources compile only these shared meanings where applicable:

- Final Lit, Albedo, Geometry Normal, Shading Normal.
- Direct Light, Environment Light, Shadow Attenuation, LOD Fade.
- Terrain adds Source Height, Rendered Height, Height/Seam Error, Region/Seam, Alphamap/Layer Weights, Holes, Clipmap LOD/Morph/Wireframe, and Sampling Mip.
- Vegetation adds Alpha/Alpha Cutoff, Wind Weight/Displacement, dither threshold, and forward/shadow geometry parity.

Terrain extension debug resources compile only beside their enabled extension. Detiling, macro variation, projection, and dual scaling contribute no uniform, texture, macro, or branch to core production programs when disabled. Automatic layer generation belongs to editor alphamap preview.

## Geometry Clipmap height-residency slice

### Goal, source, and mapping

The first Terrain integration slice must render the canonical R16 samples instead of the flat Clipmap carrier mesh. Its source semantics are the Terrain Project 1.0 per-Region decode contract, the verified Terrain Lit fingerprints above, and these public Geometry Clipmap references:

- Losasso and Hoppe, *Geometry Clipmaps: Terrain Rendering Using Nested Regular Grids*, section 6.2: <https://hhoppe.com/geomclipmap.pdf>.
- Asirvatham and Hoppe, *Terrain Rendering Using GPU-Based Geometry Clipmaps*, listings 2-1 and 2-2: <https://hhoppe.com/gpugcm.pdf>.
- Arm OpenGL ES sample, including its MIT-licensed vertex blend and coarse-height construction: <https://arm-software.github.io/opengl-es-sdk-for-android/terrain.html>.
- The public implementation that defines the current tile, edge, fill, and trim topology, pinned at commit `53e9f64c7232ccde774041d83fcf8d611747cc38`: <https://github.com/TokisanGames/Terrain3D/tree/53e9f64c7232ccde774041d83fcf8d611747cc38>.
  - Vertex program fingerprint: `d9c2e52659bda7daadefe41871a0902873b82b00bed6adc974539647cec83140`.
  - Mesher fingerprint: `ccf1af4fdaa4a76867a32fb2d987b0c62d45fc70db42c1cd0da1a59218c995db`.

The spatial morph is not a timer. The current topology's vertex program is authoritative for its transition interval and parity rules: each level computes Chebyshev distance in level-grid units, starts morphing at `meshSize + 4`, ends at `2 * meshSize`, and applies `smoothstep`. Odd vertices move horizontally onto the next-coarser lattice while their source and target heights blend with the same factor. The finest standard grid uses its authored alternating-diagonal parity rule; coarser rings use the symmetric parity rule. Ring snapping first floors the target to the base sample grid, then rounds it to each level's snap interval. Grid snap and vertex parity are relative to the active residency's shared sample-grid origin; world zero is not assumed to be a height sample.

The Clipmap adapter packs only the currently loaded renderer-compatible Region subset. Each R16 sample remains exact as low/high `R8G8` bytes in a point-sampled atlas. Per-Region world bounds, sample rectangle, and independent height offset/scale stay in runtime metadata; they never become canonical ids or Project fields. Vertex sampling performs explicit bilinear interpolation, derives the geometric normal from adjacent world-grid samples, and passes one validity value to both the forward and ShadowCaster paths. Missing Regions and legal gaps discard instead of producing a flat fallback surface.

### Non-goals and capability boundary

- Do not resample, quantize, or rewrite canonical height samples.
- Do not require equal Region dimensions or canonical resource order.
- Do not make atlas coordinates, loaded order, or a texture layer part of Region identity.
- Do not solve streaming policy or performance in this slice.
- The current WebGL2 Clipmap may reject a loaded residency set above its explicit active-Region or device texture-size limit. The Project remains valid and may load a smaller progressive subset.

### Risks, implementation slices, and acceptance

The risks are byte-order loss, atlas bleed, seam disagreement, incorrect world/decode transforms, undisplaced shadow geometry, and a test that renders only the carrier plane.

1. Add a deterministic variable-rectangle atlas packer and exact R16 byte upload for the loaded subset, with order-invariance and capability-error tests.
2. Clone the standard Project Material for renderer-owned atlas state; destroy the clone and atlas with the Clipmap root without changing Scene-owned source resources.
3. Share one topology-exact vertex-shift, source/target height blend, and geometric-normal path between Terrain forward and ShadowCaster passes.
4. Align ring snapping to the renderer descriptor's shared sample-grid origin and expose per-segment LOD plus mesh size without adding either value to canonical identity.
5. Replace the flat runtime fixture with a deterministic non-flat canonical height payload.
6. Prove source-to-Shader artifact identity, non-flat framebuffer coverage, displaced bounds, transition-region intermediate heights, continuous camera motion, and shadow-on/off pixel differences at the fixed low-DPR camera.

Acceptance requires exact source sample preservation in the packer, identical forward/shadow world height functions, no rendered pixels over an unloaded gap, and a real WebGL2 frame whose terrain silhouette and shadow difference cannot be produced by the original flat carrier mesh. The same fixed camera must show non-binary morph factors and a smaller frame-to-frame height delta with spatial morph enabled than with an abrupt fine/coarse switch.

## Canonical Detail instancing slice

### Goal, source, and semantic mapping

The complete scene fixture must render its authored Detail instances from the same standard Project closure as Regions, Prefabs, Materials, and Shaders. The authoritative placement input is the source editor API output for each Region and Detail prototype, not a runtime reconstruction from density pixels.

Each optional Detail-instance resource stores a counted little-endian stream of local position, Y rotation, horizontal scale, and vertical scale. A Region keeps its density map as editable canonical data and may additionally reference exact evaluated transforms as visual-authority data. The generic contract accepts density-only projects; the production Detail renderer reports an explicit capability error when a Prefab Detail lacks exact transforms.

The runtime resolves every Detail prototype through its exact Prefab renderer, mesh, Material, and Shader references. It combines the authored instance transform with each renderer's Prefab-local transform, then submits one instanced mesh per compatible renderer slot. Vegetation wind, alpha cutoff, distance collapse, lighting, and shadow behavior remain properties of the referenced Vegetation Material and Shader.

### Design alternatives

- Instantiating one Entity per Detail preserves stock Prefab behavior but creates hundreds of thousands of Entities and draw submissions.
- Reconstructing positions from density maps is compact but cannot reproduce the source editor's evaluated transforms, random sequence, height sampling, or prototype rules.
- A demo-owned instanced adapter preserves exact transforms and exact resource refs while keeping renderer-specific packing outside the canonical schema.

The instanced adapter is selected. Its public boundary is the optional canonical transform resource plus one Scene-owned Detail runtime; GPU buffer layout and batching remain private runtime decisions.

### Non-goals, risks, and acceptance

- Do not infer a Shader, Material, wind mode, LODGroup, or renderer slot from names or categories.
- Do not synthesize a mesh LODGroup for grass; distance collapse and mesh LOD remain independent capabilities.
- Do not make instance-buffer attributes, batching keys, or GPU residency part of the Project contract.
- Do not change generic engine loading, Prefab, Material, or MeshRenderer architecture.

The main risks are transform-order errors, missing Prefab child transforms, forward/shadow deformation divergence, overly narrow bounds, and silently accepting a density-only visual fixture. Implementation therefore proceeds as:

1. Validate counted transform payloads by SHA-256, byte length, header count, and prototype count.
2. Resolve exact renderer-local transforms beside existing Prefab geometry metadata.
3. Create a demo-owned BufferMesh adapter that shares immutable source geometry and owns only the instance stream.
4. Apply the same composed instance transform in Vegetation forward and ShadowCaster vertices.
5. Add the Scene runtime, startup diagnostics, resource-closure tests, and low-DPR fixed-camera evidence.

Acceptance requires the full fixture's declared Detail count to equal submitted GPU instances; renderer and Material refs must match their Prefabs; draw diagnostics must identify prototype, primitive, visible count, culled count, and batch-break reason; fixed pixels must show authored grass and flowers; forward and shadow silhouettes must move together under wind; and no source-export tool or private authoring path may enter the Project tree.

## Reproducible baseline

Source baseline:

- Complete nine-Region scene, including all terrain seams, seven terrain layers, foreground detail, trees, rocks, and the fixed valley view.
- Record the source default-lit pixels, camera, light, environment, render target, and source-content fingerprints without changing the authoring project.
- Record one stable LOD boundary at transition start, approximately `0.25 s`, and at `0.5 s` for a tree and a rock instance.
- Record grass before, inside, and beyond its authored distance-collapse interval without treating camera distance as an LOD transition clock.
- Record two wind timestamps and matching forward/shadow silhouettes.

Galacean development baseline:

- CSS viewport and drawing buffer `768 x 432`, DPR `1`.
- Fixed camera transform, exposure, light transform/intensity, environment intensity, shadow state, clock, and LOD test instance ids are serialized in the Scene fixture.
- The direct plus environment, direct only, environment only, and both-off states are captured from the same Galacean fixture. Screenshots, sampled object-region pixels, submitted LOD ids/fades, transition counts, and browser console diagnostics are captured by one E2E lane.
- Reduced DPR evidence is visual/functional only and never enters the performance baseline.

No runtime or Shader asset edit starts until the fixed source and current Galacean baseline records exist. Each implementation slice replaces an explicit failing baseline assertion.

## Slices

1. Establish the fixed source and Galacean baseline without changing Shader behavior.
2. Add the four production Shader resources and four standard Material families.
3. Bind terrain and Prefab renderers through exact Project Material refs.
4. Implement direct, environment, and shadow separation; pass the four-state pixel matrix.
5. Implement Vegetation alpha, normal flattening, translucency, wind, and forward/shadow parity.
6. Implement persistent per-instance tree and rock LOD selection with `0.5 s` complementary crossfade, plus independent grass distance collapse.
7. Add core debug resources and prove production programs contain no debug interface.
8. Add optional terrain-extension debug resources with compile-time isolation.
9. Emit the complete nine-Region `project.json + public` resource closure atomically.

## Acceptance

- The Project and Scene loaders resolve every Shader and Material without runtime Shader creation, include registration, path guessing, or category inference.
- Terrain, Surface, Vegetation, and Billboard compile as distinct production programs on WebGL2.
- Fixed pixels distinguish all four lighting states; both-off object regions are near black.
- Disabling direct light makes shadow enable/disable pixel-identical within tolerance.
- Enabling direct light makes shadows change only geometrically occluded regions.
- Wind and alpha-cutout geometry match between forward and shadow passes.
- Tree and rock each expose intermediate pixels throughout an approximately `0.5 s` transition; no delayed instantaneous switch remains.
- Grass exposes the authored continuous distance-collapse interval and does not acquire a synthetic LODGroup.
- Two instances crossing the same threshold at different times report independent fades.
- Production compiled programs contain no debug uniform, selector, or dormant debug branch.
- Core and extension debug programs expose only their declared outputs.
- The complete nine-Region fixture renders without a fixed Region-count, order, topology, or Heightmap-resolution assumption.
- Type checks, contract tests, Shader compilation tests, low-DPR E2E, screenshot comparison, browser diagnostics, privacy scan, and resource-closure verification pass.
