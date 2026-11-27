# River / Waterfall KTX2 recipe

The ten PNGs in this folder and `drops/` are retained as source artwork. Runtime
assets are the derived files in `ktx2/`, copied unchanged to the native Water
project. Lake and Ocean already provide six KTX2 assets and remain unchanged.

Encoding uses the project's public `@galacean/tools-ktx2-encoder`:
`NodeKtx2Encoder.encode()`, UASTC quality 3, Zstd supercompression, full mip chain,
no Y flip and no RDO. Outputs larger than 512 retain their existing 512 mip
and all smaller levels, with rebuilt KTX2 indices. Independent Zstd-compressed
UASTC level payloads, DFD color/alpha semantics and metadata remain unchanged.
The original PNG artwork stays at its authored resolution. Wave normals use normal-map mode. Wave and cloud
retain linear sampling; the other eight inputs retain sRGB sampling. The cloud,
mist and splash alpha channels and their atlas layouts are preserved. KTX2 is
lossy; it is not a lossless replacement for the source artwork. Some individual
files grow compared with PNG because they include all mip levels; supported GPUs
can upload block-compressed data instead of expanded RGBA pixels.

Use an installed version that exports `NodeKtx2Encoder`, or point the environment
variable at the shared source entry (the Engine dev dependency `ts-node` loads
TypeScript without copying the codec into Water):

```sh
WATER_KTX2_ENCODER=<tools-checkout>/packages/ktx2-encoder/src/NodeKtx2Encoder.ts \
  node packages/water/src/water/scripts/encode-river-textures.mjs

WATER_KTX2_ENCODER=<tools-checkout>/packages/ktx2-encoder/src/NodeKtx2Encoder.ts \
  node packages/water/src/water/scripts/encode-river-textures.mjs --check

node world/scripts/generate-water-assets.mjs --textures-only
node --test world/scripts/tests/generate-water-assets.test.mjs
```

`ktx2-manifest.json` records each original PNG hash, derived KTX2 hash, output dimensions,
input format, color space and mip count. The resource descriptors identify the
KTX2 bytes, not the retained PNG. `--check` regenerates in a temporary directory
and requires identical bytes and manifest. `--textures-only` preserves the
checked-in authored Shader sources and old near/far AOT bytes; full Shader
regeneration remains a separate operation.

SeedWorld upgrades only untouched built-in PNG descriptors at their exact old
delivery URLs. Cached bytes must match the recorded original PNG hash. Saved
material reference keys remain stable: their old virtual `.png` name becomes an
alias with explicit type `KTX2`, a new delivery URL and verified compressed bytes.
Custom URLs, edited binary contents, authored color-space overrides, sampler
settings and material edits remain intact; deleted resources are not restored.

The old synchronous `normals.rgba.base64` / `foam.rgba.base64` compatibility inputs
and runtime-generated field textures/render targets are separate from the native
project's sixteen offline texture assets; this recipe does not change their APIs.
