# SSR Demo asset receipt

Every third-party asset in this directory is licensed under [Creative Commons Zero 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required, but the upstream authors and exact transformations are recorded here for auditability.

## Gas mask

- Asset: [Gasmask](https://opengameart.org/content/gasmask)
- Author: `kleenstudios`
- Upstream file: `Gasmask.blend` (Blender 2.79), SHA-256 `5c092e113e2944fb9318e14a1dc5a71bbce19ab2bdbf50a91ad9867f24257e91`
- License: CC0
- Repository derivative: `gasmask.glb`, SHA-256 `5ba6f501bc08af8d5804034339ca18f958e45530c4e5d5dfd1745b1fdd338781`
- Conversion: Blender 4.4.3 glTF exporter, selected mesh only, embedded 1K PBR textures.

## Wooden dock material

- Asset: [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood)
- Author: Rob Tuytel
- License: CC0
- `fine-grained-wood-basecolor.jpg`, SHA-256 `d171f45ef01bc6e239b00dfaa4961bcd27f7d8e93e3962da3bd3d0ce703d802c`
- `fine-grained-wood-normal-gl.jpg`, SHA-256 `ba95eadc009818e161d0f753191f1bacc3fc861e593be0bc6d82b437f9ec8044`
- Source resolution: 1K JPG; the normal map uses the OpenGL convention.

## Water surface PBR

- Asset: [Water Surface](https://proctexture.com/textures/water/surface-water/water-surface)
- Publisher: ProcTexture
- License: CC0
- Upstream package: `water-surface.zip`, SHA-256 `ebd1276ca7475ae028335d8f2ff3b3d3b179e50e7a4ad73bb3d1f0d234c727d6`
- `water-surface-basecolor.png`, SHA-256 `7224916991463981d48d727e74682687cc6132142baed79da0212c2ad80ff48d`
- `water-surface-normal.png`, SHA-256 `80b8256f664fa312a49cf92257beba67f0ef56ab60dba0844c6c16ea6deaa766`
- `water-surface-roughness.png`, SHA-256 `ddf82e94421deb55fde298009278687546bf92982cf1c25a8a2b9e0775bbc18c`
- Conversion: extracted the 1K BaseColor, OpenGL normal, and roughness maps from the upstream PBR pack; no pixels were edited.

## Tree models

- Asset: [Nature Kit](https://kenney.nl/assets/nature-kit)
- Author: Kenney
- License: CC0 (the unmodified upstream license text is retained as `LICENSE-KENNEY.txt`)
- Upstream package: `kenney_nature-kit.zip`, SHA-256 `fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d`
- `kenney-tree-oak.glb`, source `tree_oak.glb`, SHA-256 `d7fd8773674928c50c11b66d12c636d49bdcc15a8b1c7fbb98e6f63a3439a3f3`
- `kenney-tree-pine-tall.glb`, source `tree_pineTallA_detailed.glb`, SHA-256 `9ba6337460e718b8baf165b23c02f39455e3d5757b1911505410c46bc88a86b5`
- `kenney-tree-pine-round.glb`, source `tree_pineRoundC.glb`, SHA-256 `29080a4935bae6b4ab29066f22c99c58f88b23ce4e2f79b4dcbb5e76de73f69d`
- Conversion: filename-only copy from the upstream GLB files; geometry, materials, and textures are unchanged.

## Meadow sky and reflection environment

- Asset: [Meadow 2](https://polyhaven.com/a/meadow_2)
- Author: Poly Haven contributors
- License: CC0
- Upstream: `meadow_2_4k.exr`, SHA-256 `4edb17f335aee9c444dd35082b9186c254e36a11601f4e9e18c7da393dad0681`
- `meadow-2-px.png`, SHA-256 `deebd14f6a0e17a49a53a5deb70ca7283836cf2c910df77acb08290dd0511eb3`
- `meadow-2-nx.png`, SHA-256 `880431c22148a5892a7f478e975d5c2abe3a760f172bc47c5f779d96ba4c7101`
- `meadow-2-py.png`, SHA-256 `70475a2abea57b3c0eace9b35a8f3a2b6dbdae5e537931a1edcb133dd9eb3672`
- `meadow-2-ny.png`, SHA-256 `4dbe49dd98137f37d141aba9716de5f3ea2ea6b3a02011de0487eb926a1e7e3e`
- `meadow-2-pz.png`, SHA-256 `eefca4e02725d6a11e271830d9696a7f00c096700040e39f7ca8af8f6e5da5c2`
- `meadow-2-nz.png`, SHA-256 `313273eb94a52c97ea7859506ed26564dced7d22de873a7fc5bda594598e0f61`
- Conversion: Filament `cmgen` 1.75.0 extracted a 256-pixel PNG cubemap. Galacean generates the mip chain at runtime and uses the same cube for the visible sky and screen-independent PBR fallback.

The wooden dock, corrugated hose, hose terminal, chrome buoy, and matte clay buoy are generated from primitives or procedural mesh code in `../main.ts` and do not contain third-party geometry.
