---
order: 6
title: 阴影
type: 图形
group: 光照
label: Graphics/Light
---

阴影能够有效增强渲染画面的立体感和真实感。在实时渲染中，一般使用所谓的 ShadowMap 技术来进行阴影的绘制，简单来说就是把光源作为一个虚拟的相机渲染场景的深度，然后从场景相机渲染画面时，如果物体的深度比之前保存的深度信息中的要深，认为被其他物体遮挡，由此渲染阴影。

## 场景配置

<img src="https://gw.alipayobjects.com/zos/OasisHub/192802cc-f0f0-4904-a59b-4471faa68bd2/image-20240724181456427.png" alt="image-20240724181456427" style="zoom:50%;" />

场景中拥有一些配置能够影响全局阴影：

| 参数 | 应用 |
| :-- | :-- |
| [Cast Shadow](/apis/core/#Scene-castShadows) | 是否投射阴影。这是总开关。 |
| [Transparent](/apis/core/#Scene-enableTransparentShadow) | 是否投射透明阴影。开启后，透明物体也能投射阴影。 |
| [Resolution](/apis/core/#Scene-shadowResolution) | Shadowmap 的分辨率。 |
| [Cascades](/apis/core/#Scene-shadowCascades) | 级联阴影数量设置。一般用于大场景分割阴影分辨率。 |
| [ShadowTwoCascadeSplits](/apis/core/#Scene-shadowTwoCascadeSplits) | 划分二级级联阴影的参数。 |
| [ShadowFourCascadeSplits](/apis/core/#Scene-shadowFourCascadeSplits) | 划分四级级联阴影的参数。 |
| [Distance](/apis/core/#Scene-shadowDistance) | 最远阴影距离。超过这个距离后看不到阴影。 |
| [Fade Border](/apis/core/#Scene-shadowFadeBorder) | 阴影衰减距离，表示从阴影距离的多少比例开始衰减，范围为 [0~1]，为 0 时表示没有衰减。 |

## 灯光配置

<img src="https://gw.alipayobjects.com/zos/OasisHub/1b572189-db78-4f56-9d42-d8b5ea1fe857/image-20240724183629537.png" alt="image-20240724183629537" style="zoom:50%;" />

要投射阴影，需要场景中有一盏[方向光](/docs/graphics/light/directional)，然后可以配置决定 shadowmap 的一些属性：

| 参数                                              | 应用                    |
| :------------------------------------------------ | :---------------------- |
| [Shadow Type](/apis/core/#Light-shadowType)       | 阴影投射类型。          |
| [Shadow Bias](/apis/core/#Light-shadowBias)       | 阴影的偏移 。           |
| [Normal Bias](/apis/core/#Light-shadowNormalBias) | 阴影的法向偏移 。       |
| [Near Plane](/apis/core/#Light-shadowNearPlane)   | 渲染深度图时的近裁面 。 |
| [Strength](/apis/core/#Light-shadowStrength)      | 阴影强度 。             |

这里需要特别说明一下阴影偏移：

![shadow-bias](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*8q5MTbrlC7QAAAAAAAAAAAAAARQnAQ)

因为深度精度问题，从相机采样时会产生伪影。所以通常需要设置阴影的偏移量，以便产生干净的阴影，如右图所示。但如果偏移量过大，阴影就会偏离投射物，可以看到右图中的影子和脚后跟分离了。因此，这个参数是使用阴影时需要仔细调整的参数。

目前引擎**只支持为一盏有向光 `DirectLight` 投射阴影**，这主要是因为阴影的渲染使得 DrawCall 翻倍，会严重影响渲染的性能。一般来说都会使用 `DirectLight` 模仿太阳光，所以才只支持一盏。对于有向光的阴影，有两点需要注意。

### 级联阴影

首先是级联阴影。由于有向光只是光照的方向，光源的位置没有什么意义。所以很难确定如何设置从光源出发的深度图绘制时使用的视锥体。且如果在整个场景中只渲染一次深度图，那么远处的物体很小，会严重浪费深度贴图，产生大量空白。所以引擎使用了稳定性级联阴影技术(CSSM):

![shadow-cascade](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*R_ESQpQuP3wAAAAAAAAAAAAAARQnAQ)

这种技术将相机的视锥体划分为两个或者四个块，然后沿着光照的方向渲染两次或者四次场景，通过划分参数确定每一个块的大小，由此尽可能提高深度贴图的利用率。引擎在开启阴影时会默认使用四级级联阴影，因此可以通过调整 shadowFourCascadeSplits 控制每一级的大小。

### 阴影的选择

上面提到**只支持为一盏有向光 `DirectLight` 开启阴影**，但如果给场景中的两盏 `DirectLight` 开启了阴影会发生什么呢？在没有确定主光的情况下，引擎会默认选择光强最强的那一盏灯投射阴影。光强由光照的 Intensity 和光照颜色的亮度共同决定，光照颜色是用 Hue-Saturation-Brightness 公式转换成去亮度值。

## 投射物与接受物

<img src="https://gw.alipayobjects.com/zos/OasisHub/f3125f0f-09e6-4404-a84c-7013df5c0db3/image-20240724184711014.png" alt="image-20240724184711014" style="zoom:50%;" />

在 [网格渲染器组件](/docs/graphics/renderer/meshRenderer) 中，`receiveShadows` 能够决定该物体是否接受阴影，`castShadows` 能够决定该物体是否投射阴影。

## 透明阴影

从 `1.3` 版本开始，引擎支持投射透明裁剪（Alpha Test）物体和透明（Transparent）物体的阴影，其中，透明物体投射阴影需要在场景面板中打开 `Transparent` 开关:

![](https://gw.alipayobjects.com/zos/OasisHub/cf763750-8d2b-45f6-91d0-15502a199010/2024-07-24%25252019.03.15.gif)
