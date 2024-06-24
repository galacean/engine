---
order: 6
title: XR 能力
type: XR
label: XR
---

Galacean XR 目前包含以下能力：

| 能力            | 解释     |
| :-------------- | :------- |
| Anchor Tracking | 锚点追踪 |
| Plane Tracking  | 平面追踪 |
| Image Tracking  | 图片追踪 |
| Hit Test        | 碰撞检测 |

## 锚点追踪

| 属性            | 解释                       |
| :-------------- | :------------------------- |
| trackingAnchors | （只读）获取请求追踪的锚点 |
| trackedAnchors  | （只读）获取追踪到的锚点   |

| 方法                  | 解释                   |
| :-------------------- | :--------------------- |
| addAnchor             | 添加特定锚点           |
| removeAnchor          | 移除特定锚点           |
| clearAnchors          | 移除所有锚点           |
| addChangedListener    | 添加监听锚点变化的函数 |
| removeChangedListener | 移除监听锚点变化的函数 |

你可以通过如下代码在 XR 空间中添加锚点：

```typescript
const anchorTracking = xrManager.getFeature(XRAnchorTracking);
const position = new Vector3();
const rotation = new Quaternion();
// 添加一个锚点
const anchor = anchorTracking.addAnchor(position, rotation);
// 移除这个锚点
anchorTracking.removeAnchor(anchor);
// 监听锚点变化
anchorTracking.addChangedListener(
  (
    added: readonly XRAnchor[],
    updated: readonly XRAnchor[],
    removed: readonly XRAnchor[]
  ) => {
    // 此处添加对新增锚点，更新锚点和移除锚点的处理
  }
);
```

## 平面追踪

| 属性          | 解释                                       |
| :------------ | :----------------------------------------- |
| detectionMode | （只读）追踪屏幕的类型，水平，竖直或者所有 |
| trackedPlanes | （只读）获取追踪到的平面                   |

| 方法                  | 解释                   |
| :-------------------- | :--------------------- |
| addChangedListener    | 添加监听平面变化的函数 |
| removeChangedListener | 移除监听平面变化的函数 |

> 需要注意的是，平面追踪在添加功能时就需要指定平面追踪的类型。

```typescript
// 在初始化时指定平面追踪的类型为所有
xrManager.addFeature(XRPlaneTracking, XRPlaneMode.EveryThing);
```

我们可以追踪现实平面，并为他们标记透明的网格和坐标系：

<playground src="xr-ar-planeTracking.ts"></playground>

## 图片追踪

| 属性           | 解释                                             |
| :------------- | :----------------------------------------------- |
| trackingImages | （只读）请求追踪的图片数组，包含名称，来源与尺寸 |
| trackedImages  | （只读）获取追踪到的图片                         |

| 方法                  | 解释                   |
| :-------------------- | :--------------------- |
| addChangedListener    | 添加监听平面变化的函数 |
| removeChangedListener | 移除监听平面变化的函数 |

> 需要注意的是，图片追踪在添加功能时就需要指定追踪的图片，并且在 WebXR 中，同张图片只会被追踪一次。

```typescript
// 在初始化时指定平面追踪的类型为所有
xrManager.addFeature(XRImageTracking, [refImage]);
```

我们可以追踪现实图片，并为他们标记坐标系：

<playground src="xr-ar-planeTracking.ts"></playground>

## 碰撞检测

| 方法          | 解释                                         |
| :------------ | :------------------------------------------- |
| hitTest       | 通过射线与现实空间的平面进行碰撞检测         |
| screenHitTest | 通过屏幕空间坐标与现实空间的平面进行碰撞检测 |

```typescript
const pointer = engine.inputManager.pointers[0];
// 获取平面触控点
if (pointer) {
  const hitTest = xrManager.getFeature(XRHitTest);
  const { position } = pointer;
  // 通过屏幕空间坐标与现实空间的平面进行碰撞检测
  const result = hitTest.screenHitTest(
    position.x,
    position.y,
    TrackableType.Plane
  );
}
```
