# Current soil: JulioVII handpainted dirt

- Author: JulioVII / Julio Sillet
- Asset: Stylized Grass & Dirt / Stylized_HandpaintedDirt_01
- Source: https://juliovii.itch.io/ftpgrass-dirt
- License: CC-BY as stated on the author's asset page; attribution required. The page additionally permits commercial application except reselling the asset. It does not specify a CC-BY version.
- Retrieved: 2026-09-15
- Tracked 1K derivatives: `juliovii/basecolor.jpg` and `juliovii/normalogl.jpg`, from `JPEG/Stylized_HandpaintedDirt_01/` in the free `Stylized_GrassAndDirt.zip`.
- Adaptation: original 4K maps resized to 1K with macOS sips; runtime tint for moisture and reduced normal strength. The shared soil provider generates rounded, slightly irregular, almost flush beds and preserves the worked surface when planting. Transient seeds are presented by the shared sowing effect; planting does not deform the soil.

Poly Haven textures below are retained as a previous alternative, no longer used by the current soil provider. Surrounding Grasslands terrain uses the farming-owned maps below.

# Farm Furrows soil textures

The three tracked 1K JPEG files are derived from Poly Haven's **Farm Furrows** asset by Amal Kumar:

- Source: <https://polyhaven.com/a/farm_furrows>
- License: CC0 1.0 Universal, <https://polyhaven.com/license>
- Retrieved: 2026-09-13

| Tracked file | Poly Haven map | Source MD5 |
| --- | --- | --- |
| `farm-furrows-diffuse-1k.jpg` | Diffuse, 1K JPG | `758240d6d0c7608caf20507498c382b9` |
| `farm-furrows-normal-gl-1k.jpg` | OpenGL normal, 1K JPG | `92b1de02166804ade573eb8179efc5f5` |
| `farm-furrows-arm-1k.jpg` | Ambient occlusion, roughness, metallic, 1K JPG | `0ad477ab736a71e59c09f63ad17f88b7` |

These three legacy files are no longer referenced by the current soil provider. The reusable farming domain and persistence modules do not depend on these textures.

# Farm perimeter: Grasslands grass/mud

The farming subsystem owns the two original 1024-square PNG derivatives under `grasslands/`, recovered byte-for-byte from commit `367159073^` (before the Water demo environment assets were removed). Runtime paths are local to `world/gallery/shared/farming` and no longer depend on another demo's asset directory.

| Tracked file | SHA-256 |
| --- | --- |
| `grasslands/grass-mud-albedo-smoothness-1024.png` | `567197d833fb99fd0cc21f908d729ca1b855eb950cffffe13ef181aac51e0375` |
| `grasslands/grass-mud-normal-1024.png` | `501d4c533ff7eafdadf21842097ada44efe24c0c749c194997f9ef56c17491d4` |

Source inputs are the paid Grasslands package's `GrassMud_AlbedoSmoothness.png` and `GrassMud_Normal.png`. The 2048-square originals were downsampled with albedo RGB filtered in linear light, smoothness alpha filtered independently, and normal vectors decoded, averaged and renormalized. Smoothness alpha is retained; the farm uses fixed material roughness rather than treating this as a metallic/roughness map.

The original project asset record documents the user's 2026-07-24 confirmation of paid purchase and authorization for project integration and derivative processing. This does not relicense the assets as open source or permit independent distribution, repackaging as an asset collection, or resale. The current record is [Grasslands asset licenses](../../../../demos/water/demo/grasslands/asset-licenses.md). The historical Grasslands `asset-licenses.md` is available at commit `367159073^`; no purchase receipt was supplied or added.

These maps belong to the shared farming presentation layer. `SoilVisualProvider` loads and binds each map independently and destroys its materials, meshes and loaded textures on disposal. Configuration lives in `presentation/soil/SoilVisualConfig.ts` and loading/material/mesh ownership lives in `presentation/soil/SoilVisualProvider.ts`. The farm example imports this provider; domain rules and persistence do not load visual assets.
