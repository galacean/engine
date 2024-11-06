---
order: 5
title: XR Capabilities
type: XR
label: XR
---

Galacean XR currently includes the following capabilities:

| Capability       | Description     |
| :--------------- | :-------------- |
| Anchor Tracking  | Anchor Tracking |
| Plane Tracking   | Plane Tracking  |
| Image Tracking   | Image Tracking  |
| Hit Test         | Hit Test        |

## Anchor Tracking

| Property         | Description                       |
| :--------------- | :-------------------------------- |
| trackingAnchors  | (Read-only) Get requested tracking anchors |
| trackedAnchors   | (Read-only) Get tracked anchors   |

| Method                 | Description                   |
| :--------------------- | :---------------------------- |
| addAnchor              | Add a specific anchor         |
| removeAnchor           | Remove a specific anchor      |
| clearAnchors           | Remove all anchors            |
| addChangedListener     | Add a function to listen for anchor changes |
| removeChangedListener  | Remove a function to listen for anchor changes |

You can add anchors in the XR space with the following code:

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
  (added: readonly XRAnchor[], updated: readonly XRAnchor[], removed: readonly XRAnchor[]) => {
    // 此处添加对新增锚点，更新锚点和移除锚点的处理
  }
);
```

## Plane Tracking

| Property       | Description                                    |
| :------------- | :--------------------------------------------- |
| detectionMode  | (Read-only) Type of screen tracking: horizontal, vertical, or all |
| trackedPlanes  | (Read-only) Get tracked planes                 |

| Method                 | Description                   |
| :--------------------- | :---------------------------- |
| addChangedListener     | Add a function to listen for plane changes |
| removeChangedListener  | Remove a function to listen for plane changes |

> Note that the type of plane tracking needs to be specified when adding the feature.

```typescript
// Specify the type of plane tracking as everything during initialization
xrManager.addFeature(XRPlaneTracking, XRPlaneMode.EveryThing);
```

We can track real-world planes and mark them with transparent grids and coordinate systems:

<playground src="xr-ar-planeTracking.ts"></playground>

## Image Tracking

| Property        | Description                                             |
| :-------------- | :------------------------------------------------------ |
| trackingImages  | (Read-only) Array of requested tracking images, including name, source, and size |
| trackedImages   | (Read-only) Get tracked images                          |

| Method                 | Description                   |
| :--------------------- | :---------------------------- |
| addChangedListener     | Add a function to listen for plane changes |
| removeChangedListener  | Remove a function to listen for plane changes |

Note that the image tracking feature requires specifying the images to be tracked in advance. In the engine, the tracked images are represented by the `XRReferenceImage` object:

| Property       | Description                                                                                                 |
| :------------- | :---------------------------------------------------------------------------------------------------------- |
| name           | Name of the tracked image                                                                                   |
| imageSource    | Source of the tracked image, usually an HtmlImageElement                                                    |
| physicalWidth  | Size of the tracked image in the real world, default unit is meters. If specified as `0.08`, it means the image size in the real world is `0.08` meters |

> In WebXR, the same image will only be tracked once.

```typescript
const image = new Image();
image.onload = () => {
  // 创建追踪图片
  const refImage = new XRReferenceImage("test", image, 0.08);
  // 初始化图片追踪能力，并指定追踪图片
  xrManager.addFeature(XRImageTracking, [refImage]);
};
image.src = "图片的 URL";
```

The example below can track a real-world image and mark the coordinate system:

<playground src="xr-ar-imageTracking.ts"></playground>

> The above example can directly generate a QR code for mobile-side experience. The tracking image is as follows:

 <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*-MneS5WGJywAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007201437362" style="zoom:20%;" />

## Collision Detection

| Method        | Description                                  |
| :------------ | :------------------------------------------- |
| hitTest       | Performs collision detection with a plane in real space using a ray |
| screenHitTest | Performs collision detection with a plane in real space using screen space coordinates |

```typescript
const pointer = engine.inputManager.pointers[0];
// 获取平面触控点
if (pointer) {
  const hitTest = xrManager.getFeature(XRHitTest);
  const { position } = pointer;
  // 通过屏幕空间坐标与现实空间的平面进行碰撞检测
  const result = hitTest.screenHitTest(position.x, position.y, TrackableType.Plane);
}
```
