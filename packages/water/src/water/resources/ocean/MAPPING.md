# Stylized Water 2 Demo to Galacean Ocean mapping

Source scene: `Assets/StylizedWater2/_Demo/StylizedWaterDemo.unity`

Source material: `Assets/StylizedWater2/_Demo/DemoAssets/Materials/StylizedWater2_Demo.mat`

The port intentionally preserves the source material's stylized response:

- fixed-basis Gerstner displacement and normal construction from `Waves.hlsl`;
- two counter-scrolling near normal samples plus the distance normal map;
- horizontal/vertical exponential depth color response;
- environment reflection and the source custom Fresnel response;
- custom Blinn-Phong sun reflection, Lambert lighting, and translucency;
- camera opaque-color/depth refraction with foreground rejection;
- texture-based surface foam with zero crest contribution;
- depth/SDF-driven sharp intersection foam and ripple breakup;
- two-sample minimum caustics projection.

Runtime textures are deterministic 512-square KTX2 derivatives of the five authorized PNG inputs. All five use high-quality UASTC with Zstd supercompression; the two normal maps retain linear RGB data, while caustics, foam, and intersection noise retain their existing sRGB sampling contract. See `KTX2.md` for the pinned mobile encoder profile.

Planar reflection, screen-space reflection, wind-field coupling, CPU surface queries, water volume, underwater rendering, temporal foam, wake/contact/obstacle injection, and quality-tier variants are outside this port.
