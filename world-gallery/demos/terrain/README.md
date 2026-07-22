# Terrain core demo

This demo implements sparse-region terrain data, geometry clipmaps, height/control sampling, projection, detiling, automatic material selection, dual scaling, macro variation, and procedural world continuation. The current renderer intentionally displays the sampled surface color; physically based lighting remains a separate milestone.

## Runtime contract

`data/manifest.json` describes three sparse 1024×1024 regions at `(0,-2)`, `(0,-1)`, and `(0,0)`. A region keeps a stable world location while GPU texture-array layers are only transient storage.

```text
main.ts
├── TerrainDataLoader  height/control/color arrays + region lookup texture
├── LayerTextureLoader material texture assets in ID order
├── TerrainMaterial    shared data, parameters, and production shader
└── TerrainClipmap     10 mesh segment types, 7 simultaneous clipmap LOD rings, 144 segments
```

The height atlas is vertically stacked little-endian R16 data. Controls remain raw little-endian uint32 words on the CPU and are uploaded as four linear RGBA8 bytes, then reconstructed in the shader. Heights are expanded into the red channel of a linear RGBA32F array because the engine does not expose a single-channel R32F texture format. Triangle winding is reversed to match the engine’s front-face convention without changing diagonals.

## Commands

From the repository root:

```bash
pnpm --filter @galacean/world-gallery typecheck:terrain
pnpm --filter @galacean/world-gallery test:terrain:e2e
```

Set `TERRAIN_E2E_URL` to test an already-running gallery server. Playwright otherwise starts an isolated Vite server. Test output goes to the system temporary directory unless `TERRAIN_E2E_OUTPUT` is set. Set `TERRAIN_E2E_CAPTURE=1` to record fixed clipmap, detiled-surface, and wireframe diagnostics; ordinary e2e runs use framebuffer assertions.

## Debug diagnostics

Open `/demos/terrain/` for the sole production demo and its Inspector. It runs the production clipmap, material, and shader; it does not create a duplicate debug renderer. The Inspector exposes deterministic camera poses and diagnostic views for region coverage, control fields, height, holes, region and vertex grids, terrain normals, clipmap LOD wireframe, dual distance, and individual layer sampling.

After the status becomes `ready`, narrow debug controls are available through `window.terrainDebug`:

- `setView(name)`, `setPose(name)`, and `setDebugLayer(id)` select a diagnostic;
- `getTuning()`, `setLayerTuning()`, `setSamplingTuning()`, and `resetTuning()` alter inspected parameters;
- `inspect()` returns region and clipmap placement snapshots without engine objects;
- `readProbe(x, z)` decodes the CPU height/control fixture at a world-space position.

Implementation decisions and remaining work live in `world-gallery/terrain-reference/implementation-mapping.md` and `world-gallery/terrain-reference/TODO.md`.
