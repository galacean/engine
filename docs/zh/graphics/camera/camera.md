---
order: 0
title: 相机总览
type: 图形
group: 相机
label: Graphics/Camera
---

相机是一个图形引擎对 [3D 投影](https://en.wikipedia.org/wiki/3D_projection)的抽象概念，作用好比现实世界中的摄像机或眼睛。Galacean 的相机实现了自动视锥剔除，只渲染视锥体内的物体。

## 相机的类型

### 透视投影

透视投影符合我们的近大远小模型，可以看一下透视模型示意图：

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*isMHSpe21ZMAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

如上图所示，近裁剪平面（[nearClipPlane](/apis/core/#Camera-nearClipPlane)），远裁剪平面（[farClipPlane](/apis/core/#Camera-farClipPlane)）和 视角（[fieldOfView](/apis/core/#Camera-fieldOfView)） 会形成一个视椎体 ([_View Frustum_](https://en.wikipedia.org/wiki/Viewing_frustum))。在视椎体内部的物体是会被投影到摄像机里的，也就是会渲染在画布上，而视椎体外的物体则会被裁剪。

### 正交投影

正交投影就是可视区近处和远处看到的物体是等大小的。由正交投影模型产生的可视区称为盒状可视区，盒状可视区模型如下：

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*KEuGSqX-vXsAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

如上图所示，有 top、bottom、left 和 right，Galacean 对正交属性做了一些简化，更符合开发者的使用习惯，只有 [orthographicSize](/apis/core/#Camera-orthographicSize)。下面是针对各项属性和 [orthographicSize](/apis/core/#Camera-orthographicSize) 的关系

- `top = orthographicSize`
- `bottom = -orthographicSize`
- `right = orthographicSize * aspectRatio`
- `left = -orthographicSize * aspectRatio`

### 如何选择

经过对透视投影和正交投影的比较，可发现他们的不同点：

- 可视区域模型
- 是否有近大远小的效果

通过以下示例能直观感受到正交相机与透视相机渲染效果的差异，简而言之，当需要展示 2D 效果时，就选择正交相机，当需要展示 3D 效果时，就选择透视相机。

<playground src="ortho-switch.ts"></playground>

## 相机的朝向

Galacean 中的局部坐标与世界坐标遵循`右手坐标系`，因此相机的 `forward` 方向为 `-Z` 轴，相机取景的方向也是 `-Z` 方向。

## 上手

介绍了相机的基本概念，接下来让我们上手：

- 在场景中添加[相机组件](/docs/graphics/camera/component/)
- 通过[相机控件](/docs/graphics/camera/control/)来更方便地操控[相机组件](/docs/graphics/camera/component/)
- 在场景中使用[多相机](/docs/graphics/camera/multiCamera/)
- 获取[相机纹理](/docs/graphics/camera/texture/)
