# Decoration cut and backing-mask assets

These are two different original resources; do not substitute one for the other.

## Geometric cut SDF

`window-cuts.ts` exposes 18 original-order, 128×128 `R8_SNORM` layers plus their exact expanded XY sampling bounds. Signed normalized samples × 0.25 encode native distance in metres, negative inside. The getter decodes and caches immutable byte arrays, without rasterization or distance-transform work during gameplay.

`tests/export-decoration-window-cuts.mjs` executes the TS bake offline, verifies its bounds and SHA-256 against **all 18 retained original-machine-code oracle layers**, then writes the bundled data. Each layer's original visual mesh identities and output digest are recorded in `window-cuts-provenance.json`. Source binary SHA-256: `4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a`.

The static samples occupy 294,912 bytes, represented by a 396,204-byte TS module (43,218 bytes gzip). Mesh assembly, placement transforms and sampling coordinates remain the consumer's responsibility.

## Foundation backing mask

`foundation-window-masks.ts` exports `foundationWindowMasks`, compatible with `leaseResidentTexture(engine, "window_cutouts", true, spec, staticAsset)`. Its content-hash blobs are in `assets/original/`, so the existing static asset loader resolves them without a new I/O path.

Original `window_cutouts` is **256×256 × 8 layers, 9 mips, BC7_SRGB_BLOCK (146)**. The original package hash is `acdd86710d80d6865ef2e8d0a757310054c40a72ac682e4fefa7385e852efa76`. Original layer-major/mip-minor payloads were regrouped into one array-layer-concatenated file per mip for the existing texture upload helper. No vertical flip, gamma conversion, alpha replacement or channel selection is applied.

The fallback uses `texture2ddecoder==1.0.6` offline. That package documents BC7 output as BGRA; the exporter explicitly reorders it to RGBA. RGB stays sRGB encoded; alpha stays linear. Original BC7 and decoded RGBA complete mip chains are retained, with every mip/layer digest in `foundation-window-masks-provenance.json`.

The mask lives in RGB, not an assumed transparency alpha: base-level alpha is 255 except layers 1/2 containing decoder values 254–255. Layer 3 is entirely white. Shader channel selection must follow native shader evidence.

BC7 total is 699,264 bytes and RGBA total 2,796,192 bytes. Distinct files combined gzip to 30,612 bytes; the renderer uploads only the selected BC7 or fallback representation. This is a storage/transfer measurement, not a GPU performance claim.

## Reproduction

```sh
node world/gallery/shared/tiny-glade/tests/export-decoration-window-cuts.mjs /absolute/path/to/window-sdf-results.json
python world/gallery/shared/tiny-glade/tests/export-decoration-foundation-masks.py /absolute/path/to/foundation-textures/manifest.json
node world/gallery/shared/tiny-glade/tests/verify-decoration-window-assets.mjs
```

The Python export requires `texture2ddecoder==1.0.6` only in the offline tooling environment. Browser runtime does not depend on Python, an installed game, or native function replay.

Validated on 2026-10-18: all 18 SDF hashes and bounds match the native oracle; bundled verification passes all 18 SDF layers and 144 backing-mask layer payloads (9 mips × 8 layers × 2 representations).
