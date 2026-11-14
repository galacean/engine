# Instant camera and photograph models

Both assets were supplied by the user on 2026-10-27. Original glTF, buffers and image bytes were packed losslessly into GLB. Original downloads are untouched. The camera and the photograph were optimized on 2026-11-11 (see below). The thumbtack keeps its lossless packing: no decimation, texture resizing or geometry removal.

## Camera: Polaroid Camera

- Author: [Boxroom 3D](https://sketchfab.com/Boxroom_3D).
- [Source](https://sketchfab.com/3d-models/polaroid-camera-920ad62faa9d4aa48bc6e9535f3d07fe).
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- File: `polaroid-camera.glb`, 2,534,216 bytes; 62,139 triangles.
- Changes to the source asset (2026-11-11, requested by the user because the file was too large):
  - Geometry: each primitive simplified with meshoptimizer 1.2.0 `simplifyWithAttributes`. Error limit 0.0005 of the mesh extent, normal weight 0.5, UV weight 1. Remaining vertices are a subset of the source vertices. The 33 meshes, 55 nodes and 13 materials are unchanged. The bounding box is unchanged, so the film-exit and flash anchors keep their coordinates.
  - Textures: both 1024×1024 images re-encoded to KTX2 with `@galacean/tools-ktx2-encoder` 1.5.0-alpha.0: UASTC quality 3, Zstd, full mip chain, no resize, no Y flip. The normal map uses normal-map mode and linear transfer; the base color uses sRGB. `KHR_texture_basisu` is required.
  - Storage: `KHR_mesh_quantization` and `EXT_meshopt_compression` (glTF-Transform 4.5.1 `meshopt`, level `medium`).
  - A stronger simplification (error limit 0.001 or position-only weighting) shows cracks and normal-map distortion on the white body in the Engine. Check any further reduction in the Engine, not in an offline renderer.
- Source file before optimization: 13,442,732 bytes; 271,187 triangles; SHA-256 `a1e14f77097682047b10b1ba10a03d5c0d896e7a26b5016a1b772877a80fcc24`. It is in the Git history of this path.
- Runtime changes: scale/orientation, shutter sound, flash lighting and entrance/retraction animation.

## Photograph: Polaroid Photo Sample

- Author: [Edoardo Galati](https://sketchfab.com/edoardogalati).
- [Source](https://sketchfab.com/3d-models/polaroid-photo-sample-fe1d05e189dc4da197f6ba2717abe182).
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- File: `polaroid-photo.glb`, 695,828 bytes; 188 triangles.
- Changes to the source asset (2026-11-11, requested by the user):
  - Texture: the 4096×4096 PNG atlas scaled to 1024×1024 (Lanczos3) and re-encoded to KTX2 with `@galacean/tools-ktx2-encoder` 1.5.0-alpha.0: UASTC quality 3, Zstd, full mip chain, sRGB, no Y flip. `KHR_texture_basisu` is required. The atlas layout is unchanged.
  - Geometry, nodes and materials are unchanged: every vertex attribute and index value equals the source.
- Source file before optimization: 5,069,328 bytes; SHA-256 `323ad2a623f0de71fade6a82f2cf26f0294bf846c4ac1c754efe018da267ba67`. It is in the Git history of its path.
- Runtime changes: align the supplied curved paper by its UV axes, replace the sample portrait material with the current world screenshot, animate ejection, flight, docking and editing while retaining paper curvature. Preserve the original front/back/frame mesh topology and the atlas layout.

Neither asset includes animation; the interaction animation is authored in Seed World. No endorsement by the authors is implied.

## Thumbtack: [Paper Mario: Sticker Star] Thumbtack

- Author: [Starlight_lambda64](https://sketchfab.com/Starlight_lambda64).
- [Source](https://sketchfab.com/3d-models/paper-mario-sticker-star-thumbtack-6ee3f284a77c40fa81f2f88af03aafd1).
- License supplied in the archive: [Sketchfab Standard](https://sketchfab.com/licenses), **not CC BY**.
- File: `thumbtack.glb`, 48,300 bytes; 1,160 triangles. Original geometry and texture bytes preserved through lossless packing.
- Runtime adaptation: instantiated as a real lit mesh for each photo in the Engine presentation Scene. The needle tip is the insertion pivot; lifting translates it along depth before it exits upward. No raster thumbtack image or CSS animation is used.
