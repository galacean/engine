# Instant camera and photograph models

Both assets were supplied by the user on 2026-10-27. Original glTF, buffers and image bytes are packed losslessly into GLB. No decimation, texture resizing or geometry removal has been performed. Original downloads are untouched.

## Camera: Polaroid Camera

- Author: [Boxroom 3D](https://sketchfab.com/Boxroom_3D).
- [Source](https://sketchfab.com/3d-models/polaroid-camera-920ad62faa9d4aa48bc6e9535f3d07fe).
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- File: `polaroid-camera.glb`, 13,442,732 bytes; 271,187 triangles.
- Runtime changes: scale/orientation, shutter sound, flash lighting and entrance/retraction animation.

## Photograph: Polaroid Photo Sample

- Author: [Edoardo Galati](https://sketchfab.com/edoardogalati).
- [Source](https://sketchfab.com/3d-models/polaroid-photo-sample-fe1d05e189dc4da197f6ba2717abe182).
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- File: `polaroid-photo.glb`, 5,069,328 bytes; 188 triangles.
- Runtime changes: align the supplied curved paper by its UV axes, replace the sample portrait material with the current world screenshot, animate ejection, flight, docking and editing while retaining paper curvature. Preserve the original front/back/frame mesh topology and source atlas.

Neither asset includes animation; the interaction animation is authored in Seed World. No endorsement by the authors is implied. Optimize only after the complete interaction has been accepted.

## Thumbtack: [Paper Mario: Sticker Star] Thumbtack

- Author: [Starlight_lambda64](https://sketchfab.com/Starlight_lambda64).
- [Source](https://sketchfab.com/3d-models/paper-mario-sticker-star-thumbtack-6ee3f284a77c40fa81f2f88af03aafd1).
- License supplied in the archive: [Sketchfab Standard](https://sketchfab.com/licenses), **not CC BY**.
- File: `thumbtack.glb`, 48,300 bytes; 1,160 triangles. Original geometry and texture bytes preserved through lossless packing.
- Runtime adaptation: instantiated as a real lit mesh for each photo in the Engine presentation Scene. The needle tip is the insertion pivot; lifting translates it along depth before it exits upward. No raster thumbtack image or CSS animation is used.
