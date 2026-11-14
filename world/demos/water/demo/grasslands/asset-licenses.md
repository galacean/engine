# Grasslands water demo asset record

This record applies only to the assets actually used by the `showcase-grasslands-stylized-water` demo.

## Authorization basis

- On 2026-07-24, the user confirmed that the Grasslands commercial source package was a paid purchase.
- The user confirmed that the package assets may be used and derivatively processed in this project, including integration into the Engine demo repository and its demo build.
- This confirmation does not relicense the commercial package as open source and does not permit repackaging, resale, or independent distribution of the source package.

No order number, account identifier, payment record, complete commercial source package, unrelated source asset, or Lotus dependency is stored in this repository.

## Integrated water asset

| Field | Value |
| --- | --- |
| Stable logical asset ID | `grasslands-water-normal-1024` (retained for authoring compatibility; runtime derivative is 512-square) |
| Use | Linear tangent-space normal used by the stylized shallow-water appearance |
| Commercial source role | `Water_Normal.png` is grayscale height data converted offline to a tangent-space normal |
| Origin SHA-256 | `0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332` |
| Decoded source SHA-256 | `af03f8e85a378367fc5e6a9f93faae1b1d83f4bd109a9ad247a864a506661f44` |
| Repository source file | [1024 PNG](../../../../shared/water/resources/lake/assets/grasslands-water-normal-1024.png) |
| Repository source SHA-256 | `af03f8e85a378367fc5e6a9f93faae1b1d83f4bd109a9ad247a864a506661f44` |
| Runtime derivative | [512 KTX2](../../../../shared/water/resources/lake/assets/grasslands-water-normal-512.ktx2) |
| Runtime derivative SHA-256 | `4ba55626a9d761edf5d5beb7d71eafdf2e9d393e3029b33491b0dd3d44159594` |
| Derivative processing | Height scale `0.01`, Sobel height-to-normal conversion, packed-normal decoding to linear RGBA8, 512-square mobile downsample, then UASTC quality 4 with Zstd 18 |
| Runtime dimensions | `512 × 512` |
| Runtime sampling | Linear data, Repeat, Bilinear, mipmaps enabled, anisotropy 1 |
| Ownership | Demo loader creates and destroys the texture; Water Runtime borrows it |

The 1024 PNG remains in the authoring repository for development comparison and resource preparation tests. SeedWorld source snapshots exclude this PNG and retain the 512 KTX2 runtime derivative and provenance manifest without changing their bytes or logical asset identity.

## Lake landscape assets

The demo uses a selected subset of the user's StylizedNatureVol2 library, as requested on 2026-09-10. The per-file source paths, source hashes, output hashes, dimensions, material slots and triangle counts are recorded in `landscape/assets/manifest.json`. Only selected model geometry and texture derivatives are included; Unreal material/shader code is not copied.

`tools/prepare-lake-landscape-assets.py` produces 10 meter-space GLBs and 13 KTX2 textures. Environment maps use 512-square pixels and leaf masks use 256-square pixels, following the current SeedWorld runtime texture sizes. Prepared PNGs remain under `landscape/source/` for auditing and are never imported by the runtime. DirectX normal maps are converted to OpenGL, then renormalized after resizing. Tree leaf color, alpha clipping and double-sided rendering are authored by this demo.

The encoder is pinned to Khronos KTX-Software `v4.4.2`, matching `demos/terrain/scripts/encode-seed-world-runtime-textures.mjs`. The official Darwin arm64 package SHA-256 is `500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c`.

| Texture role | Encoding | Channels / transfer |
| --- | --- | --- |
| Opaque ground, rock and bark color | ETC1S / BasisLZ, quality 255, compression level 4 | RGB / sRGB; no redundant alpha |
| Ground, rock and bark normal | UASTC quality 4 + Zstd 18 | RGB / linear, original XYZ layout |
| Pine and maple leaf masks | UASTC quality 4 + Zstd 18 | RGBA / linear, 256-square |
| Fern color with alpha clipping | UASTC quality 4 + Zstd 18 | RGBA / sRGB |

All derivatives include full Lanczos4 mip chains with wrap sampling, top-left orientation, one encoder thread and deterministic test-run metadata. `--normal-mode` is deliberately not used: it repacks XYZ into an XY layout that the existing PBR shader does not consume. UASTC follows SeedWorld's quality settings; ETC1S is reserved for the opaque color maps. The engine selects supported GPU formats at load time, with its existing RGBA8 fallback on unsupported devices.

Regenerate with `python3 tools/prepare-lake-landscape-assets.py --source /path/to/StylizedNatureVol2-Unity-GLB-Textures --ktx /path/to/ktx`. Add `--check` to regenerate in a temporary directory and compare every file byte-for-byte without modifying tracked outputs. `LAKE_KTX2_KTX` can also specify the executable. The manifest records original and prepared PNG hashes, exact encoding arguments and KTX2 hashes. The loader verifies compressed bytes before using `AssetType.KTX2`, validates dimensions, transfer function and mip count, and retains its blob URLs until disposal so the engine can restore textures after context loss.

`LakeLandscapeAssets` owns the GLTF resources, meshes, template materials, shared PBR materials and textures. `GrasslandsSceneController` borrows them for one blended ground draw and deterministic scenery. It destroys scene instances before releasing the asset owner. `landscape/LakeLandscapeLayout.ts` owns the art layout and `landscape/LakeGround.shader` owns the ground material blend. Neither is imported by Water runtime or SeedWorld.

Water retains ownership of reflection policy, SSR scheduling, camera color/depth and refraction. The Lake demo enables the existing SSR budget for High quality and uses the shared environment fallback for unavailable screen-space samples. Medium and Low retain environment reflection.

The previous Grasslands P0 environment derivatives and their conversion script have been replaced. The existing water normal has its own independent source and ownership record above.

## Reference-only inputs

The target image remains outside the repository and is used only for local visual-parity review:

- SHA-256: `c0f711b35a06a31557c3a4ca922ed06cb3c02bca769df420024749b6fd77b4cb`
- dimensions: `1340 × 662`

The source material and shader are reference inputs for parameter and formula semantics only. Their code and package structure are not copied into the Galacean Runtime.

## Removal and replacement

Keep source attribution when replacing derivatives. Rebuild `landscape/assets/manifest.json` through the preparation tool and rerun integrity, layout, lifecycle and browser checks. The selected derivatives are project-integrated demo assets, not a standalone distribution of the source package.
