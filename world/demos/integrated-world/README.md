# Terrain demo

The terrain entry loads a standard Project whose Scene references terrain Regions, Prefabs, Materials, and Shaders. Region identity and height sampling remain independent from runtime texture packing and the geometry renderer.

The current scene exercises sparse multi-Region loading, clipmap geometry, authored terrain layers, instanced details, trees and placed Prefabs, water, post-processing, navigation, and concise runtime diagnostics.

## Commands

From the repository root:

```bash
pnpm --filter @galacean/world-gallery typecheck:terrain
pnpm --filter @galacean/world-gallery test:terrain-project
pnpm --filter @galacean/world-gallery test:terrain:e2e
```

Set `TERRAIN_E2E_URL` to validate an existing gallery server. The combined E2E command validates both the standard resource chain and real scene pixels.

### Official Brotli profile

Integrated World, AI World Generator, and Terrain Editor share `data/grasslands/project.json` and its official Brotli v1.2.0 profile. The first two select `Scene/World.scene`; the editor selects `Scene/Editor.scene`. The Project loads 28 standard `.br` streams: nine Region JSON manifests, nine Height R16 payloads, and ten Alphamap RGBA8 payloads. Region and Alphamap use original bytes → official Brotli → original bytes. Height uses a reversible delta/VarUint rearrangement before Brotli; the `BrotliHeightmap` loader performs Brotli decode followed by the inverse transform. Both Demo-private loaders return standard `JSONAsset` or `BufferAsset` values, so Terrain code only calls `engine.resourceManager.load()`. A failed decode or size check blocks scene readiness.

`data/grasslands/compression-profile.json` is the offline selection boundary. It maps Terrain resource roles to the final Demo-private Project `AssetType`: `Brotli` selects pure Brotli, while `BrotliHeightmap` selects Height R16 transform → Brotli. Changing Height R16 to `Brotli` disables the transform; omitting any role leaves that role's declarations and files unchanged. The Project packer discovers matching files from the World and Region contracts, writes `.br` streams, and records final paths, types, and loader params in `project.json`. Runtime never reads this profile or chooses a compression policy.

Grasslands uses lossless Brotli quality 11 with `lgwin` 20. The 28 selected canonical resources occupy 39.694 M and the generated streams occupy 4.838 M, a reduction of 87.81%.

The editor normalizes that runtime Project to canonical raw bytes at its import boundary. Its workspace, preview object URLs, and exports therefore use the standard `JSON` and `Buffer` declarations rather than compression-specific asset types.

The Project packer validates every generated resource with an offline SHA-256 roundtrip before it writes the Project and build report. Runtime does not calculate SHA-256. Detail transforms remain raw because their measured 14.37% saving does not justify mobile decode and peak-memory cost; Detail R8 remains untouched because Grasslands does not request it. KTX2, GLB, shaders, and environment resources also retain their existing loaders. This profile is lossless; it does not use an error tolerance, replace KTX2, or use HTTP `Content-Encoding`.

Runtime KTX2 declarations omit duplicated sampler params because the KTX2 loader reads transfer, mip, wrap, filter, and anisotropy metadata from each KTX2 payload. The source Project retains authoring declarations, and this packaging step does not change the embedded texture settings.

Because many static servers interpret `.br` as a precompressed HTTP response, these application-managed streams must be served as `application/octet-stream` without a `Content-Encoding` header. The Gallery Vite configuration enforces that contract for development and preview; a production host must apply the same rule or the browser will decode the response before the Demo loader receives it.

The committed decoder-only and encoder-only WASM files are built with `-O3` from [Google Brotli v1.2.0](https://github.com/google/brotli/tree/v1.2.0), commit `028fb5a23661f123017c060daa546b55cf4bde29`, with Emscripten 6.0.6. The Brotli checkout and WASM build tooling are not committed. MIT attribution is in [`src/compression/NOTICE.md`](src/compression/NOTICE.md). The 0.17 M decoder is part of the browser runtime; the 0.67 M encoder is only used by repository asset tools.

Generate the Grasslands Project package or encode any single source file as a standard `.br` stream:

```bash
pnpm --filter @galacean/world-gallery terrain:compression:generate
pnpm --filter @galacean/world-gallery terrain:compression:encode -- --input <source-file>
```

`terrain:compression:generate` is the Project-level exporter: it reads the profile, discovers Terrain resources, applies transforms selected by `AssetType`, performs Brotli encoding, verifies roundtrips, and rewrites the Project. Its `--project`, `--profile`, and optional `--manifest` arguments can target another exported Terrain Project. `terrain:compression:encode` is intentionally lower-level: it performs pure official Brotli on one file and does not inspect or rewrite a Project.

## Runtime diagnostics

The inspector keeps the operational controls needed for scene review:

- camera presets, movement speed, and terrain collision;
- terrain, detail, tree, Prefab, and water visibility;
- mesh LOD and distance scaling;
- direct light, environment light, shadows, fog, tonemapping, and bloom;
- focused terrain and material debug outputs.

The lower-left panel reports frame, memory, draw, instance, triangle, shadow, Region, LOD, and water metrics from the live runtime.

## Geometry normal atlas

Terrain Clipmap packs one RG8 geometry normal per Heightmap sample into a Normal Atlas aligned with the Height Atlas. Forward, SSR, and shadow passes sample this atlas through the same shader path; they do not derive geometry normals from Clipmap triangle faces or take Heightmap finite differences in the shader.

One active Region set must either provide baked normal payloads for every Region or omit them for every Region. Generated Seed World data bakes and transfers its normals in the Field Worker. Other Terrain sources that omit normals use the shared CPU fallback to bake the same atlas before rendering, so the shader contract remains identical.

## Source and release assets

`data/grasslands/source` retains the authoring Project and its original inputs. `data/grasslands/project.json` is the single compressed runtime Project for all three demos. Its raw Height, Alphamap, and Region files remain beside generated `.br` files only as repository encoder inputs and are recorded by `brotli-manifest.json`; they are not runtime Project declarations. `public/` remains the standard physical resource root rather than another asset lifecycle state.

Color textures use ETC1S KTX2 with each source declaration's `isSRGBColorSpace` transfer contract. Normal maps use linear UASTC KTX2. Height, alphamaps, detail masks, and transform data retain their authored typed Buffer resolution. Grasslands intentionally has no hole resource; an editor export adds one only when the user paints holes.

KTX2 transfer functions are generated from each source declaration's `isSRGBColorSpace` flag and checked against the KTX2 DFD during release tests.
