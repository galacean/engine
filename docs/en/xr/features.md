---
order: 6
title: XR Abilities
type: XR
label: XR
---

Galacean XR currently includes the following abilities:

| Ability          | Explanation |
| :-------------- | :------- |
| Anchor Tracking | Anchor tracking |
| Plane Tracking  | Plane tracking |
| Image Tracking  | Image tracking |
| Hit Test        | Hit test |

## Anchor Tracking

| Property         | Explanation                 |
| :-------------- | :------------------------- |
| trackingAnchors | (Read-only) Get anchors requested for tracking |
| trackedAnchors  | (Read-only) Get tracked anchors |

| Method               | Explanation             |
| :-------------------- | :--------------------- |
| addAnchor             | Add a specific anchor   |
| removeAnchor          | Remove a specific anchor |
| clearAnchors          | Remove all anchors      |
| addChangedListener    | Add a function to listen for anchor changes |
| removeChangedListener | Remove a function listening for anchor changes |

You can add anchors in XR space with the following code:

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

## Plane Tracking

| Property       | Explanation                                     |
| :------------ | :----------------------------------------- |
| detectionMode | (Read-only) Type of planes being tracked, horizontal, vertical, or all |
| trackedPlanes | (Read-only) Get tracked planes                 |

| Method               | Explanation             |
| :-------------------- | :--------------------- |
| addChangedListener    | Add a function to listen for plane changes |
| removeChangedListener | Remove a function listening for plane changes |

> Note that when adding functionality to plane tracking, you need to specify the type of plane tracking.

```typescript
// Specify plane tracking type as all during initialization
xrManager.addFeature(XRPlaneTracking, XRPlaneMode.EveryThing);
```

We can track real-world planes and mark them with transparent grids and coordinate systems:

<playground src="xr-ar-planeTracking.ts"></playground>

## Image Tracking

| Property        | Explanation                                           |
| :------------- | :----------------------------------------------- |
| trackingImages | (Read-only) Array of images requested for tracking, including name, source, and size |
| trackedImages  | (Read-only) Get tracked images                      |

| Method               | Explanation             |
| :-------------------- | :--------------------- |
| addChangedListener    | Add a function to listen for image changes |
| removeChangedListener | Remove a function listening for image changes |

> Note that when adding functionality to image tracking, you need to specify the images to track, and in WebXR, each image will only be tracked once.

```typescript
// Specify the images to track during initialization
xrManager.addFeature(XRImageTracking, [refImage]);
```

We can track real-world images and mark them with coordinate systems:

<playground src="xr-ar-planeTracking.ts"></playground>

## Collision Detection

| Method        | Description                                   |
| :------------ | :-------------------------------------------- |
| hitTest       | Collision detection by casting rays in real space |
| screenHitTest | Collision detection by comparing screen space coordinates with real space planes |

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
