# River surface textures

Derived from the user-authorized Stylized Water 2 v1.7.0 package by Staggart Creations. Original copyright remains with its author; these assets are not relicensed by the surrounding repository license.

Reference: `Assets/StylizedWater2/_Demo/RiverDemo.unity`, material `StylizedWater2_RiverDemo.mat`.

512 x 512 linear RGBA8, base64 encoded for synchronous GPU upload and deterministic offline use. `normals`: SmoothWaves RG, StreamWaves RG in BA. `foam`: WaterfallFoam RGBA with sRGB-to-linear conversion baked into RGB. Source images are resized using Pillow LANCZOS; normal XY channels are interpreted as data, not sRGB colors. Repeat wrapping and generated mipmaps.

Source SHA256:

- `Normals/SmoothWaves.png`: `3fe63002b7f87c275045d03cd241752ec81b3f14b71777c4d59b43fa1cd273d1`
- `Normals/StreamWaves.png`: `c27d2209b2ec7c6502b6967da0956e6e689b66e5914c1af0f13c5fc9453b13e1`
- `Foam/WaterfallFoam.png`: `db689d3092a65387239247782d49864ecbc26bc05c0baf3344624ca1bf827aa3`

The River look reads the reference material's linear HDR shallow/deep colors and alpha. Its depth response uses the maximum of camera ray depth (0.32/m) and surface-normal depth (0.3/m), calibrated for the deeper PCG riverbed instead of copying RiverDemo's 1.6/m and 0.6/m coefficients. Deep opacity is 0.8 so the bed remains visible through the pools; scene composition multiplies this density by the interpolated color alpha. Existing Lake/Ocean closures keep their previous default opacity. Regular and slope normals use two samples each, RNM blending, and the reference's tiling/speed ratios. Foam uses separate regular/slope samples and a slope dissolve mask. PCG travel-time coordinates replace the source mesh UV layout, so transport follows bends and authored local flow speed.

This adapts the water material, not the complete Unity scene: the generated riverbed, lighting environment, reflection source, and underwater caustics differ from RiverDemo.
