---
order: 6
title: 坐标系统
type: 核心
label: Core
---

坐标系统在渲染引擎中扮演的角色非常重要，它保证了渲染结果与交互的准确，阅读本文档，你可以了解 Galacean 中涉及的绝大多数坐标系统，需要注意的是，不同渲染引擎中各种空间的定义是有差异的，本文仅讨论 Galacean 中的空间标准。

本文会按照`空间的定义`，`坐标系类型`等方面来横向比较各个坐标空间，其中`坐标系类型`具体指`左手坐标系`与`右手坐标系`，如下图所示：

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*YBAmSamxy_0AAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

定义为`左手坐标系`或`右手坐标系`会影响 `forward` 的朝向与旋转的方向（逆时针或顺时针），对于朝向的定义可以想象着将右手与 `+X` 重合，头顶方向与 `+Y` 重合，此时面部朝向的方向就是 `forward` ，可以简单对比 Galacean 与 Unity 的差异：

- Unity 的局部坐标与世界坐标系都是`左手坐标系`，位姿变换时依据顺时针方向进行旋转，对应的 `forward` 方向是 `+Z` ，因此相机的朝向（取景方向）就是 `+Z` 方向

- Galacean 的局部坐标与世界坐标系都是`右手坐标系`，位姿变换时依据逆时针方向进行旋转，对应的 `forward` 方向是 `-Z` ，因此相机的朝向（取景方向）就是 `-Z` 方向

## 局部空间

局部空间是相对的，它以物体的自身位置为参考坐标系的，因此描述的时候通常表示为：“ A 节点局部空间中的某个点”，局部空间是`右手坐标系`， `Transform` 组件会按照以下公式自动计算各个点在世界空间中的位置。

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*4ZLrSLEJPigAAAAAAAAAAAAADleLAQ/original" width="100%" height="100%">

## 世界空间

世界空间是绝对的，根节点放置在`世界空间`中，而其子节点会继承他的空间关系，与`局部空间`相同，`世界空间`也是`右手坐标系`，当两个节点不在同一个`局部空间`时，可以将它们转换至世界空间来比较相对的位置关系。

## 编辑器使用

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

确定 gizmo 在场景中姿态

| 图标                                                                                                                              | 选项       | 内容                                              |
| :-------------------------------------------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------ |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*of8ATKP_4u0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `本地坐标` | 保持 Gizmo 相对于选中实体的旋转                   |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*Okm5S64_LqEAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `全局坐标` | 固定 Gizmo 与世界空间方向。即与场景中网格方向一致 |


## 观察空间

`观察空间`就是相机的局部空间，以透视相机为例：

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*isMHSpe21ZMAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">

## 屏幕空间

屏幕空间的定义与前端规范保持一致，是以画布的左上角为坐标原点的二维空间坐标系，空间内的取值范围与画布的尺寸保持一致，在交互，屏幕空间转换时经常使用。

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*qG0eTrkP4MUAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## 视口空间

视口空间的定义与前端规范保持一致，通过设置相机的 viewport 可以控制渲染的目标区域，

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*ZxwVQYgXLooAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## 2D 精灵

渲染精灵或遮罩等 2D 元素时，默认在局部坐标系中的 XoY 平面上放置这个面片：

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_5fjTp0r2KEAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">
