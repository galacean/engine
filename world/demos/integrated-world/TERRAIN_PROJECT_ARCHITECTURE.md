# Terrain Project architecture

## Boundary

- The deliverable is an ordinary `project.json + public` artifact.
- Generic engine packages keep their existing Project, Scene, Prefab, Material, Shader, JSON, Buffer, Texture, and glTF loaders.
- Terrain-specific schema validation, progressive residency, and renderer adaptation stay inside this demo.
- Canonical terrain data is independent of Geometry Clipmap, patch meshes, texture arrays, atlases, GPU indices, and quality tiers.
- Offline source inspection and conversion tools are not part of the committed runtime or exported artifact.

## Standard loading chain

```text
Host entry
  -> import generated Script registry
  -> ResourceManager.load({ type: AssetType.JSON, url: "project.json" })
    -> registerVirtualResources
    -> ResourceManager.load({ type: AssetType.Scene, url: scene.json })
      -> JSONLoader(world index)
        -> TerrainProjectWorldRuntime
          -> JSONLoader(Region manifests)
          -> BufferLoader(height, holes, alphamaps, detail density)
          -> TextureLoader
          -> MaterialLoader -> ShaderLoader
          -> PrefabLoader -> glTF/Material resources
```

The host registers Scene and Prefab Script classes by their virtual Script paths before Project loading. Script modules are bundled code, not Project resources or canonical terrain identity.

## Atmospheric lighting ownership

The astronomical clock evaluates one Sun and Moon trajectory. The procedural atmosphere is the sole environment-radiance source for the visible sky, realtime diffuse SH, and GGX-prefiltered reflection cube. Solar and lunar disks remain visible but are excluded from both IBL products because directional lights own their PBR highlights.

Distance fog has no authored time-color gradient. Its weather density stays independent, while its in-scattered radiance evaluates the realtime sky's raw SH along each camera ray. The spherical mean is retained only for diagnostics and shaders that do not enable the directional path. Consequently the sunward sunset horizon may become warm while the anti-solar sky remains blue, and twilight, airglow, stars, and lunar atmospheric radiance enter fog through the same environment revision as IBL.

## Canonical world

A world contains `0..N` sparse, unordered Regions. Nine Regions are one acceptance fixture, never a schema limit.

Each Region descriptor owns:

- a stable opaque `id`;
- a manifest resource reference;
- independent world-space position and extent.

Each Region manifest owns:

- height data with explicit `sampleSize=[width,height]`, decode range, format, layout, and digest;
- holes and one or more RGBA alphamaps with independent sample sizes;
- terrain layers and standard Texture refs;
- tree, detail, and ordinary Prefab declarations and placements;
- renderer-neutral authoring values such as wind and LOD metadata.

Both height dimensions may be any integer at least two. Non-square and non-power-of-two rasters are valid. X/Z sample spacing is derived from that Region's extent and sample size.

Canonical ids never encode array order, coordinates, paths, or GPU packing.

## Seams

Adjacency is explicit. A height seam names:

- two Region ids;
- one edge on each Region;
- an inclusive distance range along each edge;
- linear world-space comparison semantics.

Missing neighbors and undeclared gaps are valid. Validation samples the union of both original edge sample locations plus exact range endpoints. It never rewrites source height data or restricts spacing ratios.

## Progressive ownership

`TerrainProjectWorldRuntime` shares in-flight resource work while giving each consumer independent ownership:

- `loadRegion` and `loadRegions` create manual pins;
- `acquireRegions` returns an explicit Region-set lease;
- `retainLoadedRegions` leases an already resident set;
- the final owner release drops the exact Material, Texture, Prefab, Mesh, and dependent Material references;
- cancellation of one observer does not cancel surviving observers;
- cancellation of the final observer cancels underlying work;
- runtime reset and Scene destruction invalidate outstanding leases safely.

Clipmap, tree, and ordinary-Prefab runtimes stage replacement residency before releasing their prior leases, so failed or superseded changes preserve the previous active set.

## Renderer capability boundary

Geometry Clipmap remains the production terrain renderer. Its adapter may reject a selected loaded set that it cannot sample, but that does not make the Project invalid.

Current adapter constraints are runtime capabilities only:

- one uniform, isotropic sampling grid for the selected active subset;
- non-overlapping Region interiors;
- device and atlas limits;
- explicit active residency independent of all loaded Regions.

The alternative geometry renderer remains an isolated experiment and is not integrated.

## Artifact organization

```text
project.json
public/
  Scene/
  World/
  Regions/
  Payloads/
  Material/
  Shader/
  Texture/
  Prefab/
  Models/
```

Every public resource is declared in `project.json` with a portable relative physical path and a stable virtual path. The Scene strongly references the world index; Region content is progressively resolved from standard refs. No raw filesystem path, personal identity, source-editor id, or runtime GPU index belongs in the artifact.

The three demos share this release `project.json`; scene differences belong in `Scene/World.scene` and `Scene/Editor.scene`. Generator reuses `Scene/World.scene` and deactivates its water entity in code before starting the engine.

## Acceptance matrix

- Empty and single-Region worlds.
- The complete nine-Region source-fidelity fixture.
- Sparse, unordered, non-nine worlds with gaps and missing neighbors.
- `257x257`, `513x1025`, non-square, and non-power-of-two height data.
- Mixed extents, different sample spacing, partial seams, and explicit seam errors.
- Region declaration-order invariance.
- Large indexes with a progressively loaded subset.
- Exact height, holes, alphamap, detail-density, tree, and transform roundtrip.
- Standard Project/Scene/Prefab/Material/Shader/Texture/Buffer/glTF loading in a real low-DPR browser.
- Script-path registration matching exported host behavior.
- Overlapping Region leases, cancellation, replacement rollback, GC, reset, and Scene destruction.

Architecture acceptance does not establish rendering parity. Complete Material/Prefab closure and matched source pixels belong to the Shader phase. Performance measurements remain paused until Shader acceptance passes.
