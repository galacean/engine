---
order: 6
title: 阴影
type: 图形
group: 光照
label: Graphics/Light
---

阴影能够有效增强渲染画面的立体感和真实感。在实时渲染中，一般使用所谓的 ShadowMap 技术来进行阴影的绘制，简单来说就是把光源作为一个虚拟的相机渲染场景的深度，然后从场景相机渲染画面时，比较渲染的物体与深度信息的关系，如果物体的深度比深度信息中的要深，会导致被其他物体遮挡，由此渲染阴影。

## 光照与阴影

<img src="https://gw.alipayobjects.com/zos/OasisHub/bf6acb06-c026-4a36-b243-0b39a759624c/image-20240319174904033.png" alt="image-20240319174904033" style="zoom:50%;" />

基于这样的原理就比较好理解在 `Light` 组件中有关阴影的各项属性设置：

| 参数                                                  | 应用                 |
| :---------------------------------------------------- | :------------------- |
| [shadowType](/apis/core/#Light-shadowType)             | 阴影投射类型         |
| [shadowBias](/apis/core/#Light-shadowBias)             | 阴影的偏移           |
| [shadowNormalBias](/apis/core/#Light-shadowNormalBias) | 阴影的法向偏移       |
| [shadowNearPlane](/apis/core/#Light-shadowNearPlane)   | 渲染深度图时的近裁面 |
| [shadowStrength](/apis/core/#Light-shadowStrength)     | 阴影强度             |

这里需要特别说明一下阴影偏移：

![shadow-bias](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*8q5MTbrlC7QAAAAAAAAAAAAAARQnAQ)

因为深度精度问题，从相机采样时会产生伪影。所以通常需要设置阴影的偏移量，以便产生干净的阴影，如右图所示。但如果偏移量过大，阴影就会偏离投射物，可以看到右图中的影子和脚后跟分离了。因此，这个参数是使用阴影时需要仔细调整的参数。

除了上述位于 `Light` 组件当中的阴影配置外，还有一些有关阴影的全局配置位于 `Scene` 当中:

<img src="https://gw.alipayobjects.com/zos/OasisHub/05b00536-63c3-42f4-b89f-1f3270aa375e/image-20240319175051723.png" alt="image-20240319175051723" style="zoom:50%;" />

| 参数 | 应用 |
| :-- | :-- |
| [castShadows](/apis/core/#Scene-castShadows) | 是否投射阴影 |
| [shadowResolution](/apis/core/#Scene-shadowResolution) | 阴影的分辨率 |
| [shadowCascades](/apis/core/#Scene-shadowCascades) | 级联阴影的数量 |
| [shadowTwoCascadeSplits](/apis/core/#Scene-shadowTwoCascadeSplits) | 划分二级级联阴影的参数 |
| [shadowFourCascadeSplits](/apis/core/#Scene-shadowFourCascadeSplits) | 划分四级级联阴影的参数 |
| [shadowDistance](/apis/core/#Scene-shadowDistance) | 最大阴影距离 |
| [shadowFadeBorder](/apis/core/#Scene-shadowFadeBorder) | 阴影衰减比例，表示从阴影距离的多少比例开始衰减，范围为 [0~1]，为 0 时表示没有衰减 |

上述参数可以通过在 Playground 的例子中进行调试进行理解：

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

在这一案例当中，背景其实只是一张贴图，但通过增加一个透明阴影，可以使得 3D 物体更加自然地融合到场景当中。
