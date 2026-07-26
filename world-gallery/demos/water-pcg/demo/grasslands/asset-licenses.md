# Grasslands water demo asset record

This record applies only to the assets actually used by the `showcase-grasslands-stylized-water` demo.

## Authorization basis

- On 2026-07-24, the user confirmed that `Grasslands-Stylized Nature_V1.0_URP.unitypackage` was a paid purchase.
- The user confirmed that the package assets may be used and derivatively processed in this project, including integration into the Engine demo repository and its demo build.
- This confirmation does not relicense the commercial package as open source and does not permit repackaging, resale, or independent distribution of the source package.

No order number, account identifier, payment record, complete Unity package, unrelated Unity source asset, or Lotus dependency is stored in this repository.

## Integrated asset

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

## Reference-only inputs

The target image remains outside the repository and is used only for local Reference Parity review:

- path: `/Users/xingyi/Documents/data/water-system-assets/river/cases/grasslands-stylized-nature-v1-0-urp/reference/target-water-effect.png`
- SHA-256: `c0f711b35a06a31557c3a4ca922ed06cb3c02bca769df420024749b6fd77b4cb`
- dimensions: `1340 × 662`

The source Unity material and shader are reference inputs for parameter and formula semantics only. Their code and package structure are not copied into the Galacean Runtime.

## Removal and replacement

If the authorization scope changes, remove the tracked normal, use the hash-checked local override or an owned replacement, and rerun M3 human visual approval plus all Regression Golden gates. A replacement does not inherit the file-level parity statement of the current normal.
