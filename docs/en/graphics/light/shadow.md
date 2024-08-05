---
order: 6
title: Shadows
type: Graphics
group: Lighting
label: Graphics/Light
---

Shadows can effectively enhance the three-dimensionality and realism of the rendered scene. To achieve this, the so-called ShadowMap technique is usually used. Simply put, it involves rendering the scene's depth from the light source as a virtual camera, and then when rendering the scene from the camera's perspective, if an object's depth is deeper than the previously saved depth information, it is considered to be occluded by other objects, and thus a shadow is rendered.

## Scene Configuration

<img src="https://gw.alipayobjects.com/zos/OasisHub/c1246c17-ba92-405d-b111-3cff6796097d/image-20240730114010025.png" alt="image-20240730114010025" style="zoom:50%;" />

There are some configurations in the scene that can affect global shadows:

| Parameter | Application |
| :-- | :-- |
| [Cast Shadow](/en/apis/core/#Scene-castShadows) | Whether to cast shadows. This is the main switch. |
| [Transparent](/en/apis/core/#Scene-enableTransparentShadow) | Whether to cast transparent shadows. When enabled, transparent objects can also cast shadows. |
| [Resolution](/en/apis/core/#Scene-shadowResolution) | The resolution of the Shadowmap. The `Low` option uses a resolution of 512, the `Medium` option uses a resolution of 1024, the `High` option uses a resolution of 2048, and the `VeryHigh` option uses a resolution of 4096. |
| [Cascades](/en/apis/core/#Scene-shadowCascades) | The number of [cascaded shadows](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps). Generally used for large scenes to divide the shadowmap resolution, which can improve shadow aliasing at different distances. After enabling two-level cascaded shadows, you can configure it through [ShadowTwoCascadeSplits](/en/apis/core/#Scene-shadowTwoCascadeSplits), and after enabling four-level cascaded shadows, you can configure it through [ShadowFourCascadeSplits](/en/apis/core/#Scene-shadowFourCascadeSplits). |
| [Distance](/en/apis/core/#Scene-shadowDistance) | The farthest shadow distance (distance from the camera), beyond which shadows are not visible. |
| [Fade Border](/en/apis/core/#Scene-shadowFadeBorder) | The shadow fade distance, indicating the proportion of the shadow distance at which fading starts, ranging from [0~1]. A value of 0 means no fading. |

## Light Configuration

<img src="https://gw.alipayobjects.com/zos/OasisHub/1b572189-db78-4f56-9d42-d8b5ea1fe857/image-20240724183629537.png" alt="image-20240724183629537" style="zoom:50%;" />

To cast shadows, there needs to be a [directional light](/en/docs/graphics/light/directional) in the scene. Currently, the engine can only enable shadows for one directional light `DirectLight`, mainly because shadow rendering doubles the DrawCall, which can severely impact rendering performance. In the absence of a specified [main light(scene.sun)](/en/apis/core/#Scene-sun), the engine will default to selecting the light with the highest intensity to cast shadows:

| Parameter | Application |
| :------------------------------------------------ | :------------------------------------------------- |
| [Shadow Type](/en/apis/core/#Light-shadowType) | The type of shadow casting. Different types affect rendering performance and visual effects. |
| [Shadow Bias](/en/apis/core/#Light-shadowBias) | The offset of the shadow. Prevents shadow distortion. |
| [Normal Bias](/en/apis/core/#Light-shadowNormalBias) | The normal offset of the shadow. Avoids shadow distortion. |
| [Near Plane](/en/apis/core/#Light-shadowNearPlane) | The near clipping plane when rendering the depth map. Affects the shadow clipping plane and precision. |
| [Strength](/en/apis/core/#Light-shadowStrength) | The strength of the shadow. Controls the transparency of the shadow. |

## Projectiles and Receivers

<img src="https://gw.alipayobjects.com/zos/OasisHub/f3125f0f-09e6-4404-a84c-7013df5c0db3/image-20240724184711014.png" alt="image-20240724184711014" style="zoom:50%;" />

In the [Mesh Renderer Component](/en/docs/graphics/renderer/meshRenderer), `receiveShadows` determines whether the object receives shadows, and `castShadows` determines whether the object casts shadows.

## Transparent Shadows

Starting from version `1.3`, the engine supports casting shadows for alpha cutoff (Alpha Cutoff) objects and transparent (Transparent) objects. For transparent objects to cast shadows, you need to enable the `Transparent` switch in the scene panel:

![](https://gw.alipayobjects.com/zos/OasisHub/3c972121-d072-4d2c-ba87-2a9ec88c9268/2024-07-30%25252011.36.32.gif)
