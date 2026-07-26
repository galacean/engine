# Grasslands water demo asset record

This record applies only to the assets actually used by the `showcase-grasslands-stylized-water` demo.

## Authorization basis

- On 2026-07-24, the user confirmed that `Grasslands-Stylized Nature_V1.0_URP.unitypackage` was a paid purchase.
- The user confirmed that the package assets may be used and derivatively processed in this project, including integration into the Engine demo repository and its demo build.
- This confirmation does not relicense the commercial package as open source and does not permit repackaging, resale, or independent distribution of the source package.

No order number, account identifier, payment record, complete Unity package, unrelated Unity source asset, or Lotus dependency is stored in this repository.

## Integrated water asset

| Field | Value |
| --- | --- |
| Logical asset ID | `grasslands-water-normal-1024` |
| Use | Linear tangent-space normal used by the stylized shallow-water appearance |
| Commercial source role | `Water_Normal.png` from the paid Grasslands package |
| Audited source copy | `/Users/xingyi/Documents/data/water-system-assets/river/cases/grasslands-stylized-nature-v1-0-urp/galacean-inputs/textures/grasslands-water-normal-1024.png` |
| Source SHA-256 | `0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332` |
| Repository file | `demo/grasslands/assets/grasslands-water-normal-1024.png` |
| Repository SHA-256 | `0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332` |
| Derivative processing | Same-byte project copy; no pixel conversion or channel rewrite |
| Dimensions | `1024 × 1024` |
| Runtime sampling | Linear data, Repeat, Bilinear, mipmaps enabled, anisotropy 1 |
| Ownership | Demo loader creates and destroys the texture; Water Runtime borrows it |

## Integrated P0 environment asset set

The `grasslands-p0-environment-v1` set is a minimal, Demo-only dependency closure from the same paid Grasslands package. Its canonical tracked-content hash is `2a1d1e0591c0d2a1125332a4b4c08938d89a782a9ea6c46b11c3fd7d35b31580`. The full per-file source path, source SHA-256, source size, conversion, tracked path, tracked SHA-256, tracked size, dimensions/format, owner, borrower, and destroyer are recorded in `demo/grasslands/assets/manifest.json`.

| Runtime role | Paid Unity inputs | Tracked derivatives |
| --- | --- | --- |
| Visible river bed | `MudStones_AlbedoSmoothness.png`, `MudStones_Normal.png` | Two audited `1024 × 1024` PNGs |
| Shallow wet bank | `Sand_AlbedoSmoothness.png`, `Sand_Normal.png` | Two audited `1024 × 1024` PNGs |
| Outer bank | `GrassMud_AlbedoSmoothness.png`, `GrassMud_Normal.png` | Two audited `1024 × 1024` PNGs |
| Large anchor rocks | `Stone_1.fbx`, `Stone_2.fbx`, shared albedo and normal | Two geometry-only GLBs and two audited `1024 × 1024` PNGs |
| Small bed/shore rocks | `Small_Stone_1.fbx`, `Small_Stone_2.fbx`, `Small_Stone_3.fbx`, shared albedo and normal | Three geometry-only GLBs and two same-byte `1024 × 1024` PNGs |

The 2048 textures are downsampled deterministically. Albedo RGB is filtered in linear light, smoothness alpha is filtered independently, and normal vectors are decoded, averaged, and renormalized. The two original 1024 small-rock textures are copied byte-for-byte.

The five FBX files are converted with the official `godotengine/FBX2glTF 0.13.1` macOS release, then deterministically reduced to the audited base mesh. Unity materials, textures, and LOD dependencies are removed, node transforms are reset, and tangent data is generated offline. The repository contains only the five geometry-only GLBs, not the FBX sources.

`AlbedoSmoothness` alpha remains present and auditable in the tracked texture. It is not bound as a Galacean roughness-metallic texture because that input uses G for roughness and B for metallic. Five Demo-local PBR materials therefore use fixed roughness values. This does not alter any frozen water Surface Appearance parameter.

`GrasslandsEnvironmentAssets` owns the 10 textures, five GLTF resources, five shared meshes, five Demo-local PBR materials, and GLTF template entities. `GrasslandsSceneController` borrows them for three terrain material slots and deterministic rock instances. Scene instances are detached first; the environment asset owner then destroys templates, resources, meshes, materials, and textures.

These commercial derivatives may be used only as project-integrated Demo assets under the user-confirmed paid authorization. They must not be independently distributed, repackaged as an asset collection, resold, or presented as open-source source assets. No purchase receipt or order identifier was supplied or added to the repository.

## Reference-only inputs

The target image remains outside the repository and is used only for local Reference Parity review:

- path: `/Users/xingyi/Documents/data/water-system-assets/river/cases/grasslands-stylized-nature-v1-0-urp/reference/target-water-effect.png`
- SHA-256: `c0f711b35a06a31557c3a4ca922ed06cb3c02bca769df420024749b6fd77b4cb`
- dimensions: `1340 × 662`

The source Unity material and shader are reference inputs for parameter and formula semantics only. Their code and package structure are not copied into the Galacean Runtime.

## Removal and replacement

If the authorization scope changes, remove the tracked water normal and the complete 15-file `grasslands-p0-environment-v1` derivative set, then use hash-checked owned replacements or disable the affected Demo-local environment path. Rerun the asset manifest checks, lifecycle/resource gates, M3 human visual approval, and all Regression Golden gates. A replacement does not inherit the file-level parity or authorization statement of any current commercial derivative.
