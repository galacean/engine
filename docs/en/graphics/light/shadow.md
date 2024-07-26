---
order: 6
title: Shadows
type: Graphics
group: Lighting
label: Graphics/Light
---

Shadows can effectively enhance the three-dimensionality and realism of the rendered image. In real-time rendering, the so-called ShadowMap technology is generally used to draw shadows. Simply put, the light source is used as a virtual camera to render the depth of the scene. Then, when rendering the image from the scene camera, if the depth of the object is deeper than the previously saved depth information, it is considered to be blocked by other objects, and the shadow is rendered accordingly.

## Scene Configuration

<img src="https://gw.alipayobjects.com/zos/OasisHub/51e08840-95c0-4c68-82f0-0d2e29fbe966/image-20240726111645816.png" alt="image-20240726111645816" style="zoom:50%;" />

There are some configurations in the scene that can affect the global shadow:

| Parameters | Application |
| :-- | :-- |
| [Cast Shadow](/apis/core/#Scene-castShadows) | Whether to cast shadows. This is the master switch. |
| [Transparent](/apis/core/#Scene-enableTransparentShadow) | Whether to cast transparent shadows. When turned on, transparent objects can also cast shadows. |
| [Resolution](/apis/core/#Scene-shadowResolution) | Shadowmap resolution. |
| [Cascades](/apis/core/#Scene-shadowCascades) | Cascade shadow quantity settings. Generally used to split shadow resolution in large scenes. |
| [ShadowTwoCascadeSplits](/apis/core/#Scene-shadowTwoCascadeSplits) | Parameters for dividing two-level cascade shadows. |
| [ShadowFourCascadeSplits](/apis/core/#Scene-shadowFourCascadeSplits) | Parameters for dividing four-level cascade shadows. |
| [Distance](/apis/core/#Scene-shadowDistance) | Farthest shadow distance. Shadows cannot be seen beyond this distance. |
| [Fade Border](/apis/core/#Scene-shadowFadeBorder) | Shadow attenuation distance, which indicates the proportion of the shadow distance from which attenuation begins. The range is [0~1]. When it is 0, it means no attenuation. |

## Light Configuration

<img src="https://gw.alipayobjects.com/zos/OasisHub/1b572189-db78-4f56-9d42-d8b5ea1fe857/image-20240724183629537.png" alt="image-20240724183629537" style="zoom:50%;" />

To cast shadows, you need a [directional light](/en/docs/graphics/light/directional) in the scene, and then you can configure some properties that determine the shadowmap:

| Parameters                                        | Application                          |
| :------------------------------------------------ | :----------------------------------- |
| [Shadow Type](/apis/core/#Light-shadowType)       | Shadow casting type.                 |
| [Shadow Bias](/apis/core/#Light-shadowBias)       | Shadow bias.                         |
| [Normal Bias](/apis/core/#Light-shadowNormalBias) | Shadow normal bias.                  |
| [Near Plane](/apis/core/#Light-shadowNearPlane)   | Near plane when rendering depth map. |
| [Strength](/apis/core/#Light-shadowStrength)      | Shadow strength.                     |

Here we need to explain the shadow bias:

![shadow-bias](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*8q5MTbrlC7QAAAAAAAAAAAAAARQnAQ)

Due to depth accuracy issues, artifacts are generated when sampling from the camera. So it is usually necessary to set the shadow bias to produce clean shadows, as shown in the right figure. But if the offset is too large, the shadow will deviate from the projected object, and you can see that the shadow and the heel in the right picture are separated. Therefore, this parameter is a parameter that needs to be carefully adjusted when using shadows.

Currently, the engine only supports casting shadows for one directional light `DirectLight`, mainly because the rendering of shadows doubles the DrawCall, which will seriously affect the rendering performance. Generally speaking, `DirectLight` is used to imitate sunlight, so only one is supported. There are two points to note about the shadow of a directional light.

### Cascade Shadows

First is cascade shadows. Since a directional light is only the direction of the light, the position of the light source is meaningless. So it is difficult to determine how to set the frustum used when drawing the depth map starting from the light source. And if the depth map is only rendered once in the entire scene, the objects in the distance are very small, which will seriously waste the depth map and produce a lot of blanks. So the engine uses the Stable Cascade Shadows (CSSM) technique:

![shadow-cascade](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*R_ESQpQuP3wAAAAAAAAAAAAAARQnAQ)

This technique divides the camera's view cone into two or four blocks, and then renders the scene two or four times along the direction of the light, and determines the size of each block by dividing the parameters, thereby maximizing the utilization of the depth map. The engine uses four-level cascade shadows by default when shadows are turned on, so the size of each level can be controlled by adjusting shadowFourCascadeSplits.

### Shadow selection

It was mentioned above that **only one directional light `DirectLight` can be used to turn on shadows**, but what happens if shadows are turned on for two `DirectLight` in the scene? In the absence of a determined main light, the engine will choose the light with the strongest light intensity to cast shadows by default. Light intensity is determined by the intensity of the light and the brightness of the light color. The light color is converted to a de-brightness value using the Hue-Saturation-Brightness formula.

## Projectors and receivers

<img src="https://gw.alipayobjects.com/zos/OasisHub/f3125f0f-09e6-4404-a84c-7013df5c0db3/image-20240724184711014.png" alt="image-20240724184711014" style="zoom:50%;" />

In the [mesh renderer component](/en/docs/graphics/renderer/meshRenderer), `receiveShadows` can determine whether the object receives shadows, and `castShadows` can determine whether the object casts shadows.

## Transparent shadows

Starting from version `1.3`, the engine supports casting shadows of `alpha cutoff` objects and `transparent` objects. Among them, transparent objects casting shadows need to turn on the `Transparent` switch in the scene panel:

![](https://gw.alipayobjects.com/zos/OasisHub/cf763750-8d2b-45f6-91d0-15502a199010/2024-07-24%25252019.03.15.gif)
