---
order: 6
title: Shadows
type: Graphics
group: Lighting
label: Graphics/Light
---

Shadows can effectively enhance the three-dimensionality and realism of rendered images. In real-time rendering, the so-called ShadowMap technique is generally used to draw shadows. Simply put, the light source is used as a virtual camera to render the depth of the scene. Then, when rendering the scene from the scene camera, the relationship between the rendered objects and the depth information is compared. If the depth of an object is deeper than the depth information, it will be occluded by other objects, thus rendering a shadow.

## Lighting and Shadows

<img src="https://gw.alipayobjects.com/zos/OasisHub/bf6acb06-c026-4a36-b243-0b39a759624c/image-20240319174904033.png" alt="image-20240319174904033" style="zoom:50%;" />

Based on this principle, it is easier to understand the various shadow-related properties in the `Light` component:

| Parameter                                              | Application           |
| :----------------------------------------------------- | :-------------------- |
| [shadowType](/apis/core/#Light-shadowType)              | Shadow projection type |
| [shadowBias](/apis/core/#Light-shadowBias)              | Shadow bias           |
| [shadowNormalBias](/apis/core/#Light-shadowNormalBias)  | Shadow normal bias     |
| [shadowNearPlane](/apis/core/#Light-shadowNearPlane)    | Near clipping plane for rendering depth map |
| [shadowStrength](/apis/core/#Light-shadowStrength)      | Shadow strength        |

It is important to note the shadow bias:

![shadow-bias](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*8q5MTbrlC7QAAAAAAAAAAAAAARQnAQ)

Due to depth precision issues, there may be shadow acne when sampling from the camera. Therefore, it is usually necessary to set a shadow bias to produce clean shadows, as shown in the image on the right. However, if the bias is too large, the shadow will deviate from the casting object, as seen in the image where the shadow separates from the heel. Therefore, this parameter is one that needs to be carefully adjusted when using shadows.

In addition to the shadow configurations in the `Light` component mentioned above, there are also some global shadow-related configurations in the `Scene`:

<img src="https://gw.alipayobjects.com/zos/OasisHub/05b00536-63c3-42f4-b89f-1f3270aa375e/image-20240319175051723.png" alt="image-20240319175051723" style="zoom:50%;" />

| Parameter | Application |
| :-- | :-- |
| [castShadows](/apis/core/#Scene-castShadows) | Whether to cast shadows |
| [shadowResolution](/apis/core/#Scene-shadowResolution) | Shadow resolution |
| [shadowCascades](/apis/core/#Scene-shadowCascades) | Number of cascaded shadows |
| [shadowTwoCascadeSplits](/apis/core/#Scene-shadowTwoCascadeSplits) | Parameters for dividing two-level cascaded shadows |
| [shadowFourCascadeSplits](/apis/core/#Scene-shadowFourCascadeSplits) | Parameters for dividing four-level cascaded shadows |
| [shadowDistance](/apis/core/#Scene-shadowDistance) | Maximum shadow distance |
| [shadowFadeBorder](/apis/core/#Scene-shadowFadeBorder) | Shadow fade border, indicating at what percentage of the shadow distance the fading starts, ranging from [0~1], where 0 means no fading |

These parameters can be understood through debugging in the Playground example:

<playground src="cascaded-shadow.ts"></playground>

目前引擎**只支持为一盏有向光 `DirectLight` 开启阴影**，这主要是因为阴影的渲染使得 DrawCall 翻倍，会严重影响渲染的性能。一般来说都会使用 `DirectLight` 模仿太阳光，所以才只支持一盏。对于有向光的阴影，有两点需要注意。

### 级联阴影

首先是级联阴影。由于有向光只是光照的方向，光源的位置没有什么意义。所以很难确定如何设置从光源出发的深度图绘制时使用的视锥体。且如果在整个场景中只渲染一次深度图，那么远处的物体很小，会严重浪费深度贴图，产生大量空白。所以引擎使用了稳定性级联阴影技术(CSSM):

![shadow-cascade](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*R_ESQpQuP3wAAAAAAAAAAAAAARQnAQ)

这种技术将相机的视锥体划分为两个或者四个块，然后沿着光照的方向渲染两次或者四次场景，通过划分参数确定每一个块的大小，由此尽可能提高深度贴图的利用率。引擎在开启阴影时会默认使用四级级联阴影，因此可以通过调整 shadowFourCascadeSplits 控制每一级的大小。

### 阴影的选择

上面提到**只支持为一盏有向光 `DirectLight` 开启阴影**，但如果给场景中的两盏 `DirectLight` 开启了阴影会发生什么呢？在没有确定主光的情况下，引擎会默认选择光强最强的那一盏灯投射阴影。光强由光照的 Intensity 和光照颜色的亮度共同决定，光照颜色是用 Hue-Saturation-Brightness 公式转换成去亮度值。

## 投射物与接受物

在光照中配置 enableShadow 只能控制深度图是否被渲染，还需要在 Renderer 当中对应选项，才能控制该物体是否投射阴影，或者是否接受其他物体的阴影。

| 参数                                                 | 应用                 |
| :--------------------------------------------------- | :------------------- |
| [receiveShadows](/apis/core/#Renderer-receiveShadows) | 该物体是否接受阴影   |
| [castShadows](/apis/core/#Renderer-castShadows)       | 该物体是否会投射阴影 |

开启 receiveShadows 的 Renderer，如果被其他物体遮挡则会渲染出阴影。开启 castShadows 的 Renderer，则会向其他物体投射阴影。

## 透明阴影

对于大多数需要阴影的场景，上述的控制参数基本够用了。但有时候我们希望在一个透明物体上投射阴影，例如场景中其实没有地面（比如 AR 的画面），但也希望物体能够拥有一个阴影，用以增强画面立体感。如果给地面设置标准的渲染材质，并且使得 alpha 设置为 0，那么地面上不会看到任何阴影。因为在真实世界中，光线会直接穿过透明物体。因此，对于透明地面这样的场景，需要一个特殊的材质进行渲染。可以参考 Playground 当中阴影绘制方式:

<playground src="transparent-shadow.ts"></playground>
